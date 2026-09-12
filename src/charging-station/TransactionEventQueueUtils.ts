import {
  type ConnectorStatus,
  OCPP20LocationEnumType,
  OCPP20MeasurandEnumType,
  type OCPP20MeterValue,
  OCPP20ReadingContextEnumType,
  type OCPP20SampledValue,
  type OCPP20SignedMeterValue,
  OCPP20TransactionEventEnumType,
  OCPP20UnitEnumType,
  type QueuedTransactionEvent,
} from '../types/index.js'
import {
  Constants,
  isEmpty,
  isJsonObject,
  isNotEmptyArray,
  isNotEmptyString,
} from '../utils/index.js'
import { canonicalizeCustomData } from './meter-values/MeterValueUtils.js'

export interface BoundedTransactionEventQueue {
  bytes: number
  changed: boolean
  overLimit: boolean
  removedEvents: QueuedTransactionEvent[]
}

export interface EnqueuedTransactionEventQueue extends BoundedTransactionEventQueue {
  capacityRejected?: boolean
  inserted: boolean
}

interface TransactionEventQueueAccounting {
  bytes: number
  endedEventCounts: Map<string, number>
  eventBytes: Map<QueuedTransactionEvent, number>
  eventKeys: Set<string>
  first?: QueuedTransactionEvent
  last?: QueuedTransactionEvent
  queue: QueuedTransactionEvent[]
  stagedEndedEventCounts: Map<string, number>
}

const TRANSACTION_EVENT_QUEUE_HEADROOM_RATIO = 0.75
const MAX_UPDATED_TRANSACTION_EVENT_QUEUE_LENGTH = Math.floor(
  Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH * TRANSACTION_EVENT_QUEUE_HEADROOM_RATIO
)
const MAX_UPDATED_TRANSACTION_EVENT_QUEUE_BYTES = Math.floor(
  Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES * TRANSACTION_EVENT_QUEUE_HEADROOM_RATIO
)
const inFlightTransactionEvents = new WeakMap<ConnectorStatus, QueuedTransactionEvent>()

export const setTransactionEventQueueInFlight = (
  connectorStatus: ConnectorStatus,
  queuedEvent: QueuedTransactionEvent
): void => {
  inFlightTransactionEvents.set(connectorStatus, queuedEvent)
}

export const clearTransactionEventQueueInFlight = (
  connectorStatus: ConnectorStatus,
  queuedEvent: QueuedTransactionEvent
): void => {
  if (inFlightTransactionEvents.get(connectorStatus) === queuedEvent) {
    inFlightTransactionEvents.delete(connectorStatus)
  }
}

/**
 * Clears process-local delivery ownership when a station lifecycle is sealed.
 * @param connectorStatus - Connector state whose process-local delivery markers are cleared.
 */
export const resetTransactionEventQueueRuntimeState = (connectorStatus: ConnectorStatus): void => {
  inFlightTransactionEvents.delete(connectorStatus)
  for (const queuedEvent of connectorStatus.transactionEventQueue ?? []) {
    stagedTransactionEventQueueEntries.delete(queuedEvent)
  }
  invalidateTransactionEventQueueAccounting(connectorStatus)
}
const blockedTransactionEventQueueEntries = new WeakSet<QueuedTransactionEvent>()
const stagedTransactionEventQueueEntries = new WeakSet<QueuedTransactionEvent>()

const isImmutableTransactionEvent = (
  queuedEvent: QueuedTransactionEvent,
  inFlightEvent?: QueuedTransactionEvent
): boolean =>
  queuedEvent.deliveryAttempted === true ||
  blockedTransactionEventQueueEntries.has(queuedEvent) ||
  stagedTransactionEventQueueEntries.has(queuedEvent) ||
  queuedEvent === inFlightEvent
const transactionEventQueueAccounting = new WeakMap<
  ConnectorStatus,
  TransactionEventQueueAccounting
>()

const getQueuedTransactionEventBytes = (queuedEvent: QueuedTransactionEvent): number =>
  Buffer.byteLength(JSON.stringify(queuedEvent), 'utf8')

const getQueuedTransactionEventKey = (transactionId: string, seqNo: number): string =>
  `${transactionId}\u0000${seqNo.toString()}`

export const getTransactionEventQueueBytes = (queue: QueuedTransactionEvent[]): number =>
  queue.reduce(
    (bytes, queuedEvent, index) =>
      bytes + getQueuedTransactionEventBytes(queuedEvent) + (index === 0 ? 0 : 1),
    2
  )

const buildTransactionEventQueueAccounting = (
  connectorStatus: ConnectorStatus,
  queue: QueuedTransactionEvent[]
): TransactionEventQueueAccounting => {
  const endedEventCounts = new Map<string, number>()
  const eventBytes = new Map<QueuedTransactionEvent, number>()
  const stagedEndedEventCounts = new Map<string, number>()
  const eventKeys = new Set<string>()
  let bytes = 2
  for (const [index, queuedEvent] of queue.entries()) {
    const queuedEventBytes = getQueuedTransactionEventBytes(queuedEvent)
    eventBytes.set(queuedEvent, queuedEventBytes)
    const transactionId = queuedEvent.request.transactionInfo.transactionId
    eventKeys.add(getQueuedTransactionEventKey(transactionId, queuedEvent.seqNo))
    if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended) {
      endedEventCounts.set(transactionId, (endedEventCounts.get(transactionId) ?? 0) + 1)
      if (stagedTransactionEventQueueEntries.has(queuedEvent)) {
        stagedEndedEventCounts.set(
          transactionId,
          (stagedEndedEventCounts.get(transactionId) ?? 0) + 1
        )
      }
    }
    bytes += queuedEventBytes + (index === 0 ? 0 : 1)
  }
  const accounting = {
    bytes,
    endedEventCounts,
    eventBytes,
    eventKeys,
    first: queue[0],
    last: queue.at(-1),
    queue,
    stagedEndedEventCounts,
  }
  transactionEventQueueAccounting.set(connectorStatus, accounting)
  return accounting
}

const getTransactionEventQueueAccounting = (
  connectorStatus: ConnectorStatus
): TransactionEventQueueAccounting => {
  const queue = connectorStatus.transactionEventQueue ?? []
  const accounting = transactionEventQueueAccounting.get(connectorStatus)
  if (
    accounting?.queue !== queue ||
    accounting.eventBytes.size !== queue.length ||
    accounting.first !== queue[0] ||
    accounting.last !== queue.at(-1)
  ) {
    return buildTransactionEventQueueAccounting(connectorStatus, queue)
  }
  return accounting
}

const refreshAccountingEdges = (accounting: TransactionEventQueueAccounting): void => {
  accounting.first = accounting.queue[0]
  accounting.last = accounting.queue.at(-1)
}

const refreshQueuedEventBytes = (
  accounting: TransactionEventQueueAccounting,
  queuedEvent: QueuedTransactionEvent
): void => {
  const previousBytes = accounting.eventBytes.get(queuedEvent) ?? 0
  const currentBytes = getQueuedTransactionEventBytes(queuedEvent)
  accounting.eventBytes.set(queuedEvent, currentBytes)
  accounting.bytes += currentBytes - previousBytes
}

export const getMutableSignedMeterValue = (
  sampledValue: OCPP20SampledValue
): OCPP20SignedMeterValue | undefined => {
  const signedMeterValue: unknown = sampledValue.signedMeterValue
  if (
    !isJsonObject(signedMeterValue) ||
    typeof signedMeterValue.encodingMethod !== 'string' ||
    typeof signedMeterValue.publicKey !== 'string' ||
    typeof signedMeterValue.signedMeterData !== 'string' ||
    typeof signedMeterValue.signingMethod !== 'string'
  ) {
    return undefined
  }
  const publicKeyDescriptor = Object.getOwnPropertyDescriptor(signedMeterValue, 'publicKey')
  if (
    publicKeyDescriptor == null ||
    (publicKeyDescriptor.writable !== true && publicKeyDescriptor.set == null)
  ) {
    return undefined
  }
  return signedMeterValue as OCPP20SignedMeterValue
}

export const getRawSignedMeterValuePublicKey = (
  sampledValue: OCPP20SampledValue
): string | undefined => {
  const signedMeterValue: unknown = sampledValue.signedMeterValue
  return isJsonObject(signedMeterValue) && typeof signedMeterValue.publicKey === 'string'
    ? signedMeterValue.publicKey
    : undefined
}

export const queuedTransactionEventHasPublicKey = (
  queuedEvent: QueuedTransactionEvent,
  transactionId: string
): boolean =>
  queuedEvent.request.transactionInfo.transactionId === transactionId &&
  queuedEvent.request.meterValue?.some(meterValue =>
    meterValue.sampledValue.some(sampledValue => {
      const publicKey = getMutableSignedMeterValue(sampledValue)?.publicKey
      return isNotEmptyString(publicKey)
    })
  ) === true

const findPublicKey = (queuedEvent: QueuedTransactionEvent): string | undefined =>
  queuedEvent.request.meterValue
    ?.flatMap(meterValue => meterValue.sampledValue)
    .map(sampledValue => getMutableSignedMeterValue(sampledValue)?.publicKey)
    .find(publicKey => isNotEmptyString(publicKey))

const findRawPublicKey = (queuedEvent: QueuedTransactionEvent): string | undefined =>
  queuedEvent.request.meterValue
    ?.flatMap(meterValue => meterValue.sampledValue)
    .map(getRawSignedMeterValuePublicKey)
    .find(publicKey => isNotEmptyString(publicKey))

const getEffectiveUnit = (sampledValue: OCPP20SampledValue): string | undefined => {
  if (sampledValue.unitOfMeasure?.unit != null) return sampledValue.unitOfMeasure.unit
  const measurand = sampledValue.measurand ?? OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
  return measurand.startsWith('Energy.') ? OCPP20UnitEnumType.WATT_HOUR : undefined
}

const getSampledValueIdentity = (
  sampledValue: OCPP20SampledValue,
  includeSignedMetadata = true
): string => {
  const signedMeterValue = sampledValue.signedMeterValue
  return JSON.stringify([
    sampledValue.measurand ?? OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
    sampledValue.context ?? OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
    sampledValue.phase,
    sampledValue.location ?? OCPP20LocationEnumType.Outlet,
    getEffectiveUnit(sampledValue),
    sampledValue.unitOfMeasure?.multiplier ?? 0,
    canonicalizeCustomData(sampledValue.customData),
    canonicalizeCustomData(sampledValue.unitOfMeasure?.customData),
    !includeSignedMetadata || signedMeterValue == null
      ? undefined
      : [
          signedMeterValue.encodingMethod,
          signedMeterValue.signingMethod,
          canonicalizeCustomData(signedMeterValue.customData),
          isNotEmptyString(signedMeterValue.publicKey),
        ],
  ])
}

const hasSignedMeterValuePayload = (queuedEvent: QueuedTransactionEvent): boolean =>
  queuedEvent.request.meterValue?.some(meterValue =>
    meterValue.sampledValue.some(sampledValue => sampledValue.signedMeterValue != null)
  ) === true

const compactLifecycleMeterValueEndpoints = (
  accounting: TransactionEventQueueAccounting,
  queuedEvent: QueuedTransactionEvent
): boolean => {
  const meterValues = queuedEvent.request.meterValue
  if (
    queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated ||
    !isNotEmptyArray(meterValues)
  ) {
    return false
  }

  const meterValueEndpoints = new Map<string, { first: number; last: number }>()
  const retainedMeterValueIndexes = new Set([0, meterValues.length - 1])
  for (const [meterValueIndex, meterValue] of meterValues.entries()) {
    const identities = new Set<string>()
    for (const sampledValue of meterValue.sampledValue) {
      if (sampledValue.signedMeterValue != null) {
        retainedMeterValueIndexes.add(meterValueIndex)
      } else {
        identities.add(getSampledValueIdentity(sampledValue))
      }
    }
    for (const identity of identities) {
      const endpoints = meterValueEndpoints.get(identity)
      if (endpoints == null) {
        meterValueEndpoints.set(identity, { first: meterValueIndex, last: meterValueIndex })
      } else {
        endpoints.last = meterValueIndex
      }
    }
  }
  for (const endpoints of meterValueEndpoints.values()) {
    retainedMeterValueIndexes.add(endpoints.first)
    retainedMeterValueIndexes.add(endpoints.last)
  }

  const intervalTotals = new Map<string, { readonly sample: OCPP20SampledValue; total: number }>()
  for (const meterValue of meterValues) {
    for (const sampledValue of meterValue.sampledValue) {
      if (
        sampledValue.signedMeterValue != null ||
        sampledValue.measurand !== OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL ||
        typeof sampledValue.value !== 'number' ||
        !Number.isFinite(sampledValue.value)
      ) {
        continue
      }
      const identity = getSampledValueIdentity(sampledValue, false)
      const intervalTotal = intervalTotals.get(identity)
      if (intervalTotal == null) {
        intervalTotals.set(identity, { sample: sampledValue, total: sampledValue.value })
      } else {
        intervalTotal.total += sampledValue.value
      }
    }
  }

  let changed = retainedMeterValueIndexes.size !== meterValues.length
  const retainedMeterValues = meterValues.filter((meterValue, meterValueIndex) => {
    if (!retainedMeterValueIndexes.has(meterValueIndex)) return false

    const sampleEndpoints = new Map<string, { first: number; last: number }>()
    const retainedSampleIndexes = new Set<number>()
    for (const [sampledValueIndex, sampledValue] of meterValue.sampledValue.entries()) {
      if (sampledValue.signedMeterValue != null) {
        retainedSampleIndexes.add(sampledValueIndex)
        continue
      }
      const identity = getSampledValueIdentity(sampledValue)
      const endpoints = sampleEndpoints.get(identity)
      if (endpoints == null) {
        sampleEndpoints.set(identity, { first: sampledValueIndex, last: sampledValueIndex })
      } else {
        endpoints.last = sampledValueIndex
      }
    }
    for (const endpoints of sampleEndpoints.values()) {
      retainedSampleIndexes.add(endpoints.first)
      retainedSampleIndexes.add(endpoints.last)
    }
    if (isEmpty(retainedSampleIndexes) && isNotEmptyArray(meterValue.sampledValue)) {
      retainedSampleIndexes.add(0)
      retainedSampleIndexes.add(meterValue.sampledValue.length - 1)
    }
    if (retainedSampleIndexes.size !== meterValue.sampledValue.length) {
      meterValue.sampledValue = meterValue.sampledValue.filter((_, sampledValueIndex) =>
        retainedSampleIndexes.has(sampledValueIndex)
      )
      changed = true
    }
    return true
  })

  const retainedIntervalTotals = new Map<string, number>()
  const retainedUnsignedIntervalSamples = new Map<string, OCPP20SampledValue>()
  for (const meterValue of retainedMeterValues) {
    for (const sampledValue of meterValue.sampledValue) {
      if (
        sampledValue.signedMeterValue != null ||
        sampledValue.measurand !== OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL ||
        typeof sampledValue.value !== 'number' ||
        !Number.isFinite(sampledValue.value)
      ) {
        continue
      }
      const identity = getSampledValueIdentity(sampledValue, false)
      retainedIntervalTotals.set(
        identity,
        (retainedIntervalTotals.get(identity) ?? 0) + sampledValue.value
      )
      retainedUnsignedIntervalSamples.set(identity, sampledValue)
    }
  }
  for (const [identity, { sample, total }] of intervalTotals) {
    const missingEnergy = total - (retainedIntervalTotals.get(identity) ?? 0)
    if (missingEnergy === 0) continue
    const retainedUnsignedSample = retainedUnsignedIntervalSamples.get(identity)
    if (retainedUnsignedSample != null) {
      retainedUnsignedSample.value += missingEnergy
      changed = true
      continue
    }
    const terminalMeterValue = retainedMeterValues.at(-1)
    if (terminalMeterValue == null) continue
    terminalMeterValue.sampledValue.push({
      ...structuredClone(sample),
      context: OCPP20ReadingContextEnumType.TRANSACTION_END,
      value: missingEnergy,
    })
    changed = true
  }

  if (!changed) return false
  meterValues.splice(0, meterValues.length, ...retainedMeterValues)
  refreshQueuedEventBytes(accounting, queuedEvent)
  return true
}

const compactOversizedLifecycleEvent = (
  accounting: TransactionEventQueueAccounting,
  queuedEvent: QueuedTransactionEvent
): boolean =>
  queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended &&
  compactLifecycleMeterValueEndpoints(accounting, queuedEvent)

const transferPublicKeys = (
  accounting: TransactionEventQueueAccounting,
  publicKeys: ReadonlyMap<string, string>,
  inFlightEvent?: QueuedTransactionEvent,
  protectedEvent?: QueuedTransactionEvent
): void => {
  const transactionsWithPublicKeys = new Set<string>()
  const replacements = new Map<string, OCPP20SignedMeterValue>()
  const replacementEvents = new Map<string, QueuedTransactionEvent>()
  for (const queuedEvent of accounting.queue) {
    const transactionId = queuedEvent.request.transactionInfo.transactionId
    for (const meterValue of queuedEvent.request.meterValue ?? []) {
      for (const sampledValue of meterValue.sampledValue) {
        const signedMeterValue = getMutableSignedMeterValue(sampledValue)
        if (signedMeterValue == null) continue
        if (isNotEmptyString(signedMeterValue.publicKey)) {
          transactionsWithPublicKeys.add(transactionId)
        } else if (
          !isImmutableTransactionEvent(queuedEvent, inFlightEvent) &&
          !replacements.has(transactionId)
        ) {
          replacements.set(transactionId, signedMeterValue)
          replacementEvents.set(transactionId, queuedEvent)
        }
      }
    }
  }
  for (const [transactionId, publicKey] of publicKeys) {
    if (transactionsWithPublicKeys.has(transactionId)) continue
    const replacement = replacements.get(transactionId)
    if (replacement == null) continue
    replacement.publicKey = publicKey
    const replacementEvent = replacementEvents.get(transactionId)
    if (replacementEvent != null) refreshQueuedEventBytes(accounting, replacementEvent)
  }
}

const getOrCreateMeterValueAtTimestamp = (
  queuedEvent: QueuedTransactionEvent,
  timestamp: Date
): OCPP20MeterValue => {
  queuedEvent.request.meterValue ??= []
  const existing = queuedEvent.request.meterValue.find(
    meterValue => meterValue.timestamp.getTime() === timestamp.getTime()
  )
  if (existing != null) return existing
  const meterValue: OCPP20MeterValue = { sampledValue: [], timestamp }
  const insertionIndex = queuedEvent.request.meterValue.findIndex(
    existingMeterValue => existingMeterValue.timestamp > timestamp
  )
  if (insertionIndex === -1) queuedEvent.request.meterValue.push(meterValue)
  else queuedEvent.request.meterValue.splice(insertionIndex, 0, meterValue)
  return meterValue
}

const transferRemovedIntervalEnergy = (
  accounting: TransactionEventQueueAccounting,
  connectorStatus: ConnectorStatus,
  removedEvents: readonly QueuedTransactionEvent[],
  inFlightEvent?: QueuedTransactionEvent,
  protectedEvent?: QueuedTransactionEvent
): void => {
  const retainedEventsByTransaction = new Map<string, QueuedTransactionEvent[]>()
  for (const queuedEvent of accounting.queue) {
    if (isImmutableTransactionEvent(queuedEvent, inFlightEvent)) continue
    const transactionId = queuedEvent.request.transactionInfo.transactionId
    const retainedEvents = retainedEventsByTransaction.get(transactionId) ?? []
    retainedEvents.push(queuedEvent)
    retainedEventsByTransaction.set(transactionId, retainedEvents)
  }
  for (const retainedEvents of retainedEventsByTransaction.values()) {
    retainedEvents.sort((left, right) => left.seqNo - right.seqNo)
  }

  const carryIntervalConsumption = (removedEvent: QueuedTransactionEvent): void => {
    const transactionId = removedEvent.request.transactionInfo.transactionId
    if (connectorStatus.transactionId?.toString() !== transactionId) return
    const consumption = removedEvent.transactionEnergyActiveImportIntervalConsumption
    if (consumption == null) return
    connectorStatus.transactionEnergyActiveImportIntervalCarry ??= {}
    for (const [key, value] of Object.entries(consumption)) {
      connectorStatus.transactionEnergyActiveImportIntervalCarry[key] =
        (connectorStatus.transactionEnergyActiveImportIntervalCarry[key] ?? 0) + value
    }
  }

  for (const removedEvent of removedEvents) {
    if (removedEvent.request.eventType !== OCPP20TransactionEventEnumType.Updated) continue
    const transactionId = removedEvent.request.transactionInfo.transactionId
    const retainedEvents = retainedEventsByTransaction.get(transactionId)
    if (retainedEvents == null) {
      carryIntervalConsumption(removedEvent)
      continue
    }
    let left = 0
    let right = retainedEvents.length
    while (left < right) {
      const middle = left + Math.floor((right - left) / 2)
      if (retainedEvents[middle].seqNo <= removedEvent.seqNo) left = middle + 1
      else right = middle
    }
    if (left >= retainedEvents.length) {
      carryIntervalConsumption(removedEvent)
      continue
    }
    const replacementEvent = retainedEvents[left]

    let changed = false
    for (const meterValue of removedEvent.request.meterValue ?? []) {
      for (const sampledValue of meterValue.sampledValue) {
        if (
          sampledValue.measurand !== OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL ||
          typeof sampledValue.value !== 'number' ||
          !Number.isFinite(sampledValue.value)
        ) {
          continue
        }
        const targetTimestamp =
          sampledValue.signedMeterValue == null
            ? replacementEvent.request.timestamp
            : meterValue.timestamp
        const replacementMeterValue = getOrCreateMeterValueAtTimestamp(
          replacementEvent,
          targetTimestamp
        )
        const identity = getSampledValueIdentity(sampledValue)
        const replacementSample = replacementMeterValue.sampledValue.find(
          value => getSampledValueIdentity(value) === identity
        )
        if (replacementSample != null && sampledValue.signedMeterValue == null) {
          replacementSample.value += sampledValue.value
        } else {
          replacementMeterValue.sampledValue.push(structuredClone(sampledValue))
        }
        changed = true
      }
    }
    const removedConsumption = removedEvent.transactionEnergyActiveImportIntervalConsumption
    if (removedConsumption != null) {
      replacementEvent.transactionEnergyActiveImportIntervalConsumption ??= {}
      for (const [key, value] of Object.entries(removedConsumption)) {
        replacementEvent.transactionEnergyActiveImportIntervalConsumption[key] =
          (replacementEvent.transactionEnergyActiveImportIntervalConsumption[key] ?? 0) + value
      }
      changed = true
    }
    if (changed) refreshQueuedEventBytes(accounting, replacementEvent)
  }
}

const rebuildAccountingAfterRemoval = (accounting: TransactionEventQueueAccounting): void => {
  accounting.bytes = accounting.queue.reduce(
    (bytes, queuedEvent, index) =>
      bytes + (accounting.eventBytes.get(queuedEvent) ?? 0) + (index === 0 ? 0 : 1),
    2
  )
  refreshAccountingEdges(accounting)
}

const decrementEndedEventCounts = (
  accounting: TransactionEventQueueAccounting,
  queuedEvent: QueuedTransactionEvent
): void => {
  if (queuedEvent.request.eventType !== OCPP20TransactionEventEnumType.Ended) return
  const transactionId = queuedEvent.request.transactionInfo.transactionId
  const remainingEndedEvents = (accounting.endedEventCounts.get(transactionId) ?? 1) - 1
  if (remainingEndedEvents === 0) {
    accounting.endedEventCounts.delete(transactionId)
  } else {
    accounting.endedEventCounts.set(transactionId, remainingEndedEvents)
  }
  if (!stagedTransactionEventQueueEntries.has(queuedEvent)) return
  const remainingStagedEndedEvents = (accounting.stagedEndedEventCounts.get(transactionId) ?? 1) - 1
  if (remainingStagedEndedEvents === 0) {
    accounting.stagedEndedEventCounts.delete(transactionId)
  } else {
    accounting.stagedEndedEventCounts.set(transactionId, remainingStagedEndedEvents)
  }
}

/**
 * Orders candidates breadth-first by interval midpoint so every selected prefix spans history.
 * @param candidates - Chronologically ordered removal candidates.
 * @returns Candidates in deterministic distributed-removal order.
 */
const distributeRemovalCandidates = <T>(candidates: readonly T[]): T[] => {
  if (candidates.length === 0) return []
  const orderedCandidates: T[] = []
  const ranges: { end: number; start: number }[] = [{ end: candidates.length - 1, start: 0 }]
  for (const { end, start } of ranges) {
    const midpoint = Math.floor((start + end + 1) / 2)
    orderedCandidates.push(candidates[midpoint])
    if (start < midpoint) ranges.push({ end: midpoint - 1, start })
    if (midpoint < end) ranges.push({ end, start: midpoint + 1 })
  }
  return orderedCandidates
}

const hasIntervalEnergyToTransfer = (queuedEvent: QueuedTransactionEvent): boolean =>
  (queuedEvent.transactionEnergyActiveImportIntervalConsumption != null &&
    !isEmpty(queuedEvent.transactionEnergyActiveImportIntervalConsumption)) ||
  queuedEvent.request.meterValue?.some(meterValue =>
    meterValue.sampledValue.some(
      sampledValue =>
        sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL &&
        typeof sampledValue.value === 'number' &&
        Number.isFinite(sampledValue.value)
    )
  ) === true

const retainUntransferableIntervalSources = (
  queue: readonly QueuedTransactionEvent[],
  candidates: readonly QueuedTransactionEvent[],
  activeTransactionId: string | undefined,
  inFlightEvent?: QueuedTransactionEvent
): QueuedTransactionEvent[] => {
  const removableCandidates = new Set(candidates)
  const transactionsWithMutableSuccessor = new Set<string>()
  for (let index = queue.length - 1; index >= 0; index--) {
    const queuedEvent = queue[index]
    const transactionId = queuedEvent.request.transactionInfo.transactionId
    if (!removableCandidates.has(queuedEvent)) {
      if (!isImmutableTransactionEvent(queuedEvent, inFlightEvent)) {
        transactionsWithMutableSuccessor.add(transactionId)
      }
      continue
    }
    if (
      queuedEvent.request.eventType !== OCPP20TransactionEventEnumType.Updated ||
      !hasIntervalEnergyToTransfer(queuedEvent)
    ) {
      continue
    }
    const canCarry =
      transactionId === activeTransactionId &&
      queuedEvent.transactionEnergyActiveImportIntervalConsumption != null
    if (canCarry || transactionsWithMutableSuccessor.has(transactionId)) continue
    removableCandidates.delete(queuedEvent)
    transactionsWithMutableSuccessor.add(transactionId)
  }
  return candidates.filter(candidate => removableCandidates.has(candidate))
}

const getUpdatedRemovalCandidates = (
  queue: readonly QueuedTransactionEvent[],
  activeTransactionId: string | undefined,
  inFlightEvent: QueuedTransactionEvent | undefined,
  isProtected: (queuedEvent: QueuedTransactionEvent) => boolean
): QueuedTransactionEvent[] => {
  const updatesByTransaction = new Map<string, QueuedTransactionEvent[]>()
  for (const queuedEvent of queue) {
    if (queuedEvent.request.eventType !== OCPP20TransactionEventEnumType.Updated) continue
    const transactionId = queuedEvent.request.transactionInfo.transactionId
    const updates = updatesByTransaction.get(transactionId) ?? []
    updates.push(queuedEvent)
    updatesByTransaction.set(transactionId, updates)
  }

  const retainedEvents = new Set<QueuedTransactionEvent>()
  for (const updates of updatesByTransaction.values()) {
    if (updates.length <= 5) {
      for (const queuedEvent of updates) retainedEvents.add(queuedEvent)
      continue
    }
    const first = updates[0]
    const last = updates.at(-1)
    if (last == null) continue
    retainedEvents.add(first)
    retainedEvents.add(last)
    const sequenceRange = last.seqNo - first.seqNo
    for (const fraction of [0.25, 0.5, 0.75]) {
      const targetSequence = first.seqNo + sequenceRange * fraction
      let closest = first
      for (const candidate of updates) {
        if (Math.abs(candidate.seqNo - targetSequence) < Math.abs(closest.seqNo - targetSequence)) {
          closest = candidate
        }
      }
      retainedEvents.add(closest)
    }
  }
  const candidates = queue.filter(
    queuedEvent =>
      queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated &&
      !retainedEvents.has(queuedEvent) &&
      !isProtected(queuedEvent)
  )
  const transferableCandidates = retainUntransferableIntervalSources(
    queue,
    distributeRemovalCandidates(candidates),
    activeTransactionId,
    inFlightEvent
  )
  return transferableCandidates
}

const getDistributedUpdatedRemovalCandidates = (
  queue: readonly QueuedTransactionEvent[],
  activeTransactionId: string | undefined,
  inFlightEvent: QueuedTransactionEvent | undefined,
  isProtected: (queuedEvent: QueuedTransactionEvent) => boolean
): QueuedTransactionEvent[] => {
  const updatesByTransaction = new Map<string, QueuedTransactionEvent[]>()
  let latestActiveUpdate: QueuedTransactionEvent | undefined
  for (const queuedEvent of queue) {
    if (queuedEvent.request.eventType !== OCPP20TransactionEventEnumType.Updated) continue
    const transactionId = queuedEvent.request.transactionInfo.transactionId
    const updates = updatesByTransaction.get(transactionId) ?? []
    updates.push(queuedEvent)
    updatesByTransaction.set(transactionId, updates)
    if (transactionId === activeTransactionId) latestActiveUpdate = queuedEvent
  }

  const endpointEvents = new Set<QueuedTransactionEvent>()
  for (const updates of updatesByTransaction.values()) {
    endpointEvents.add(updates[0])
    endpointEvents.add(updates.at(-1) ?? updates[0])
  }
  const interiorCandidates: QueuedTransactionEvent[] = []
  const endpointCandidates: QueuedTransactionEvent[] = []
  for (const queuedEvent of queue) {
    if (
      queuedEvent.request.eventType !== OCPP20TransactionEventEnumType.Updated ||
      queuedEvent === latestActiveUpdate ||
      isProtected(queuedEvent)
    ) {
      continue
    }
    if (endpointEvents.has(queuedEvent)) endpointCandidates.push(queuedEvent)
    else interiorCandidates.push(queuedEvent)
  }
  const transferableCandidates = retainUntransferableIntervalSources(
    queue,
    [
      ...distributeRemovalCandidates(interiorCandidates),
      ...distributeRemovalCandidates(endpointCandidates),
    ],
    activeTransactionId,
    inFlightEvent
  )
  return transferableCandidates
}

/**
 * Compacts a durable TransactionEvent queue toward its configured targets.
 * Only Updated events and intermediate meter data from Ended events are removed.
 * Started/Ended cores and all other records remain queued even when
 * those mandatory records alone exceed a target.
 * @param connectorStatus - Connector whose durable queue is compacted in place.
 * @param protectedEvent - Newly queued event, retained while older candidates exist.
 * @param maxLength - Absolute queue event-count limit
 * @param maxBytes - Absolute serialized queue byte limit
 * @param targetLength - Preferred event count after compaction
 * @param targetBytes - Preferred serialized byte count after compaction
 * @returns Exact cached serialized bytes, over-limit state, and queue mutations.
 */
const boundTransactionEventQueueToLimits = (
  connectorStatus: ConnectorStatus,
  protectedEvent: QueuedTransactionEvent | undefined,
  maxLength: number,
  maxBytes: number,
  targetLength: number,
  targetBytes: number
): BoundedTransactionEventQueue => {
  const accounting = getTransactionEventQueueAccounting(connectorStatus)
  const { queue } = accounting
  const inFlightEvent = inFlightTransactionEvents.get(connectorStatus)
  const isProtected = (candidate: QueuedTransactionEvent): boolean =>
    candidate === protectedEvent ||
    isImmutableTransactionEvent(candidate, inFlightEvent) ||
    hasSignedMeterValuePayload(candidate)
  const removedEvents: QueuedTransactionEvent[] = []
  const removedPublicKeyTransactionIds = new Set<string>()
  let changed = false

  const isOverLimit = (): boolean => queue.length > maxLength || accounting.bytes > maxBytes
  const compactLifecycleEvent = (queuedEvent: QueuedTransactionEvent): boolean => {
    const transactionId = queuedEvent.request.transactionInfo.transactionId
    const hadPublicKey = findRawPublicKey(queuedEvent) != null
    const eventChanged = compactOversizedLifecycleEvent(accounting, queuedEvent)
    if (hadPublicKey && !queuedTransactionEventHasPublicKey(queuedEvent, transactionId)) {
      removedPublicKeyTransactionIds.add(transactionId)
    }
    return eventChanged
  }
  if (!isOverLimit()) {
    return { bytes: accounting.bytes, changed, overLimit: false, removedEvents }
  }

  for (const queuedEvent of queue) {
    if (!isOverLimit()) break
    if (
      isImmutableTransactionEvent(queuedEvent, inFlightEvent) ||
      !compactLifecycleEvent(queuedEvent)
    ) {
      continue
    }
    changed = true
  }

  const remove = (
    candidates: readonly QueuedTransactionEvent[],
    transferWithinTransactions = true
  ): void => {
    if (!isNotEmptyArray(candidates)) return
    const candidateSet = new Set(candidates)
    const publicKeys = new Map<string, string>()
    for (const candidate of candidates) {
      const transactionId = candidate.request.transactionInfo.transactionId
      const publicKey = findPublicKey(candidate)
      if (publicKey != null) {
        publicKeys.set(transactionId, publicKeys.get(transactionId) ?? publicKey)
      }
      if (findRawPublicKey(candidate) != null) {
        removedPublicKeyTransactionIds.add(transactionId)
      }
      removedEvents.push(candidate)
      accounting.eventBytes.delete(candidate)
      accounting.eventKeys.delete(getQueuedTransactionEventKey(transactionId, candidate.seqNo))
      if (candidate.request.eventType === OCPP20TransactionEventEnumType.Ended) {
        const remainingEndedEvents = (accounting.endedEventCounts.get(transactionId) ?? 1) - 1
        if (remainingEndedEvents === 0) {
          accounting.endedEventCounts.delete(transactionId)
        } else {
          accounting.endedEventCounts.set(transactionId, remainingEndedEvents)
        }
        if (stagedTransactionEventQueueEntries.has(candidate)) {
          const remainingStagedEndedEvents =
            (accounting.stagedEndedEventCounts.get(transactionId) ?? 1) - 1
          if (remainingStagedEndedEvents === 0) {
            accounting.stagedEndedEventCounts.delete(transactionId)
          } else {
            accounting.stagedEndedEventCounts.set(transactionId, remainingStagedEndedEvents)
          }
        }
      }
    }
    queue.splice(0, queue.length, ...queue.filter(candidate => !candidateSet.has(candidate)))
    if (transferWithinTransactions) {
      transferRemovedIntervalEnergy(
        accounting,
        connectorStatus,
        candidates,
        inFlightEvent,
        protectedEvent
      )
    }
    rebuildAccountingAfterRemoval(accounting)
    if (transferWithinTransactions) {
      transferPublicKeys(accounting, publicKeys, inFlightEvent, protectedEvent)
    }
    changed = true
  }

  const selectUntilTarget = (
    candidates: readonly QueuedTransactionEvent[],
    targetLength: number,
    targetBytes: number
  ): QueuedTransactionEvent[] => {
    const selected: QueuedTransactionEvent[] = []
    let projectedLength = queue.length
    let projectedBytes = accounting.bytes
    for (const candidate of candidates) {
      if (projectedLength <= targetLength && projectedBytes <= targetBytes) break
      selected.push(candidate)
      projectedBytes -= (accounting.eventBytes.get(candidate) ?? 0) + (projectedLength > 1 ? 1 : 0)
      projectedLength--
    }
    return selected
  }

  const activeTransactionId = connectorStatus.transactionId?.toString()
  if (isOverLimit()) {
    remove(
      selectUntilTarget(
        getUpdatedRemovalCandidates(queue, activeTransactionId, inFlightEvent, isProtected),
        targetLength,
        targetBytes
      )
    )
  }

  if (isOverLimit()) {
    remove(
      selectUntilTarget(
        getDistributedUpdatedRemovalCandidates(
          queue,
          activeTransactionId,
          inFlightEvent,
          isProtected
        ),
        targetLength,
        targetBytes
      )
    )
  }

  if (accounting.bytes > maxBytes) {
    for (const queuedEvent of queue) {
      if (accounting.bytes <= maxBytes) break
      if (
        isImmutableTransactionEvent(queuedEvent, inFlightEvent) ||
        !compactLifecycleEvent(queuedEvent)
      ) {
        continue
      }
      changed = true
    }
  }

  if (isOverLimit()) {
    const cohorts = new Map<string, { events: QueuedTransactionEvent[]; firstIndex: number }>()
    for (const [index, queuedEvent] of queue.entries()) {
      const transactionId = queuedEvent.request.transactionInfo.transactionId
      const cohort = cohorts.get(transactionId) ?? {
        events: [],
        firstIndex: index,
      }
      cohort.events.push(queuedEvent)
      cohorts.set(transactionId, cohort)
    }
    const removableCohorts = distributeRemovalCandidates(
      [...cohorts.entries()]
        .filter(
          ([transactionId, cohort]) =>
            transactionId !== activeTransactionId && !cohort.events.some(isProtected)
        )
        .sort((left, right) => left[1].firstIndex - right[1].firstIndex)
    )
    for (const [, cohort] of removableCohorts) {
      if (!isOverLimit()) break
      remove(cohort.events, false)
    }
  }

  if (
    activeTransactionId != null &&
    removedPublicKeyTransactionIds.has(activeTransactionId) &&
    !queue.some(
      queuedEvent =>
        queuedEvent.request.transactionInfo.transactionId === activeTransactionId &&
        findRawPublicKey(queuedEvent) != null
    )
  ) {
    connectorStatus.publicKeySentInTransaction = false
  }

  return {
    bytes: accounting.bytes,
    changed,
    overLimit: isOverLimit(),
    removedEvents,
  }
}

export const boundTransactionEventQueue = (
  connectorStatus: ConnectorStatus,
  protectedEvent?: QueuedTransactionEvent
): BoundedTransactionEventQueue =>
  boundTransactionEventQueueToLimits(
    connectorStatus,
    protectedEvent,
    Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH,
    Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES,
    MAX_UPDATED_TRANSACTION_EVENT_QUEUE_LENGTH,
    MAX_UPDATED_TRANSACTION_EVENT_QUEUE_BYTES
  )

/**
 * Inserts one event in transaction sequence order and applies permitted queue compaction.
 * Cached byte and identity accounting makes the common append path O(1).
 * @param connectorStatus - Queue owner.
 * @param queuedEvent - Event to insert.
 * @returns Insertion and bounding result.
 */
export const enqueueBoundedTransactionEvent = (
  connectorStatus: ConnectorStatus,
  queuedEvent: QueuedTransactionEvent
): EnqueuedTransactionEventQueue => {
  const hadQueue = connectorStatus.transactionEventQueue != null
  connectorStatus.transactionEventQueue ??= []
  const accounting = getTransactionEventQueueAccounting(connectorStatus)
  const { queue } = accounting
  const transactionId = queuedEvent.request.transactionInfo.transactionId
  const isUpdatedEvent = queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated
  const maxLength = isUpdatedEvent
    ? MAX_UPDATED_TRANSACTION_EVENT_QUEUE_LENGTH
    : Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH
  const maxBytes = isUpdatedEvent
    ? MAX_UPDATED_TRANSACTION_EVENT_QUEUE_BYTES
    : Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
  const targetLength = isUpdatedEvent ? maxLength : MAX_UPDATED_TRANSACTION_EVENT_QUEUE_LENGTH
  const targetBytes = isUpdatedEvent ? maxBytes : MAX_UPDATED_TRANSACTION_EVENT_QUEUE_BYTES
  const eventKey = getQueuedTransactionEventKey(transactionId, queuedEvent.seqNo)
  if (accounting.eventKeys.has(eventKey)) {
    const bounded = boundTransactionEventQueue(connectorStatus)
    return { ...bounded, inserted: false }
  }

  let insertionIndex = queue.length
  const lastEvent = queue.at(-1)
  if (
    lastEvent != null &&
    (lastEvent.request.transactionInfo.transactionId !== transactionId ||
      lastEvent.seqNo >= queuedEvent.seqNo)
  ) {
    for (let index = queue.length - 1; index >= 0; index--) {
      const existingEvent = queue[index]
      if (existingEvent.request.transactionInfo.transactionId !== transactionId) continue
      insertionIndex = existingEvent.seqNo < queuedEvent.seqNo ? index + 1 : index
      if (existingEvent.seqNo < queuedEvent.seqNo) break
    }
  }

  const queuedEventWithMetadata =
    queuedEvent.deliveryAttempted == null
      ? { ...queuedEvent, deliveryAttempted: false }
      : queuedEvent
  const queuedEventBytes = getQueuedTransactionEventBytes(queuedEventWithMetadata)
  const projectedBytes = accounting.bytes + queuedEventBytes + (queue.length === 0 ? 0 : 1)
  if (queue.length + 1 > maxLength || projectedBytes > maxBytes) {
    const simulatedQueue = queue.map(event => structuredClone(event))
    const simulatedQueuedEvent = structuredClone(queuedEventWithMetadata)
    simulatedQueue.splice(insertionIndex, 0, simulatedQueuedEvent)
    const simulatedConnectorStatus = {
      ...connectorStatus,
      ...(connectorStatus.transactionEnergyActiveImportIntervalCarry != null && {
        transactionEnergyActiveImportIntervalCarry: {
          ...connectorStatus.transactionEnergyActiveImportIntervalCarry,
        },
      }),
      transactionEventQueue: simulatedQueue,
    }
    const simulatedEventBytes = new Map<QueuedTransactionEvent, number>()
    for (const [index, simulatedEvent] of simulatedQueue.entries()) {
      if (index === insertionIndex) {
        simulatedEventBytes.set(simulatedEvent, queuedEventBytes)
      } else {
        const sourceIndex = index < insertionIndex ? index : index - 1
        simulatedEventBytes.set(simulatedEvent, accounting.eventBytes.get(queue[sourceIndex]) ?? 0)
      }
    }
    const simulatedEndedEventCounts = new Map(accounting.endedEventCounts)
    if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended) {
      simulatedEndedEventCounts.set(
        transactionId,
        (simulatedEndedEventCounts.get(transactionId) ?? 0) + 1
      )
    }
    transactionEventQueueAccounting.set(simulatedConnectorStatus, {
      bytes: projectedBytes,
      endedEventCounts: simulatedEndedEventCounts,
      eventBytes: simulatedEventBytes,
      eventKeys: new Set([...accounting.eventKeys, eventKey]),
      first: simulatedQueue[0],
      last: simulatedQueue.at(-1),
      queue: simulatedQueue,
      stagedEndedEventCounts: new Map(accounting.stagedEndedEventCounts),
    })
    const inFlightEvent = inFlightTransactionEvents.get(connectorStatus)
    if (inFlightEvent != null) {
      const inFlightIndex = queue.indexOf(inFlightEvent)
      if (inFlightIndex >= 0) {
        const simulatedIndex = inFlightIndex < insertionIndex ? inFlightIndex : inFlightIndex + 1
        inFlightTransactionEvents.set(simulatedConnectorStatus, simulatedQueue[simulatedIndex])
      }
    }
    for (const [index, event] of queue.entries()) {
      if (!stagedTransactionEventQueueEntries.has(event)) continue
      const simulatedIndex = index < insertionIndex ? index : index + 1
      stagedTransactionEventQueueEntries.add(simulatedQueue[simulatedIndex])
    }
    const simulatedBound = boundTransactionEventQueueToLimits(
      simulatedConnectorStatus,
      simulatedQueuedEvent,
      maxLength,
      maxBytes,
      targetLength,
      targetBytes
    )
    if (simulatedBound.overLimit) {
      if (!hadQueue) {
        delete connectorStatus.transactionEventQueue
        transactionEventQueueAccounting.delete(connectorStatus)
      }
      return {
        bytes: accounting.bytes,
        capacityRejected: true,
        changed: false,
        inserted: false,
        overLimit:
          queue.length > Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH ||
          accounting.bytes > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES,
        removedEvents: [],
      }
    }
  }
  queuedEvent.deliveryAttempted ??= false
  queue.splice(insertionIndex, 0, queuedEvent)
  accounting.eventBytes.set(queuedEvent, queuedEventBytes)
  accounting.eventKeys.add(eventKey)
  if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended) {
    accounting.endedEventCounts.set(
      transactionId,
      (accounting.endedEventCounts.get(transactionId) ?? 0) + 1
    )
  }
  accounting.bytes += queuedEventBytes + (queue.length === 1 ? 0 : 1)
  refreshAccountingEdges(accounting)
  const bounded = boundTransactionEventQueueToLimits(
    connectorStatus,
    queuedEvent,
    maxLength,
    maxBytes,
    targetLength,
    targetBytes
  )
  if (bounded.overLimit) {
    const candidateIndex = queue.indexOf(queuedEvent)
    if (candidateIndex >= 0) queue.splice(candidateIndex, 1)
    const restoredAccounting = buildTransactionEventQueueAccounting(connectorStatus, queue)
    if (!hadQueue && queue.length === 0) {
      delete connectorStatus.transactionEventQueue
      transactionEventQueueAccounting.delete(connectorStatus)
    }
    return {
      bytes: restoredAccounting.bytes,
      capacityRejected: true,
      changed: bounded.changed,
      inserted: false,
      overLimit:
        queue.length > Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH ||
        restoredAccounting.bytes > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES,
      removedEvents: bounded.removedEvents,
    }
  }
  return { ...bounded, changed: true, inserted: true }
}

/**
 * Returns whether a transaction has a queued Ended lifecycle event not staged for direct delivery.
 * @param connectorStatus - Queue owner.
 * @param transactionId - Transaction whose lifecycle state is queried.
 * @returns Whether the transaction has an Ended event in the queue.
 */
export const hasQueuedEndedTransactionEvent = (
  connectorStatus: ConnectorStatus,
  transactionId: string
): boolean => {
  const accounting = getTransactionEventQueueAccounting(connectorStatus)
  return (
    (accounting.endedEventCounts.get(transactionId) ?? 0) >
    (accounting.stagedEndedEventCounts.get(transactionId) ?? 0)
  )
}

/**
 * Marks or clears a durable queue entry that is owned by a pending direct delivery.
 * Staged entries remain persisted but are excluded from queued lifecycle and replay decisions.
 * @param connectorStatus - Queue owner
 * @param queuedEvent - Durable queue entry owned by the direct delivery
 * @param staged - Whether the entry is currently staged
 */
export const setTransactionEventQueueStaged = (
  connectorStatus: ConnectorStatus,
  queuedEvent: QueuedTransactionEvent,
  staged: boolean
): void => {
  const wasStaged = stagedTransactionEventQueueEntries.has(queuedEvent)
  if (wasStaged === staged) return
  const accounting = getTransactionEventQueueAccounting(connectorStatus)
  const isQueuedEnded =
    accounting.eventBytes.has(queuedEvent) &&
    queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended
  if (staged) {
    stagedTransactionEventQueueEntries.add(queuedEvent)
  } else {
    stagedTransactionEventQueueEntries.delete(queuedEvent)
  }
  if (!isQueuedEnded) return
  const transactionId = queuedEvent.request.transactionInfo.transactionId
  const stagedCount =
    (accounting.stagedEndedEventCounts.get(transactionId) ?? 0) + (staged ? 1 : -1)
  if (stagedCount > 0) {
    accounting.stagedEndedEventCounts.set(transactionId, stagedCount)
  } else {
    accounting.stagedEndedEventCounts.delete(transactionId)
  }
}

/**
 * Marks whether an unattempted event is waiting for a predecessor delivery outcome.
 * @param queuedEvent - Queue entry whose runtime gate changes.
 * @param blocked - Whether replay must wait.
 */
export const setTransactionEventQueueBlocked = (
  queuedEvent: QueuedTransactionEvent,
  blocked: boolean
): void => {
  if (blocked) {
    blockedTransactionEventQueueEntries.add(queuedEvent)
  } else {
    blockedTransactionEventQueueEntries.delete(queuedEvent)
  }
}

/**
 * Returns whether an event must wait for a predecessor delivery outcome.
 * @param queuedEvent - Queue entry to inspect.
 * @returns Whether replay must wait.
 */
export const isTransactionEventQueueBlocked = (queuedEvent: QueuedTransactionEvent): boolean =>
  blockedTransactionEventQueueEntries.has(queuedEvent)

/**
 * Returns whether a durable queue entry is temporarily owned by a direct delivery.
 * @param queuedEvent - Queue entry to inspect
 * @returns Whether the direct delivery owns the entry
 */
export const isTransactionEventQueueStaged = (queuedEvent: QueuedTransactionEvent): boolean =>
  stagedTransactionEventQueueEntries.has(queuedEvent)

/**
 * Invalidates cached accounting after an externally mutated queued event payload.
 * @param connectorStatus - Queue owner whose payload was mutated externally.
 */
export const invalidateTransactionEventQueueAccounting = (
  connectorStatus: ConnectorStatus
): void => {
  transactionEventQueueAccounting.delete(connectorStatus)
}

/**
 * Marks an exact queued request for durable write-ahead before a transport attempt.
 * @param connectorStatus - Queue owner
 * @param queuedEvent - Exact event whose request is about to be sent
 * @returns Whether the marker changed and therefore requires persistence
 */
export const markTransactionEventQueueDeliveryAttempted = (
  connectorStatus: ConnectorStatus,
  queuedEvent: QueuedTransactionEvent
): boolean => {
  if (queuedEvent.deliveryAttempted === true) return false
  queuedEvent.deliveryAttempted = true
  const accounting = getTransactionEventQueueAccounting(connectorStatus)
  if (accounting.eventBytes.has(queuedEvent)) refreshQueuedEventBytes(accounting, queuedEvent)
  return true
}

/**
 * Restores rejected interval consumption directly to the active transaction carry.
 * This path deliberately does not mutate any queued successor after capacity validation.
 * @param connectorStatus - Queue owner and active transaction state.
 * @param discardedEvent - Updated event rejected before durable admission.
 */
export const restoreRejectedTransactionEventIntervalCarry = (
  connectorStatus: ConnectorStatus,
  discardedEvent: QueuedTransactionEvent
): void => {
  if (
    connectorStatus.transactionId?.toString() !==
    discardedEvent.request.transactionInfo.transactionId
  ) {
    return
  }
  const consumption = discardedEvent.transactionEnergyActiveImportIntervalConsumption
  if (consumption == null) return
  connectorStatus.transactionEnergyActiveImportIntervalCarry ??= {}
  for (const [baselineKey, energyWh] of Object.entries(consumption)) {
    if (typeof energyWh !== 'number' || !Number.isFinite(energyWh) || energyWh <= 0) continue
    connectorStatus.transactionEnergyActiveImportIntervalCarry[baselineKey] =
      (connectorStatus.transactionEnergyActiveImportIntervalCarry[baselineKey] ?? 0) + energyWh
  }
}

/**
 * Preserves interval energy from a discarded TransactionEvent by transferring it
 * to the next event of the same transaction or to the active transaction carry.
 * @param connectorStatus - Queue owner and active transaction state
 * @param discardedEvent - Event being discarded outside the bounded queue
 */
export const transferDiscardedTransactionEventIntervalEnergy = (
  connectorStatus: ConnectorStatus,
  discardedEvent: QueuedTransactionEvent
): void => {
  transferRemovedIntervalEnergy(
    getTransactionEventQueueAccounting(connectorStatus),
    connectorStatus,
    [discardedEvent],
    inFlightTransactionEvents.get(connectorStatus)
  )
}

/**
 * Removes one exact queued event while keeping queue accounting exact.
 * @param connectorStatus - Queue owner.
 * @param queuedEvent - Exact event to remove.
 * @returns Whether the event was present and removed.
 */
export const removeBoundedTransactionEvent = (
  connectorStatus: ConnectorStatus,
  queuedEvent: QueuedTransactionEvent
): boolean => {
  const accounting = getTransactionEventQueueAccounting(connectorStatus)
  const eventIndex = accounting.queue.indexOf(queuedEvent)
  if (eventIndex < 0) return false
  const transactionId = queuedEvent.request.transactionInfo.transactionId
  accounting.queue.splice(eventIndex, 1)
  accounting.eventBytes.delete(queuedEvent)
  accounting.eventKeys.delete(getQueuedTransactionEventKey(transactionId, queuedEvent.seqNo))
  decrementEndedEventCounts(accounting, queuedEvent)
  rebuildAccountingAfterRemoval(accounting)
  return true
}

/**
 * Removes and returns the oldest queued event while keeping byte accounting exact.
 * @param connectorStatus - Queue owner.
 * @param preserveIntervalEnergy - Whether unsigned interval energy is carried into the next event.
 * @returns The removed oldest event, or undefined when the queue is empty.
 */
export const shiftBoundedTransactionEvent = (
  connectorStatus: ConnectorStatus,
  preserveIntervalEnergy = false
): QueuedTransactionEvent | undefined => {
  const accounting = getTransactionEventQueueAccounting(connectorStatus)
  const queuedEvent = accounting.queue.at(0)
  if (queuedEvent == null) return
  if (preserveIntervalEnergy) {
    transferRemovedIntervalEnergy(
      accounting,
      connectorStatus,
      [queuedEvent],
      inFlightTransactionEvents.get(connectorStatus)
    )
  }
  accounting.queue.shift()
  accounting.bytes -= accounting.eventBytes.get(queuedEvent) ?? 0
  if (isNotEmptyArray(accounting.queue)) accounting.bytes--
  accounting.eventBytes.delete(queuedEvent)
  const transactionId = queuedEvent.request.transactionInfo.transactionId
  accounting.eventKeys.delete(getQueuedTransactionEventKey(transactionId, queuedEvent.seqNo))
  decrementEndedEventCounts(accounting, queuedEvent)
  refreshAccountingEdges(accounting)
  return queuedEvent
}
