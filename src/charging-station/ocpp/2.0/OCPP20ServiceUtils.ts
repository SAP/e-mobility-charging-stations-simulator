import { secondsToMilliseconds } from 'date-fns'

import type { ConnectorStatus, QueuedTransactionEvent } from '../../../types/ConnectorStatus.js'
import type { ConfigurationKeyType } from '../../../types/ocpp/Configuration.js'

import { type ChargingStation, resetConnectorStatus } from '../../../charging-station/index.js'
import { OCPPError } from '../../../exception/index.js'
import {
  AvailabilityType,
  type ConnectorStatusEnum,
  CurrentType,
  ErrorType,
  type MeterValue,
  MeterValueLocation,
  MeterValueUnit,
  OCPP20AuthorizationStatusEnumType,
  OCPP20ChargingStateEnumType,
  OCPP20ComponentName,
  OCPP20ConnectorStatusEnumType,
  type OCPP20EVSEType,
  type OCPP20GetVariableResultType,
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenInfoType,
  type OCPP20IdTokenType,
  OCPP20IncomingRequestCommand,
  OCPP20LocationEnumType,
  OCPP20MeasurandEnumType,
  type OCPP20MeterValue,
  type OCPP20MeterValuesRequest,
  type OCPP20MeterValuesResponse,
  OCPP20OptionalVariableName,
  OCPP20ReadingContextEnumType,
  OCPP20ReasonEnumType,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  type OCPP20SampledValue,
  type OCPP20StatusNotificationRequest,
  OCPP20TransactionEventEnumType,
  type OCPP20TransactionEventOptions,
  type OCPP20TransactionEventRequest,
  type OCPP20TransactionEventResponse,
  type OCPP20TransactionType,
  OCPP20TriggerReasonEnumType,
  OCPP20UnitEnumType,
  OCPPVersion,
  ReasonCodeEnumType,
  RequestCommand,
  type RequestParams,
  type SampledValueTemplate,
  type StartTransactionResult,
  type StatusNotificationOptions,
  type StopTransactionReason,
  type StopTransactionResult,
  type UUIDv4,
} from '../../../types/index.js'
import {
  buildPersistentTransactionEnergyIntervalState,
  clampToSafeTimerValue,
  computeExponentialBackOffDelay,
  Constants,
  convertToBoolean,
  convertToInt,
  convertToIntOrNaN,
  formatDurationMilliSeconds,
  generateUUID,
  getErrorMessage,
  interruptibleSleep,
  isNotEmptyArray,
  logger,
  roundTo,
  sleep,
  validateIdentifierString,
} from '../../../utils/index.js'
import { buildConfigKey, getConfigurationKey } from '../../index.js'
import {
  advanceConnectorEnergyRegister,
  advanceStationEnergyRegister,
  advanceTransactionEnergyRegister,
  computeCoherentSampleAtTime,
  consumePendingSharedEnergy,
  recordPendingSharedEnergy,
} from '../../meter-values/CoherentSampleComputer.js'
import { resolveRootSeed } from '../../meter-values/CoherentSession.js'
import { canonicalizeCustomData } from '../../meter-values/MeterValueUtils.js'
import { getTransactionIntervalConsumptions } from '../../meter-values/TransactionIntervalUtils.js'
import {
  enqueueBoundedTransactionEvent,
  hasQueuedEndedTransactionEvent,
  invalidateTransactionEventQueueAccounting,
  queuedTransactionEventHasPublicKey,
  setTransactionEventQueueInFlight,
  shiftBoundedTransactionEvent,
  transactionEventHasUnsignedIntervalEnergy,
} from '../../TransactionEventQueueUtils.js'
import {
  mapOCPP20AuthorizationStatus,
  mapOCPP20TokenType,
  OCPPAuthServiceFactory,
} from '../auth/index.js'
import { sendPostTransactionStatus } from '../OCPPConnectorStatusOperations.js'
import {
  buildClockAlignedConnectorMeterValue,
  buildMeterValue,
  createPayloadConfigs,
  PayloadValidatorOptions,
} from '../OCPPServiceUtils.js'
import { OCPP20Constants } from './OCPP20Constants.js'
import { mapStopReasonToOCPP20 } from './OCPP20RequestBuilders.js'
import { OCPP20VariableManager } from './OCPP20VariableManager.js'
import { getVariableMetadata } from './OCPP20VariableRegistry.js'

const moduleName = 'OCPP20ServiceUtils'

const isAbortSignalAborted = (signal?: AbortSignal): boolean => signal?.aborted === true

export const isOCPP20ConnectorStatus = (
  status: ConnectorStatusEnum
): status is OCPP20ConnectorStatusEnumType =>
  Object.values(OCPP20ConnectorStatusEnumType).some(value => value === status)

export interface RejectionReason {
  additionalInfo: string
  reasonCode: ReasonCodeEnumType
}

const hasQueuedEndedEvent = (connectorStatus: ConnectorStatus): boolean =>
  connectorStatus.transactionId != null &&
  hasQueuedEndedTransactionEvent(connectorStatus, connectorStatus.transactionId.toString())

export const isTransactionEnding = (connectorStatus: ConnectorStatus): boolean =>
  connectorStatus.transactionEnding === true || hasQueuedEndedEvent(connectorStatus)

const hasOngoingTransaction = (connectorStatus: ConnectorStatus): boolean =>
  !isTransactionEnding(connectorStatus) &&
  (connectorStatus.transactionStarting === true ||
    (connectorStatus.transactionStarted === true && connectorStatus.transactionId != null))

const getTransactionObservationInterval = (
  connectorStatus: ConnectorStatus,
  timestamp: Date,
  fallbackInterval: number
): number => {
  const previousUpdate =
    connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt ??
    connectorStatus.transactionStart
  return previousUpdate != null
    ? Math.max(0, timestamp.getTime() - previousUpdate.getTime())
    : fallbackInterval
}

const getSharedEnergyObservationInterval = (
  connectors: [number, ConnectorStatus][],
  previousSharedEnergyUpdate: Date | undefined,
  timestamp: Date,
  fallbackInterval: number
): number => {
  let earliestTransactionUpdate: number | undefined
  for (const [, connectorStatus] of connectors) {
    if (!hasOngoingTransaction(connectorStatus)) continue
    const previousUpdate =
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt ??
      connectorStatus.transactionStart
    if (previousUpdate == null) continue
    earliestTransactionUpdate = Math.min(
      earliestTransactionUpdate ?? previousUpdate.getTime(),
      previousUpdate.getTime()
    )
  }
  const previousSharedUpdate = previousSharedEnergyUpdate?.getTime()
  const observationBaseline =
    previousSharedUpdate != null && earliestTransactionUpdate != null
      ? Math.max(previousSharedUpdate, earliestTransactionUpdate)
      : (previousSharedUpdate ?? earliestTransactionUpdate)
  return observationBaseline != null
    ? Math.max(0, timestamp.getTime() - observationBaseline)
    : fallbackInterval
}

const prorateSharedObservationEnergy = (
  energyWh: number,
  observationInterval: number,
  connectorStatus: ConnectorStatus,
  timestamp: Date,
  fallbackInterval: number
): number =>
  observationInterval > 0
    ? roundTo(
      energyWh *
          Math.min(
            1,
            getTransactionObservationInterval(connectorStatus, timestamp, fallbackInterval) /
              observationInterval
          ),
      2
    )
    : 0

const hasConfiguredEnergyMeasurand = (
  chargingStation: ChargingStation,
  measurandsKey: ConfigurationKeyType
): boolean => {
  const configuredMeasurands = getConfigurationKey(chargingStation, measurandsKey)?.value
  return (
    configuredMeasurands == null ||
    configuredMeasurands.split(',').some(measurand => {
      const normalizedMeasurand = measurand.trim()
      return (
        normalizedMeasurand === (OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER as string) ||
        normalizedMeasurand === (OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL as string)
      )
    })
  )
}

const consumeConnectorEnergySinceBaseline = (
  connectorStatus: ConnectorStatus,
  baselineKey: string,
  initialBaseline: number
): number => {
  const currentEnergy = connectorStatus.energyActiveImportRegisterValue ?? 0
  const baseline =
    connectorStatus.transactionEnergyActiveImportIntervalBaselines?.[baselineKey] ?? initialBaseline
  connectorStatus.transactionEnergyActiveImportIntervalBaselines ??= {}
  connectorStatus.transactionEnergyActiveImportIntervalBaselines[baselineKey] = currentEnergy
  return Math.max(0, currentEnergy - baseline)
}

const hasConfiguredAlignedEnergyMeasurand = (chargingStation: ChargingStation): boolean =>
  hasConfiguredEnergyMeasurand(
    chargingStation,
    buildConfigKey(OCPP20ComponentName.AlignedDataCtrlr, OCPP20RequiredVariableName.Measurands)
  )

const getTransactionEnergyNominalInterval = (
  chargingStation: ChargingStation,
  fallbackInterval: number,
  overrides?: { txEndedInterval?: number; txUpdatedInterval?: number }
): number | undefined => {
  const txUpdatedMeasurandsKey = buildConfigKey(
    OCPP20ComponentName.SampledDataCtrlr,
    OCPP20RequiredVariableName.TxUpdatedMeasurands
  )
  const txUpdatedInterval =
    overrides?.txUpdatedInterval ?? OCPP20ServiceUtils.getTxUpdatedInterval(chargingStation)
  if (
    txUpdatedInterval > 0 &&
    hasConfiguredEnergyMeasurand(chargingStation, txUpdatedMeasurandsKey)
  ) {
    return txUpdatedInterval
  }
  const txEndedMeasurandsKey = buildConfigKey(
    OCPP20ComponentName.SampledDataCtrlr,
    OCPP20RequiredVariableName.TxEndedMeasurands
  )
  const txEndedInterval =
    overrides?.txEndedInterval ?? OCPP20ServiceUtils.getTxEndedInterval(chargingStation)
  if (txEndedInterval > 0 && hasConfiguredEnergyMeasurand(chargingStation, txEndedMeasurandsKey)) {
    return txEndedInterval
  }
  return fallbackInterval > 0 ? fallbackInterval : undefined
}

const getEnabledAlignedEnergyInterval = (chargingStation: ChargingStation): number | undefined => {
  if (
    !hasConfiguredAlignedEnergyMeasurand(chargingStation) ||
    !OCPP20ServiceUtils.readVariableAsBoolean(
      chargingStation,
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20RequiredVariableName.Enabled,
      false
    )
  ) {
    return undefined
  }
  const intervalSeconds = OCPP20ServiceUtils.readAlignedDataIntervalSeconds(chargingStation)
  return intervalSeconds != null && intervalSeconds > 0
    ? secondsToMilliseconds(intervalSeconds)
    : undefined
}

const canAdvanceAlignedEnergy = (connectorStatus: ConnectorStatus): boolean =>
  connectorStatus.transactionRestored !== true &&
  connectorStatus.transactionEnding !== true &&
  !hasQueuedEndedEvent(connectorStatus) &&
  connectorStatus.transactionStarted === true &&
  connectorStatus.transactionId != null

const canContributeToSharedObservation = (
  connectorStatus: ConnectorStatus,
  context: OCPP20ReadingContextEnumType | undefined
): boolean =>
  canAdvanceAlignedEnergy(connectorStatus) ||
  (context === OCPP20ReadingContextEnumType.TRANSACTION_END &&
    hasOngoingTransaction(connectorStatus))

export interface IntervalBaselineRestore {
  consumed?: number
  generation?: string
  key: object
  restore: (consumed: number) => void
}

interface AdditiveUnitFamily {
  baseUnit: string
  kiloUnit?: string
}

interface ClockAlignedMeterValuesSendState {
  inFlight?: Promise<void>
  pending?: PendingClockAlignedMeterValuesRequest
}

interface PendingClockAlignedMeterValuesRequest {
  request: OCPP20MeterValuesRequest
  responseTimeoutMs: number
  restoreIntervalBaselines: Map<object, IntervalBaselineRestore>
  triggerMessage?: boolean
}

const mergeIntervalBaselineRestores = (
  earlier: ReadonlyMap<object, IntervalBaselineRestore>,
  later: ReadonlyMap<object, IntervalBaselineRestore>
): Map<object, IntervalBaselineRestore> => {
  const merged = new Map(later)
  for (const [key, restore] of earlier) {
    const laterRestore = merged.get(key)
    if (laterRestore == null) {
      merged.set(key, restore)
    } else if (laterRestore.generation === restore.generation) {
      merged.set(key, {
        ...restore,
        consumed: (restore.consumed ?? 0) + (laterRestore.consumed ?? 0),
      })
    }
  }
  return merged
}

const runIntervalBaselineRestores = (
  restores: ReadonlyMap<object, IntervalBaselineRestore>
): void => {
  for (const { consumed = 0, restore } of [...restores.values()].toReversed()) {
    restore(consumed)
  }
}

const getClockAlignedAdditiveUnitFamily = (
  measurand: OCPP20MeasurandEnumType | undefined,
  configuredUnit: string | undefined
): AdditiveUnitFamily | undefined => {
  let family: AdditiveUnitFamily | undefined
  if (measurand?.startsWith('Current.') === true) {
    family = { baseUnit: MeterValueUnit.AMP }
  } else if (measurand?.startsWith('Energy.Active.') === true) {
    family = { baseUnit: MeterValueUnit.WATT_HOUR, kiloUnit: MeterValueUnit.KILO_WATT_HOUR }
  } else if (measurand?.startsWith('Energy.Reactive.') === true) {
    family = { baseUnit: MeterValueUnit.VAR_HOUR, kiloUnit: MeterValueUnit.KILO_VAR_HOUR }
  } else if (measurand?.startsWith('Energy.Apparent.') === true) {
    family = { baseUnit: MeterValueUnit.VOLT_AMP_HOUR, kiloUnit: MeterValueUnit.KILO_VOLT_AMP_HOUR }
  } else if (
    measurand?.startsWith('Power.') === true &&
    measurand !== OCPP20MeasurandEnumType.POWER_FACTOR
  ) {
    family = measurand.startsWith('Power.Reactive.')
      ? { baseUnit: MeterValueUnit.VAR, kiloUnit: MeterValueUnit.KILO_VAR }
      : { baseUnit: MeterValueUnit.WATT, kiloUnit: MeterValueUnit.KILO_WATT }
  }
  if (
    family != null &&
    configuredUnit != null &&
    configuredUnit !== family.baseUnit &&
    configuredUnit !== family.kiloUnit
  ) {
    return undefined
  }
  return family
}

const normalizeClockAlignedAdditiveSample = (
  sampledValue: OCPP20SampledValue,
  unitFamily: AdditiveUnitFamily
): OCPP20SampledValue => {
  const configuredUnit = sampledValue.unitOfMeasure?.unit
  const namedUnitMultiplier =
    configuredUnit === unitFamily.kiloUnit ? Constants.UNIT_DIVIDER_KILO : 1
  const decimalMultiplier = 10 ** (sampledValue.unitOfMeasure?.multiplier ?? 0)
  return {
    ...sampledValue,
    unitOfMeasure: {
      ...sampledValue.unitOfMeasure,
      multiplier: 0,
      unit: unitFamily.baseUnit,
    },
    value: sampledValue.value * namedUnitMultiplier * decimalMultiplier,
  }
}

// Only active import/export quantities have a defined DC output-to-AC-input projection.
const DC_STATION_AGGREGATION_DIRECTION = new Map<OCPP20MeasurandEnumType, 'export' | 'import'>([
  [OCPP20MeasurandEnumType.ENERGY_ACTIVE_EXPORT_INTERVAL, 'export'],
  [OCPP20MeasurandEnumType.ENERGY_ACTIVE_EXPORT_REGISTER, 'export'],
  [OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL, 'import'],
  [OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, 'import'],
  [OCPP20MeasurandEnumType.POWER_ACTIVE_EXPORT, 'export'],
  [OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT, 'import'],
])

const normalizePhysicalMeterValueForStationAggregation = (
  meterValue: OCPP20MeterValue,
  currentType: CurrentType | undefined,
  conversionEfficiency: number
): OCPP20MeterValue => {
  const selectedSamples = new Map<
    string,
    { explicitInlet: boolean; sampledValue: OCPP20SampledValue }
  >()
  const passthroughSamples: OCPP20SampledValue[] = []
  for (const sampledValue of meterValue.sampledValue) {
    const additiveUnitFamily = getClockAlignedAdditiveUnitFamily(
      sampledValue.measurand,
      sampledValue.unitOfMeasure?.unit
    )
    if (additiveUnitFamily == null) {
      passthroughSamples.push(sampledValue)
      continue
    }
    const isOutlet = sampledValue.location === OCPP20LocationEnumType.Outlet
    const dcProjectionDirection =
      sampledValue.measurand == null
        ? undefined
        : DC_STATION_AGGREGATION_DIRECTION.get(sampledValue.measurand)
    const canPromoteOutletToInlet =
      isOutlet &&
      (currentType === CurrentType.DC
        ? dcProjectionDirection != null
        : sampledValue.measurand?.startsWith('Power.') === true ||
          sampledValue.measurand?.startsWith('Energy.') === true)
    if (isOutlet && !canPromoteOutletToInlet) {
      passthroughSamples.push(sampledValue)
      continue
    }
    const projectedValue =
      currentType === CurrentType.DC && canPromoteOutletToInlet
        ? dcProjectionDirection === 'import'
          ? sampledValue.value / conversionEfficiency
          : sampledValue.value * conversionEfficiency
        : sampledValue.value
    const normalizedSample = canPromoteOutletToInlet
      ? {
          ...sampledValue,
          location: OCPP20LocationEnumType.Inlet,
          value: projectedValue,
        }
      : sampledValue
    const unitNormalizedSample = normalizeClockAlignedAdditiveSample(
      normalizedSample,
      additiveUnitFamily
    )
    const key = JSON.stringify([
      unitNormalizedSample.measurand,
      unitNormalizedSample.context,
      unitNormalizedSample.location,
      unitNormalizedSample.phase,
      canonicalizeCustomData(unitNormalizedSample.customData),
    ])
    const explicitInlet = sampledValue.location === OCPP20LocationEnumType.Inlet
    const existing = selectedSamples.get(key)
    if (existing == null || (!existing.explicitInlet && explicitInlet)) {
      selectedSamples.set(key, { explicitInlet, sampledValue: normalizedSample })
    }
  }
  return {
    ...meterValue,
    sampledValue: [
      ...passthroughSamples,
      ...[...selectedSamples.values()].map(({ sampledValue }) => sampledValue),
    ],
  }
}

// An EVSE template describes one physical observation even when its additive
// samples are copied into multiple connector-scoped TransactionEvent payloads.
const filterDuplicateSharedEvseSamples = (
  meterValue: OCPP20MeterValue,
  seenSamples: Set<string>,
  registersOnly = false
): OCPP20MeterValue => ({
  ...meterValue,
  sampledValue: meterValue.sampledValue.filter(sampledValue => {
    if (registersOnly && sampledValue.measurand?.endsWith('.Register') !== true) return true
    const unitFamily = getClockAlignedAdditiveUnitFamily(
      sampledValue.measurand,
      sampledValue.unitOfMeasure?.unit
    )
    if (unitFamily == null) return true
    const normalizedSample = normalizeClockAlignedAdditiveSample(sampledValue, unitFamily)
    const identity = JSON.stringify([
      normalizedSample.measurand,
      normalizedSample.context,
      normalizedSample.location,
      normalizedSample.phase,
      canonicalizeCustomData(normalizedSample.customData),
      normalizedSample.unitOfMeasure?.unit,
      normalizedSample.unitOfMeasure?.multiplier,
    ])
    if (seenSamples.has(identity)) return false
    seenSamples.add(identity)
    return true
  }),
})

const isClockAlignedIntervalSample = (sampledValue: OCPP20SampledValue): boolean =>
  sampledValue.measurand?.startsWith('Energy.') === true &&
  sampledValue.measurand.endsWith('.Interval')

const clockAlignedSampleIdentity = (sampledValue: OCPP20SampledValue): string =>
  JSON.stringify([
    sampledValue.measurand,
    sampledValue.context,
    sampledValue.location,
    sampledValue.phase,
    canonicalizeCustomData(sampledValue.customData),
    sampledValue.unitOfMeasure?.unit,
    sampledValue.unitOfMeasure?.multiplier,
  ])

const coalesceClockAlignedMeterValuesRequests = (
  previous: OCPP20MeterValuesRequest,
  next: OCPP20MeterValuesRequest
): OCPP20MeterValuesRequest => {
  const targetMeterValue = next.meterValue.at(-1)
  if (targetMeterValue == null) return next
  const sampledValue = targetMeterValue.sampledValue.map(sample => ({ ...sample }))
  const intervalSamplesByIdentity = new Map<string, OCPP20SampledValue>()
  for (const sample of sampledValue) {
    if (!isClockAlignedIntervalSample(sample) || sample.signedMeterValue != null) continue
    intervalSamplesByIdentity.set(clockAlignedSampleIdentity(sample), sample)
  }
  const preservedSignedMeterValues: OCPP20MeterValue[] = []
  for (const meterValue of previous.meterValue) {
    const signedIntervalSamples: OCPP20SampledValue[] = []
    for (const previousSample of meterValue.sampledValue) {
      if (!isClockAlignedIntervalSample(previousSample)) continue
      if (previousSample.signedMeterValue != null) {
        signedIntervalSamples.push(structuredClone(previousSample))
        continue
      }
      const identity = clockAlignedSampleIdentity(previousSample)
      const currentSample = intervalSamplesByIdentity.get(identity)
      if (currentSample == null) {
        const preservedSample = { ...previousSample }
        sampledValue.push(preservedSample)
        intervalSamplesByIdentity.set(identity, preservedSample)
      } else {
        currentSample.value += previousSample.value
      }
    }
    if (signedIntervalSamples.length > 0) {
      preservedSignedMeterValues.push({ ...meterValue, sampledValue: signedIntervalSamples })
    }
  }
  return {
    ...next,
    meterValue: [
      ...preservedSignedMeterValues,
      ...next.meterValue.slice(0, -1),
      { ...targetMeterValue, sampledValue },
    ],
  }
}

const normalizeElectricalPhase = (phase: string | undefined): string | undefined => {
  switch (phase) {
    case 'L1':
    case 'L1-N':
      return 'L1'
    case 'L2':
    case 'L2-N':
      return 'L2'
    case 'L3':
    case 'L3-N':
      return 'L3'
    default:
      return phase
  }
}

const filterUnconvertibleDcStationSamples = (
  sampledValues: OCPP20SampledValue[],
  physicalBaseline: readonly OCPP20SampledValue[],
  currentType: CurrentType | undefined
): OCPP20SampledValue[] => {
  if (currentType !== CurrentType.DC) return sampledValues
  return sampledValues.filter(sampledValue => {
    if (
      sampledValue.location == null ||
      (sampledValue.measurand != null &&
        DC_STATION_AGGREGATION_DIRECTION.has(sampledValue.measurand))
    ) {
      return true
    }
    const matchingSources = physicalBaseline.filter(
      source =>
        source.measurand === sampledValue.measurand &&
        source.context === sampledValue.context &&
        normalizeElectricalPhase(source.phase) === normalizeElectricalPhase(sampledValue.phase) &&
        canonicalizeCustomData(source.customData) ===
          canonicalizeCustomData(sampledValue.customData)
    )
    return (
      matchingSources.length === 0 ||
      matchingSources.some(source => source.location === sampledValue.location)
    )
  })
}

const aggregateClockAlignedSamples = (
  meterValues: readonly OCPP20MeterValue[],
  numberOfPhases: number
): OCPP20SampledValue[] => {
  const samples = new Map<string, OCPP20SampledValue>()
  const phaseOnlyGroups = new Map<string, Map<string, OCPP20SampledValue>>()
  const buildKey = (sample: OCPP20SampledValue, additive: boolean): string =>
    JSON.stringify([
      sample.measurand,
      sample.context,
      sample.location,
      sample.phase,
      canonicalizeCustomData(sample.customData),
      ...(additive ? [] : [sample.unitOfMeasure?.unit, sample.unitOfMeasure?.multiplier]),
    ])
  const buildGroupKey = (sample: OCPP20SampledValue): string =>
    JSON.stringify([
      sample.measurand,
      sample.context,
      sample.location,
      sample.unitOfMeasure?.unit,
      sample.unitOfMeasure?.multiplier,
      canonicalizeCustomData(sample.customData),
    ])

  for (const meterValue of meterValues) {
    const meterSamples = new Map<string, { additive: boolean; sampledValue: OCPP20SampledValue }>()
    for (const sampledValue of meterValue.sampledValue) {
      const additiveUnitFamily = getClockAlignedAdditiveUnitFamily(
        sampledValue.measurand,
        sampledValue.unitOfMeasure?.unit
      )
      const normalizedSample =
        additiveUnitFamily != null
          ? normalizeClockAlignedAdditiveSample(sampledValue, additiveUnitFamily)
          : sampledValue
      meterSamples.set(buildKey(normalizedSample, additiveUnitFamily != null), {
        additive: additiveUnitFamily != null,
        sampledValue: normalizedSample,
      })
    }

    const meterGroups = Map.groupBy(
      [...meterSamples.values()].filter(({ additive }) => additive),
      ({ sampledValue }) => buildGroupKey(sampledValue)
    )
    for (const [groupKey, groupSamples] of meterGroups) {
      if (groupSamples.some(({ sampledValue }) => sampledValue.phase == null)) continue
      const meterPhases = new Map<string, OCPP20SampledValue>()
      for (const { sampledValue } of groupSamples) {
        const lineMatch =
          sampledValue.phase == null ? null : /^L([123])(?:-N)?$/.exec(sampledValue.phase)
        const line = lineMatch?.[1]
        if (line != null && !meterPhases.has(line)) meterPhases.set(line, sampledValue)
      }
      const accumulatedPhases =
        phaseOnlyGroups.get(groupKey) ?? new Map<string, OCPP20SampledValue>()
      for (const [line, sampledValue] of meterPhases) {
        const existing = accumulatedPhases.get(line)
        if (existing == null) {
          accumulatedPhases.set(line, { ...sampledValue })
        } else {
          existing.value += sampledValue.value
        }
      }
      phaseOnlyGroups.set(groupKey, accumulatedPhases)
    }

    for (const [key, { additive, sampledValue }] of meterSamples) {
      const existing = samples.get(key)
      if (existing != null && additive) {
        existing.value += sampledValue.value
        continue
      }
      if (existing == null) {
        const aggregate = { ...sampledValue }
        delete aggregate.signedMeterValue
        samples.set(key, aggregate)
      }
    }
  }

  for (const byLine of phaseOnlyGroups.values()) {
    if (byLine.size < Math.max(1, numberOfPhases)) continue
    const values = [...byLine.values()]
    const first = values[0]
    const total = values.reduce((sum, sample) => sum + sample.value, 0)
    const aggregate = {
      ...first,
      phase: undefined,
      value: first.measurand?.startsWith('Current.') === true ? total / values.length : total,
    }
    delete aggregate.signedMeterValue
    const key = buildKey(aggregate, true)
    const existing = samples.get(key)
    if (existing == null) {
      samples.set(key, aggregate)
    } else {
      existing.value += aggregate.value
    }
  }
  return [...samples.values()]
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class OCPP20ServiceUtils {
  private static readonly clockAlignedMeterValuesSendStates = new WeakMap<
    ChargingStation,
    Map<number, ClockAlignedMeterValuesSendState>
  >()

  private static readonly incomingRequestSchemaNames: readonly [
    OCPP20IncomingRequestCommand,
    string
  ][] = [
      [OCPP20IncomingRequestCommand.CERTIFICATE_SIGNED, 'CertificateSigned'],
      [OCPP20IncomingRequestCommand.CHANGE_AVAILABILITY, 'ChangeAvailability'],
      [OCPP20IncomingRequestCommand.CLEAR_CACHE, 'ClearCache'],
      [OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION, 'CustomerInformation'],
      [OCPP20IncomingRequestCommand.DATA_TRANSFER, 'DataTransfer'],
      [OCPP20IncomingRequestCommand.DELETE_CERTIFICATE, 'DeleteCertificate'],
      [OCPP20IncomingRequestCommand.GET_BASE_REPORT, 'GetBaseReport'],
      [OCPP20IncomingRequestCommand.GET_INSTALLED_CERTIFICATE_IDS, 'GetInstalledCertificateIds'],
      [OCPP20IncomingRequestCommand.GET_LOCAL_LIST_VERSION, 'GetLocalListVersion'],
      [OCPP20IncomingRequestCommand.GET_LOG, 'GetLog'],
      [OCPP20IncomingRequestCommand.GET_TRANSACTION_STATUS, 'GetTransactionStatus'],
      [OCPP20IncomingRequestCommand.GET_VARIABLES, 'GetVariables'],
      [OCPP20IncomingRequestCommand.INSTALL_CERTIFICATE, 'InstallCertificate'],
      [OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION, 'RequestStartTransaction'],
      [OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION, 'RequestStopTransaction'],
      [OCPP20IncomingRequestCommand.RESET, 'Reset'],
      [OCPP20IncomingRequestCommand.SEND_LOCAL_LIST, 'SendLocalList'],
      [OCPP20IncomingRequestCommand.SET_NETWORK_PROFILE, 'SetNetworkProfile'],
      [OCPP20IncomingRequestCommand.SET_VARIABLES, 'SetVariables'],
      [OCPP20IncomingRequestCommand.TRIGGER_MESSAGE, 'TriggerMessage'],
      [OCPP20IncomingRequestCommand.UNLOCK_CONNECTOR, 'UnlockConnector'],
      [OCPP20IncomingRequestCommand.UPDATE_FIRMWARE, 'UpdateFirmware'],
    ]

  private static readonly outgoingRequestSchemaNames: readonly [OCPP20RequestCommand, string][] = [
    [OCPP20RequestCommand.AUTHORIZE, 'Authorize'],
    [OCPP20RequestCommand.BOOT_NOTIFICATION, 'BootNotification'],
    [OCPP20RequestCommand.DATA_TRANSFER, 'DataTransfer'],
    [OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION, 'FirmwareStatusNotification'],
    [OCPP20RequestCommand.GET_15118_EV_CERTIFICATE, 'Get15118EVCertificate'],
    [OCPP20RequestCommand.GET_CERTIFICATE_STATUS, 'GetCertificateStatus'],
    [OCPP20RequestCommand.HEARTBEAT, 'Heartbeat'],
    [OCPP20RequestCommand.LOG_STATUS_NOTIFICATION, 'LogStatusNotification'],
    [OCPP20RequestCommand.METER_VALUES, 'MeterValues'],
    [OCPP20RequestCommand.NOTIFY_CUSTOMER_INFORMATION, 'NotifyCustomerInformation'],
    [OCPP20RequestCommand.NOTIFY_REPORT, 'NotifyReport'],
    [OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION, 'SecurityEventNotification'],
    [OCPP20RequestCommand.SIGN_CERTIFICATE, 'SignCertificate'],
    [OCPP20RequestCommand.STATUS_NOTIFICATION, 'StatusNotification'],
    [OCPP20RequestCommand.TRANSACTION_EVENT, 'TransactionEvent'],
  ]

  private static readonly pendingTransactionEventDeliveryCounts = new WeakMap<
    ConnectorStatus,
    Map<string, number>
  >()

  private static readonly replayedTransactionEventRequests =
    new WeakSet<OCPP20TransactionEventRequest>()

  private static readonly retryableTransactionEventQueueFailures = new WeakSet<ConnectorStatus>()
  private static readonly saturatedTransactionEventQueues = new WeakSet<ConnectorStatus>()
  private static readonly transactionEventQueueDrains = new WeakSet<ConnectorStatus>()
  private static readonly transactionEventSendChains = new WeakMap<
    ConnectorStatus,
    Promise<unknown>
  >()

  /**
   * @param chargingStation - Target charging station for EVSE resolution
   * @param commandParams - StatusNotification input; `connectorStatus` takes precedence over `status`
   * @returns Formatted OCPP 2.0.1 StatusNotification request payload
   * @throws {OCPPError} When the EVSE id cannot be resolved or the connector status is missing/not a valid OCPP 2.0.1 status
   */
  public static buildStatusNotificationRequest (
    chargingStation: ChargingStation,
    commandParams: StatusNotificationOptions
  ): OCPP20StatusNotificationRequest {
    const { connectorId, evseId } = commandParams
    const connectorStatus = commandParams.connectorStatus ?? commandParams.status
    const resolvedEvseId = evseId ?? chargingStation.getEvseIdByConnectorId(connectorId)
    if (resolvedEvseId === undefined) {
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Cannot build status notification payload: evseId is undefined for connector ${connectorId.toString()}`,
        RequestCommand.STATUS_NOTIFICATION
      )
    }
    if (connectorStatus == null || !isOCPP20ConnectorStatus(connectorStatus)) {
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Cannot build status notification payload: invalid connector status for connector ${connectorId.toString()}`,
        RequestCommand.STATUS_NOTIFICATION
      )
    }
    return {
      connectorId,
      connectorStatus,
      evseId: resolvedEvseId,
      timestamp: new Date(),
    } satisfies OCPP20StatusNotificationRequest
  }

  /**
   * Build a transaction MeterValue while keeping a shared EVSE register single-writer.
   * @param chargingStation - Target charging station
   * @param connectorId - EVSE-local connector identifier
   * @param evseId - EVSE identifier
   * @param transactionId - Active transaction identifier
   * @param interval - Sampling interval in milliseconds
   * @param measurandsKey - Configuration key selecting sampled measurands
   * @param context - MeterValue reading context
   * @param timestamp - Optional shared observation timestamp
   * @param energyNominalIntervalOverride - Optional cadence governing elapsed legacy energy.
   * @param settlementOnly - Build an unsigned accounting snapshot that is not sent on the wire.
   * @returns Populated OCPP 2.0 MeterValue
   */
  public static buildTransactionMeterValue (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId: number | undefined,
    transactionId: number | string,
    interval: number,
    measurandsKey?: ConfigurationKeyType,
    context?: OCPP20ReadingContextEnumType,
    timestamp?: Date,
    energyNominalIntervalOverride?: number,
    settlementOnly = false
  ): OCPP20MeterValue {
    const evseStatus = evseId != null ? chargingStation.getEvseStatus(evseId) : undefined
    const usesSharedEvseRegister =
      evseId != null &&
      evseId !== 0 &&
      isNotEmptyArray(evseStatus?.MeterValues) &&
      chargingStation.stationInfo?.meteringPerTransaction !== true
    const connectors = usesSharedEvseRegister
      ? [...evseStatus.connectors.entries()].sort(
          ([leftConnectorId], [rightConnectorId]) => leftConnectorId - rightConnectorId
        )
      : []
    const coherentSession = chargingStation.getCoherentSession(transactionId)
    const energyNominalInterval =
      energyNominalIntervalOverride ??
      getTransactionEnergyNominalInterval(chargingStation, interval)
    const meterValueTimestamp = timestamp ?? new Date()
    const previousSharedEnergyUpdate = evseStatus?.energyActiveImportRegisterLastUpdatedAt
    const sharedEnergyInterval = getSharedEnergyObservationInterval(
      connectors,
      previousSharedEnergyUpdate,
      meterValueTimestamp,
      interval
    )
    const hasCoherentTransaction = connectors.some(([, status]) => {
      return (
        canContributeToSharedObservation(status, context) &&
        status.transactionId != null &&
        chargingStation.getCoherentSession(status.transactionId) != null
      )
    })
    const isNewLegacySharedObservation =
      !hasCoherentTransaction &&
      (evseStatus?.energyActiveImportRegisterLastUpdatedAt == null ||
        meterValueTimestamp > evseStatus.energyActiveImportRegisterLastUpdatedAt)
    const sharedEnergyOwnerConnectorId = usesSharedEvseRegister
      ? hasCoherentTransaction
        ? coherentSession != null || context !== OCPP20ReadingContextEnumType.SAMPLE_CLOCK
          ? connectorId
          : (connectors.find(([, status]) => {
              return (
                canAdvanceAlignedEnergy(status) &&
                status.transactionId != null &&
                chargingStation.getCoherentSession(status.transactionId) == null
              )
            })?.[0] ?? connectors.find(([, status]) => canAdvanceAlignedEnergy(status))?.[0])
        : isNewLegacySharedObservation
          ? connectorId
          : undefined
      : undefined
    let sharedEnergyRegisterWh = usesSharedEvseRegister
      ? connectors.reduce(
        (total, [, status]) => total + Math.max(0, status.energyActiveImportRegisterValue ?? 0),
        0
      )
      : undefined
    const ownerTransactionId = connectors.find(
      ([candidateConnectorId]) => candidateConnectorId === sharedEnergyOwnerConnectorId
    )?.[1].transactionId
    const ownerSession =
      ownerTransactionId != null
        ? chargingStation.getCoherentSession(ownerTransactionId)
        : undefined
    if (
      usesSharedEvseRegister &&
      connectorId === sharedEnergyOwnerConnectorId &&
      context !== OCPP20ReadingContextEnumType.TRANSACTION_BEGIN
    ) {
      const sampledAtMs = meterValueTimestamp.getTime()
      if (ownerSession != null) {
        const legacyOwner = connectors.find(([, status]) => {
          return (
            canContributeToSharedObservation(status, context) &&
            status.transactionId != null &&
            chargingStation.getCoherentSession(status.transactionId) == null
          )
        })
        if (legacyOwner != null) {
          const [legacyConnectorId, legacyConnectorStatus] = legacyOwner
          const previousLegacyEnergyWh = Math.max(
            0,
            legacyConnectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
          )
          const legacyObservationInterval = getTransactionObservationInterval(
            legacyConnectorStatus,
            meterValueTimestamp,
            energyNominalInterval ?? interval
          )
          buildMeterValue(
            chargingStation,
            legacyConnectorStatus.transactionId,
            interval,
            measurandsKey,
            OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
            false,
            {
              advanceEnergy: false,
              connectorId: legacyConnectorId,
              deferEnergyInterval: true,
              energyNominalInterval,
              energyRegisterWhOverride: sharedEnergyRegisterWh,
              evseId,
              suppressSigning: true,
              timestamp: meterValueTimestamp,
            }
          )
          const legacyObservationEnergyWh = Math.max(
            0,
            (legacyConnectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) -
              previousLegacyEnergyWh
          )
          recordPendingSharedEnergy(ownerSession, legacyObservationEnergyWh)
          for (const [otherLegacyConnectorId, otherLegacyStatus] of connectors) {
            if (
              otherLegacyConnectorId === legacyConnectorId ||
              !canContributeToSharedObservation(otherLegacyStatus, context) ||
              otherLegacyStatus.transactionId == null ||
              chargingStation.getCoherentSession(otherLegacyStatus.transactionId) != null ||
              (otherLegacyStatus.transactionEnergyActiveImportRegisterLastUpdatedAt != null &&
                otherLegacyStatus.transactionEnergyActiveImportRegisterLastUpdatedAt >=
                  meterValueTimestamp)
            ) {
              continue
            }
            const peerObservationEnergyWh = prorateSharedObservationEnergy(
              legacyObservationEnergyWh,
              legacyObservationInterval,
              otherLegacyStatus,
              meterValueTimestamp,
              energyNominalInterval ?? interval
            )
            otherLegacyStatus.transactionEnergyActiveImportRegisterValue =
              Math.max(0, otherLegacyStatus.transactionEnergyActiveImportRegisterValue ?? 0) +
              peerObservationEnergyWh
            otherLegacyStatus.transactionEnergyActiveImportRegisterLastUpdatedAt =
              meterValueTimestamp
          }
        }
      }
      for (const [otherConnectorId, otherConnectorStatus] of connectors) {
        if (
          otherConnectorId === connectorId ||
          !canContributeToSharedObservation(otherConnectorStatus, context)
        ) {
          continue
        }
        const otherTransactionId = otherConnectorStatus.transactionId
        const otherSession =
          otherTransactionId != null
            ? chargingStation.getCoherentSession(otherTransactionId)
            : undefined
        if (otherSession == null) continue
        const sample = computeCoherentSampleAtTime(
          chargingStation,
          otherConnectorStatus,
          otherSession,
          {
            intervalMs: energyNominalInterval ?? interval,
            nowMs: sampledAtMs,
            rootSeed: resolveRootSeed(chargingStation.stationInfo),
          },
          evseId
        )
        advanceTransactionEnergyRegister(otherConnectorStatus, sample.deltaEnergyWh)
        const pendingSharedEnergyWh = consumePendingSharedEnergy(otherSession, sample.deltaEnergyWh)
        if (ownerSession != null) {
          recordPendingSharedEnergy(ownerSession, pendingSharedEnergyWh)
        } else {
          const ownerStatus = connectors.find(
            ([candidateConnectorId]) => candidateConnectorId === sharedEnergyOwnerConnectorId
          )?.[1]
          advanceConnectorEnergyRegister(ownerStatus, pendingSharedEnergyWh)
          advanceStationEnergyRegister(
            chargingStation,
            evseId,
            otherSession.currentType,
            MeterValueLocation.OUTLET,
            pendingSharedEnergyWh
          )
          if (sharedEnergyRegisterWh != null) sharedEnergyRegisterWh += pendingSharedEnergyWh
        }
      }
    }
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    const sharedRegisterBeforeRequestedBuild = sharedEnergyRegisterWh
    const meterValue = buildMeterValue(
      chargingStation,
      transactionId,
      interval,
      measurandsKey,
      context,
      false,
      {
        connectorId,
        energyNominalInterval,
        ...(evseId != null && { evseId }),
        timestamp: meterValueTimestamp,
        ...(settlementOnly && { deferEnergyInterval: true, suppressSigning: true }),
        ...(usesSharedEvseRegister && {
          advanceEnergy: connectorId === sharedEnergyOwnerConnectorId,
          ...(connectorId === sharedEnergyOwnerConnectorId &&
            context !== OCPP20ReadingContextEnumType.TRANSACTION_BEGIN && {
            energyElapsedInterval: sharedEnergyInterval,
          }),
          energyRegisterWhOverride: sharedEnergyRegisterWh,
        }),
      }
    ) as OCPP20MeterValue
    const sharedObservationEnergyWh =
      usesSharedEvseRegister &&
      context !== OCPP20ReadingContextEnumType.TRANSACTION_BEGIN &&
      connectorId === sharedEnergyOwnerConnectorId &&
      connectorStatus?.transactionEnergyActiveImportRegisterLastUpdatedAt?.getTime() ===
        meterValueTimestamp.getTime()
        ? Math.max(
          0,
          connectors.reduce(
            (total, [, status]) =>
              total + Math.max(0, status.energyActiveImportRegisterValue ?? 0),
            0
          ) - (sharedRegisterBeforeRequestedBuild ?? 0)
        )
        : undefined
    if (sharedObservationEnergyWh != null) {
      if (evseStatus != null && sharedObservationEnergyWh > 0) {
        evseStatus.energyActiveImportRegisterValue =
          Math.max(0, evseStatus.energyActiveImportRegisterValue ?? 0) + sharedObservationEnergyWh
      }
      const sharedObservationInterval = sharedEnergyInterval
      if (
        evseStatus != null &&
        (previousSharedEnergyUpdate == null || meterValueTimestamp > previousSharedEnergyUpdate)
      ) {
        evseStatus.energyActiveImportRegisterLastUpdatedAt = meterValueTimestamp
      }
      if (coherentSession == null) {
        for (const [otherConnectorId, otherConnectorStatus] of connectors) {
          if (
            otherConnectorId === connectorId ||
            otherConnectorStatus.transactionId == null ||
            chargingStation.getCoherentSession(otherConnectorStatus.transactionId) != null ||
            (!canAdvanceAlignedEnergy(otherConnectorStatus) &&
              !(
                context === OCPP20ReadingContextEnumType.TRANSACTION_END &&
                hasOngoingTransaction(otherConnectorStatus)
              )) ||
            (otherConnectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt != null &&
              otherConnectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt >=
                meterValueTimestamp)
          ) {
            continue
          }
          const peerObservationEnergyWh = prorateSharedObservationEnergy(
            sharedObservationEnergyWh,
            sharedObservationInterval,
            otherConnectorStatus,
            meterValueTimestamp,
            energyNominalInterval ?? interval
          )
          otherConnectorStatus.transactionEnergyActiveImportRegisterValue =
            Math.max(0, otherConnectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) +
            peerObservationEnergyWh
          otherConnectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt =
            meterValueTimestamp
        }
      }
    }
    return meterValue
  }

  /**
   * Build meter values for the start of a transaction.
   * @param chargingStation - Target charging station
   * @param transactionId - Transaction identifier
   * @returns Array of OCPP 2.0.1 meter values at transaction begin
   */
  static buildTransactionStartedMeterValues (
    chargingStation: ChargingStation,
    transactionId: number | string
  ): OCPP20MeterValue[] {
    try {
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.SampledDataCtrlr,
        OCPP20RequiredVariableName.TxStartedMeasurands
      )
      const connectorId = chargingStation.getConnectorIdByTransactionId(transactionId)
      const evseId = chargingStation.getEvseIdByTransactionId(transactionId)
      const startedMeterValue =
        connectorId != null
          ? OCPP20ServiceUtils.buildTransactionMeterValue(
            chargingStation,
            connectorId,
            evseId,
            transactionId,
            0,
            measurandsKey,
            OCPP20ReadingContextEnumType.TRANSACTION_BEGIN
          )
          : ({ sampledValue: [], timestamp: new Date() } as OCPP20MeterValue)
      return isNotEmptyArray(startedMeterValue.sampledValue) ? [startedMeterValue] : []
    } catch (error) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.buildTransactionStartedMeterValues: ${getErrorMessage(error)}`
      )
      return []
    }
  }

  /**
   * Clean up connector state after a transaction has ended.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   * @param connectorStatus - Connector status to reset
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   * @param expectedTransactionId - Transaction that is allowed to own the connector cleanup
   * @returns Whether the expected transaction was finalized
   */
  public static async cleanupEndedTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus,
    evseId?: number,
    expectedTransactionId?: string
  ): Promise<boolean> {
    if (
      expectedTransactionId != null &&
      connectorStatus.transactionId?.toString() !== expectedTransactionId
    ) {
      return false
    }
    if (
      connectorStatus.transactionStarted !== true &&
      connectorStatus.transactionPending !== true &&
      connectorStatus.transactionStarting !== true &&
      connectorStatus.transactionEnding !== true
    ) {
      return false
    }
    const txId = connectorStatus.transactionId
    const postTransactionDelay = chargingStation.stationInfo?.postTransactionDelay ?? 0
    OCPP20ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId, evseId)
    resetConnectorStatus(connectorStatus)
    chargingStation.destroyCoherentSession(txId)
    // Persist an unlocked terminal state: the in-memory lock only represents
    // this process' unplug-delay timer and cannot be resumed after a restart.
    connectorStatus.locked = false
    const lifecycleAbortSignal = (chargingStation as { lifecycleAbortSignal?: AbortSignal })
      .lifecycleAbortSignal
    if (postTransactionDelay > 0 && !chargingStation.isStopping()) {
      connectorStatus.postTransactionDelayTransactionId = txId
      chargingStation.saveTransactionEventQueues()
      // The connector remains occupied during the configured unplug delay.
      connectorStatus.locked = true
      if (lifecycleAbortSignal == null) {
        await sleep(secondsToMilliseconds(postTransactionDelay))
      } else {
        await interruptibleSleep(secondsToMilliseconds(postTransactionDelay), lifecycleAbortSignal)
      }
    }
    if (
      connectorStatus.postTransactionDelayTransactionId != null &&
      connectorStatus.postTransactionDelayTransactionId !== txId
    ) {
      return true
    }
    if (connectorStatus.postTransactionDelayTransactionId === txId) {
      delete connectorStatus.postTransactionDelayTransactionId
    }
    const currentConnectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    if (
      currentConnectorStatus !== connectorStatus ||
      connectorStatus.transactionId != null ||
      connectorStatus.transactionStarted === true ||
      connectorStatus.transactionPending === true ||
      connectorStatus.transactionStarting === true ||
      connectorStatus.transactionEnding === true
    ) {
      return true
    }
    connectorStatus.locked = false
    if (
      !chargingStation.started ||
      chargingStation.isStopping() ||
      lifecycleAbortSignal?.aborted === true
    ) {
      connectorStatus.status =
        chargingStation.isChargingStationAvailable() &&
        connectorStatus.availability === AvailabilityType.Operative
          ? OCPP20ConnectorStatusEnumType.Available
          : OCPP20ConnectorStatusEnumType.Unavailable
      chargingStation.saveTransactionEventQueues()
      return true
    }
    sendPostTransactionStatus(chargingStation, connectorId, evseId, {
      responseTimeoutMs: OCPP20ServiceUtils.readVariableAsIntervalMs(
        chargingStation,
        OCPP20ComponentName.OCPPCommCtrlr,
        OCPP20RequiredVariableName.MessageTimeout,
        Constants.DEFAULT_MESSAGE_TIMEOUT_SECONDS
      ),
      waitForResponse: false,
    }).catch((error: unknown) => {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.cleanupEndedTransaction: Failed to send post-transaction status:`,
        error
      )
    })
    chargingStation.saveTransactionEventQueues()
    return true
  }

  /**
   * OCPP 2.0.1 §8.1-§8.3 RetryBackOff reconnection delay computation.
   * @param chargingStation - Target charging station
   * @param retryCount - Current websocket connection retry count
   * @returns Reconnect delay in milliseconds
   */
  public static computeReconnectDelay (
    chargingStation: ChargingStation,
    retryCount: number
  ): number {
    const waitMinimum = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.RetryBackOffWaitMinimum,
      OCPP20Constants.DEFAULT_RETRY_BACKOFF_WAIT_MINIMUM_SECONDS
    )
    const randomRange = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.RetryBackOffRandomRange,
      OCPP20Constants.DEFAULT_RETRY_BACKOFF_RANDOM_RANGE_SECONDS
    )
    const repeatTimes = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20OptionalVariableName.RetryBackOffRepeatTimes,
      OCPP20Constants.DEFAULT_RETRY_BACKOFF_REPEAT_TIMES
    )
    return computeExponentialBackOffDelay({
      baseDelayMs: secondsToMilliseconds(waitMinimum),
      jitterMs: secondsToMilliseconds(randomRange),
      maxRetries: repeatTimes,
      retryNumber: Math.max(0, retryCount - 1),
    })
  }

  /**
   * OCPP 2.0.1 Incoming Request Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestPayloadConfigs = (): [
    OCPP20IncomingRequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP20ServiceUtils.incomingRequestSchemaNames, 'Request.json')

  /**
   * Configuration for OCPP 2.0.1 Incoming Request Response validators
   * @returns Array of validator configuration tuples
   */
  public static createIncomingRequestResponsePayloadConfigs = (): [
    OCPP20IncomingRequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP20ServiceUtils.incomingRequestSchemaNames, 'Response.json')

  /**
   * Factory options for OCPP 2.0.1 payload validators
   * @param moduleName - Name of the OCPP module
   * @param methodName - Name of the method/command
   * @returns Factory options object for OCPP 2.0.1 validators
   */
  public static createPayloadOptions = (moduleName: string, methodName: string) =>
    PayloadValidatorOptions(
      OCPPVersion.VERSION_201,
      'assets/json-schemas/ocpp/2.0',
      moduleName,
      methodName
    )

  /**
   * OCPP 2.0.1 Request Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createRequestPayloadConfigs = (): [
    OCPP20RequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP20ServiceUtils.outgoingRequestSchemaNames, 'Request.json')

  /**
   * OCPP 2.0.1 Response Service validator configurations
   * @returns Array of validator configuration tuples
   */
  public static createResponsePayloadConfigs = (): [
    OCPP20RequestCommand,
    { schemaPath: string }
  ][] => createPayloadConfigs(OCPP20ServiceUtils.outgoingRequestSchemaNames, 'Response.json')

  /**
   * One tick of the station-scoped clock-aligned MeterValues sweep (#2011
   * Category 2F, J01.FR.14/J01.FR.20/J01.FR.21/J01.FR.22). Called by the
   * station-level aligned timer; every gate is re-read per tick so
   * configuration changes take effect without re-arming:
   * - `AlignedDataCtrlr.Interval <= 0` disables transmission (spec §2.2). Read
   *   raw (not via {@link OCPP20ServiceUtils.getAlignedDataInterval}) because
   *   `readVariableAsIntervalMs` clamps non-positive values to the default.
   * - `AlignedDataCtrlr.Enabled=false` (the default) disables the feature.
   * - The station-scoped `SendDuringIdle=true` suppresses the whole sweep
   *   while any transaction is ongoing (J01.FR.20).
   * EVSEs without a transaction get one aggregated `MeterValuesRequest` with
   * ReadingContext Sample.Clock while online. Each active connector reports
   * its sample in `TransactionEvent(Updated, MeterValueClock)` and queues it
   * while offline so transaction identity and sequence state remain attached.
   * @param chargingStation - Target charging station
   * @param timestamp - UTC slot timestamp shared by every message in this sweep
   */
  public static async emitClockAlignedMeterValues (
    chargingStation: ChargingStation,
    timestamp = new Date()
  ): Promise<void> {
    const alignedDataIntervalSeconds =
      OCPP20ServiceUtils.readAlignedDataIntervalSeconds(chargingStation)
    if (alignedDataIntervalSeconds == null || alignedDataIntervalSeconds === 0) {
      return
    }
    const alignedDataEnabled = OCPP20ServiceUtils.readVariableAsBoolean(
      chargingStation,
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20RequiredVariableName.Enabled,
      false
    )
    if (!alignedDataEnabled) {
      return
    }
    const sendDuringIdle = OCPP20ServiceUtils.isAlignedDataSendDuringIdleEnabled(chargingStation)
    // J01.FR.20: the station-scoped value suppresses the whole charging
    // station. More specific EVSE values are applied in the EVSE sweep below.
    // A pending remote start is not ongoing until its Started event is accepted.
    if (
      sendDuringIdle &&
      chargingStation
        .iterateConnectors(true)
        .some(({ connectorStatus }) => hasOngoingTransaction(connectorStatus))
    ) {
      return
    }
    const responseTimeoutMs = OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20RequiredVariableName.MessageTimeout,
      Constants.DEFAULT_MESSAGE_TIMEOUT_SECONDS,
      'Default'
    )
    const measurandsKey = buildConfigKey(
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20RequiredVariableName.Measurands
    )
    const alignedEnergySamples = hasConfiguredAlignedEnergyMeasurand(chargingStation)
    const alignedIntervalEnergySamples =
      getConfigurationKey(chargingStation, measurandsKey)
        ?.value?.split(',')
        .some(
          measurand =>
            measurand.trim() === (OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL as string)
        ) === true
    const alignedInterval = secondsToMilliseconds(alignedDataIntervalSeconds)
    const alignedIntervalBaselineKey = measurandsKey
    const stationIntervalBaselineKey = `station:${alignedIntervalBaselineKey}`
    const stationIntervalBaselinesBeforeBuild = new Map(
      [...chargingStation.iterateConnectors(true)].map(({ connectorStatus }) => [
        connectorStatus,
        connectorStatus.transactionEnergyActiveImportIntervalBaselines?.[
          stationIntervalBaselineKey
        ],
      ])
    )
    const restoreStationIntervalBaselines = (): void => {
      for (const [connectorStatus, baseline] of stationIntervalBaselinesBeforeBuild) {
        if (baseline == null) {
          const baselines = connectorStatus.transactionEnergyActiveImportIntervalBaselines
          if (baselines != null) {
            const { [stationIntervalBaselineKey]: _removed, ...remainingBaselines } = baselines
            connectorStatus.transactionEnergyActiveImportIntervalBaselines = remainingBaselines
          }
        } else {
          connectorStatus.transactionEnergyActiveImportIntervalBaselines ??= {}
          connectorStatus.transactionEnergyActiveImportIntervalBaselines[
            stationIntervalBaselineKey
          ] = baseline
        }
      }
    }
    const transactionEnergyNominalInterval = getTransactionEnergyNominalInterval(
      chargingStation,
      alignedInterval
    )
    const canSendNonTransactional =
      chargingStation.isWebSocketConnectionOpened() && chargingStation.inAcceptedState()
    const pendingRequests: { evseId: number; send: () => Promise<void> }[] = []
    const physicalMeterValues: OCPP20MeterValue[] = []
    const evses = [...chargingStation.iterateEvses()].sort(
      ({ evseId: left }, { evseId: right }) => {
        if (left === 0) return 1
        if (right === 0) return -1
        return left - right
      }
    )
    for (const { evseId, evseStatus } of evses) {
      const evseIntervalBaselineBeforeBuild = evseStatus.energyActiveImportIntervalBaseline
      let evseInTransaction = false
      for (const connectorStatus of evseStatus.connectors.values()) {
        if (hasOngoingTransaction(connectorStatus)) {
          evseInTransaction = true
          break
        }
      }
      const usesEvseMeterTemplate = evseId !== 0 && isNotEmptyArray(evseStatus.MeterValues)
      const connectors = [...evseStatus.connectors.entries()].sort(
        ([leftConnectorId], [rightConnectorId]) => leftConnectorId - rightConnectorId
      )
      const stationIntervalInitialBaselines = new Map(
        connectors.map(([connectorId, connectorStatus]) => {
          const transactionRegister =
            connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
          const alignedTransactionBaseline =
            connectorStatus.transactionEnergyActiveImportIntervalBaselines?.[
              alignedIntervalBaselineKey
            ] ?? 0
          return [
            connectorId,
            Math.max(
              0,
              (connectorStatus.energyActiveImportRegisterValue ?? 0) -
                Math.max(0, transactionRegister - alignedTransactionBaseline)
            ),
          ]
        })
      )
      const sharedEnergyInterval = getSharedEnergyObservationInterval(
        connectors,
        evseStatus.energyActiveImportRegisterLastUpdatedAt,
        timestamp,
        alignedInterval
      )
      const hasCoherentTransaction = connectors.some(([, connectorStatus]) => {
        return (
          canAdvanceAlignedEnergy(connectorStatus) &&
          connectorStatus.transactionId != null &&
          chargingStation.getCoherentSession(connectorStatus.transactionId) != null
        )
      })
      const sharedEvseEnergyOwnerConnectorId =
        usesEvseMeterTemplate &&
        evseInTransaction &&
        chargingStation.stationInfo?.meteringPerTransaction !== true
          ? ((hasCoherentTransaction
              ? connectors.find(([, connectorStatus]) => {
                return (
                  canAdvanceAlignedEnergy(connectorStatus) &&
                    connectorStatus.transactionId != null &&
                    chargingStation.getCoherentSession(connectorStatus.transactionId) == null
                )
              })?.[0]
              : undefined) ??
            connectors.find(([, connectorStatus]) => canAdvanceAlignedEnergy(connectorStatus))?.[0])
          : undefined
      let evseEnergyActiveImportRegisterValue = usesEvseMeterTemplate
        ? [...evseStatus.connectors.values()].reduce(
            (total, connectorStatus) =>
              total + Math.max(0, connectorStatus.energyActiveImportRegisterValue ?? 0),
            0
          )
        : undefined
      const suppressEvseEmission =
        evseId !== 0 &&
        evseInTransaction &&
        OCPP20ServiceUtils.isAlignedDataSendDuringIdleEnabled(chargingStation, evseId)
      const meterValues: OCPP20MeterValue[] = []
      const sampledValueTemplates: SampledValueTemplate[] = []
      let idleMeterConnectorId: number | undefined
      const physicalEvseRegisterSamples =
        usesEvseMeterTemplate && evseInTransaction ? new Set<string>() : undefined
      let sharedIntervalObservationRecorded = false
      const sharedOwnerStatus =
        sharedEvseEnergyOwnerConnectorId != null
          ? evseStatus.connectors.get(sharedEvseEnergyOwnerConnectorId)
          : undefined
      const sharedOwnerTransactionId = sharedOwnerStatus?.transactionId
      const sharedOwnerSession =
        sharedOwnerTransactionId != null
          ? chargingStation.getCoherentSession(sharedOwnerTransactionId)
          : undefined
      if (sharedEvseEnergyOwnerConnectorId != null) {
        for (const [connectorId, connectorStatus] of connectors) {
          if (
            connectorId === sharedEvseEnergyOwnerConnectorId ||
            !canAdvanceAlignedEnergy(connectorStatus)
          ) {
            continue
          }
          const transactionId = connectorStatus.transactionId
          const session =
            transactionId != null ? chargingStation.getCoherentSession(transactionId) : undefined
          if (session == null) continue
          const sample = computeCoherentSampleAtTime(
            chargingStation,
            connectorStatus,
            session,
            {
              intervalMs: transactionEnergyNominalInterval ?? alignedInterval,
              nowMs: timestamp.getTime(),
              rootSeed: resolveRootSeed(chargingStation.stationInfo),
            },
            evseId
          )
          advanceTransactionEnergyRegister(connectorStatus, sample.deltaEnergyWh)
          connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = timestamp
          const pendingSharedEnergyWh = consumePendingSharedEnergy(session, sample.deltaEnergyWh)
          if (sharedOwnerSession != null) {
            recordPendingSharedEnergy(sharedOwnerSession, pendingSharedEnergyWh)
          } else {
            advanceConnectorEnergyRegister(sharedOwnerStatus, pendingSharedEnergyWh)
            advanceStationEnergyRegister(
              chargingStation,
              evseId,
              session.currentType,
              MeterValueLocation.OUTLET,
              pendingSharedEnergyWh
            )
            if (evseEnergyActiveImportRegisterValue != null) {
              evseEnergyActiveImportRegisterValue += pendingSharedEnergyWh
            }
          }
        }
      }
      const connectorsInBuildOrder =
        sharedEvseEnergyOwnerConnectorId != null
          ? [
              ...connectors.filter(
                ([connectorId]) => connectorId === sharedEvseEnergyOwnerConnectorId
              ),
              ...connectors.filter(
                ([connectorId]) => connectorId !== sharedEvseEnergyOwnerConnectorId
              ),
            ]
          : connectors
      for (const [connectorId, connectorStatus] of connectorsInBuildOrder) {
        if (!evseInTransaction && usesEvseMeterTemplate && idleMeterConnectorId != null) continue
        // A transaction whose Ended delivery is in flight already reports as
        // an idle meter point; it must not emit another Updated event.
        // Only accepted Started transactions get TransactionEvent(Updated).
        // A pending remote start remains idle until then and reports through
        // the non-transactional MeterValues path.
        const transactionId =
          connectorStatus.transactionEnding !== true &&
          !hasQueuedEndedEvent(connectorStatus) &&
          connectorStatus.transactionStarted === true &&
          connectorStatus.transactionId != null
            ? connectorStatus.transactionId
            : undefined
        if (evseInTransaction && transactionId == null && usesEvseMeterTemplate) continue
        try {
          let sharedObservationEnergyWh: number | undefined
          let stationAlignedTransactionEnergyWh: number | undefined
          const stationBaseline =
            evseId === 0
              ? aggregateClockAlignedSamples(
                physicalMeterValues,
                chargingStation.getNumberOfPhases()
              )
                .filter(
                  sampledValue =>
                    sampledValue.measurand !== OCPP20MeasurandEnumType.STATE_OF_CHARGE
                )
                .sort(
                  (left, right) =>
                    Number(right.location === OCPP20LocationEnumType.Inlet) -
                      Number(left.location === OCPP20LocationEnumType.Inlet)
                )
              : undefined
          const sharedRegisterBeforeBuild = evseEnergyActiveImportRegisterValue
          const transactionIntervalCarryBeforeBuild =
            Math.max(
              0,
              (connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) -
                (connectorStatus.transactionEnergyActiveImportIntervalBaselines?.[
                  alignedIntervalBaselineKey
                ] ?? 0)
            ) +
            (connectorStatus.transactionEnergyActiveImportIntervalCarry?.[
              alignedIntervalBaselineKey
            ] ?? 0)
          const transactionRegisterBeforeBuild =
            connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
          let meterValue = buildClockAlignedConnectorMeterValue(
            chargingStation,
            {
              connectorId,
              deferEnergyInterval: suppressEvseEmission,
              suppressSigning: suppressEvseEmission,
              ...(evseId !== 0 &&
                (alignedEnergySamples ||
                  (transactionId != null &&
                    chargingStation.getCoherentSession(transactionId) != null)) &&
                canAdvanceAlignedEnergy(connectorStatus) &&
                transactionId != null && {
                advanceEnergy:
                    sharedEvseEnergyOwnerConnectorId == null ||
                    connectorId === sharedEvseEnergyOwnerConnectorId,
                ...(connectorId === sharedEvseEnergyOwnerConnectorId && {
                  energyElapsedInterval: sharedEnergyInterval,
                }),
                ...(transactionEnergyNominalInterval != null && {
                  energyNominalInterval: transactionEnergyNominalInterval,
                }),
              }),
              ...(evseId === 0 && {
                idle: !chargingStation
                  .iterateConnectors(true)
                  .some(({ connectorStatus }) => hasOngoingTransaction(connectorStatus)),
                sampledValueBaseline: stationBaseline,
              }),
              ...(usesEvseMeterTemplate &&
                (!evseInTransaction ||
                  chargingStation.stationInfo?.meteringPerTransaction !== true) && {
                energyRegisterWhOverride: evseEnergyActiveImportRegisterValue,
              }),
              evseId,
              timestamp,
              ...(transactionId != null && { transactionId }),
            },
            alignedInterval,
            measurandsKey,
            OCPP20ReadingContextEnumType.SAMPLE_CLOCK
          )
          if (
            usesEvseMeterTemplate &&
            connectorId === sharedEvseEnergyOwnerConnectorId &&
            connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt?.getTime() ===
              timestamp.getTime()
          ) {
            const currentSharedRegister = [...evseStatus.connectors.values()].reduce(
              (total, status) => total + Math.max(0, status.energyActiveImportRegisterValue ?? 0),
              0
            )
            sharedObservationEnergyWh = Math.max(
              0,
              currentSharedRegister - (sharedRegisterBeforeBuild ?? 0)
            )
            if (sharedObservationEnergyWh > 0) {
              evseStatus.energyActiveImportRegisterValue =
                Math.max(0, evseStatus.energyActiveImportRegisterValue ?? 0) +
                sharedObservationEnergyWh
            }
            const sharedObservationInterval = sharedEnergyInterval
            evseStatus.energyActiveImportRegisterLastUpdatedAt = timestamp
            for (const [otherConnectorId, otherConnectorStatus] of connectors) {
              if (
                otherConnectorId === connectorId ||
                !canAdvanceAlignedEnergy(otherConnectorStatus) ||
                otherConnectorStatus.transactionId == null ||
                chargingStation.getCoherentSession(otherConnectorStatus.transactionId) != null ||
                (otherConnectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt != null &&
                  otherConnectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt >=
                    timestamp)
              ) {
                continue
              }
              const peerObservationEnergyWh = prorateSharedObservationEnergy(
                sharedObservationEnergyWh,
                sharedObservationInterval,
                otherConnectorStatus,
                timestamp,
                transactionEnergyNominalInterval ?? alignedInterval
              )
              otherConnectorStatus.transactionEnergyActiveImportRegisterValue =
                Math.max(0, otherConnectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) +
                peerObservationEnergyWh
              otherConnectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = timestamp
            }
          }
          if (alignedEnergySamples && connectorId === sharedEvseEnergyOwnerConnectorId) {
            evseEnergyActiveImportRegisterValue = [...evseStatus.connectors.values()].reduce(
              (total, status) => total + Math.max(0, status.energyActiveImportRegisterValue ?? 0),
              0
            )
          }
          if (stationBaseline != null) {
            meterValue = {
              ...meterValue,
              sampledValue: filterUnconvertibleDcStationSamples(
                meterValue.sampledValue,
                stationBaseline,
                chargingStation.stationInfo?.currentOutType
              ),
            }
          }
          if (!isNotEmptyArray(meterValue.sampledValue)) continue
          if (
            canSendNonTransactional &&
            alignedIntervalEnergySamples &&
            transactionId != null &&
            meterValue.sampledValue.some(
              sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
            )
          ) {
            if (sharedEvseEnergyOwnerConnectorId == null) {
              stationAlignedTransactionEnergyWh = consumeConnectorEnergySinceBaseline(
                connectorStatus,
                stationIntervalBaselineKey,
                stationIntervalInitialBaselines.get(connectorId) ?? 0
              )
            } else if (connectorId === sharedEvseEnergyOwnerConnectorId) {
              const sharedEvseEnergy = evseStatus.energyActiveImportRegisterValue ?? 0
              stationAlignedTransactionEnergyWh = Math.max(
                0,
                sharedEvseEnergy - (evseStatus.energyActiveImportIntervalBaseline ?? 0)
              )
              evseStatus.energyActiveImportIntervalBaseline = sharedEvseEnergy
            }
          }
          if (
            evseId !== 0 &&
            !isNotEmptyArray(evseStatus.MeterValues) &&
            isNotEmptyArray(connectorStatus.MeterValues)
          ) {
            sampledValueTemplates.push(...connectorStatus.MeterValues)
          }
          if (evseId !== 0) {
            const configuredEfficiency =
              chargingStation.stationInfo?.currentOutType === CurrentType.DC
                ? (chargingStation.stationInfo.conversionEfficiency ?? 1)
                : 1
            const conversionEfficiency = configuredEfficiency > 0 ? configuredEfficiency : 1
            const sharedIntervalSamples = (() => {
              if (
                stationAlignedTransactionEnergyWh == null ||
                transactionId == null ||
                chargingStation.stationInfo?.meteringPerTransaction === true
              ) {
                return []
              }
              const samplesByIdentity = new Map<string, OCPP20SampledValue>()
              for (const sample of meterValue.sampledValue) {
                if (sample.measurand !== OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL) {
                  continue
                }
                const normalizedSample: OCPP20SampledValue = {
                  ...sample,
                  phase: undefined,
                  unitOfMeasure: {
                    multiplier: 0,
                    unit: OCPP20UnitEnumType.WATT_HOUR,
                  },
                  value:
                    chargingStation.stationInfo?.currentOutType === CurrentType.DC &&
                    sample.location === OCPP20LocationEnumType.Inlet
                      ? stationAlignedTransactionEnergyWh / conversionEfficiency
                      : stationAlignedTransactionEnergyWh,
                }
                const identity = JSON.stringify([
                  normalizedSample.measurand,
                  normalizedSample.context,
                  normalizedSample.location,
                  canonicalizeCustomData(normalizedSample.customData),
                ])
                if (!samplesByIdentity.has(identity)) {
                  samplesByIdentity.set(identity, normalizedSample)
                }
              }
              return [...samplesByIdentity.values()]
            })()
            const transactionAlignedIntervalEnergyWh =
              transactionIntervalCarryBeforeBuild +
              Math.max(
                0,
                (connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) -
                  transactionRegisterBeforeBuild
              )
            const stationIntervalRatio =
              stationAlignedTransactionEnergyWh != null && transactionAlignedIntervalEnergyWh > 0
                ? stationAlignedTransactionEnergyWh / transactionAlignedIntervalEnergyWh
                : 1
            const physicalMeterValueSource =
              sharedEvseEnergyOwnerConnectorId != null &&
              connectorId !== sharedEvseEnergyOwnerConnectorId
                ? {
                    ...meterValue,
                    sampledValue: meterValue.sampledValue.filter(
                      sample =>
                        sample.measurand !== OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
                    ),
                  }
                : sharedIntervalSamples.length > 0
                  ? {
                      ...meterValue,
                      sampledValue: [
                        ...meterValue.sampledValue.filter(
                          sample =>
                            sample.measurand !==
                            OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
                        ),
                        ...sharedIntervalSamples,
                      ],
                    }
                  : transactionId != null
                    ? {
                        ...meterValue,
                        sampledValue: meterValue.sampledValue.map(sample =>
                          sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
                            ? { ...sample, value: roundTo(sample.value * stationIntervalRatio, 2) }
                            : sample
                        ),
                      }
                    : meterValue
            const physicalMeterValue = normalizePhysicalMeterValueForStationAggregation(
              physicalMeterValueSource,
              chargingStation.stationInfo?.currentOutType,
              conversionEfficiency
            )
            const stationMeterValue =
              physicalEvseRegisterSamples != null
                ? filterDuplicateSharedEvseSamples(
                  physicalMeterValue,
                  physicalEvseRegisterSamples,
                  transactionId != null &&
                      (chargingStation.getCoherentSession(transactionId) != null ||
                        (sharedIntervalSamples.length === 0 &&
                          !sharedIntervalObservationRecorded &&
                          chargingStation.stationInfo?.meteringPerTransaction === true))
                )
                : physicalMeterValue
            if (isNotEmptyArray(stationMeterValue.sampledValue)) {
              physicalMeterValues.push(stationMeterValue)
              if (sharedIntervalSamples.length > 0) sharedIntervalObservationRecorded = true
            }
          }
          if (transactionId != null) {
            if (!suppressEvseEmission) {
              pendingRequests.push({
                evseId,
                send: () =>
                  OCPP20ServiceUtils.sendTransactionEvent(
                    chargingStation,
                    OCPP20TransactionEventEnumType.Updated,
                    OCPP20TriggerReasonEnumType.MeterValueClock,
                    connectorId,
                    transactionId.toString(),
                    { evseId, meterValue: [meterValue], timestamp },
                    {
                      responseTimeoutMs,
                      skipBufferingOnError: false,
                      throwError: true,
                    }
                  )
                    .then(() => undefined)
                    .catch((error: unknown) => {
                      logger.error(
                        `${chargingStation.logPrefix()} ${moduleName}.emitClockAlignedMeterValues: Error sending clock-aligned '${OCPP20RequestCommand.TRANSACTION_EVENT}':`,
                        error
                      )
                    }),
              })
            }
          } else {
            idleMeterConnectorId ??= connectorId
            meterValues.push(meterValue)
          }
        } catch (error: unknown) {
          logger.warn(
            `${chargingStation.logPrefix()} ${moduleName}.emitClockAlignedMeterValues: ${getErrorMessage(error)}`
          )
        }
      }
      if (
        suppressEvseEmission ||
        !canSendNonTransactional ||
        evseInTransaction ||
        !isNotEmptyArray(meterValues)
      ) {
        continue
      }
      let requestMeterValues = meterValues
      if (evseId !== 0 && meterValues.length > 1 && idleMeterConnectorId != null) {
        const energyRegisterWhOverride = [...evseStatus.connectors.values()].reduce(
          (total, connectorStatus) =>
            total + Math.max(0, connectorStatus.energyActiveImportRegisterValue ?? 0),
          0
        )
        requestMeterValues = [
          buildClockAlignedConnectorMeterValue(
            chargingStation,
            {
              connectorId: idleMeterConnectorId,
              energyRegisterWhOverride,
              evseId,
              idle: true,
              sampledValueBaseline: aggregateClockAlignedSamples(
                meterValues,
                chargingStation.getNumberOfPhases()
              ),
              ...(isNotEmptyArray(sampledValueTemplates) && { sampledValueTemplates }),
              timestamp,
            },
            alignedInterval,
            measurandsKey,
            OCPP20ReadingContextEnumType.SAMPLE_CLOCK
          ),
        ]
      }
      pendingRequests.push({
        evseId,
        send: () =>
          OCPP20ServiceUtils.sendClockAlignedMeterValuesRequest(
            chargingStation,
            evseId,
            { evseId, meterValue: requestMeterValues },
            responseTimeoutMs,
            [
              {
                key: evseStatus,
                restore:
                  evseId === 0
                    ? restoreStationIntervalBaselines
                    : () => {
                        if (evseIntervalBaselineBeforeBuild == null) {
                          delete evseStatus.energyActiveImportIntervalBaseline
                        } else {
                          evseStatus.energyActiveImportIntervalBaseline =
                            evseIntervalBaselineBeforeBuild
                        }
                      },
              },
            ]
          ),
      })
    }
    await Promise.all(
      pendingRequests
        .sort(({ evseId: left }, { evseId: right }) => left - right)
        .map(({ send }) => send())
    )
  }

  /**
   * Enforce ItemsPerMessage and BytesPerMessage limits on request data.
   * @param chargingStation - Charging station providing log prefix
   * @param chargingStation.logPrefix - Log prefix function
   * @param moduleName - Module name for logging context
   * @param context - Method name for logging context
   * @param data - Array of variable data items to validate
   * @param itemsLimit - Maximum allowed items per message (0 = unlimited)
   * @param bytesLimit - Maximum allowed bytes per message (0 = unlimited)
   * @param buildRejected - Factory function to build rejection results
   * @param logger - Logger instance for debug output
   * @param logger.debug - Debug logging function
   * @returns Object indicating whether data was rejected and the rejection results
   */
  public static enforceMessageLimits<
    T extends { attributeType?: unknown; component: unknown; variable: unknown },
    R
  >(
    chargingStation: { logPrefix: () => string },
    moduleName: string,
    context: string,
    data: T[],
    itemsLimit: number,
    bytesLimit: number,
    buildRejected: (item: T, reason: RejectionReason) => R,
    logger: { debug: (...args: unknown[]) => void }
  ): { rejected: boolean; results: R[] } {
    if (itemsLimit > 0 && data.length > itemsLimit) {
      const results = data.map(d =>
        buildRejected(d, {
          additionalInfo: `ItemsPerMessage limit ${itemsLimit.toString()} exceeded (${data.length.toString()} requested)`,
          reasonCode: ReasonCodeEnumType.TooManyElements,
        })
      )
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.${context}: Rejected all variables due to ItemsPerMessage limit (${itemsLimit.toString()})`
      )
      return { rejected: true, results }
    }
    if (bytesLimit > 0) {
      const estimatedSize = Buffer.byteLength(JSON.stringify(data), 'utf8')
      if (estimatedSize > bytesLimit) {
        const results = data.map(d =>
          buildRejected(d, {
            additionalInfo: `BytesPerMessage limit ${bytesLimit.toString()} exceeded (estimated ${estimatedSize.toString()} bytes)`,
            reasonCode: ReasonCodeEnumType.TooLargeElement,
          })
        )
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.${context}: Rejected all variables due to BytesPerMessage limit (${bytesLimit.toString()})`
        )
        return { rejected: true, results }
      }
    }
    return { rejected: false, results: [] }
  }

  /**
   * Enforce BytesPerMessage limit after results have been computed.
   * @param chargingStation - Charging station providing log prefix
   * @param chargingStation.logPrefix - Log prefix function
   * @param moduleName - Module name for logging context
   * @param context - Method name for logging context
   * @param originalData - Original variable data items
   * @param currentResults - Computed results to check against byte limit
   * @param bytesLimit - Maximum allowed bytes per message (0 = unlimited)
   * @param buildRejected - Factory function to build rejection results
   * @param logger - Logger instance for debug output
   * @param logger.debug - Debug logging function
   * @returns Original results if within limit, or rejection results if exceeded
   */
  public static enforcePostCalculationBytesLimit<
    T extends { attributeType?: unknown; component: unknown; variable: unknown },
    R
  >(
    chargingStation: { logPrefix: () => string },
    moduleName: string,
    context: string,
    originalData: T[],
    currentResults: R[],
    bytesLimit: number,
    buildRejected: (item: T, reason: RejectionReason) => R,
    logger: { debug: (...args: unknown[]) => void }
  ): R[] {
    if (bytesLimit > 0) {
      try {
        const actualSize = Buffer.byteLength(JSON.stringify(currentResults), 'utf8')
        if (actualSize > bytesLimit) {
          const results = originalData.map(d =>
            buildRejected(d, {
              additionalInfo: `BytesPerMessage limit ${bytesLimit.toString()} exceeded (actual ${actualSize.toString()} bytes)`,
              reasonCode: ReasonCodeEnumType.TooLargeElement,
            })
          )
          logger.debug(
            `${chargingStation.logPrefix()} ${moduleName}.${context}: Rejected all variables due to BytesPerMessage limit post calculation (${bytesLimit.toString()})`
          )
          return results
        }
      } catch (error) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.${context}: BytesPerMessage limit calculation failed`,
          error
        )
      }
    }
    return currentResults
  }

  /**
   * Retrieve the AlignedDataCtrlr interval in milliseconds.
   * @param chargingStation - Target charging station
   * @returns Aligned data interval in milliseconds
   */
  public static getAlignedDataInterval (chargingStation: ChargingStation): number {
    return OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20RequiredVariableName.AlignedDataInterval,
      Constants.DEFAULT_ALIGNED_DATA_INTERVAL_SECONDS
    )
  }

  /**
   * Retrieve the OCPPCommCtrlr MessageTimeout in milliseconds.
   * @param chargingStation - Target charging station
   * @returns General OCPP response timeout in milliseconds
   */
  public static getMessageTimeout (chargingStation: ChargingStation): number {
    return OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20RequiredVariableName.MessageTimeout,
      Constants.DEFAULT_MESSAGE_TIMEOUT_SECONDS,
      'Default'
    )
  }

  public static getTransactionEnergyMeteringConfiguration (chargingStation: ChargingStation):
    | undefined
    | {
      context: OCPP20ReadingContextEnumType
      interval: number
      measurandsKey: ConfigurationKeyType
    } {
    const txUpdatedMeasurandsKey = buildConfigKey(
      OCPP20ComponentName.SampledDataCtrlr,
      OCPP20RequiredVariableName.TxUpdatedMeasurands
    )
    const txUpdatedInterval = OCPP20ServiceUtils.getTxUpdatedInterval(chargingStation)
    if (
      txUpdatedInterval > 0 &&
      hasConfiguredEnergyMeasurand(chargingStation, txUpdatedMeasurandsKey)
    ) {
      return {
        context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        interval: txUpdatedInterval,
        measurandsKey: txUpdatedMeasurandsKey,
      }
    }
    const txEndedMeasurandsKey = buildConfigKey(
      OCPP20ComponentName.SampledDataCtrlr,
      OCPP20RequiredVariableName.TxEndedMeasurands
    )
    const txEndedInterval = OCPP20ServiceUtils.getTxEndedInterval(chargingStation)
    if (
      txEndedInterval > 0 &&
      hasConfiguredEnergyMeasurand(chargingStation, txEndedMeasurandsKey)
    ) {
      return {
        context: OCPP20ReadingContextEnumType.TRANSACTION_END,
        interval: txEndedInterval,
        measurandsKey: txEndedMeasurandsKey,
      }
    }
    const alignedInterval = getEnabledAlignedEnergyInterval(chargingStation)
    if (alignedInterval == null) return undefined
    return {
      context: OCPP20ReadingContextEnumType.SAMPLE_CLOCK,
      interval: alignedInterval,
      measurandsKey: buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      ),
    }
  }

  public static getTransactionEnergyNominalInterval (
    chargingStation: ChargingStation,
    fallbackInterval = 0,
    overrides?: { txEndedInterval?: number; txUpdatedInterval?: number }
  ): number | undefined {
    return getTransactionEnergyNominalInterval(chargingStation, fallbackInterval, overrides)
  }

  /**
   * Retrieve the SampledDataCtrlr TxEndedInterval in milliseconds.
   * @param chargingStation - Target charging station
   * @returns Transaction ended meter values interval in milliseconds
   */
  public static getTxEndedInterval (chargingStation: ChargingStation): number {
    return OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.SampledDataCtrlr,
      OCPP20RequiredVariableName.TxEndedInterval,
      0
    )
  }

  /**
   * Retrieve the SampledDataCtrlr TxUpdatedInterval in milliseconds.
   * @param chargingStation - Target charging station
   * @returns Transaction updated meter values interval in milliseconds
   */
  public static getTxUpdatedInterval (chargingStation: ChargingStation): number {
    return OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.SampledDataCtrlr,
      OCPP20RequiredVariableName.TxUpdatedInterval,
      Constants.DEFAULT_TX_UPDATED_INTERVAL_SECONDS
    )
  }

  /**
   * Checks whether direct TransactionEvent delivery is pending for a connector.
   * @param connectorStatus - Connector whose direct deliveries are queried
   * @param transactionId - Optional transaction identifier to scope the query
   * @returns Whether at least one matching direct delivery is pending
   */
  public static hasPendingTransactionEventDelivery (
    connectorStatus: ConnectorStatus,
    transactionId?: string
  ): boolean {
    const counts = OCPP20ServiceUtils.pendingTransactionEventDeliveryCounts.get(connectorStatus)
    if (transactionId == null) return counts != null && counts.size > 0
    return (counts?.get(transactionId) ?? 0) > 0
  }

  /**
   * Returns whether autonomous clock-aligned data generation is enabled.
   * @param chargingStation - Target charging station
   * @returns Whether clock-aligned data generation is enabled
   */
  public static isAlignedDataEnabled (chargingStation: ChargingStation): boolean {
    return OCPP20ServiceUtils.readVariableAsBoolean(
      chargingStation,
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20RequiredVariableName.Enabled,
      false
    )
  }

  /**
   * Resolves `AlignedDataCtrlr.SendDuringIdle`, optionally for one EVSE.
   * EVSE-scoped values fall back to the station-wide value when absent.
   * @param chargingStation - Target charging station
   * @param evseId - Optional EVSE scope
   * @returns The SendDuringIdle variable value
   */
  public static isAlignedDataSendDuringIdleEnabled (
    chargingStation: ChargingStation,
    evseId?: number
  ): boolean {
    return OCPP20ServiceUtils.readVariableAsBoolean(
      chargingStation,
      OCPP20ComponentName.AlignedDataCtrlr,
      OCPP20OptionalVariableName.SendDuringIdle,
      false,
      evseId
    )
  }

  /**
   * Check whether the queue replay owner is currently delivering a request.
   * @param request - TransactionEvent request handled by the response service
   * @returns Whether queue replay owns response cleanup for this request
   */
  public static isReplayedTransactionEventRequest (request: OCPP20TransactionEventRequest): boolean {
    return OCPP20ServiceUtils.replayedTransactionEventRequests.has(request)
  }

  /**
   * Stops transaction meter timers before station shutdown while retaining
   * enough state to re-arm them after a non-terminal restart.
   * @param chargingStation - Target charging station
   */
  public static pauseTransactionMeterValues (chargingStation: ChargingStation): void {
    if (
      chargingStation.stationInfo?.ocppVersion !== OCPPVersion.VERSION_20 &&
      chargingStation.stationInfo?.ocppVersion !== OCPPVersion.VERSION_201
    ) {
      return
    }
    for (const { connectorId, connectorStatus, evseId } of chargingStation.iterateConnectors()) {
      OCPP20ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId, evseId)
      OCPP20ServiceUtils.stopEndedMeterValues(chargingStation, connectorId, evseId)
      if (hasOngoingTransaction(connectorStatus)) connectorStatus.transactionRestored = true
    }
  }

  public static readAlignedDataIntervalSeconds (
    chargingStation: ChargingStation
  ): number | undefined {
    const value =
      OCPP20ServiceUtils.readVariableValue(
        chargingStation,
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.AlignedDataInterval
      ) ?? Constants.DEFAULT_ALIGNED_DATA_INTERVAL_SECONDS.toString()
    if (!/^[0-9]+$/.test(value)) {
      logger.warn(
        `${moduleName}.readAlignedDataIntervalSeconds: Invalid integer '${value}' for AlignedDataCtrlr.Interval`
      )
      return
    }
    const intervalSeconds = Number(value)
    if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds > Constants.SECONDS_PER_DAY) {
      logger.warn(
        `${moduleName}.readAlignedDataIntervalSeconds: Out-of-range value '${value}' for AlignedDataCtrlr.Interval`
      )
      return
    }
    return intervalSeconds
  }

  /**
   * Read ItemsPerMessage and BytesPerMessage configuration limits
   * Extracts configuration-reading logic shared between handleRequestGetVariables
   * and handleRequestSetVariables to eliminate DRY violations.
   * @param chargingStation - The charging station instance
   * @returns Object with itemsLimit and bytesLimit (both fallback to 0 if not configured or invalid)
   */
  public static readMessageLimits (chargingStation: ChargingStation): {
    bytesLimit: number
    itemsLimit: number
  } {
    let itemsLimit = 0
    let bytesLimit = 0
    try {
      const itemsCfg = getConfigurationKey(
        chargingStation,
        buildConfigKey(
          OCPP20ComponentName.DeviceDataCtrlr,
          OCPP20RequiredVariableName.ItemsPerMessage
        )
      )?.value
      const bytesCfg = getConfigurationKey(
        chargingStation,
        buildConfigKey(
          OCPP20ComponentName.DeviceDataCtrlr,
          OCPP20RequiredVariableName.BytesPerMessage
        )
      )?.value
      if (itemsCfg && /^\d+$/.test(itemsCfg)) {
        itemsLimit = convertToIntOrNaN(itemsCfg)
      }
      if (bytesCfg && /^\d+$/.test(bytesCfg)) {
        bytesLimit = convertToIntOrNaN(bytesCfg)
      }
    } catch (error) {
      logger.debug(
        `${chargingStation.logPrefix()} readMessageLimits: error reading message limits:`,
        error
      )
    }
    return { bytesLimit, itemsLimit }
  }

  public static readVariableAsBoolean (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultValue: boolean,
    evseId?: number
  ): boolean {
    const value = OCPP20ServiceUtils.readVariableValue(
      chargingStation,
      componentName,
      variableName,
      undefined,
      evseId
    )
    return value != null ? convertToBoolean(value) : defaultValue
  }

  public static readVariableAsInteger (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultValue: number,
    componentInstance?: string
  ): number {
    const value = OCPP20ServiceUtils.readVariableValue(
      chargingStation,
      componentName,
      variableName,
      componentInstance
    )
    if (value != null) {
      try {
        return convertToInt(value)
      } catch {
        logger.warn(
          `${moduleName}.readVariableAsInteger: Cannot convert '${value}' to integer for ${buildConfigKey(componentName, variableName)}, using default ${defaultValue.toString()}`
        )
        return defaultValue
      }
    }
    return defaultValue
  }

  public static readVariableAsString (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultValue = ''
  ): string {
    return (
      OCPP20ServiceUtils.readVariableValue(chargingStation, componentName, variableName) ??
      defaultValue
    )
  }

  public static readVariableValue (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    componentInstance?: string,
    evseId?: number
  ): string | undefined {
    const variableManager = OCPP20VariableManager.getInstance()
    const results = variableManager.getVariables(chargingStation, [
      {
        component: {
          name: componentName,
          ...(componentInstance != null && { instance: componentInstance }),
          ...(evseId != null && { evse: { id: evseId } }),
        },
        variable: { name: variableName },
      },
    ])
    if (
      isNotEmptyArray<OCPP20GetVariableResultType>(results) &&
      results[0].attributeValue != null
    ) {
      return results[0].attributeValue
    }
    return undefined
  }

  /**
   * Deauthorize an active transaction per OCPP 2.0.1 E05 requirements.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier with the active transaction
   * @param evseId - Optional EVSE identifier
   * @returns Promise resolving to the TransactionEvent response
   */
  public static async requestDeauthorizeTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): Promise<OCPP20TransactionEventResponse> {
    const { connectorStatus, transactionId } = OCPP20ServiceUtils.resolveActiveTransaction(
      chargingStation,
      connectorId,
      evseId
    )

    const stopTxOnInvalidId = OCPP20ServiceUtils.readVariableAsBoolean(
      chargingStation,
      OCPP20ComponentName.TxCtrlr,
      OCPP20RequiredVariableName.StopTxOnInvalidId,
      true
    )

    if (!stopTxOnInvalidId) {
      await this.sendTransactionEvent(
        chargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.Deauthorized,
        connectorId,
        transactionId,
        { evseId }
      )
      return { idTokenInfo: undefined }
    }

    const maxEnergyOnInvalidId = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.TxCtrlr,
      OCPP20OptionalVariableName.MaxEnergyOnInvalidId,
      0
    )

    if (maxEnergyOnInvalidId > 0) {
      // E05.FR.03: continue charging up to MaxEnergyOnInvalidId Wh before terminating
      connectorStatus.transactionDeauthorized = true
      connectorStatus.transactionDeauthorizedEnergyWh =
        connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0

      await this.sendTransactionEvent(
        chargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.Deauthorized,
        connectorId,
        transactionId,
        { evseId }
      )

      return { idTokenInfo: undefined }
    }

    await this.sendTransactionEvent(
      chargingStation,
      OCPP20TransactionEventEnumType.Updated,
      OCPP20TriggerReasonEnumType.Deauthorized,
      connectorId,
      transactionId,
      {
        chargingState: OCPP20ChargingStateEnumType.SuspendedEVSE,
        evseId,
      }
    )

    return this.terminateTransaction(
      chargingStation,
      connectorId,
      connectorStatus,
      transactionId,
      OCPP20TriggerReasonEnumType.Deauthorized,
      OCPP20ReasonEnumType.DeAuthorized,
      evseId
    )
  }

  /**
   * Stop an active transaction by sending a TransactionEvent(Ended).
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier with the active transaction
   * @param evseId - Optional EVSE identifier
   * @param triggerReason - Trigger reason for the stop event
   * @param stoppedReason - Reason the transaction was stopped
   * @returns Promise resolving to the TransactionEvent response
   */
  public static async requestStopTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number,
    triggerReason: OCPP20TriggerReasonEnumType = OCPP20TriggerReasonEnumType.RemoteStop,
    stoppedReason: OCPP20ReasonEnumType = OCPP20ReasonEnumType.Remote
  ): Promise<OCPP20TransactionEventResponse> {
    const { connectorStatus, transactionId } = OCPP20ServiceUtils.resolveActiveTransaction(
      chargingStation,
      connectorId,
      evseId
    )

    return this.terminateTransaction(
      chargingStation,
      connectorId,
      connectorStatus,
      transactionId,
      triggerReason,
      stoppedReason,
      evseId
    )
  }

  /**
   * Resets all TransactionEvent-related state for a connector when starting a new transaction.
   * According to OCPP 2.0.1 Section 1.3.2.1, sequence numbers should start at 0 for new transactions.
   * This also resets the EVSE and IdToken sent flags per E01.FR.16 and E03.FR.01.
   * @param chargingStation - The charging station instance
   * @param connectorId - The connector ID for which to reset the transaction state
   */
  public static resetTransactionSequenceNumber (
    chargingStation: ChargingStation,
    connectorId: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    if (connectorStatus != null) {
      connectorStatus.transactionSeqNo = undefined // Reset to undefined, will be set to 0 on first use
      connectorStatus.transactionEvseSent = undefined // E01.FR.16: EVSE must be sent in first event of new transaction
      connectorStatus.transactionIdTokenSent = undefined // E03.FR.01: IdToken must be sent in first event after authorization
      logger.debug(
        `${chargingStation.logPrefix()} OCPP20ServiceUtils.resetTransactionSequenceNumber: Reset transaction state for connector ${connectorId.toString()}`
      )
    }
  }

  /**
   * Re-arms transaction meter timers restored from persistent connector state.
   * The accounting baseline starts when the running process resumes, so process
   * downtime is not simulated as delivered energy.
   * @param chargingStation - Target charging station
   */
  public static resumeRestoredTransactionMeterValues (chargingStation: ChargingStation): void {
    const resumedAt = new Date()
    for (const { connectorId, connectorStatus, evseId } of chargingStation.iterateConnectors()) {
      if (
        connectorStatus.transactionRestored !== true ||
        connectorStatus.transactionStarted !== true ||
        !hasOngoingTransaction(connectorStatus)
      ) {
        continue
      }
      const transactionId = connectorStatus.transactionId
      if (transactionId == null) continue
      const persistedEnergy = connectorStatus.transactionEnergyActiveImportRegisterValue
      const persistedEnergyWh =
        typeof persistedEnergy === 'number' &&
        Number.isFinite(persistedEnergy) &&
        persistedEnergy >= 0
          ? persistedEnergy
          : 0
      connectorStatus.transactionEnergyActiveImportRegisterValue = persistedEnergyWh
      const restoredSession =
        chargingStation.getCoherentSession(transactionId) ??
        chargingStation.createCoherentSession(transactionId, connectorId)
      if (restoredSession != null) {
        restoredSession.socPercent = Math.min(
          Constants.SOC_MAXIMUM_PERCENT,
          Math.max(
            0,
            restoredSession.socPercent +
              (persistedEnergyWh / restoredSession.profile.batteryCapacityWh) *
                Constants.SOC_MAXIMUM_PERCENT
          )
        )
      }
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = resumedAt
      if (evseId != null && chargingStation.stationInfo?.meteringPerTransaction !== true) {
        const evseStatus = chargingStation.getEvseStatus(evseId)
        if (evseStatus != null) {
          evseStatus.energyActiveImportRegisterLastUpdatedAt = resumedAt
        }
      }
      OCPP20ServiceUtils.startUpdatedMeterValues(
        chargingStation,
        connectorId,
        OCPP20ServiceUtils.getTxUpdatedInterval(chargingStation),
        evseId
      )
      OCPP20ServiceUtils.startEndedMeterValues(
        chargingStation,
        connectorId,
        OCPP20ServiceUtils.getTxEndedInterval(chargingStation),
        evseId
      )
      delete connectorStatus.transactionRestored
    }
  }

  /**
   * Serializes non-transactional aligned MeterValues per EVSE. While a request
   * is stalled, only the latest later sampling boundary is retained; additive
   * interval energy from replaced boundaries is folded into that request.
   * Replacement-only callers settle immediately so they do not accumulate
   * continuations on the long-lived drain promise.
   * @param chargingStation - Target charging station
   * @param evseId - Meter point EVSE identifier
   * @param request - Aligned MeterValues request for one sampling boundary
   * @param responseTimeoutMs - Request response timeout in milliseconds
   * @param restoreIntervalBaselines - Bounded per-owner baseline restorations after a failed send.
   * @param triggerMessage - Whether the request was initiated by TriggerMessage.
   * @returns The drain operation for its first request, or an immediate acknowledgement when queued
   */
  public static sendClockAlignedMeterValuesRequest (
    chargingStation: ChargingStation,
    evseId: number,
    request: OCPP20MeterValuesRequest,
    responseTimeoutMs?: number,
    restoreIntervalBaselines: readonly IntervalBaselineRestore[] = [],
    triggerMessage = false
  ): Promise<void> {
    let stationStates = OCPP20ServiceUtils.clockAlignedMeterValuesSendStates.get(chargingStation)
    if (stationStates == null) {
      stationStates = new Map<number, ClockAlignedMeterValuesSendState>()
      OCPP20ServiceUtils.clockAlignedMeterValuesSendStates.set(chargingStation, stationStates)
    }
    let state = stationStates.get(evseId)
    if (state == null) {
      state = {}
      stationStates.set(evseId, state)
    }
    const previousPending = state.pending
    state.pending = {
      request:
        previousPending == null
          ? request
          : coalesceClockAlignedMeterValuesRequests(previousPending.request, request),
      responseTimeoutMs:
        responseTimeoutMs ??
        OCPP20ServiceUtils.readVariableAsIntervalMs(
          chargingStation,
          OCPP20ComponentName.OCPPCommCtrlr,
          OCPP20RequiredVariableName.MessageTimeout,
          Constants.DEFAULT_MESSAGE_TIMEOUT_SECONDS,
          'Default'
        ),
      restoreIntervalBaselines: mergeIntervalBaselineRestores(
        previousPending?.restoreIntervalBaselines ?? new Map(),
        new Map(restoreIntervalBaselines.map(restore => [restore.key, restore]))
      ),
      triggerMessage,
    }
    if (state.inFlight != null) return Promise.resolve()

    const sendState = state
    const restorePending = (failed: PendingClockAlignedMeterValuesRequest): void => {
      const later = sendState.pending
      sendState.pending =
        later == null
          ? failed
          : {
              request: coalesceClockAlignedMeterValuesRequests(failed.request, later.request),
              responseTimeoutMs: later.responseTimeoutMs,
              restoreIntervalBaselines: mergeIntervalBaselineRestores(
                failed.restoreIntervalBaselines,
                later.restoreIntervalBaselines
              ),
              triggerMessage: later.triggerMessage,
            }
    }
    const drain = async (): Promise<void> => {
      while (sendState.pending != null) {
        const pending = sendState.pending
        delete sendState.pending
        if (
          !chargingStation.isWebSocketConnectionOpened() ||
          !chargingStation.inAcceptedState() ||
          OCPP20ServiceUtils.isChargingStationStopping(chargingStation)
        ) {
          runIntervalBaselineRestores(pending.restoreIntervalBaselines)
          delete sendState.pending
          break
        }
        const responseState = { received: false }
        try {
          await chargingStation.ocppRequestService.requestHandler<
            OCPP20MeterValuesRequest,
            OCPP20MeterValuesResponse
          >(chargingStation, OCPP20RequestCommand.METER_VALUES, pending.request, {
            onResponseReceived: () => {
              responseState.received = true
            },
            responseTimeoutMs: pending.responseTimeoutMs,
            skipBufferingOnError: true,
            throwError: true,
            triggerMessage: pending.triggerMessage,
          })
        } catch (error: unknown) {
          const hasLaterPending = stationStates.get(evseId)?.pending != null
          if (!responseState.received) {
            if (hasLaterPending) restorePending(pending)
            else runIntervalBaselineRestores(pending.restoreIntervalBaselines)
          }
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.emitClockAlignedMeterValues: Error sending clock-aligned '${OCPP20RequestCommand.METER_VALUES}':`,
            error
          )
          if (hasLaterPending) continue
          break
        }
      }
    }
    const inFlight = drain().finally(() => {
      if (sendState.inFlight === inFlight) {
        delete sendState.inFlight
        if (sendState.pending == null) stationStates.delete(evseId)
      }
    })
    sendState.inFlight = inFlight
    return inFlight
  }

  /**
   * Send the queued TransactionEvent generation present after acquiring the
   * connector delivery lock. Events appended during replay remain queued for a
   * later generation so reconnect resumption cannot be starved by producers.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier whose queue to drain
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   */
  public static async sendQueuedTransactionEvents (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): Promise<void> {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    if (connectorStatus == null) return
    const lifecycleAbortSignal = chargingStation.lifecycleAbortSignal
    await OCPP20ServiceUtils.serializeTransactionEventDelivery(connectorStatus, () => {
      const eligibleEvents = new Set(connectorStatus.transactionEventQueue ?? [])
      return OCPP20ServiceUtils.drainQueuedTransactionEvents(
        chargingStation,
        connectorId,
        connectorStatus,
        lifecycleAbortSignal,
        evseId,
        eligibleEvents
      )
    })
  }

  /**
   * Send a TransactionEvent request to the CSMS, or queue it if offline.
   * @param chargingStation - Target charging station
   * @param eventType - Transaction event type (Started, Updated, Ended)
   * @param triggerReason - Reason that triggered the event
   * @param connectorId - Connector identifier
   * @param transactionId - Transaction identifier
   * @param options - Additional transaction event options
   * @param requestParams - Optional transport behavior overrides
   * @returns Promise resolving to the TransactionEvent response
   */
  public static async sendTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    triggerReason: OCPP20TriggerReasonEnumType,
    connectorId: number,
    transactionId: string,
    options: Omit<OCPP20TransactionEventOptions, 'eventType'> = {},
    requestParams?: RequestParams
  ): Promise<OCPP20TransactionEventResponse> {
    try {
      const evseId = typeof options.evseId === 'number' ? options.evseId : undefined
      const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
      if (connectorStatus == null) {
        const errorMsg = `Cannot find connector status for connector ${connectorId.toString()}`
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: ${errorMsg}`
        )
        throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
      }
      if (
        eventType === OCPP20TransactionEventEnumType.Updated &&
        isTransactionEnding(connectorStatus)
      ) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Dropping TransactionEvent(Updated) after transaction ending started`
        )
        return { idTokenInfo: undefined }
      }
      const transactionOwnedWhenQueued = connectorStatus.transactionId?.toString() === transactionId
      const reservePublicKey = (request: OCPP20TransactionEventRequest): boolean => {
        const reservesPublicKey =
          connectorStatus.publicKeySentInTransaction !== true &&
          connectorStatus.transactionId?.toString() === transactionId &&
          request.meterValue?.some(meterValue =>
            meterValue.sampledValue.some(
              sampledValue => (sampledValue.signedMeterValue?.publicKey.length ?? 0) > 0
            )
          ) === true
        if (reservesPublicKey) connectorStatus.publicKeySentInTransaction = true
        return reservesPublicKey
      }

      const webSocketOpen = chargingStation.isWebSocketConnectionOpened()
      const canSend = webSocketOpen && chargingStation.inAcceptedState()
      if (!canSend && requestParams?.skipBufferingOnError === true) {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Dropping non-buffered TransactionEvent while the station cannot send transaction messages`
        )
        return { idTokenInfo: undefined }
      }
      const transactionEventRequest = buildTransactionEvent(chargingStation, {
        connectorId,
        eventType,
        transactionId,
        ...options,
        triggerReason,
        ...(!webSocketOpen && { offline: true }),
      })
      const reservesPublicKey = reservePublicKey(transactionEventRequest)
      const lifecycleAbortSignal = chargingStation.lifecycleAbortSignal
      if (!canSend) {
        OCPP20ServiceUtils.enqueueTransactionEvent(
          chargingStation,
          connectorStatus,
          transactionEventRequest,
          transactionEventRequest.offline === true
        )
        logger.info(
          `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Station ${webSocketOpen ? 'not accepted' : 'offline'}, queueing TransactionEvent with seqNo=${transactionEventRequest.seqNo.toString()}`
        )
        return { idTokenInfo: undefined }
      }
      if (
        eventType === OCPP20TransactionEventEnumType.Updated &&
        OCPP20ServiceUtils.transactionEventSendChains.has(connectorStatus)
      ) {
        OCPP20ServiceUtils.enqueueTransactionEvent(
          chargingStation,
          connectorStatus,
          transactionEventRequest
        )
        OCPP20ServiceUtils.scheduleTransactionEventQueueDrain(
          chargingStation,
          connectorId,
          connectorStatus,
          evseId
        )
        return { idTokenInfo: undefined }
      }

      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Sending TransactionEvent for trigger ${triggerReason}`
      )
      const deliveryState = { callError: false, responseReceived: false, sent: false }
      let deliveryPending = true
      const finishPendingDelivery = (): void => {
        if (!deliveryPending) return
        deliveryPending = false
        OCPP20ServiceUtils.decrementPendingTransactionEventDelivery(connectorStatus, transactionId)
      }
      OCPP20ServiceUtils.incrementPendingTransactionEventDelivery(connectorStatus, transactionId)
      try {
        const retryableQueueFailureBeforeDelivery =
          OCPP20ServiceUtils.retryableTransactionEventQueueFailures.has(connectorStatus)
        const response = await OCPP20ServiceUtils.serializeTransactionEventDelivery(
          connectorStatus,
          async () => {
            const queuedEventsBeforeRequest = new Set(
              (connectorStatus.transactionEventQueue ?? []).filter(
                queuedEvent =>
                  queuedEvent.request.transactionInfo.transactionId !== transactionId ||
                  queuedEvent.seqNo < transactionEventRequest.seqNo
              )
            )
            try {
              if (queuedEventsBeforeRequest.size > 0) {
                await OCPP20ServiceUtils.drainQueuedTransactionEvents(
                  chargingStation,
                  connectorId,
                  connectorStatus,
                  lifecycleAbortSignal,
                  evseId,
                  queuedEventsBeforeRequest
                )
                if (
                  connectorStatus.transactionEventQueue?.some(queuedEvent =>
                    queuedEventsBeforeRequest.has(queuedEvent)
                  ) === true ||
                  !chargingStation.isWebSocketConnectionOpened() ||
                  !chargingStation.inAcceptedState()
                ) {
                  OCPP20ServiceUtils.enqueueTransactionEvent(
                    chargingStation,
                    connectorStatus,
                    transactionEventRequest,
                    transactionEventRequest.offline === true
                  )
                  return { idTokenInfo: undefined }
                }
              }
              if (
                transactionOwnedWhenQueued &&
                eventType !== OCPP20TransactionEventEnumType.Started &&
                connectorStatus.transactionId?.toString() !== transactionId
              ) {
                logger.warn(
                  `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Dropping stale ${eventType} for transaction ${transactionId}`
                )
                return { idTokenInfo: undefined }
              }
              return await OCPP20ServiceUtils.sendBuiltTransactionEvent(
                chargingStation,
                transactionEventRequest,
                {
                  ...requestParams,
                  onError: (error, isCallError) => {
                    deliveryState.callError = isCallError
                    requestParams?.onError?.(error, isCallError)
                  },
                  onMessageSent: () => {
                    deliveryState.sent = true
                    requestParams?.onMessageSent?.()
                  },
                  onResponseReceived: () => {
                    deliveryState.responseReceived = true
                    finishPendingDelivery()
                    requestParams?.onResponseReceived?.()
                  },
                  skipBufferingOnError: true,
                },
                lifecycleAbortSignal
              )
            } catch (error) {
              if (
                !deliveryState.responseReceived &&
                requestParams?.skipBufferingOnError !== true &&
                ((transactionEventHasUnsignedIntervalEnergy(transactionEventRequest) &&
                  (eventType === OCPP20TransactionEventEnumType.Updated ||
                    !deliveryState.callError)) ||
                  OCPP20ServiceUtils.isChargingStationStopping(chargingStation) ||
                  !deliveryState.sent ||
                  !chargingStation.isWebSocketConnectionOpened() ||
                  !chargingStation.inAcceptedState())
              ) {
                OCPP20ServiceUtils.enqueueTransactionEvent(
                  chargingStation,
                  connectorStatus,
                  transactionEventRequest,
                  transactionEventRequest.offline === true
                )
                if (
                  eventType === OCPP20TransactionEventEnumType.Ended &&
                  deliveryState.sent &&
                  !deliveryState.callError &&
                  chargingStation.isWebSocketConnectionOpened() &&
                  chargingStation.inAcceptedState()
                ) {
                  OCPP20ServiceUtils.scheduleRetainedEndedTransactionEventRetry(
                    chargingStation,
                    connectorId,
                    connectorStatus,
                    evseId
                  )
                }
                logger.info(
                  `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Delivery failed, queueing TransactionEvent with seqNo=${transactionEventRequest.seqNo.toString()}`
                )
                return { idTokenInfo: undefined }
              }
              if (
                reservesPublicKey &&
                !deliveryState.sent &&
                connectorStatus.transactionId?.toString() === transactionId
              ) {
                connectorStatus.publicKeySentInTransaction = false
              }
              throw error
            }
          }
        )
        if (
          retryableQueueFailureBeforeDelivery &&
          OCPP20ServiceUtils.retryableTransactionEventQueueFailures.delete(connectorStatus)
        ) {
          OCPP20ServiceUtils.scheduleTransactionEventQueueDrain(
            chargingStation,
            connectorId,
            connectorStatus,
            evseId
          )
        }
        return response
      } finally {
        finishPendingDelivery()
      }
    } catch (error) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.sendTransactionEvent: Failed to send TransactionEvent:`,
        error
      )
      throw error
    }
  }

  /**
   * Start periodic collection of TxEnded meter values for a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   * @param interval - Collection interval in milliseconds
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   */
  public static startEndedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    interval: number,
    evseId?: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    if (connectorStatus == null) {
      return
    }
    connectorStatus.transactionEndedMeterValues ??= []
    if (interval <= 0) {
      return
    }
    if (connectorStatus.transactionEndedMeterValuesSetInterval != null) {
      OCPP20ServiceUtils.stopEndedMeterValues(chargingStation, connectorId, evseId)
    }
    connectorStatus.transactionEndedMeterValuesSetInterval = setInterval(() => {
      const cs = chargingStation.getConnectorStatus(connectorId, evseId)
      if (
        cs?.transactionStarted === true &&
        cs.transactionEnding !== true &&
        cs.transactionId != null
      ) {
        const measurandsKey = buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxEndedMeasurands
        )
        const meterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
          chargingStation,
          connectorId,
          evseId,
          cs.transactionId,
          interval,
          measurandsKey
        )
        if (isNotEmptyArray(meterValue.sampledValue)) {
          cs.transactionEndedMeterValues?.push(meterValue)
        }
      }
    }, clampToSafeTimerValue(interval))
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.startEndedMeterValues: TxEndedInterval started every ${formatDurationMilliSeconds(interval)}`
    )
  }

  public static async startTransactionOnConnector (
    chargingStation: ChargingStation,
    connectorId: number,
    idTag?: string
  ): Promise<StartTransactionResult> {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId)
    let transactionId = connectorStatus?.transactionId as string | undefined
    if (transactionId == null) {
      transactionId = generateUUID()
      if (connectorStatus != null) {
        connectorStatus.transactionId = transactionId
      }
      OCPP20ServiceUtils.resetTransactionSequenceNumber(chargingStation, connectorId)
    }
    // Create coherent session BEFORE building the Transaction.Started MeterValue
    // so the coherent gate in `buildMeterValue` runs against a live session
    // (E02.FR.09 measurands from a physics-consistent initial state).
    // Idempotent — a duplicate call from the response handler is a no-op.
    chargingStation.createCoherentSession(transactionId, connectorId)
    const startedMeterValues = OCPP20ServiceUtils.buildTransactionStartedMeterValues(
      chargingStation,
      transactionId
    )
    if (isNotEmptyArray(startedMeterValues) && connectorStatus != null) {
      connectorStatus.transactionBeginMeterValue = startedMeterValues[0] as MeterValue
    }
    let response
    if (connectorStatus != null) connectorStatus.transactionStarting = true
    try {
      response = await OCPP20ServiceUtils.sendTransactionEvent(
        chargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId,
        {
          idToken:
            idTag != null ? { idToken: idTag, type: OCPP20IdTokenEnumType.ISO14443 } : undefined,
          ...(isNotEmptyArray(startedMeterValues) && { meterValue: startedMeterValues }),
        }
      )
    } catch (error) {
      // A failed Started delivery must not leak identity/sequence state into
      // the next transaction attempt. Both cleanup operations are idempotent.
      resetConnectorStatus(connectorStatus)
      chargingStation.destroyCoherentSession(transactionId)
      throw error
    } finally {
      if (connectorStatus != null) connectorStatus.transactionStarting = false
    }
    const accepted =
      response.idTokenInfo == null ||
      response.idTokenInfo.status === OCPP20AuthorizationStatusEnumType.Accepted
    if (
      accepted &&
      chargingStation.started &&
      !OCPP20ServiceUtils.isChargingStationStopping(chargingStation) &&
      connectorStatus != null &&
      connectorStatus.transactionStarted !== true
    ) {
      const evseId = chargingStation.getEvseIdByConnectorId(connectorId)
      connectorStatus.transactionStarted = true
      connectorStatus.transactionPending = false
      connectorStatus.transactionIdTag ??= idTag
      connectorStatus.transactionStart ??= new Date()
      connectorStatus.transactionEnergyActiveImportRegisterValue ??= 0
      connectorStatus.locked = true
      connectorStatus.status = OCPP20ConnectorStatusEnumType.Occupied
      OCPP20ServiceUtils.startUpdatedMeterValues(
        chargingStation,
        connectorId,
        OCPP20ServiceUtils.getTxUpdatedInterval(chargingStation),
        evseId
      )
      OCPP20ServiceUtils.startEndedMeterValues(
        chargingStation,
        connectorId,
        OCPP20ServiceUtils.getTxEndedInterval(chargingStation),
        evseId
      )
    }
    return { accepted }
  }

  /**
   * Start periodic TransactionEvent(Updated) with meter values for a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   * @param interval - Sending interval in milliseconds
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   */
  public static startUpdatedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    interval: number,
    evseId?: number
  ): void {
    const initialConnectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    if (initialConnectorStatus == null) {
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: Connector ${connectorId.toString()} not found`
      )
      return
    }
    if (interval <= 0) {
      logger.debug(
        `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: TxUpdatedInterval is ${interval.toString()}, not starting periodic TransactionEvent`
      )
      return
    }
    delete initialConnectorStatus.transactionRestored
    if (initialConnectorStatus.transactionUpdatedMeterValuesSetInterval != null) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: TxUpdatedInterval already started, stopping first`
      )
      OCPP20ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId, evseId)
    }
    initialConnectorStatus.transactionUpdatedMeterValuesSetInterval = setInterval(() => {
      const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
      if (
        connectorStatus?.transactionStarted === true &&
        connectorStatus.transactionEnding !== true &&
        connectorStatus.transactionId != null
      ) {
        if (
          connectorStatus.transactionDeauthorized === true &&
          connectorStatus.transactionDeauthorizedEnergyWh != null
        ) {
          const maxEnergy = OCPP20ServiceUtils.readVariableAsInteger(
            chargingStation,
            OCPP20ComponentName.TxCtrlr,
            OCPP20OptionalVariableName.MaxEnergyOnInvalidId,
            0
          )
          const currentEnergy = connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
          const energySinceDeauth = currentEnergy - connectorStatus.transactionDeauthorizedEnergyWh
          if (maxEnergy > 0 && energySinceDeauth >= maxEnergy) {
            const resolvedEvseId = evseId ?? chargingStation.getEvseIdByConnectorId(connectorId)
            OCPP20ServiceUtils.terminateTransaction(
              chargingStation,
              connectorId,
              connectorStatus,
              connectorStatus.transactionId.toString(),
              OCPP20TriggerReasonEnumType.Deauthorized,
              OCPP20ReasonEnumType.DeAuthorized,
              resolvedEvseId
            ).catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: Error terminating deauthorized transaction:`,
                error
              )
            })
            return
          }
        }
        const meterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
          chargingStation,
          connectorId,
          evseId,
          connectorStatus.transactionId,
          interval,
          buildConfigKey(
            OCPP20ComponentName.SampledDataCtrlr,
            OCPP20RequiredVariableName.TxUpdatedMeasurands
          )
        )
        // OCPP 2.0.1 `MeterValueType.sampledValue` cardinality is `1..*`, while
        // `TransactionEventRequest.meterValue` is `0..*`: when `TxUpdatedMeasurands`
        // yields no sampled values, omit the `meterValue` field entirely rather
        // than send an empty-wrapper schema violation.
        const eventPayload = {
          ...(isNotEmptyArray(meterValue.sampledValue) && { meterValue: [meterValue] }),
          ...(evseId != null && { evseId }),
        }
        OCPP20ServiceUtils.sendTransactionEvent(
          chargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          connectorStatus.transactionId as string,
          eventPayload
        ).catch((error: unknown) => {
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: Error sending periodic TransactionEvent:`,
            error
          )
        })
      }
    }, clampToSafeTimerValue(interval))
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.startUpdatedMeterValues: TxUpdatedInterval started every ${formatDurationMilliSeconds(interval)}`
    )
  }

  /**
   * Stop all active transactions on the charging station or a specific EVSE.
   * @param chargingStation - Target charging station
   * @param triggerReason - Trigger reason for stop events
   * @param stoppedReason - Reason the transactions were stopped
   * @param evseId - Optional EVSE identifier to limit scope
   */
  public static async stopAllTransactions (
    chargingStation: ChargingStation,
    triggerReason: OCPP20TriggerReasonEnumType = OCPP20TriggerReasonEnumType.RemoteStop,
    stoppedReason: OCPP20ReasonEnumType = OCPP20ReasonEnumType.Remote,
    evseId?: number
  ): Promise<void> {
    const terminationPromises: Promise<unknown>[] = []
    if (evseId != null) {
      const evseStatus = chargingStation.getEvseStatus(evseId)
      if (evseStatus != null) {
        for (const [connectorId, connectorStatus] of evseStatus.connectors) {
          if (connectorStatus.transactionId != null) {
            terminationPromises.push(
              OCPP20ServiceUtils.requestStopTransaction(
                chargingStation,
                connectorId,
                evseId,
                triggerReason,
                stoppedReason
              ).catch((error: unknown) => {
                logger.error(
                  `${chargingStation.logPrefix()} ${moduleName}.stopAllTransactions: Error stopping transaction on connector ${connectorId.toString()}:`,
                  error
                )
              })
            )
          }
        }
      }
    } else {
      for (const {
        connectorId,
        connectorStatus,
        evseId: connectorEvseId,
      } of chargingStation.iterateConnectors(true)) {
        if (connectorStatus.transactionId != null) {
          terminationPromises.push(
            OCPP20ServiceUtils.requestStopTransaction(
              chargingStation,
              connectorId,
              connectorEvseId,
              triggerReason,
              stoppedReason
            ).catch((error: unknown) => {
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.stopAllTransactions: Error stopping transaction on connector ${connectorId.toString()}:`,
                error
              )
            })
          )
        }
      }
    }
    if (isNotEmptyArray(terminationPromises)) {
      await Promise.all(terminationPromises)
    }
  }

  /**
   * Stop periodic TxEnded meter value collection for a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   */
  public static stopEndedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    if (connectorStatus?.transactionEndedMeterValuesSetInterval != null) {
      clearInterval(connectorStatus.transactionEndedMeterValuesSetInterval)
      delete connectorStatus.transactionEndedMeterValuesSetInterval
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.stopEndedMeterValues: TxEndedInterval stopped`
      )
    }
  }

  public static async stopTransactionOnConnector (
    chargingStation: ChargingStation,
    connectorId: number,
    reason?: StopTransactionReason
  ): Promise<StopTransactionResult> {
    const evseId = chargingStation.getEvseIdByConnectorId(connectorId)
    if (evseId == null) {
      logger.warn(
        `${chargingStation.logPrefix()} stopTransactionOnConnector: cannot resolve EVSE ID for connector ${connectorId.toString()}, skipping`
      )
      return { accepted: false }
    }
    const { stoppedReason, triggerReason } = mapStopReasonToOCPP20(reason)
    const response = await OCPP20ServiceUtils.requestStopTransaction(
      chargingStation,
      connectorId,
      evseId,
      triggerReason,
      stoppedReason
    )
    return {
      accepted:
        response.idTokenInfo == null ||
        response.idTokenInfo.status === OCPP20AuthorizationStatusEnumType.Accepted,
    }
  }

  /**
   * Stop periodic TransactionEvent(Updated) sending for a connector.
   * @param chargingStation - Target charging station
   * @param connectorId - Connector identifier
   * @param evseId - Optional EVSE identifier for EVSE-local connector ids
   */
  public static stopUpdatedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): void {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    if (connectorStatus?.transactionUpdatedMeterValuesSetInterval != null) {
      clearInterval(connectorStatus.transactionUpdatedMeterValuesSetInterval)
      delete connectorStatus.transactionUpdatedMeterValuesSetInterval
      logger.info(
        `${chargingStation.logPrefix()} ${moduleName}.stopUpdatedMeterValues: TxUpdatedInterval stopped`
      )
    }
  }

  public static updateAuthorizationCache (
    chargingStation: ChargingStation,
    idToken: OCPP20IdTokenType,
    idTokenInfo: OCPP20IdTokenInfoType
  ): void {
    try {
      const authService = OCPPAuthServiceFactory.getInstance(chargingStation)
      authService.updateCacheEntry(
        idToken.idToken,
        mapOCPP20AuthorizationStatus(idTokenInfo.status),
        idTokenInfo.cacheExpiryDateTime,
        mapOCPP20TokenType(idToken.type)
      )
    } catch (error: unknown) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.updateAuthorizationCache: Error updating auth cache:`,
        error
      )
    }
  }

  /**
   * Waits until all transaction-event work currently serialized for a connector has settled.
   * New work chained while waiting is included before this method resolves.
   * @param connectorStatus - Connector whose delivery chain must settle
   */
  public static async waitForTransactionEventDelivery (
    connectorStatus: ConnectorStatus
  ): Promise<void> {
    let pending = OCPP20ServiceUtils.transactionEventSendChains.get(connectorStatus)
    while (pending != null) {
      await pending.catch(() => undefined)
      const next = OCPP20ServiceUtils.transactionEventSendChains.get(connectorStatus)
      if (next === pending) return
      pending = next
    }
  }

  private static buildTransactionEndedMeterValues (
    chargingStation: ChargingStation,
    connectorId: number,
    transactionId: number | string,
    evseId?: number
  ): OCPP20MeterValue[] {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    const endedMeterValues = (connectorStatus?.transactionEndedMeterValues ??
      []) as OCPP20MeterValue[]
    const beginMeterValue = connectorStatus?.transactionBeginMeterValue as
      OCPP20MeterValue | undefined

    try {
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.SampledDataCtrlr,
        OCPP20RequiredVariableName.TxEndedMeasurands
      )
      const finalMeterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        chargingStation,
        connectorId,
        evseId,
        transactionId,
        getEnabledAlignedEnergyInterval(chargingStation) ?? 0,
        measurandsKey,
        OCPP20ReadingContextEnumType.TRANSACTION_END
      )
      if (isNotEmptyArray(finalMeterValue.sampledValue)) {
        return [
          ...(beginMeterValue != null ? [beginMeterValue] : []),
          ...endedMeterValues,
          finalMeterValue,
        ]
      }
    } catch (error) {
      logger.warn(
        `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEndedMeterValues: ${getErrorMessage(error)}`
      )
    }
    const meterValues: OCPP20MeterValue[] = [
      ...(beginMeterValue != null ? [beginMeterValue] : []),
      ...endedMeterValues,
    ]
    return isNotEmptyArray(meterValues) ? meterValues : []
  }

  private static decrementPendingTransactionEventDelivery (
    connectorStatus: ConnectorStatus,
    transactionId: string
  ): void {
    const counts = OCPP20ServiceUtils.pendingTransactionEventDeliveryCounts.get(connectorStatus)
    if (counts == null) return
    const remaining = (counts.get(transactionId) ?? 0) - 1
    if (remaining > 0) {
      counts.set(transactionId, remaining)
    } else {
      counts.delete(transactionId)
      if (counts.size === 0) {
        OCPP20ServiceUtils.pendingTransactionEventDeliveryCounts.delete(connectorStatus)
      }
    }
  }

  private static async drainQueuedTransactionEvents (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus,
    lifecycleAbortSignal?: AbortSignal,
    evseId?: number,
    eligibleEvents?: ReadonlySet<QueuedTransactionEvent>
  ): Promise<void> {
    const queue: QueuedTransactionEvent[] = connectorStatus.transactionEventQueue ?? []
    OCPP20ServiceUtils.retryableTransactionEventQueueFailures.delete(connectorStatus)
    if (queue.length === 0) return
    logger.info(
      `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Sending ${queue.length.toString()} queued TransactionEvents for connector ${connectorId.toString()}`
    )

    const responseTimeoutMs = OCPP20ServiceUtils.readVariableAsIntervalMs(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20RequiredVariableName.MessageTimeout,
      Constants.DEFAULT_MESSAGE_TIMEOUT_SECONDS,
      'Default'
    )
    let queueChanged = false
    while (queue.length > 0) {
      const queuedEvent = queue[0]
      if (eligibleEvents != null && !eligibleEvents.has(queuedEvent)) break
      const responseState = { callError: false, received: false, sent: false }
      const wasQueuedStartedEvent =
        queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Started
      try {
        logger.debug(
          `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Sending queued event with seqNo=${queuedEvent.seqNo.toString()}`
        )
        OCPP20ServiceUtils.replayedTransactionEventRequests.add(queuedEvent.request)
        setTransactionEventQueueInFlight(connectorStatus, queuedEvent)
        try {
          await OCPP20ServiceUtils.sendBuiltTransactionEvent(
            chargingStation,
            queuedEvent.request,
            {
              onError: (_error, isCallError) => {
                responseState.callError = isCallError
              },
              onMessageSent: () => {
                responseState.sent = true
              },
              onResponseReceived: () => {
                responseState.received = true
              },
              responseTimeoutMs,
              skipBufferingOnError: true,
            },
            lifecycleAbortSignal
          )
        } finally {
          setTransactionEventQueueInFlight(connectorStatus)
          OCPP20ServiceUtils.replayedTransactionEventRequests.delete(queuedEvent.request)
        }
        if (queue[0] === queuedEvent) {
          shiftBoundedTransactionEvent(connectorStatus)
          queueChanged = true
          if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended) {
            const transactionFinalized = await OCPP20ServiceUtils.cleanupEndedTransaction(
              chargingStation,
              connectorId,
              connectorStatus,
              evseId,
              queuedEvent.request.transactionInfo.transactionId
            )
            if (!transactionFinalized) chargingStation.saveTransactionEventQueues()
            queueChanged = false
          }
        }
      } catch (error) {
        if (responseState.callError && wasQueuedStartedEvent) {
          const failedTransactionId = queuedEvent.request.transactionInfo.transactionId
          for (let index = queue.length - 1; index >= 0; index--) {
            if (queue[index].request.transactionInfo.transactionId === failedTransactionId) {
              queue.splice(index, 1)
            }
          }
          invalidateTransactionEventQueueAccounting(connectorStatus)
          OCPP20ServiceUtils.retryableTransactionEventQueueFailures.delete(connectorStatus)
          const currentConnectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
          const stillOwnsFailedTransaction =
            currentConnectorStatus === connectorStatus &&
            connectorStatus.transactionId?.toString() === failedTransactionId
          if (stillOwnsFailedTransaction) {
            const replacementRestored = OCPP20ServiceUtils.restoreNextQueuedStartedTransaction(
              chargingStation,
              connectorId,
              connectorStatus,
              failedTransactionId,
              evseId
            )
            if (!replacementRestored) {
              const transactionFinalized = await OCPP20ServiceUtils.cleanupEndedTransaction(
                chargingStation,
                connectorId,
                connectorStatus,
                evseId,
                failedTransactionId
              )
              if (!transactionFinalized) {
                chargingStation.destroyCoherentSession(failedTransactionId)
                chargingStation.saveTransactionEventQueues()
              }
            }
          } else {
            chargingStation.destroyCoherentSession(failedTransactionId)
            chargingStation.saveTransactionEventQueues()
          }
          queueChanged = false
          logger.error(
            `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Discarding transaction ${failedTransactionId} after queued TransactionEvent(Started) CALLERROR:`,
            error
          )
          continue
        }
        if (
          !OCPP20ServiceUtils.isChargingStationStopping(chargingStation) &&
          (responseState.received || chargingStation.isWebSocketConnectionOpened())
        ) {
          const ownsRestoredStartedEvent =
            connectorStatus.transactionRestored === true &&
            connectorStatus.transactionStarted !== true &&
            connectorStatus.transactionId?.toString() ===
              queuedEvent.request.transactionInfo.transactionId &&
            queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Started
          if (ownsRestoredStartedEvent) {
            OCPP20ServiceUtils.retryableTransactionEventQueueFailures.add(connectorStatus)
            chargingStation.saveTransactionEventQueues()
            queueChanged = false
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Preserving restored owning TransactionEvent(Started) with seqNo=${queuedEvent.seqNo.toString()} after configured delivery attempts:`,
              error
            )
            break
          }
          if (!responseState.sent) {
            const publicKey = Array.isArray(queuedEvent.request.meterValue)
              ? queuedEvent.request.meterValue
                .flatMap(meterValue =>
                  Array.isArray(meterValue.sampledValue) ? meterValue.sampledValue : []
                )
                .map(sampledValue => sampledValue.signedMeterValue?.publicKey)
                .find(key => key != null && key.length > 0)
              : undefined
            const nextSignedEvent = queue
              .slice(1)
              .find(
                remainingEvent =>
                  remainingEvent.request.transactionInfo.transactionId ===
                    queuedEvent.request.transactionInfo.transactionId &&
                  remainingEvent.request.meterValue?.some(meterValue =>
                    meterValue.sampledValue.some(
                      sampledValue => sampledValue.signedMeterValue != null
                    )
                  ) === true
              )
            const nextSignedSample = nextSignedEvent?.request.meterValue
              ?.flatMap(meterValue => meterValue.sampledValue)
              .find(sampledValue => sampledValue.signedMeterValue != null)
            if (
              publicKey != null &&
              nextSignedEvent != null &&
              nextSignedSample?.signedMeterValue != null
            ) {
              nextSignedSample.signedMeterValue.publicKey = publicKey
              invalidateTransactionEventQueueAccounting(connectorStatus)
            } else if (
              publicKey != null &&
              connectorStatus.transactionId?.toString() ===
                queuedEvent.request.transactionInfo.transactionId
            ) {
              connectorStatus.publicKeySentInTransaction = false
            }
          }
          if (queue[0] === queuedEvent) {
            const removedEvent = shiftBoundedTransactionEvent(
              connectorStatus,
              !responseState.received &&
                (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated ||
                  !responseState.callError)
            )
            if (removedEvent == null) {
              if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended) {
                OCPP20ServiceUtils.scheduleRetainedEndedTransactionEventRetry(
                  chargingStation,
                  connectorId,
                  connectorStatus,
                  evseId
                )
              } else {
                OCPP20ServiceUtils.retryableTransactionEventQueueFailures.add(connectorStatus)
              }
              logger.error(
                `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Preserving queued TransactionEvent with seqNo=${queuedEvent.seqNo.toString()} because discarding it would lose interval energy:`,
                error
              )
              chargingStation.saveTransactionEventQueues()
              queueChanged = false
              break
            }
            logger.error(
              `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Discarding queued TransactionEvent with seqNo=${queuedEvent.seqNo.toString()} ${responseState.received ? 'after its response handler failed' : 'after configured delivery attempts'}:`,
              error
            )
            queueChanged = true
            if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended) {
              const transactionFinalized = await OCPP20ServiceUtils.cleanupEndedTransaction(
                chargingStation,
                connectorId,
                connectorStatus,
                evseId,
                queuedEvent.request.transactionInfo.transactionId
              )
              if (!transactionFinalized) chargingStation.saveTransactionEventQueues()
              queueChanged = false
            }
          }
          continue
        }
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.sendQueuedTransactionEvents: Connection lost while sending queued TransactionEvent with seqNo=${queuedEvent.seqNo.toString()}, preserving it and the remaining queue:`,
          error
        )
        break
      }
    }
    if (queueChanged) chargingStation.saveTransactionEventQueues()
  }

  private static enqueueTransactionEvent (
    chargingStation: ChargingStation,
    connectorStatus: ConnectorStatus,
    request: OCPP20TransactionEventRequest,
    markOffline = false
  ): void {
    if (markOffline) request.offline = true
    const isUpdatedEvent = request.eventType === OCPP20TransactionEventEnumType.Updated
    const result = enqueueBoundedTransactionEvent(connectorStatus, {
      request,
      seqNo: request.seqNo,
      timestamp: new Date(),
      ...buildPersistentTransactionEnergyIntervalState(
        connectorStatus.transactionEnergyActiveImportIntervalBaselines
      ),
      ...(getTransactionIntervalConsumptions(request.meterValue) != null && {
        transactionEnergyActiveImportIntervalConsumption: getTransactionIntervalConsumptions(
          request.meterValue
        ),
      }),
      ...(connectorStatus.transactionEnergyActiveImportRegisterValue != null && {
        transactionEnergyActiveImportRegisterValue:
          connectorStatus.transactionEnergyActiveImportRegisterValue,
      }),
    })
    if (!result.inserted) {
      if (result.changed) chargingStation.saveTransactionEventQueues()
      return
    }
    if (
      result.removedEvents.length > 0 &&
      !OCPP20ServiceUtils.saturatedTransactionEventQueues.has(connectorStatus)
    ) {
      OCPP20ServiceUtils.saturatedTransactionEventQueues.add(connectorStatus)
      logger.error(
        `${chargingStation.logPrefix()} ${moduleName}.enqueueTransactionEvent: TransactionEvent queue reached its bounded capacity; decimating intermediate updates or compacting queued payload`
      )
    }
    chargingStation.saveTransactionEventQueues(isUpdatedEvent)
  }

  private static incrementPendingTransactionEventDelivery (
    connectorStatus: ConnectorStatus,
    transactionId: string
  ): void {
    let counts = OCPP20ServiceUtils.pendingTransactionEventDeliveryCounts.get(connectorStatus)
    if (counts == null) {
      counts = new Map<string, number>()
      OCPP20ServiceUtils.pendingTransactionEventDeliveryCounts.set(connectorStatus, counts)
    }
    counts.set(transactionId, (counts.get(transactionId) ?? 0) + 1)
  }

  private static isChargingStationStopping (chargingStation: ChargingStation): boolean {
    return (chargingStation as unknown as { isStopping?: () => boolean }).isStopping?.() === true
  }

  /**
   * Reads an integer and clamps it to its canonical Device Model bounds.
   * @param chargingStation - Target charging station
   * @param componentName - Device Model component name
   * @param variableName - Device Model variable name
   * @param defaultValue - Fallback value
   * @param componentInstance - Optional component instance
   * @returns The bounded integer value
   */
  private static readBoundedVariableAsInteger (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultValue: number,
    componentInstance?: string
  ): number {
    const value = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      componentName,
      variableName,
      defaultValue,
      componentInstance
    )
    const metadata = getVariableMetadata(componentName, variableName, componentInstance)
    return Math.min(metadata?.max ?? value, Math.max(metadata?.min ?? value, value))
  }

  private static readVariableAsIntervalMs (
    chargingStation: ChargingStation,
    componentName: string,
    variableName: string,
    defaultSeconds: number,
    componentInstance?: string
  ): number {
    const intervalSeconds = OCPP20ServiceUtils.readVariableAsInteger(
      chargingStation,
      componentName,
      variableName,
      defaultSeconds,
      componentInstance
    )
    return intervalSeconds > 0
      ? secondsToMilliseconds(intervalSeconds)
      : secondsToMilliseconds(defaultSeconds)
  }

  private static resolveActiveTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    evseId?: number
  ): { connectorStatus: ConnectorStatus; transactionId: string } {
    const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
    if (
      connectorStatus != null &&
      !isTransactionEnding(connectorStatus) &&
      (connectorStatus.transactionStarted === true ||
        connectorStatus.transactionPending === true ||
        connectorStatus.transactionStarting === true) &&
      connectorStatus.transactionId != null
    ) {
      let transactionId: string
      if (typeof connectorStatus.transactionId === 'string') {
        transactionId = connectorStatus.transactionId
      } else {
        transactionId = connectorStatus.transactionId.toString()
        logger.warn(
          `${chargingStation.logPrefix()} ${moduleName}.resolveActiveTransaction: Non-string transaction ID ${transactionId} converted to string for OCPP 2.0.1`
        )
      }
      return { connectorStatus, transactionId }
    }
    throw new OCPPError(
      ErrorType.PROPERTY_CONSTRAINT_VIOLATION,
      `No active transaction on connector ${connectorId.toString()}`
    )
  }

  private static restoreNextQueuedStartedTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus,
    failedTransactionId: string,
    evseId?: number
  ): boolean {
    const queuedStarted = connectorStatus.transactionEventQueue?.[0]
    if (queuedStarted?.request.eventType !== OCPP20TransactionEventEnumType.Started) return false

    OCPP20ServiceUtils.stopUpdatedMeterValues(chargingStation, connectorId, evseId)
    OCPP20ServiceUtils.stopEndedMeterValues(chargingStation, connectorId, evseId)
    resetConnectorStatus(connectorStatus)
    chargingStation.destroyCoherentSession(failedTransactionId)
    const replacementTransactionId = queuedStarted.request.transactionInfo.transactionId
    const replacementEvents = (connectorStatus.transactionEventQueue ?? []).filter(
      queuedEvent => queuedEvent.request.transactionInfo.transactionId === replacementTransactionId
    )
    const replacementEnergyWh = replacementEvents.reduce((latestEnergyWh, queuedEvent) => {
      const energyWh = queuedEvent.transactionEnergyActiveImportRegisterValue
      return typeof energyWh === 'number' && Number.isFinite(energyWh) && energyWh >= 0
        ? energyWh
        : latestEnergyWh
    }, 0)
    const replacementIntervalBaselines =
      replacementEvents.at(-1)?.transactionEnergyActiveImportIntervalBaselines
    connectorStatus.transactionId = replacementTransactionId
    connectorStatus.transactionIdTag = replacementEvents.find(
      queuedEvent => queuedEvent.request.idToken != null
    )?.request.idToken?.idToken
    connectorStatus.transactionBeginMeterValue = queuedStarted.request.meterValue?.[0]
    if (replacementIntervalBaselines != null) {
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = {
        ...replacementIntervalBaselines,
      }
    }
    connectorStatus.transactionEnergyActiveImportRegisterValue = Math.max(0, replacementEnergyWh)
    connectorStatus.transactionSeqNo = Math.max(
      queuedStarted.seqNo,
      ...replacementEvents.map(queuedEvent => queuedEvent.seqNo)
    )
    connectorStatus.transactionStart = queuedStarted.request.timestamp
    connectorStatus.transactionStarting = true
    connectorStatus.transactionRestored = true
    if (replacementEvents.some(queuedEvent => queuedEvent.request.evse != null)) {
      connectorStatus.transactionEvseSent = true
    }
    if (replacementEvents.some(queuedEvent => queuedEvent.request.idToken != null)) {
      connectorStatus.transactionIdTokenSent = true
    }
    if (
      replacementEvents.some(queuedEvent =>
        queuedTransactionEventHasPublicKey(queuedEvent, replacementTransactionId)
      )
    ) {
      connectorStatus.publicKeySentInTransaction = true
    }
    chargingStation.saveTransactionEventQueues()
    return true
  }

  private static scheduleRetainedEndedTransactionEventRetry (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus,
    evseId?: number
  ): void {
    OCPP20ServiceUtils.retryableTransactionEventQueueFailures.add(connectorStatus)
    const retryDelayMs = Math.max(
      1000,
      secondsToMilliseconds(
        OCPP20ServiceUtils.readBoundedVariableAsInteger(
          chargingStation,
          OCPP20ComponentName.OCPPCommCtrlr,
          OCPP20RequiredVariableName.MessageAttemptInterval,
          5,
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
      )
    )
    setTimeout(() => {
      if (OCPP20ServiceUtils.isChargingStationStopping(chargingStation)) return
      OCPP20ServiceUtils.retryableTransactionEventQueueFailures.delete(connectorStatus)
      OCPP20ServiceUtils.scheduleTransactionEventQueueDrain(
        chargingStation,
        connectorId,
        connectorStatus,
        evseId
      )
    }, retryDelayMs).unref()
  }

  private static scheduleTransactionEventQueueDrain (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus,
    evseId?: number
  ): void {
    if (
      OCPP20ServiceUtils.isChargingStationStopping(chargingStation) ||
      OCPP20ServiceUtils.retryableTransactionEventQueueFailures.has(connectorStatus) ||
      OCPP20ServiceUtils.transactionEventQueueDrains.has(connectorStatus)
    ) {
      return
    }
    OCPP20ServiceUtils.transactionEventQueueDrains.add(connectorStatus)
    OCPP20ServiceUtils.sendQueuedTransactionEvents(chargingStation, connectorId, evseId)
      .finally(() => {
        OCPP20ServiceUtils.transactionEventQueueDrains.delete(connectorStatus)
        if (
          isNotEmptyArray(connectorStatus.transactionEventQueue) &&
          !OCPP20ServiceUtils.isChargingStationStopping(chargingStation) &&
          chargingStation.isWebSocketConnectionOpened() &&
          chargingStation.inAcceptedState()
        ) {
          OCPP20ServiceUtils.scheduleTransactionEventQueueDrain(
            chargingStation,
            connectorId,
            connectorStatus,
            evseId
          )
        }
      })
      .catch((error: unknown) => {
        logger.error(
          `${chargingStation.logPrefix()} ${moduleName}.scheduleTransactionEventQueueDrain: Error draining queued TransactionEvents:`,
          error
        )
      })
  }

  /**
   * Sends one pre-built TransactionEvent and applies the OCPP E13 retry policy
   * without rebuilding it, preserving its timestamp and sequence number.
   * @param chargingStation - Target charging station
   * @param request - Immutable TransactionEvent payload to send
   * @param requestParams - Transport behavior overrides
   * @param lifecycleAbortSignal - Lifecycle generation governing this delivery
   * @returns The TransactionEvent response
   */
  private static async sendBuiltTransactionEvent (
    chargingStation: ChargingStation,
    request: OCPP20TransactionEventRequest,
    requestParams: RequestParams = {},
    lifecycleAbortSignal?: AbortSignal
  ): Promise<OCPP20TransactionEventResponse> {
    const maximumAttempts = OCPP20ServiceUtils.readBoundedVariableAsInteger(
      chargingStation,
      OCPP20ComponentName.OCPPCommCtrlr,
      OCPP20RequiredVariableName.MessageAttempts,
      3,
      OCPP20RequestCommand.TRANSACTION_EVENT
    )
    const retryIntervalMs = secondsToMilliseconds(
      OCPP20ServiceUtils.readBoundedVariableAsInteger(
        chargingStation,
        OCPP20ComponentName.OCPPCommCtrlr,
        OCPP20RequiredVariableName.MessageAttemptInterval,
        5,
        OCPP20RequestCommand.TRANSACTION_EVENT
      )
    )
    const responseTimeoutMs =
      requestParams.responseTimeoutMs ??
      secondsToMilliseconds(
        OCPP20ServiceUtils.readBoundedVariableAsInteger(
          chargingStation,
          OCPP20ComponentName.OCPPCommCtrlr,
          OCPP20RequiredVariableName.MessageTimeout,
          Constants.DEFAULT_MESSAGE_TIMEOUT_SECONDS,
          'Default'
        )
      )
    for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
      if (isAbortSignalAborted(lifecycleAbortSignal)) {
        throw new OCPPError(
          ErrorType.GENERIC_ERROR,
          'TransactionEvent delivery aborted before send',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
      }
      const deliveryState = { callError: false, responseReceived: false, sent: false }
      try {
        return await chargingStation.ocppRequestService.requestHandler<
          OCPP20TransactionEventRequest,
          OCPP20TransactionEventResponse
        >(chargingStation, OCPP20RequestCommand.TRANSACTION_EVENT, request, {
          ...requestParams,
          onError: (error, isCallError) => {
            deliveryState.callError = isCallError
            requestParams.onError?.(error, isCallError)
          },
          onMessageSent: () => {
            deliveryState.sent = true
            requestParams.onMessageSent?.()
          },
          onResponseReceived: () => {
            deliveryState.responseReceived = true
            requestParams.onResponseReceived?.()
          },
          rawPayload: true,
          responseTimeoutMs,
          skipBufferingOnError: requestParams.skipBufferingOnError ?? false,
          throwError: true,
        })
      } catch (error) {
        if (deliveryState.callError || deliveryState.responseReceived) throw error
        const bufferedBeforeSend =
          !deliveryState.sent && requestParams.skipBufferingOnError !== true
        if (
          bufferedBeforeSend ||
          !chargingStation.isWebSocketConnectionOpened() ||
          attempt >= maximumAttempts
        ) {
          throw error
        }
        const retryDelayMs = clampToSafeTimerValue(retryIntervalMs * attempt)
        if (lifecycleAbortSignal == null) {
          await sleep(retryDelayMs)
        } else {
          await interruptibleSleep(retryDelayMs, lifecycleAbortSignal)
          if (isAbortSignalAborted(lifecycleAbortSignal)) throw error
        }
      }
    }
    throw new OCPPError(
      ErrorType.GENERIC_ERROR,
      'TransactionEvent retry loop exhausted unexpectedly',
      OCPP20RequestCommand.TRANSACTION_EVENT
    )
  }

  private static async serializeTransactionEventDelivery<T>(
    connectorStatus: ConnectorStatus,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = OCPP20ServiceUtils.transactionEventSendChains.get(connectorStatus)
    const { promise, resolve } = Promise.withResolvers<undefined>()
    OCPP20ServiceUtils.transactionEventSendChains.set(connectorStatus, promise)
    try {
      await previous?.catch(() => undefined)
      return await operation()
    } finally {
      resolve(undefined)
      if (OCPP20ServiceUtils.transactionEventSendChains.get(connectorStatus) === promise) {
        OCPP20ServiceUtils.transactionEventSendChains.delete(connectorStatus)
      }
    }
  }

  private static async terminateTransaction (
    chargingStation: ChargingStation,
    connectorId: number,
    connectorStatus: ConnectorStatus,
    transactionId: string,
    triggerReason: OCPP20TriggerReasonEnumType,
    stoppedReason: OCPP20ReasonEnumType,
    evseId?: number
  ): Promise<OCPP20TransactionEventResponse> {
    this.stopEndedMeterValues(chargingStation, connectorId, evseId)
    const endedMeterValues = this.buildTransactionEndedMeterValues(
      chargingStation,
      connectorId,
      transactionId,
      evseId
    )

    connectorStatus.transactionEnding = true
    let response: OCPP20TransactionEventResponse
    try {
      response = await this.sendTransactionEvent(
        chargingStation,
        OCPP20TransactionEventEnumType.Ended,
        triggerReason,
        connectorId,
        transactionId,
        {
          evseId,
          meterValue: isNotEmptyArray(endedMeterValues) ? endedMeterValues : undefined,
          stoppedReason,
        }
      )
    } catch (error) {
      await OCPP20ServiceUtils.cleanupEndedTransaction(
        chargingStation,
        connectorId,
        connectorStatus,
        evseId,
        transactionId
      )
      throw error
    }

    await OCPP20ServiceUtils.cleanupEndedTransaction(
      chargingStation,
      connectorId,
      connectorStatus,
      evseId,
      transactionId
    )

    return response
  }
}

/**
 * @param chargingStation - Charging station instance
 * @param commandParams - Transaction event request parameters
 * @returns Built TransactionEventRequest
 */
export function buildTransactionEvent (
  chargingStation: ChargingStation,
  commandParams: OCPP20TransactionEventOptions
): OCPP20TransactionEventRequest {
  const eventType = commandParams.eventType
  const defaultTriggerReason =
    eventType === OCPP20TransactionEventEnumType.Ended
      ? OCPP20TriggerReasonEnumType.RemoteStop
      : OCPP20TriggerReasonEnumType.Authorized
  const triggerReason = commandParams.triggerReason ?? defaultTriggerReason
  const inputEvse = commandParams.evse
  const connectorId = commandParams.connectorId ?? inputEvse?.connectorId ?? inputEvse?.id ?? 1
  const transactionId =
    commandParams.transactionId ??
    (eventType === OCPP20TransactionEventEnumType.Ended
      ? (chargingStation.getConnectorStatus(connectorId)?.transactionId?.toString() ??
        generateUUID())
      : generateUUID())

  if (!validateIdentifierString(transactionId, 36)) {
    const errorMsg = `Invalid transaction ID format (must be non-empty string ≤36 characters): ${transactionId}`
    logger.error(`${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: ${errorMsg}`)
    throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
  }

  const evseId = commandParams.evseId ?? chargingStation.getEvseIdByConnectorId(connectorId)
  if (evseId == null) {
    const errorMsg = `Cannot find EVSE ID for connector ${connectorId.toString()}`
    logger.error(`${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: ${errorMsg}`)
    throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
  }

  const connectorStatus = chargingStation.getConnectorStatus(connectorId, evseId)
  if (connectorStatus == null) {
    const errorMsg = `Cannot find connector status for connector ${connectorId.toString()}`
    logger.error(`${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: ${errorMsg}`)
    throw new OCPPError(ErrorType.PROPERTY_CONSTRAINT_VIOLATION, errorMsg)
  }

  if (connectorStatus.transactionSeqNo == null) {
    connectorStatus.transactionSeqNo = 0
  } else {
    connectorStatus.transactionSeqNo = connectorStatus.transactionSeqNo + 1
  }

  // E01.FR.16: only include EVSE in first TransactionEvent
  let evse: OCPP20EVSEType | undefined
  if (connectorStatus.transactionEvseSent !== true) {
    evse = { id: evseId }
    if (connectorId !== evseId) {
      evse.connectorId = connectorId
    }
    connectorStatus.transactionEvseSent = true
  }

  const transactionInfo: OCPP20TransactionType = {
    transactionId: transactionId as UUIDv4,
  }

  const chargingState =
    commandParams.chargingState ??
    (eventType === OCPP20TransactionEventEnumType.Ended
      ? undefined
      : connectorStatus.transactionStarted === true
        ? OCPP20ChargingStateEnumType.Charging
        : OCPP20ChargingStateEnumType.EVConnected)
  if (chargingState !== undefined) {
    transactionInfo.chargingState = chargingState
  }
  if (commandParams.stoppedReason !== undefined) {
    transactionInfo.stoppedReason = commandParams.stoppedReason
  }
  if (commandParams.remoteStartId !== undefined) {
    transactionInfo.remoteStartId = commandParams.remoteStartId
  }

  const transactionEventRequest: OCPP20TransactionEventRequest = {
    eventType,
    seqNo: connectorStatus.transactionSeqNo,
    timestamp: commandParams.timestamp ?? new Date(),
    transactionInfo,
    triggerReason,
  }

  if (evse !== undefined) {
    transactionEventRequest.evse = evse
  }

  // E03.FR.01: Include idToken only once per transaction
  if (commandParams.idToken !== undefined && connectorStatus.transactionIdTokenSent !== true) {
    transactionEventRequest.idToken = commandParams.idToken
    connectorStatus.transactionIdTokenSent = true
  }
  if (commandParams.meterValue !== undefined && isNotEmptyArray(commandParams.meterValue)) {
    transactionEventRequest.meterValue = commandParams.meterValue
  }
  if (commandParams.cableMaxCurrent !== undefined) {
    transactionEventRequest.cableMaxCurrent = commandParams.cableMaxCurrent
  }
  if (commandParams.numberOfPhasesUsed !== undefined) {
    transactionEventRequest.numberOfPhasesUsed = commandParams.numberOfPhasesUsed
  }
  if (commandParams.offline !== undefined) {
    transactionEventRequest.offline = commandParams.offline
  }
  if (commandParams.reservationId !== undefined) {
    transactionEventRequest.reservationId = commandParams.reservationId
  }
  if (commandParams.customData !== undefined) {
    transactionEventRequest.customData = commandParams.customData
  }

  logger.debug(
    `${chargingStation.logPrefix()} ${moduleName}.buildTransactionEvent: Building ${OCPP20RequestCommand.TRANSACTION_EVENT} for trigger '${triggerReason}'`
  )

  return transactionEventRequest
}
