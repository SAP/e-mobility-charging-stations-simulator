import { type ConnectorStatus, CurrentType, MeterValueMeasurand } from '../../types/index.js'
import { Constants, isEmpty } from '../../utils/index.js'

export interface TransactionIntervalState {
  consumed: number
  readonly transactionId?: string
}

const transactionIntervalConsumptions = new WeakMap<object, Record<string, number>>()

/**
 * Resolves the conversion factor used to translate an emitted inlet value back
 * to the transaction's output-side energy accounting.
 * @param currentType - Station output current type.
 * @param configuredEfficiency - Configured inlet-to-output conversion efficiency.
 * @param evseId - EVSE identity; EVSE zero represents the raw station inlet.
 * @returns A validated efficiency for a DC output, otherwise one.
 */
export const resolveInletToOutputEfficiency = (
  currentType: CurrentType | undefined,
  configuredEfficiency: number | undefined,
  evseId?: number
): number =>
  currentType === CurrentType.DC &&
  evseId !== 0 &&
  configuredEfficiency != null &&
  Number.isFinite(configuredEfficiency) &&
  configuredEfficiency > 0 &&
  configuredEfficiency <= 1
    ? configuredEfficiency
    : 1

export const recordTransactionIntervalConsumption = (
  meterValue: object,
  baselineKey: string,
  energyWh: number
): void => {
  if (!Number.isFinite(energyWh) || energyWh <= 0) return
  transactionIntervalConsumptions.set(meterValue, { [baselineKey]: energyWh })
}

export const getTransactionIntervalConsumptions = (
  meterValues: readonly object[] | undefined
): Record<string, number> | undefined => {
  if (meterValues == null) return undefined
  const consumptions: Record<string, number> = {}
  for (const meterValue of meterValues) {
    const meterValueConsumptions = transactionIntervalConsumptions.get(meterValue)
    if (meterValueConsumptions == null) continue
    for (const [key, value] of Object.entries(meterValueConsumptions)) {
      consumptions[key] = (consumptions[key] ?? 0) + value
    }
  }
  return isEmpty(consumptions) ? undefined : consumptions
}

export const captureTransactionIntervalState = (
  connectorStatus: ConnectorStatus
): TransactionIntervalState => ({
  consumed: 0,
  transactionId: connectorStatus.transactionId?.toString(),
})

export const completeTransactionIntervalState = (
  state: TransactionIntervalState,
  baselineKey: string,
  meterValues: readonly object[]
): void => {
  state.consumed = getTransactionIntervalConsumptions(meterValues)?.[baselineKey] ?? 0
}

export const restoreTransactionIntervalState = (
  state: TransactionIntervalState,
  connectorStatus: ConnectorStatus,
  baselineKey: string
): void => {
  if (state.consumed <= 0 || connectorStatus.transactionId?.toString() !== state.transactionId) {
    return
  }
  connectorStatus.transactionEnergyActiveImportIntervalCarry ??= {}
  connectorStatus.transactionEnergyActiveImportIntervalCarry[baselineKey] =
    (connectorStatus.transactionEnergyActiveImportIntervalCarry[baselineKey] ?? 0) + state.consumed
}

interface IntervalMeterValue {
  sampledValue: readonly IntervalSampledValue[]
}

interface IntervalSampledValue {
  location?: string
  measurand?: string
  phase?: string
  unit?: string
  unitOfMeasure?: { multiplier?: number; unit?: string }
  value: number | string
}

export const truncateTransactionIntervalValue = (value: number): number =>
  Math.floor(Math.max(0, value) * 100) / 100

export const getRepresentedTransactionIntervalEnergyWh = (
  meterValue: IntervalMeterValue,
  numberOfPhases: number,
  inletToOutputEfficiency = 1
): number => {
  let representedEnergyWh = 0
  for (const sampledValue of meterValue.sampledValue) {
    if (sampledValue.measurand !== MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_INTERVAL) continue
    const value =
      typeof sampledValue.value === 'number'
        ? sampledValue.value
        : Number.parseFloat(sampledValue.value)
    if (!Number.isFinite(value)) continue
    const unit = sampledValue.unitOfMeasure?.unit ?? sampledValue.unit
    const unitMultiplier =
      unit === 'kWh' ? Constants.UNIT_DIVIDER_KILO : unit === 'MWh' ? 1_000_000 : 1
    const decimalMultiplier = 10 ** (sampledValue.unitOfMeasure?.multiplier ?? 0)
    const phaseMultiplier = /^L[123](?:-N)?$/.test(sampledValue.phase ?? '') ? numberOfPhases : 1
    const locationMultiplier =
      sampledValue.location === 'Inlet' && inletToOutputEfficiency > 0 ? inletToOutputEfficiency : 1
    representedEnergyWh = Math.max(
      representedEnergyWh,
      value * unitMultiplier * decimalMultiplier * phaseMultiplier * locationMultiplier
    )
  }
  return representedEnergyWh
}

/**
 * Commits the transaction interval state represented by an emitted MeterValue.
 *
 * The baseline, response-restoration accounting, and fractional carry must be
 * updated together so retries cannot lose or duplicate interval energy.
 * @param connectorStatus - Connector transaction state to update.
 * @param meterValue - Emitted MeterValue containing interval samples.
 * @param baselineKey - Configuration-scoped interval baseline key.
 * @param intervalEnergyWh - Physical interval energy available before serialization.
 * @param numberOfPhases - Station phase count used to expand per-phase samples.
 * @param inletToOutputEfficiency - Efficiency for inlet samples represented at the output.
 */
export const recordTransactionIntervalEmission = (
  connectorStatus: ConnectorStatus,
  meterValue: IntervalMeterValue,
  baselineKey: string,
  intervalEnergyWh: number,
  numberOfPhases: number,
  inletToOutputEfficiency = 1
): void => {
  connectorStatus.transactionEnergyActiveImportIntervalBaselines ??= {}
  connectorStatus.transactionEnergyActiveImportIntervalBaselines[baselineKey] =
    connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
  const representedEnergyWh = getRepresentedTransactionIntervalEnergyWh(
    meterValue,
    numberOfPhases,
    inletToOutputEfficiency
  )
  recordTransactionIntervalConsumption(meterValue, baselineKey, representedEnergyWh)
  connectorStatus.transactionEnergyActiveImportIntervalCarry ??= {}
  connectorStatus.transactionEnergyActiveImportIntervalCarry[baselineKey] = Math.max(
    0,
    intervalEnergyWh - representedEnergyWh
  )
}

/**
 * Commits a previously frozen interval snapshot against the current transaction state.
 *
 * Delivery may wait behind an earlier request whose definitive rejection restores energy,
 * while the physical register may also continue advancing. Rebase the frozen snapshot's
 * represented energy onto that current state so neither source of newly available energy is lost.
 * @param connectorStatus - Connector transaction state to update.
 * @param meterValue - Frozen MeterValue snapshot being emitted.
 * @param baselineKey - Configuration-scoped interval baseline key.
 * @param numberOfPhases - Station phase count used to expand per-phase samples.
 * @param inletToOutputEfficiency - Efficiency for inlet samples represented at the output.
 */
export const recordFrozenTransactionIntervalEmission = (
  connectorStatus: ConnectorStatus,
  meterValue: IntervalMeterValue,
  baselineKey: string,
  numberOfPhases: number,
  inletToOutputEfficiency = 1
): void => {
  const intervalEnergyWh =
    Math.max(
      0,
      (connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) -
        (connectorStatus.transactionEnergyActiveImportIntervalBaselines?.[baselineKey] ?? 0)
    ) + (connectorStatus.transactionEnergyActiveImportIntervalCarry?.[baselineKey] ?? 0)
  recordTransactionIntervalEmission(
    connectorStatus,
    meterValue,
    baselineKey,
    intervalEnergyWh,
    numberOfPhases,
    inletToOutputEfficiency
  )
}
