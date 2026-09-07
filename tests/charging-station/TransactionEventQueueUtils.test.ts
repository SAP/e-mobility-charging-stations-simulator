import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ConnectorStatus, QueuedTransactionEvent } from '../../src/types/ConnectorStatus.js'
import type {
  OCPP20MeterValue,
  OCPP20SampledValue,
  OCPP20TransactionEventRequest,
} from '../../src/types/index.js'

import transactionEventRequestSchema from '../../src/assets/json-schemas/ocpp/2.0/TransactionEventRequest.json' with { type: 'json' }
import { createAjv } from '../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  boundTransactionEventQueue,
  enqueueBoundedTransactionEvent,
  getTransactionEventQueueBytes,
  hasQueuedEndedTransactionEvent,
  queuedTransactionEventHasPublicKey,
  shiftBoundedTransactionEvent,
} from '../../src/charging-station/TransactionEventQueueUtils.js'
import {
  OCPP20IdTokenEnumType,
  OCPP20LocationEnumType,
  OCPP20MeasurandEnumType,
  OCPP20PhaseEnumType,
  OCPP20ReadingContextEnumType,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPP20UnitEnumType,
} from '../../src/types/index.js'
import { Constants } from '../../src/utils/index.js'

const validateTransactionEvent = createAjv().compile(transactionEventRequestSchema)

const assertSchemaValid = (request: OCPP20TransactionEventRequest): void => {
  const wireRequest = JSON.parse(JSON.stringify(request)) as OCPP20TransactionEventRequest
  assert.strictEqual(
    validateTransactionEvent(wireRequest),
    true,
    JSON.stringify(validateTransactionEvent.errors)
  )
}

const toQueuedEvent = (request: OCPP20TransactionEventRequest): QueuedTransactionEvent => ({
  request,
  seqNo: request.seqNo,
  timestamp: request.timestamp,
})

await describe('TransactionEventQueueUtils', async () => {
  await it('retains both endpoints of every signed billing identity under the byte cap', () => {
    const transactionId = '00000000-0000-4000-8000-000000000201'
    const measurands = [
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
      OCPP20MeasurandEnumType.ENERGY_ACTIVE_EXPORT_REGISTER,
    ] as const
    const phases = [OCPP20PhaseEnumType.L1, OCPP20PhaseEnumType.L2, OCPP20PhaseEnumType.L3] as const
    const channels = measurands.flatMap(measurand =>
      phases.flatMap(phase =>
        [false, true].flatMap(publicKeyRequired =>
          [0, 1].map(customVariant => ({ customVariant, measurand, phase, publicKeyRequired }))
        )
      )
    )
    const channelKey = (sample: OCPP20SampledValue): string =>
      JSON.stringify([
        sample.measurand,
        sample.context,
        sample.phase,
        sample.location,
        sample.unitOfMeasure?.unit,
        sample.unitOfMeasure?.multiplier,
        sample.customData,
        (sample.signedMeterValue?.publicKey.length ?? 0) > 0,
      ])
    const meterValue: OCPP20MeterValue[] = Array.from({ length: 500 }, (_, index) => {
      const channel = channels[index % channels.length]
      return {
        sampledValue: [
          {
            context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
            customData: { channel: channel.customVariant, vendorId: 'test' },
            location:
              channel.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
                ? OCPP20LocationEnumType.Inlet
                : OCPP20LocationEnumType.Outlet,
            measurand: channel.measurand,
            phase: channel.phase,
            signedMeterValue: {
              encodingMethod: 'OCMF',
              publicKey: channel.publicKeyRequired ? 'public-key' : '',
              signedMeterData: 'x'.repeat(2500),
              signingMethod: '',
            },
            unitOfMeasure: {
              multiplier: channel.customVariant,
              unit: OCPP20UnitEnumType.WATT_HOUR,
            },
            value: index,
          },
        ],
        timestamp: new Date(index * 1000),
      }
    })
    const request: OCPP20TransactionEventRequest = {
      eventType: OCPP20TransactionEventEnumType.Ended,
      meterValue,
      seqNo: 500,
      timestamp: new Date(500_000),
      transactionInfo: { transactionId },
      triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
    }
    assertSchemaValid(request)
    const expectedEndpoints = new Map<string, [number, number]>()
    for (const sample of meterValue.flatMap(value => value.sampledValue)) {
      const key = channelKey(sample)
      const endpoints = expectedEndpoints.get(key)
      if (endpoints == null) {
        expectedEndpoints.set(key, [sample.value, sample.value])
      } else {
        endpoints[1] = sample.value
      }
    }
    const connectorStatus = {} as ConnectorStatus

    const result = enqueueBoundedTransactionEvent(connectorStatus, toQueuedEvent(request))

    const queue = connectorStatus.transactionEventQueue
    assert.ok(queue != null)
    assert.strictEqual(queue.length, 1)
    assert.ok(result.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    assert.strictEqual(result.bytes, getTransactionEventQueueBytes(queue))
    assertSchemaValid(queue[0].request)
    const actualEndpoints = new Map<string, number[]>()
    for (const sample of queue[0].request.meterValue?.flatMap(value => value.sampledValue) ?? []) {
      const key = channelKey(sample)
      const values = actualEndpoints.get(key) ?? []
      values.push(sample.value)
      actualEndpoints.set(key, values)
    }
    assert.strictEqual(actualEndpoints.size, expectedEndpoints.size)
    for (const [key, endpoints] of expectedEndpoints) {
      assert.deepEqual(actualEndpoints.get(key), [...new Set(endpoints)])
    }
  })

  await it('retains unsigned customData channel endpoints from the middle of an oversized event', () => {
    const transactionId = '00000000-0000-4000-8000-000000000203'
    const billingSample = (
      context: OCPP20ReadingContextEnumType,
      value: number
    ): OCPP20SampledValue => ({
      context,
      measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
      unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
      value,
    })
    const frequencySamples = Array.from({ length: 500 }, (_, index): OCPP20MeterValue => ({
      sampledValue: [
        {
          context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
          customData: {
            channel: index % 2 === 0 ? 'channel-a' : 'channel-b',
            payload: 'x'.repeat(2500),
            vendorId: 'test',
          },
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.FREQUENCY,
          unitOfMeasure: { unit: OCPP20UnitEnumType.HERTZ },
          value: index,
        },
      ],
      timestamp: new Date((index + 1) * 1000),
    }))
    const request: OCPP20TransactionEventRequest = {
      eventType: OCPP20TransactionEventEnumType.Ended,
      meterValue: [
        {
          sampledValue: [billingSample(OCPP20ReadingContextEnumType.TRANSACTION_BEGIN, 10)],
          timestamp: new Date(0),
        },
        ...frequencySamples,
        {
          sampledValue: [billingSample(OCPP20ReadingContextEnumType.TRANSACTION_END, 20)],
          timestamp: new Date(501_000),
        },
      ],
      seqNo: 501,
      timestamp: new Date(501_000),
      transactionInfo: { transactionId },
      triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
    }
    assertSchemaValid(request)
    assert.ok(
      getTransactionEventQueueBytes([toQueuedEvent(request)]) >
        Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
    )
    const connectorStatus = {} as ConnectorStatus

    const result = enqueueBoundedTransactionEvent(connectorStatus, toQueuedEvent(request))

    const queue = connectorStatus.transactionEventQueue
    assert.ok(queue != null)
    assert.strictEqual(queue.length, 1)
    assert.ok(result.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    assert.strictEqual(result.bytes, getTransactionEventQueueBytes(queue))
    assertSchemaValid(queue[0].request)
    const retainedFrequencyValues = new Map<string, number[]>()
    for (const sample of queue[0].request.meterValue?.flatMap(value => value.sampledValue) ?? []) {
      if (sample.measurand !== OCPP20MeasurandEnumType.FREQUENCY) continue
      const channel = sample.customData?.channel
      if (typeof channel !== 'string') assert.fail('Retained Frequency sample has no channel')
      const values = retainedFrequencyValues.get(channel) ?? []
      values.push(sample.value)
      retainedFrequencyValues.set(channel, values)
    }
    assert.deepEqual(retainedFrequencyValues.get('channel-a'), [0, 498])
    assert.deepEqual(retainedFrequencyValues.get('channel-b'), [1, 499])
  })

  await it('transfers first-event identity when a large Started and Ended pair cannot coexist', () => {
    const transactionId = '00000000-0000-4000-8000-000000000202'
    const lifecycleMeterValues = (offset: number): OCPP20MeterValue[] =>
      Array.from({ length: 225 }, (_, index) => ({
        sampledValue: [
          {
            customData: { channel: offset + index, vendorId: 'test' },
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            phase: OCPP20PhaseEnumType.L1,
            signedMeterValue: {
              encodingMethod: 'OCMF',
              publicKey: index === 0 ? 'public-key' : '',
              signedMeterData: 'x'.repeat(2500),
              signingMethod: '',
            },
            unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
            value: offset + index,
          },
        ],
        timestamp: new Date((offset + index) * 1000),
      }))
    const startedRequest: OCPP20TransactionEventRequest = {
      eventType: OCPP20TransactionEventEnumType.Started,
      evse: { connectorId: 2, id: 1 },
      idToken: { idToken: 'first-event-token', type: OCPP20IdTokenEnumType.Local },
      meterValue: lifecycleMeterValues(0),
      seqNo: 0,
      timestamp: new Date(0),
      transactionInfo: { transactionId },
      triggerReason: OCPP20TriggerReasonEnumType.Authorized,
    }
    const endedRequest: OCPP20TransactionEventRequest = {
      eventType: OCPP20TransactionEventEnumType.Ended,
      meterValue: lifecycleMeterValues(1000),
      seqNo: 1,
      timestamp: new Date(1_000_000),
      transactionInfo: { transactionId },
      triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
    }
    assertSchemaValid(startedRequest)
    assertSchemaValid(endedRequest)
    const startedEvent = toQueuedEvent(startedRequest)
    const endedEvent = toQueuedEvent(endedRequest)
    const startedBytes = getTransactionEventQueueBytes([startedEvent])
    const endedBytes = getTransactionEventQueueBytes([endedEvent])
    assert.ok(startedBytes > 600_000 && startedBytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    assert.ok(endedBytes > 600_000 && endedBytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    assert.ok(
      getTransactionEventQueueBytes([startedEvent, endedEvent]) >
        Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
    )
    const connectorStatus = {
      publicKeySentInTransaction: true,
      transactionEventQueue: [startedEvent, endedEvent],
      transactionId,
    } as unknown as ConnectorStatus

    const endedResult = boundTransactionEventQueue(connectorStatus)

    const queue = connectorStatus.transactionEventQueue
    assert.ok(queue != null)
    assert.strictEqual(queue.length, 1)
    assert.strictEqual(queue[0].request.eventType, OCPP20TransactionEventEnumType.Ended)
    assert.strictEqual(queue[0].request.seqNo, 1)
    assert.deepEqual(queue[0].request.evse, startedRequest.evse)
    assert.deepEqual(queue[0].request.idToken, startedRequest.idToken)
    assert.ok(
      endedResult.removedEvents.some(
        event => event.request.eventType === OCPP20TransactionEventEnumType.Started
      )
    )
    assert.ok(endedResult.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    assert.strictEqual(endedResult.bytes, getTransactionEventQueueBytes(queue))
    assert.strictEqual(hasQueuedEndedTransactionEvent(connectorStatus, transactionId), true)
    assert.strictEqual(queuedTransactionEventHasPublicKey(queue[0], transactionId), true)
    assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
    assertSchemaValid(queue[0].request)

    const duplicateResult = enqueueBoundedTransactionEvent(connectorStatus, {
      ...endedEvent,
      request: { ...endedEvent.request },
    })
    assert.strictEqual(duplicateResult.inserted, false)
    assert.strictEqual(queue.length, 1)
    assert.strictEqual(duplicateResult.bytes, getTransactionEventQueueBytes(queue))

    assert.strictEqual(shiftBoundedTransactionEvent(connectorStatus)?.seqNo, 1)
    assert.strictEqual(hasQueuedEndedTransactionEvent(connectorStatus, transactionId), false)
    const emptyResult = boundTransactionEventQueue(connectorStatus)
    assert.strictEqual(emptyResult.bytes, getTransactionEventQueueBytes([]))
  })
})
