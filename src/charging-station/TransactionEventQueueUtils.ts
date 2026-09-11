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
import { Constants, isJsonObject } from '../utils/index.js'
import { canonicalizeCustomData } from './meter-values/MeterValueUtils.js'

export interface BoundedTransactionEventQueue {
  bytes: number
  changed: boolean
  overLimit: boolean
  removedEvents: QueuedTransactionEvent[]
}

export interface EnqueuedTransactionEventQueue extends BoundedTransactionEventQueue {
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
const inFlightTransactionIds = new WeakMap<ConnectorStatus, string>()

export const setTransactionEventQueueInFlight = (
  connectorStatus: ConnectorStatus,
  queuedEvent?: QueuedTransactionEvent
): void => {
  if (queuedEvent == null) {
    inFlightTransactionIds.delete(connectorStatus)
  } else {
    inFlightTransactionIds.set(connectorStatus, queuedEvent.request.transactionInfo.transactionId)
  }
}
const stagedTransactionEventQueueEntries = new WeakSet<QueuedTransactionEvent>()
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

export const queuedTransactionEventHasPublicKey = (
  queuedEvent: QueuedTransactionEvent,
  transactionId: string
): boolean =>
  queuedEvent.request.transactionInfo.transactionId === transactionId &&
  queuedEvent.request.meterValue?.some(meterValue =>
    meterValue.sampledValue.some(sampledValue => {
      const publicKey = getMutableSignedMeterValue(sampledValue)?.publicKey
      return typeof publicKey === 'string' && publicKey.length > 0
    })
  ) === true

const findPublicKey = (queuedEvent: QueuedTransactionEvent): string | undefined =>
  queuedEvent.request.meterValue
    ?.flatMap(meterValue => meterValue.sampledValue)
    .map(sampledValue => getMutableSignedMeterValue(sampledValue)?.publicKey)
    .find(publicKey => typeof publicKey === 'string' && publicKey.length > 0)

const findRawPublicKey = (queuedEvent: QueuedTransactionEvent): string | undefined =>
  queuedEvent.request.meterValue
    ?.flatMap(meterValue => meterValue.sampledValue)
    .map(sampledValue => {
      const signedMeterValue: unknown = sampledValue.signedMeterValue
      return isJsonObject(signedMeterValue) && typeof signedMeterValue.publicKey === 'string'
        ? signedMeterValue.publicKey
        : undefined
    })
    .find(publicKey => publicKey != null && publicKey.length > 0)

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
          typeof signedMeterValue.publicKey === 'string' && signedMeterValue.publicKey.length > 0,
        ],
  ])
}

const compactLifecycleMeterValueEndpoints = (
  accounting: TransactionEventQueueAccounting,
  queuedEvent: QueuedTransactionEvent
): boolean => {
  const meterValues = queuedEvent.request.meterValue
  if (
    queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated ||
    meterValues == null ||
    meterValues.length === 0
  ) {
    return false
  }

  const meterValueEndpoints = new Map<string, { first: number; last: number }>()
  for (const [meterValueIndex, meterValue] of meterValues.entries()) {
    const identities = new Set<string>()
    for (const sampledValue of meterValue.sampledValue) {
      identities.add(getSampledValueIdentity(sampledValue))
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

  const intervalTotals = new Map<string, { readonly sample: OCPP20SampledValue; total: number }>()
  for (const meterValue of meterValues) {
    for (const sampledValue of meterValue.sampledValue) {
      if (
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

  const retainedMeterValueIndexes = new Set([0, meterValues.length - 1])
  for (const endpoints of meterValueEndpoints.values()) {
    retainedMeterValueIndexes.add(endpoints.first)
    retainedMeterValueIndexes.add(endpoints.last)
  }
  let changed = retainedMeterValueIndexes.size !== meterValues.length
  const retainedMeterValues = meterValues.filter((meterValue, meterValueIndex) => {
    if (!retainedMeterValueIndexes.has(meterValueIndex)) return false

    const sampleEndpoints = new Map<string, { first: number; last: number }>()
    for (const [sampledValueIndex, sampledValue] of meterValue.sampledValue.entries()) {
      const identity = getSampledValueIdentity(sampledValue)
      const endpoints = sampleEndpoints.get(identity)
      if (endpoints == null) {
        sampleEndpoints.set(identity, { first: sampledValueIndex, last: sampledValueIndex })
      } else {
        endpoints.last = sampledValueIndex
      }
    }

    const retainedSampleIndexes = new Set<number>()
    for (const endpoints of sampleEndpoints.values()) {
      retainedSampleIndexes.add(endpoints.first)
      retainedSampleIndexes.add(endpoints.last)
    }
    if (retainedSampleIndexes.size === 0 && meterValue.sampledValue.length > 0) {
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
      if (sampledValue.signedMeterValue == null) {
        retainedUnsignedIntervalSamples.set(identity, sampledValue)
      }
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
    const recoverySample = structuredClone(sample)
    delete recoverySample.signedMeterValue
    recoverySample.context = OCPP20ReadingContextEnumType.TRANSACTION_END
    recoverySample.value = missingEnergy
    terminalMeterValue.sampledValue.push(recoverySample)
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
  publicKeys: ReadonlyMap<string, string>
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
        if (
          typeof signedMeterValue.publicKey === 'string' &&
          signedMeterValue.publicKey.length > 0
        ) {
          transactionsWithPublicKeys.add(transactionId)
        } else if (!replacements.has(transactionId)) {
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
  removedEvents: readonly QueuedTransactionEvent[]
): void => {
  const retainedEventsByTransaction = new Map<string, QueuedTransactionEvent[]>()
  for (const queuedEvent of accounting.queue) {
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

const hasSignedMeterValue = (queuedEvent: QueuedTransactionEvent): boolean =>
  queuedEvent.request.meterValue?.some(meterValue =>
    meterValue.sampledValue.some(sampledValue => getMutableSignedMeterValue(sampledValue) != null)
  ) === true

const retainRequiredSignedMeterValueTargets = (
  queue: readonly QueuedTransactionEvent[],
  candidates: readonly QueuedTransactionEvent[]
): QueuedTransactionEvent[] => {
  const candidateSet = new Set(candidates)
  const retainedTargets = new Set<QueuedTransactionEvent>()
  const publicKeyTransactionIds = new Set(
    queue
      .filter(queuedEvent => findPublicKey(queuedEvent) != null)
      .map(queuedEvent => queuedEvent.request.transactionInfo.transactionId)
  )
  for (const transactionId of publicKeyTransactionIds) {
    const retainedSignedTarget = queue.some(
      queuedEvent =>
        queuedEvent.request.transactionInfo.transactionId === transactionId &&
        !candidateSet.has(queuedEvent) &&
        hasSignedMeterValue(queuedEvent)
    )
    if (retainedSignedTarget) continue
    for (let index = candidates.length - 1; index >= 0; index--) {
      const candidate = candidates[index]
      if (
        candidate.request.transactionInfo.transactionId === transactionId &&
        hasSignedMeterValue(candidate)
      ) {
        retainedTargets.add(candidate)
        break
      }
    }
  }
  return candidates.filter(candidate => !retainedTargets.has(candidate))
}

const getUpdatedRemovalCandidates = (
  queue: readonly QueuedTransactionEvent[],
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

  const candidates: QueuedTransactionEvent[] = []
  for (const updates of updatesByTransaction.values()) {
    if (updates.length <= 5) continue
    const first = updates[0]
    const last = updates.at(-1)
    if (last == null) continue
    const retainedEvents = new Set([first, last])
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
    for (const queuedEvent of updates) {
      if (!retainedEvents.has(queuedEvent) && !isProtected(queuedEvent)) {
        candidates.push(queuedEvent)
      }
    }
  }
  return retainRequiredSignedMeterValueTargets(queue, candidates)
}

const getOldestUpdatedRemovalCandidates = (
  queue: readonly QueuedTransactionEvent[],
  activeTransactionId: string | undefined,
  isProtected: (queuedEvent: QueuedTransactionEvent) => boolean
): QueuedTransactionEvent[] => {
  const latestActiveUpdate = queue
    .filter(
      queuedEvent =>
        queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated &&
        queuedEvent.request.transactionInfo.transactionId === activeTransactionId
    )
    .at(-1)
  const candidates = queue.filter(
    queuedEvent =>
      queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated &&
      queuedEvent !== latestActiveUpdate &&
      !isProtected(queuedEvent)
  )
  return retainRequiredSignedMeterValueTargets(queue, candidates)
}

/**
 * Compacts a durable TransactionEvent queue toward its configured targets.
 * Only Updated events and intermediate meter data from Ended events are removed.
 * Started/Ended cores and all other records remain queued even when
 * those mandatory records alone exceed a target.
 * @param connectorStatus - Connector whose durable queue is compacted in place.
 * @param protectedEvent - Newly queued event, retained while older candidates exist.
 * @returns Exact cached serialized bytes, over-limit state, and queue mutations.
 */
export const boundTransactionEventQueue = (
  connectorStatus: ConnectorStatus,
  protectedEvent?: QueuedTransactionEvent
): BoundedTransactionEventQueue => {
  const accounting = getTransactionEventQueueAccounting(connectorStatus)
  const { queue } = accounting
  const inFlightTransactionId = inFlightTransactionIds.get(connectorStatus)
  const isInFlightTransaction = (candidate: QueuedTransactionEvent): boolean =>
    candidate.request.transactionInfo.transactionId === inFlightTransactionId
  const isProtected = (candidate: QueuedTransactionEvent): boolean =>
    candidate === protectedEvent || isInFlightTransaction(candidate)
  const removedEvents: QueuedTransactionEvent[] = []
  const removedPublicKeyTransactionIds = new Set<string>()
  let changed = false

  const isOverLimit = (): boolean =>
    queue.length > Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH ||
    accounting.bytes > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
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
    if (isInFlightTransaction(queuedEvent) || !compactLifecycleEvent(queuedEvent)) continue
    changed = true
  }

  const remove = (candidates: readonly QueuedTransactionEvent[]): void => {
    if (candidates.length === 0) return
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
    transferRemovedIntervalEnergy(accounting, connectorStatus, candidates)
    rebuildAccountingAfterRemoval(accounting)
    transferPublicKeys(accounting, publicKeys)
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
  const targetLength = Math.floor(
    Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH * TRANSACTION_EVENT_QUEUE_HEADROOM_RATIO
  )
  const targetBytes = Math.floor(
    Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES * TRANSACTION_EVENT_QUEUE_HEADROOM_RATIO
  )
  if (isOverLimit()) {
    remove(
      selectUntilTarget(getUpdatedRemovalCandidates(queue, isProtected), targetLength, targetBytes)
    )
  }

  if (isOverLimit()) {
    remove(
      selectUntilTarget(
        getOldestUpdatedRemovalCandidates(queue, activeTransactionId, isProtected),
        targetLength,
        targetBytes
      )
    )
  }

  if (accounting.bytes > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES) {
    for (const queuedEvent of queue) {
      if (accounting.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES) break
      if (isInFlightTransaction(queuedEvent) || !compactLifecycleEvent(queuedEvent)) continue
      changed = true
    }
  }

  if (
    activeTransactionId != null &&
    removedPublicKeyTransactionIds.has(activeTransactionId) &&
    !queue.some(queuedEvent => queuedTransactionEventHasPublicKey(queuedEvent, activeTransactionId))
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
  connectorStatus.transactionEventQueue ??= []
  const accounting = getTransactionEventQueueAccounting(connectorStatus)
  const { queue } = accounting
  const transactionId = queuedEvent.request.transactionInfo.transactionId
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

  const queuedEventBytes = getQueuedTransactionEventBytes(queuedEvent)
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
  const bounded = boundTransactionEventQueue(connectorStatus, queuedEvent)
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
    [discardedEvent]
  )
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
    transferRemovedIntervalEnergy(accounting, connectorStatus, [queuedEvent])
  }
  accounting.queue.shift()
  accounting.bytes -= accounting.eventBytes.get(queuedEvent) ?? 0
  if (accounting.queue.length > 0) accounting.bytes--
  accounting.eventBytes.delete(queuedEvent)
  const transactionId = queuedEvent.request.transactionInfo.transactionId
  accounting.eventKeys.delete(getQueuedTransactionEventKey(transactionId, queuedEvent.seqNo))
  if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended) {
    const remainingEndedEvents = (accounting.endedEventCounts.get(transactionId) ?? 1) - 1
    if (remainingEndedEvents === 0) {
      accounting.endedEventCounts.delete(transactionId)
    } else {
      accounting.endedEventCounts.set(transactionId, remainingEndedEvents)
    }
    if (stagedTransactionEventQueueEntries.has(queuedEvent)) {
      const remainingStagedEndedEvents =
        (accounting.stagedEndedEventCounts.get(transactionId) ?? 1) - 1
      if (remainingStagedEndedEvents === 0) {
        accounting.stagedEndedEventCounts.delete(transactionId)
      } else {
        accounting.stagedEndedEventCounts.set(transactionId, remainingStagedEndedEvents)
      }
    }
  }
  refreshAccountingEdges(accounting)
  return queuedEvent
}
