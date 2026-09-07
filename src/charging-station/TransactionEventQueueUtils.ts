import type { ConnectorStatus, QueuedTransactionEvent } from '../types/ConnectorStatus.js'

import { type OCPP20SignedMeterValue, OCPP20TransactionEventEnumType } from '../types/index.js'
import { Constants } from '../utils/index.js'

export interface BoundedTransactionEventQueue {
  bytes: number
  changed: boolean
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
}

const RECENT_UPDATED_EVENTS_TO_RETAIN = 8
const TRANSACTION_EVENT_QUEUE_HEADROOM_RATIO = 0.75
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
  const eventKeys = new Set<string>()
  let bytes = 2
  for (const [index, queuedEvent] of queue.entries()) {
    const queuedEventBytes = getQueuedTransactionEventBytes(queuedEvent)
    eventBytes.set(queuedEvent, queuedEventBytes)
    const transactionId = queuedEvent.request.transactionInfo.transactionId
    eventKeys.add(getQueuedTransactionEventKey(transactionId, queuedEvent.seqNo))
    if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Ended) {
      endedEventCounts.set(transactionId, (endedEventCounts.get(transactionId) ?? 0) + 1)
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

export const queuedTransactionEventHasPublicKey = (
  queuedEvent: QueuedTransactionEvent,
  transactionId: string
): boolean =>
  queuedEvent.request.transactionInfo.transactionId === transactionId &&
  queuedEvent.request.meterValue?.some(meterValue =>
    meterValue.sampledValue.some(sampledValue => {
      const publicKey = sampledValue.signedMeterValue?.publicKey
      return typeof publicKey === 'string' && publicKey.length > 0
    })
  ) === true

const findPublicKey = (queuedEvent: QueuedTransactionEvent): string | undefined =>
  queuedEvent.request.meterValue
    ?.flatMap(meterValue => meterValue.sampledValue)
    .map(sampledValue => sampledValue.signedMeterValue?.publicKey)
    .find(publicKey => typeof publicKey === 'string' && publicKey.length > 0)

const removeCustomData = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    let changed = false
    for (const item of value) changed = removeCustomData(item) || changed
    return changed
  }
  if (value == null || typeof value !== 'object' || value instanceof Date) return false
  const record = value as Record<string, unknown>
  let changed = false
  if ('customData' in record) {
    delete record.customData
    changed = true
  }
  for (const nestedValue of Object.values(record)) {
    changed = removeCustomData(nestedValue) || changed
  }
  return changed
}

const isBillingSampledValue = (
  sampledValue: NonNullable<
    QueuedTransactionEvent['request']['meterValue']
  >[number]['sampledValue'][number]
): boolean => {
  const context = sampledValue.context?.toString()
  return (
    sampledValue.measurand == null ||
    sampledValue.measurand.includes('.Register') ||
    context === 'Transaction.Begin' ||
    context === 'Transaction.End'
  )
}

const isBillingMeterValue = (
  meterValue: NonNullable<QueuedTransactionEvent['request']['meterValue']>[number]
): boolean => meterValue.sampledValue.some(isBillingSampledValue)

const isSignedMeterValue = (
  meterValue: NonNullable<QueuedTransactionEvent['request']['meterValue']>[number]
): boolean => meterValue.sampledValue.some(sampledValue => sampledValue.signedMeterValue != null)

const hasPublicKey = (
  sampledValue: NonNullable<
    QueuedTransactionEvent['request']['meterValue']
  >[number]['sampledValue'][number]
): boolean => (sampledValue.signedMeterValue?.publicKey.length ?? 0) > 0

const addMatchingEndpointIndexes = <T>(
  retainedIndexes: Set<number>,
  values: readonly T[],
  predicate: (value: T) => boolean
): void => {
  let firstIndex: number | undefined
  let lastIndex: number | undefined
  for (const [index, value] of values.entries()) {
    if (!predicate(value)) continue
    firstIndex ??= index
    lastIndex = index
  }
  if (firstIndex != null) retainedIndexes.add(firstIndex)
  if (lastIndex != null) retainedIndexes.add(lastIndex)
}

const compactLifecycleMeterValueIntermediates = (
  accounting: TransactionEventQueueAccounting,
  queuedEvent: QueuedTransactionEvent
): boolean => {
  const meterValues = queuedEvent.request.meterValue
  if (
    queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated ||
    meterValues == null ||
    meterValues.length <= 2
  ) {
    return false
  }
  const retainedMeterValues = meterValues.filter(
    (meterValue, index) =>
      index === 0 ||
      index === meterValues.length - 1 ||
      isBillingMeterValue(meterValue) ||
      isSignedMeterValue(meterValue)
  )
  if (retainedMeterValues.length === meterValues.length) return false
  queuedEvent.request.meterValue = retainedMeterValues
  refreshQueuedEventBytes(accounting, queuedEvent)
  return true
}

const compactLifecycleMeterValueEndpoints = (
  accounting: TransactionEventQueueAccounting,
  queuedEvent: QueuedTransactionEvent
): boolean => {
  const meterValues = queuedEvent.request.meterValue
  if (
    queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated ||
    meterValues == null
  ) {
    return false
  }

  const retainedMeterValueIndexes = new Set([0, meterValues.length - 1])
  addMatchingEndpointIndexes(retainedMeterValueIndexes, meterValues, isBillingMeterValue)
  addMatchingEndpointIndexes(retainedMeterValueIndexes, meterValues, isSignedMeterValue)
  addMatchingEndpointIndexes(retainedMeterValueIndexes, meterValues, meterValue =>
    meterValue.sampledValue.some(hasPublicKey)
  )
  const retainedMeterValues = meterValues.filter((_, index) => retainedMeterValueIndexes.has(index))
  let changed = retainedMeterValues.length !== meterValues.length

  for (const meterValue of retainedMeterValues) {
    const { sampledValue } = meterValue
    const retainedSampleIndexes = new Set([0, sampledValue.length - 1])
    addMatchingEndpointIndexes(retainedSampleIndexes, sampledValue, isBillingSampledValue)
    addMatchingEndpointIndexes(
      retainedSampleIndexes,
      sampledValue,
      sample => sample.signedMeterValue != null
    )
    addMatchingEndpointIndexes(retainedSampleIndexes, sampledValue, hasPublicKey)
    const retainedSamples = sampledValue.filter((_, index) => retainedSampleIndexes.has(index))
    if (retainedSamples.length === sampledValue.length) continue
    meterValue.sampledValue = retainedSamples
    changed = true
  }

  if (!changed) return false
  queuedEvent.request.meterValue = retainedMeterValues
  refreshQueuedEventBytes(accounting, queuedEvent)
  return true
}

const compactOversizedLifecycleEvent = (
  accounting: TransactionEventQueueAccounting,
  queuedEvent: QueuedTransactionEvent
): boolean => {
  if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated) return false
  let changed = removeCustomData(queuedEvent.request)
  if (changed) refreshQueuedEventBytes(accounting, queuedEvent)
  if (
    (accounting.eventBytes.get(queuedEvent) ?? 0) + 2 <=
    Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
  ) {
    return changed
  }

  if (compactLifecycleMeterValueIntermediates(accounting, queuedEvent)) changed = true
  if (
    (accounting.eventBytes.get(queuedEvent) ?? 0) + 2 <=
    Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
  ) {
    return changed
  }

  if (compactLifecycleMeterValueEndpoints(accounting, queuedEvent)) changed = true
  if (
    (accounting.eventBytes.get(queuedEvent) ?? 0) + 2 <=
    Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
  ) {
    return changed
  }

  const request = queuedEvent.request
  const previousBytes = accounting.eventBytes.get(queuedEvent) ?? 0
  const transactionInfo = request.transactionInfo
  queuedEvent.request = {
    eventType: request.eventType,
    ...(typeof request.offline === 'boolean' && { offline: request.offline }),
    ...(request.meterValue != null && { meterValue: request.meterValue }),
    seqNo: request.seqNo,
    timestamp: request.timestamp,
    transactionInfo: {
      ...(typeof transactionInfo.chargingState === 'string' && {
        chargingState: transactionInfo.chargingState,
      }),
      ...(typeof transactionInfo.remoteStartId === 'number' && {
        remoteStartId: transactionInfo.remoteStartId,
      }),
      ...(typeof transactionInfo.stoppedReason === 'string' && {
        stoppedReason: transactionInfo.stoppedReason,
      }),
      ...(typeof transactionInfo.timeSpentCharging === 'number' && {
        timeSpentCharging: transactionInfo.timeSpentCharging,
      }),
      transactionId: transactionInfo.transactionId,
    },
    triggerReason: request.triggerReason,
  }
  refreshQueuedEventBytes(accounting, queuedEvent)
  return changed || (accounting.eventBytes.get(queuedEvent) ?? 0) < previousBytes
}

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
        const signedMeterValue = sampledValue.signedMeterValue
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

const rebuildAccountingAfterRemoval = (accounting: TransactionEventQueueAccounting): void => {
  accounting.bytes = accounting.queue.reduce(
    (bytes, queuedEvent, index) =>
      bytes + (accounting.eventBytes.get(queuedEvent) ?? 0) + (index === 0 ? 0 : 1),
    2
  )
  refreshAccountingEdges(accounting)
}

const getUpdatedRemovalCandidates = (
  queue: readonly QueuedTransactionEvent[],
  protectedEvent?: QueuedTransactionEvent
): QueuedTransactionEvent[] => {
  const updatesByTransaction = new Map<string, QueuedTransactionEvent[]>()
  for (const queuedEvent of queue) {
    if (
      queuedEvent === protectedEvent ||
      queuedEvent.request.eventType !== OCPP20TransactionEventEnumType.Updated
    ) {
      continue
    }
    const transactionId = queuedEvent.request.transactionInfo.transactionId
    const updates = updatesByTransaction.get(transactionId) ?? []
    updates.push(queuedEvent)
    updatesByTransaction.set(transactionId, updates)
  }

  const firstPass: QueuedTransactionEvent[] = []
  const secondPass: QueuedTransactionEvent[] = []
  const endpointPass: QueuedTransactionEvent[] = []
  for (const updates of updatesByTransaction.values()) {
    const recentStart = Math.max(1, updates.length - RECENT_UPDATED_EVENTS_TO_RETAIN)
    for (let index = 1; index < recentStart; index++) {
      if (index % 2 === 1) {
        firstPass.push(updates[index])
      } else {
        secondPass.push(updates[index])
      }
    }
    if (updates.length > 0) endpointPass.push(updates[0])
  }
  return [...firstPass, ...secondPass, ...endpointPass]
}

/**
 * Mutates a durable TransactionEvent queue to satisfy both hard bounds.
 * Updated events are decimated in batches so a saturated live queue retains
 * its temporal endpoints and newest samples without scanning the full queue on every tick.
 * Lifecycle custom data is removed before lifecycle meter data, and a newly
 * queued lifecycle event is retained unless even its required core cannot fit.
 * @param connectorStatus - Connector whose durable queue is bounded in place.
 * @param protectedEvent - Newly queued event to evict only as a last resort.
 * @returns Exact cached serialized bytes and details of queue mutations.
 */
export const boundTransactionEventQueue = (
  connectorStatus: ConnectorStatus,
  protectedEvent?: QueuedTransactionEvent
): BoundedTransactionEventQueue => {
  const accounting = getTransactionEventQueueAccounting(connectorStatus)
  const { queue } = accounting
  const removedEvents: QueuedTransactionEvent[] = []
  const removedPublicKeyTransactionIds = new Set<string>()
  let changed = false

  const isOverHardBounds = (): boolean =>
    queue.length > Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH ||
    accounting.bytes > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
  if (!isOverHardBounds()) {
    return { bytes: accounting.bytes, changed, removedEvents }
  }

  for (const queuedEvent of queue) {
    if (!isOverHardBounds()) break
    if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated) continue
    if (!removeCustomData(queuedEvent.request)) continue
    changed = true
    refreshQueuedEventBytes(accounting, queuedEvent)
  }

  for (const queuedEvent of queue) {
    if (!isOverHardBounds()) break
    if (!compactOversizedLifecycleEvent(accounting, queuedEvent)) continue
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
      }
    }
    queue.splice(0, queue.length, ...queue.filter(candidate => !candidateSet.has(candidate)))
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

  if (isOverHardBounds()) {
    const targetLength = Math.floor(
      Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH * TRANSACTION_EVENT_QUEUE_HEADROOM_RATIO
    )
    const targetBytes = Math.floor(
      Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES * TRANSACTION_EVENT_QUEUE_HEADROOM_RATIO
    )
    remove(
      selectUntilTarget(
        getUpdatedRemovalCandidates(queue, protectedEvent),
        targetLength,
        targetBytes
      )
    )
  }

  const removeOldestCompletedTransaction = (): boolean => {
    const completedTransactionIds = new Set(
      queue
        .filter(candidate => candidate.request.eventType === OCPP20TransactionEventEnumType.Ended)
        .map(candidate => candidate.request.transactionInfo.transactionId)
    )
    const completedTransactionGroupsById = new Map<string, QueuedTransactionEvent[]>()
    for (const candidate of queue) {
      const transactionId = candidate.request.transactionInfo.transactionId
      if (candidate === protectedEvent || !completedTransactionIds.has(transactionId)) continue
      const transactionGroup = completedTransactionGroupsById.get(transactionId) ?? []
      transactionGroup.push(candidate)
      completedTransactionGroupsById.set(transactionId, transactionGroup)
    }
    const oldestCompletedTransaction = completedTransactionGroupsById.values().next().value
    if (oldestCompletedTransaction == null) return false
    remove(oldestCompletedTransaction)
    return true
  }

  while (isOverHardBounds() && removeOldestCompletedTransaction()) {
    // Evict complete history before degrading any retained lifecycle billing evidence.
  }

  if (accounting.bytes > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES) {
    for (const queuedEvent of queue) {
      if (accounting.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES) break
      if (!compactLifecycleMeterValueIntermediates(accounting, queuedEvent)) continue
      changed = true
    }
  }

  while (isOverHardBounds()) {
    if (
      protectedEvent?.request.eventType === OCPP20TransactionEventEnumType.Updated &&
      queue.includes(protectedEvent)
    ) {
      remove([protectedEvent])
      continue
    }
    if (removeOldestCompletedTransaction()) continue

    const residualEvent = queue.find(candidate => candidate !== protectedEvent)
    if (residualEvent != null) {
      remove([residualEvent])
      continue
    }

    if (protectedEvent != null && compactOversizedLifecycleEvent(accounting, protectedEvent)) {
      changed = true
      continue
    }
    if (protectedEvent == null || queue.length === 0) break
    remove([protectedEvent])
  }

  const activeTransactionId = connectorStatus.transactionId?.toString()
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
    removedEvents,
  }
}

/**
 * Inserts one event in transaction sequence order and enforces queue bounds.
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
 * Returns whether a transaction has a queued Ended lifecycle event in O(1).
 * @param connectorStatus - Queue owner.
 * @param transactionId - Transaction whose lifecycle state is queried.
 * @returns Whether the transaction has an Ended event in the queue.
 */
export const hasQueuedEndedTransactionEvent = (
  connectorStatus: ConnectorStatus,
  transactionId: string
): boolean =>
  (getTransactionEventQueueAccounting(connectorStatus).endedEventCounts.get(transactionId) ?? 0) > 0

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
 * Removes and returns the oldest queued event while keeping byte accounting exact.
 * @param connectorStatus - Queue owner.
 * @returns The removed oldest event, or undefined for an empty queue.
 */
export const shiftBoundedTransactionEvent = (
  connectorStatus: ConnectorStatus
): QueuedTransactionEvent | undefined => {
  const accounting = getTransactionEventQueueAccounting(connectorStatus)
  const queuedEvent = accounting.queue.shift()
  if (queuedEvent == null) return
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
  }
  refreshAccountingEdges(accounting)
  return queuedEvent
}
