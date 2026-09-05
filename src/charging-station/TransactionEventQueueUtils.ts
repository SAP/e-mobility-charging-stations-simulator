import type { ConnectorStatus, QueuedTransactionEvent } from '../types/ConnectorStatus.js'

import { OCPP20TransactionEventEnumType } from '../types/index.js'
import { Constants } from '../utils/index.js'

export interface BoundedTransactionEventQueue {
  bytes: number
  changed: boolean
  removedEvents: QueuedTransactionEvent[]
}

const getQueuedTransactionEventBytes = (queuedEvent: QueuedTransactionEvent): number =>
  Buffer.byteLength(JSON.stringify(queuedEvent), 'utf8')

export const getTransactionEventQueueBytes = (queue: QueuedTransactionEvent[]): number =>
  queue.reduce(
    (bytes, queuedEvent, index) =>
      bytes + getQueuedTransactionEventBytes(queuedEvent) + (index === 0 ? 0 : 1),
    2
  )

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

const removeCustomData = (value: unknown): void => {
  if (Array.isArray(value)) {
    for (const item of value) removeCustomData(item)
    return
  }
  if (value == null || typeof value !== 'object' || value instanceof Date) return
  const record = value as Record<string, unknown>
  delete record.customData
  for (const nestedValue of Object.values(record)) removeCustomData(nestedValue)
}

const compactLifecycleEvent = (queuedEvent: QueuedTransactionEvent): boolean => {
  if (queuedEvent.request.eventType === OCPP20TransactionEventEnumType.Updated) return false
  if (getTransactionEventQueueBytes([queuedEvent]) <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES) {
    return false
  }
  delete queuedEvent.request.meterValue
  removeCustomData(queuedEvent.request)
  if (getTransactionEventQueueBytes([queuedEvent]) <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES) {
    return true
  }

  const request = queuedEvent.request
  const transactionInfo = request.transactionInfo
  queuedEvent.request = {
    eventType: request.eventType,
    ...(typeof request.offline === 'boolean' && { offline: request.offline }),
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
  return true
}

const transferPublicKeys = (
  queue: QueuedTransactionEvent[],
  publicKeys: ReadonlyMap<string, string>
): void => {
  for (const [transactionId, publicKey] of publicKeys) {
    if (queue.some(queuedEvent => queuedTransactionEventHasPublicKey(queuedEvent, transactionId))) {
      continue
    }
    const replacementSignedMeterValue = queue
      .filter(queuedEvent => queuedEvent.request.transactionInfo.transactionId === transactionId)
      .flatMap(queuedEvent => queuedEvent.request.meterValue ?? [])
      .flatMap(meterValue => meterValue.sampledValue)
      .map(sampledValue => sampledValue.signedMeterValue)
      .find(signedMeterValue => signedMeterValue != null)
    if (replacementSignedMeterValue != null) replacementSignedMeterValue.publicKey = publicKey
  }
}

/**
 * Mutates a durable TransactionEvent queue to satisfy both hard bounds.
 * Lifecycle events are compacted before eviction, and a protected newly
 * queued lifecycle event is retained unless even its required core cannot fit.
 * @param connectorStatus - Connector whose durable queue is bounded in place.
 * @param protectedEvent - Newly queued lifecycle event to evict only as a last resort.
 * @returns Exact serialized bytes and details of queue mutations.
 */
export const boundTransactionEventQueue = (
  connectorStatus: ConnectorStatus,
  protectedEvent?: QueuedTransactionEvent
): BoundedTransactionEventQueue => {
  const queue = connectorStatus.transactionEventQueue ?? []
  const removedEvents: QueuedTransactionEvent[] = []
  const removedPublicKeyTransactionIds = new Set<string>()
  let changed = false

  for (const queuedEvent of queue) {
    const publicKey = findPublicKey(queuedEvent)
    if (!compactLifecycleEvent(queuedEvent)) continue
    changed = true
    if (publicKey != null) {
      removedPublicKeyTransactionIds.add(queuedEvent.request.transactionInfo.transactionId)
      transferPublicKeys(
        queue.filter(candidate => candidate !== queuedEvent),
        new Map([[queuedEvent.request.transactionInfo.transactionId, publicKey]])
      )
    }
  }

  let bytes = getTransactionEventQueueBytes(queue)
  const remove = (candidates: readonly QueuedTransactionEvent[]): void => {
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
    }
    queue.splice(0, queue.length, ...queue.filter(candidate => !candidateSet.has(candidate)))
    transferPublicKeys(queue, publicKeys)
    bytes = getTransactionEventQueueBytes(queue)
    changed = true
  }
  const selectUntilBounded = (
    candidateGroups: readonly (readonly QueuedTransactionEvent[])[]
  ): QueuedTransactionEvent[] => {
    const selected: QueuedTransactionEvent[] = []
    const selectedSet = new Set<QueuedTransactionEvent>()
    const queueSeparatorBytes = Math.max(0, queue.length - 1)
    const queueEventBytes = bytes - queueSeparatorBytes - 2
    let selectedEventBytes = 0
    for (const group of candidateGroups) {
      for (const candidate of group) {
        if (selectedSet.has(candidate)) continue
        selected.push(candidate)
        selectedSet.add(candidate)
        selectedEventBytes += getQueuedTransactionEventBytes(candidate)
      }
      const retainedLength = queue.length - selected.length
      const projectedBytes =
        queueEventBytes - selectedEventBytes + Math.max(0, retainedLength - 1) + 2
      if (
        retainedLength <= Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH &&
        projectedBytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      ) {
        break
      }
    }
    return selected
  }

  while (
    queue.length > Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH ||
    bytes > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
  ) {
    const updatedEvents = queue.filter(
      candidate =>
        candidate !== protectedEvent &&
        candidate.request.eventType === OCPP20TransactionEventEnumType.Updated
    )
    if (updatedEvents.length > 0) {
      remove(selectUntilBounded(updatedEvents.map(candidate => [candidate])))
      continue
    }

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
    const completedTransactionGroups = [...completedTransactionGroupsById.values()]
    if (completedTransactionGroups.length > 0) {
      remove(selectUntilBounded(completedTransactionGroups))
      continue
    }

    const residualEvents = queue.filter(candidate => candidate !== protectedEvent)
    const candidates: QueuedTransactionEvent[] =
      residualEvents.length > 0 ? residualEvents : protectedEvent != null ? [protectedEvent] : []
    if (candidates.length === 0) break
    remove(selectUntilBounded(candidates.map(candidate => [candidate])))
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
    bytes,
    changed,
    removedEvents,
  }
}
