import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ConnectorStatus, QueuedTransactionEvent } from '../../src/types/ConnectorStatus.js'
import type {
  OCPP20MeterValue,
  OCPP20SampledValue,
  OCPP20TransactionEventRequest,
} from '../../src/types/index.js'

import transactionEventRequestSchema from '../../src/assets/json-schemas/ocpp/2.0/TransactionEventRequest.json' with { type: 'json' }
import { prepareConnectorStatus } from '../../src/charging-station/HelpersConnectorStatus.js'
import { createAjv } from '../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  boundTransactionEventQueue,
  enqueueBoundedTransactionEvent,
  getTransactionEventQueueBytes,
  hasQueuedEndedTransactionEvent,
  queuedTransactionEventHasPublicKey,
  setTransactionEventQueueInFlight,
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

const oversizedLifecycleMeterValues = (timestamp: Date): OCPP20MeterValue[] => [
  {
    sampledValue: Array.from({ length: 425 }, (_, sampledValueIndex) => ({
      context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
      measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
      signedMeterValue: {
        encodingMethod: 'OCMF',
        publicKey: sampledValueIndex === 0 ? 'public-key' : '',
        signedMeterData: 'x'.repeat(2500),
        signingMethod: '',
      },
      unitOfMeasure: {
        multiplier: sampledValueIndex,
        unit: OCPP20UnitEnumType.WATT_HOUR,
      },
      value: sampledValueIndex,
    })),
    timestamp,
  },
]

await describe('TransactionEventQueueUtils', async () => {
  await it('preserves additive interval energy while decimating queued updates', () => {
    const transactionId = '00000000-0000-4000-8000-000000000200'
    const eventCount = Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH + 1
    const transactionEventQueue = Array.from({ length: eventCount }, (_, seqNo) => {
      const timestamp = new Date(seqNo * 1000)
      return toQueuedEvent({
        eventType: OCPP20TransactionEventEnumType.Updated,
        meterValue: [
          {
            sampledValue: [
              {
                context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
                measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
                unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
                value: 1,
              },
            ],
            timestamp,
          },
        ],
        seqNo,
        timestamp,
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      })
    })
    const connectorStatus = { transactionEventQueue } as ConnectorStatus

    const result = boundTransactionEventQueue(connectorStatus)

    const queue = connectorStatus.transactionEventQueue
    assert.ok(queue != null)
    assert.ok(result.removedEvents.length > 0)
    assert.ok(queue.length <= Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH)
    assert.ok(result.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    for (const queuedEvent of queue) {
      for (const meterValue of queuedEvent.request.meterValue ?? []) {
        if (
          meterValue.sampledValue.some(
            sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
          )
        ) {
          assert.strictEqual(
            meterValue.timestamp.getTime(),
            queuedEvent.request.timestamp.getTime()
          )
        }
      }
    }
    const retainedEnergy = queue
      .flatMap(queuedEvent => queuedEvent.request.meterValue ?? [])
      .flatMap(meterValue => meterValue.sampledValue)
      .filter(sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL)
      .reduce((total, sample) => total + sample.value, 0)
    assert.strictEqual(retainedEnergy, eventCount)
    assert.strictEqual(result.bytes, getTransactionEventQueueBytes(queue))
  })

  await it('conserves unsigned interval energy while compacting an Ended history', () => {
    const transactionId = '00000000-0000-4000-8000-000000000206'
    const sampleCount = 425
    const meterValue = Array.from({ length: sampleCount }, (_, index) => ({
      sampledValue: [
        {
          context: OCPP20ReadingContextEnumType.TRANSACTION_END,
          customData: { padding: 'x'.repeat(2500), vendorId: 'test' },
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
          value: 1,
        },
      ],
      timestamp: new Date(index * 1000),
    }))
    const request: OCPP20TransactionEventRequest = {
      eventType: OCPP20TransactionEventEnumType.Ended,
      meterValue,
      seqNo: 1,
      timestamp: new Date(sampleCount * 1000),
      transactionInfo: { transactionId },
      triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
    }
    const connectorStatus = { transactionId } as ConnectorStatus

    const result = enqueueBoundedTransactionEvent(connectorStatus, toQueuedEvent(request))

    const queue = connectorStatus.transactionEventQueue
    assert.ok(queue != null)
    assert.strictEqual(queue.length, 1)
    assert.ok((queue[0].request.meterValue?.length ?? 0) < sampleCount)
    const retainedEnergy =
      queue[0].request.meterValue
        ?.flatMap(value => value.sampledValue)
        .filter(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
        .reduce((total, sample) => total + sample.value, 0) ?? 0
    assert.strictEqual(retainedEnergy, sampleCount)
    assert.ok(result.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    assert.strictEqual(result.bytes, getTransactionEventQueueBytes(queue))
    assertSchemaValid(queue[0].request)
  })

  await it('preserves signed interval coverage as unsigned recovery when compacting Ended', () => {
    const transactionId = '00000000-0000-4000-8000-000000000223'
    const baselineKey = 'SampledDataCtrlr.TxEndedMeasurands'
    const sampleCount = 100
    const meterValue: OCPP20MeterValue[] = Array.from({ length: sampleCount }, (_, index) => ({
      sampledValue: [
        {
          context: OCPP20ReadingContextEnumType.TRANSACTION_END,
          customData: { padding: 'x'.repeat(10_000), vendorId: 'test' },
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          signedMeterValue: {
            encodingMethod: 'OCMF',
            publicKey: index === 0 ? 'public-key' : '',
            signedMeterData: 'x'.repeat(2500),
            signingMethod: '',
          },
          unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
          value: 1,
        },
      ],
      timestamp: new Date(index * 1000),
    }))
    const queuedEvent = {
      ...toQueuedEvent({
        eventType: OCPP20TransactionEventEnumType.Ended,
        meterValue,
        seqNo: sampleCount,
        timestamp: new Date(sampleCount * 1000),
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
      }),
      transactionEnergyActiveImportIntervalConsumption: { [baselineKey]: sampleCount },
    }
    const connectorStatus = { transactionId } as ConnectorStatus

    const result = enqueueBoundedTransactionEvent(connectorStatus, queuedEvent)

    const retainedEvent = connectorStatus.transactionEventQueue?.[0]
    assert.ok(retainedEvent != null)
    assert.strictEqual(retainedEvent.request.meterValue, meterValue)
    const retainedIntervalSamples = retainedEvent.request.meterValue.flatMap(value =>
      value.sampledValue.filter(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
    )
    assert.strictEqual(
      retainedIntervalSamples.reduce((total, sample) => total + sample.value, 0),
      sampleCount
    )
    assert.strictEqual(
      retainedIntervalSamples
        .filter(sample => sample.signedMeterValue == null)
        .reduce((total, sample) => total + sample.value, 0),
      sampleCount - 3
    )
    assert.deepStrictEqual(retainedEvent.transactionEnergyActiveImportIntervalConsumption, {
      [baselineKey]: sampleCount,
    })
    assert.strictEqual(result.overLimit, false)
    assert.strictEqual(result.bytes, getTransactionEventQueueBytes([retainedEvent]))
    assertSchemaValid(retainedEvent.request)
  })

  await it('bounds a rehydrated lifecycle event with malformed signed meter metadata', () => {
    const transactionId = '00000000-0000-4000-8000-000000000220'
    const meterValue: OCPP20MeterValue[] = Array.from({ length: 425 }, (_, index) => ({
      sampledValue: [
        {
          customData: { payload: 'x'.repeat(3000), vendorId: 'test' },
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          signedMeterValue: {} as OCPP20SampledValue['signedMeterValue'],
          value: index,
        },
      ],
      timestamp: new Date(index * 1000),
    }))
    const queuedEvent = toQueuedEvent({
      eventType: OCPP20TransactionEventEnumType.Ended,
      meterValue,
      seqNo: 425,
      timestamp: new Date(425_000),
      transactionInfo: { transactionId },
      triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
    })
    assert.ok(
      getTransactionEventQueueBytes([queuedEvent]) > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
    )
    const persistedStatus = JSON.parse(
      JSON.stringify({ transactionEventQueue: [queuedEvent] })
    ) as ConnectorStatus

    const connectorStatus = prepareConnectorStatus(persistedStatus)
    const result = boundTransactionEventQueue(connectorStatus)

    const queue = connectorStatus.transactionEventQueue
    assert.ok(queue != null)
    assert.deepEqual(result.removedEvents, [])
    assert.strictEqual(result.overLimit, false)
    assert.strictEqual(queue.length, 1)
    assert.strictEqual(queue[0].request.eventType, OCPP20TransactionEventEnumType.Ended)
    assert.strictEqual(queue[0].request.meterValue?.length, 2)
    assert.deepEqual(
      queue[0].request.meterValue.map(value => value.timestamp.getTime()),
      [0, 424_000]
    )
    assert.ok(result.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
  })

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

  await it('retains a protected lifecycle event intact above the byte cap', () => {
    const events = [
      {
        eventType: OCPP20TransactionEventEnumType.Started,
        transactionId: '00000000-0000-4000-8000-000000000210',
      },
      {
        eventType: OCPP20TransactionEventEnumType.Ended,
        transactionId: '00000000-0000-4000-8000-000000000211',
      },
    ] as const
    for (const [index, { eventType, transactionId }] of events.entries()) {
      const timestamp = new Date((6000 + index) * 1000)
      const request: OCPP20TransactionEventRequest = {
        eventType,
        evse: { connectorId: 2, id: 1 },
        idToken: {
          additionalInfo: Array.from({ length: 15_000 }, (_, additionalInfoIndex) => ({
            additionalIdToken: additionalInfoIndex.toString().padStart(36, '0'),
            type: 'x'.repeat(50),
          })),
          idToken: 'first-event-token',
          type: OCPP20IdTokenEnumType.Local,
        },
        meterValue: oversizedLifecycleMeterValues(timestamp),
        seqNo: index,
        timestamp,
        transactionInfo: { remoteStartId: 212 + index, transactionId },
        triggerReason:
          eventType === OCPP20TransactionEventEnumType.Started
            ? OCPP20TriggerReasonEnumType.RemoteStart
            : OCPP20TriggerReasonEnumType.StopAuthorized,
      }
      assertSchemaValid(request)
      const queuedEvent = toQueuedEvent(request)
      assert.ok(
        getTransactionEventQueueBytes([queuedEvent]) > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )
      const connectorStatus = {
        publicKeySentInTransaction: true,
        transactionId,
      } as ConnectorStatus

      const result = enqueueBoundedTransactionEvent(connectorStatus, queuedEvent)

      const queue = connectorStatus.transactionEventQueue
      assert.ok(queue != null)
      assert.strictEqual(queue.length, 1)
      assert.strictEqual(queue[0], queuedEvent)
      assert.deepEqual(result.removedEvents, [])
      assert.strictEqual(queue[0].request.eventType, eventType)
      assert.strictEqual(queue[0].request.seqNo, index)
      assert.strictEqual(queue[0].request.timestamp, timestamp)
      assert.strictEqual(
        queue[0].request.triggerReason,
        eventType === OCPP20TransactionEventEnumType.Started
          ? OCPP20TriggerReasonEnumType.RemoteStart
          : OCPP20TriggerReasonEnumType.StopAuthorized
      )
      assert.deepEqual(queue[0].request.transactionInfo, {
        remoteStartId: 212 + index,
        transactionId,
      })
      assert.deepEqual(queue[0].request.evse, { connectorId: 2, id: 1 })
      assert.strictEqual(queue[0].request.idToken, request.idToken)
      assert.strictEqual(queue[0].request.meterValue, request.meterValue)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
      assert.strictEqual(result.overLimit, true)
      assert.ok(result.bytes > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
      assert.strictEqual(result.bytes, getTransactionEventQueueBytes(queue))
      assertSchemaValid(queue[0].request)
    }
  })

  await it('preserves the public-key reservation when another queued frame retains the key', () => {
    const transactionId = '00000000-0000-4000-8000-000000000212'
    const retainedTimestamp = new Date(8_000_000)
    const retainedEvent = toQueuedEvent({
      eventType: OCPP20TransactionEventEnumType.Updated,
      meterValue: [
        {
          sampledValue: [
            {
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey: 'public-key',
                signedMeterData: 'signed-data',
                signingMethod: '',
              },
              value: 1,
            },
          ],
          timestamp: retainedTimestamp,
        },
      ],
      seqNo: 0,
      timestamp: retainedTimestamp,
      transactionInfo: { transactionId },
      triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
    })
    const protectedTimestamp = new Date(8_001_000)
    const protectedEvent = toQueuedEvent({
      eventType: OCPP20TransactionEventEnumType.Ended,
      meterValue: oversizedLifecycleMeterValues(protectedTimestamp),
      seqNo: 1,
      timestamp: protectedTimestamp,
      transactionInfo: { transactionId },
      triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
    })
    assertSchemaValid(retainedEvent.request)
    assertSchemaValid(protectedEvent.request)
    assert.ok(
      getTransactionEventQueueBytes([protectedEvent]) > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
    )
    const connectorStatus = {
      publicKeySentInTransaction: true,
      transactionEventQueue: [retainedEvent],
      transactionId,
    } as unknown as ConnectorStatus

    const result = enqueueBoundedTransactionEvent(connectorStatus, protectedEvent)

    const queue = connectorStatus.transactionEventQueue
    assert.ok(queue != null)
    assert.strictEqual(queue.length, 2)
    assert.strictEqual(queue[0], retainedEvent)
    assert.strictEqual(queue[1], protectedEvent)
    assert.strictEqual(protectedEvent.request.meterValue?.length, 1)
    assert.strictEqual(queuedTransactionEventHasPublicKey(retainedEvent, transactionId), true)
    assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
    assert.strictEqual(result.overLimit, true)
    assert.ok(result.bytes > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    assert.strictEqual(result.bytes, getTransactionEventQueueBytes(queue))
    assertSchemaValid(protectedEvent.request)
  })

  await it('retains a non-quantile signed Updated during the first compaction pass', () => {
    const transactionId = '00000000-0000-4000-8000-000000000221'
    const eventCount = Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH + 1
    const transactionEventQueue = Array.from({ length: eventCount }, (_, seqNo) => {
      const timestamp = new Date(seqNo * 1000)
      return toQueuedEvent({
        eventType: OCPP20TransactionEventEnumType.Updated,
        ...(seqNo === 1 && {
          meterValue: [
            {
              sampledValue: [
                {
                  measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                  signedMeterValue: {
                    encodingMethod: 'OCMF',
                    publicKey: 'public-key',
                    signedMeterData: 'signed-data',
                    signingMethod: '',
                  },
                  value: seqNo,
                },
              ],
              timestamp,
            },
          ],
        }),
        seqNo,
        timestamp,
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      })
    })
    const signedEvent = transactionEventQueue[1]
    const connectorStatus = {
      publicKeySentInTransaction: true,
      transactionEventQueue,
      transactionId,
    } as ConnectorStatus

    const result = boundTransactionEventQueue(connectorStatus)

    assert.ok(result.removedEvents.length > 0)
    assert.strictEqual(connectorStatus.transactionEventQueue?.includes(signedEvent), true)
    assert.strictEqual(queuedTransactionEventHasPublicKey(signedEvent, transactionId), true)
  })

  await it('does not transfer a public key into malformed persisted signed metadata', () => {
    const transactionId = '00000000-0000-4000-8000-000000000222'
    const eventCount = Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH + 1
    const transactionEventQueue = Array.from({ length: eventCount }, (_, seqNo) => {
      const timestamp = new Date(seqNo * 1000)
      return toQueuedEvent({
        eventType: OCPP20TransactionEventEnumType.Updated,
        ...(seqNo === 1 && {
          meterValue: [
            {
              sampledValue: [
                {
                  measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                  signedMeterValue: {
                    encodingMethod: 'OCMF',
                    publicKey: 'public-key',
                    signedMeterData: 'signed-data',
                    signingMethod: '',
                  },
                  value: seqNo,
                },
              ],
              timestamp,
            },
          ],
        }),
        ...(seqNo === eventCount - 1 && {
          meterValue: [
            {
              sampledValue: [
                {
                  measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                  signedMeterValue:
                    'malformed' as unknown as OCPP20SampledValue['signedMeterValue'],
                  value: seqNo,
                },
              ],
              timestamp,
            },
          ],
        }),
        seqNo,
        timestamp,
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      })
    })
    const persistedStatus = JSON.parse(
      JSON.stringify({
        publicKeySentInTransaction: true,
        transactionEventQueue,
        transactionId,
      })
    ) as ConnectorStatus
    const connectorStatus = prepareConnectorStatus(persistedStatus)
    const queue = connectorStatus.transactionEventQueue
    assert.ok(queue != null)
    const keyedEvent = queue.find(({ seqNo }) => seqNo === 1)
    const malformedEvent = queue.at(-1)
    assert.ok(keyedEvent != null)
    assert.ok(malformedEvent != null)

    assert.ok(queue.length < eventCount)
    assert.doesNotThrow(() => boundTransactionEventQueue(connectorStatus))

    assert.strictEqual(queue.includes(keyedEvent), true)
    assert.strictEqual(queue.includes(malformedEvent), true)
    assert.strictEqual(queuedTransactionEventHasPublicKey(keyedEvent, transactionId), true)
    assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
  })

  await it('reopens the active reservation when compaction removes a malformed raw key', () => {
    const transactionId = '00000000-0000-4000-8000-000000000224'
    const eventCount = Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH + 1
    const transactionEventQueue = Array.from({ length: eventCount }, (_, seqNo) => {
      const timestamp = new Date(seqNo * 1000)
      return toQueuedEvent({
        eventType: OCPP20TransactionEventEnumType.Updated,
        ...(seqNo === 1 && {
          meterValue: [
            {
              sampledValue: [
                {
                  measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                  signedMeterValue: {
                    publicKey: 'stale-public-key',
                  } as unknown as OCPP20SampledValue['signedMeterValue'],
                  value: seqNo,
                },
              ],
              timestamp,
            },
          ],
        }),
        seqNo,
        timestamp,
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      })
    })
    const malformedKeyEvent = transactionEventQueue[1]
    const connectorStatus = {
      publicKeySentInTransaction: true,
      transactionEventQueue,
      transactionId,
    } as ConnectorStatus

    const result = boundTransactionEventQueue(connectorStatus)

    assert.strictEqual(result.removedEvents.includes(malformedKeyEvent), true)
    assert.strictEqual(connectorStatus.transactionEventQueue?.includes(malformedKeyEvent), false)
    assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
  })

  await it('retains the final signed Updated candidate for every inactive transaction', () => {
    const firstTransactionId = '00000000-0000-4000-8000-000000000213'
    const secondTransactionId = '00000000-0000-4000-8000-000000000214'
    const eventCount = Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH + 4
    const transactionEventQueue = Array.from({ length: eventCount }, (_, seqNo) => {
      const transactionId = seqNo < 2 ? firstTransactionId : secondTransactionId
      const timestamp = new Date(seqNo * 1000)
      return toQueuedEvent({
        eventType: OCPP20TransactionEventEnumType.Updated,
        meterValue: [
          {
            sampledValue: [
              {
                measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                signedMeterValue: {
                  encodingMethod: 'OCMF',
                  publicKey: `public-key-${transactionId}`,
                  signedMeterData: `signed-data-${seqNo.toString()}`,
                  signingMethod: '',
                },
                value: seqNo,
              },
            ],
            timestamp,
          },
        ],
        seqNo,
        timestamp,
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      })
    })
    const firstTransactionFinalSignedEvent = transactionEventQueue[1]
    const secondTransactionFinalSignedEvent = transactionEventQueue[eventCount - 1]
    const connectorStatus = { transactionEventQueue } as ConnectorStatus

    const result = boundTransactionEventQueue(connectorStatus)

    assert.ok(result.removedEvents.length > 0)
    const boundedQueue = connectorStatus.transactionEventQueue
    assert.ok(boundedQueue != null)
    assert.ok(boundedQueue.length <= Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH)
    assert.ok(result.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    assert.strictEqual(boundedQueue.includes(firstTransactionFinalSignedEvent), true)
    assert.strictEqual(boundedQueue.includes(secondTransactionFinalSignedEvent), true)
  })

  await it('retains Started and Ended cores while compacting permitted Ended meter data', () => {
    const transactionId = '00000000-0000-4000-8000-000000000202'
    const startedRequest: OCPP20TransactionEventRequest = {
      eventType: OCPP20TransactionEventEnumType.Started,
      evse: { connectorId: 2, id: 1 },
      idToken: { idToken: 'first-event-token', type: OCPP20IdTokenEnumType.Local },
      meterValue: lifecycleMeterValues(0),
      seqNo: 0,
      timestamp: new Date(0),
      transactionInfo: { remoteStartId: 202, transactionId },
      triggerReason: OCPP20TriggerReasonEnumType.RemoteStart,
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
    assert.deepStrictEqual(queue, [startedEvent, endedEvent])
    assert.deepEqual(endedResult.removedEvents, [])
    assert.strictEqual(endedRequest.evse, undefined)
    assert.strictEqual(endedRequest.idToken, undefined)
    assert.strictEqual(endedRequest.transactionInfo.remoteStartId, undefined)
    assert.strictEqual(endedResult.overLimit, true)
    assert.ok(endedResult.bytes > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    assert.strictEqual(endedResult.bytes, getTransactionEventQueueBytes(queue))
    assert.strictEqual(hasQueuedEndedTransactionEvent(connectorStatus, transactionId), true)
    assert.strictEqual(queuedTransactionEventHasPublicKey(startedEvent, transactionId), true)
    assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
    assertSchemaValid(startedEvent.request)
    assertSchemaValid(endedEvent.request)

    const duplicateResult = enqueueBoundedTransactionEvent(connectorStatus, {
      ...endedEvent,
      request: { ...endedEvent.request },
    })
    assert.strictEqual(duplicateResult.inserted, false)
    assert.strictEqual(queue.length, 2)
    assert.strictEqual(duplicateResult.bytes, getTransactionEventQueueBytes(queue))

    assert.strictEqual(shiftBoundedTransactionEvent(connectorStatus)?.seqNo, 0)
    assert.strictEqual(hasQueuedEndedTransactionEvent(connectorStatus, transactionId), true)
    assert.strictEqual(shiftBoundedTransactionEvent(connectorStatus)?.seqNo, 1)
    assert.strictEqual(hasQueuedEndedTransactionEvent(connectorStatus, transactionId), false)
    const emptyResult = boundTransactionEventQueue(connectorStatus)
    assert.strictEqual(emptyResult.bytes, getTransactionEventQueueBytes([]))
  })

  await it('disposes the exact update and carries derivable active-transaction energy', () => {
    const transactionId = '00000000-0000-4000-8000-000000000206'
    const intervalEvent = (seqNo: number, value: number): QueuedTransactionEvent =>
      toQueuedEvent({
        eventType: OCPP20TransactionEventEnumType.Updated,
        meterValue: [
          {
            sampledValue: [
              {
                context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
                measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
                unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
                value,
              },
            ],
            timestamp: new Date(seqNo * 1000),
          },
        ],
        seqNo,
        timestamp: new Date(seqNo * 1000),
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      })
    const connectorStatus = {
      transactionEventQueue: [intervalEvent(1, 10), intervalEvent(2, 20)],
      transactionId,
    } as unknown as ConnectorStatus

    assert.strictEqual(shiftBoundedTransactionEvent(connectorStatus, true)?.seqNo, 1)

    const queue = connectorStatus.transactionEventQueue
    assert.ok(queue != null)
    assert.strictEqual(queue.length, 1)
    assert.strictEqual(queue[0].request.meterValue?.[0].sampledValue[0].value, 30)

    const signedEvent = intervalEvent(5, 40)
    const signedSample = signedEvent.request.meterValue?.[0].sampledValue[0]
    assert.ok(signedSample != null)
    signedSample.signedMeterValue = {
      encodingMethod: 'OCMF',
      publicKey: '',
      signedMeterData: 'signed-data',
      signingMethod: '',
    }
    const signedConnectorStatus = {
      transactionEventQueue: [signedEvent, intervalEvent(6, 50)],
      transactionId,
    } as unknown as ConnectorStatus
    assert.strictEqual(shiftBoundedTransactionEvent(signedConnectorStatus, true)?.seqNo, 5)
    const retainedSamples =
      signedConnectorStatus.transactionEventQueue?.[0].request.meterValue?.flatMap(
        meterValue => meterValue.sampledValue
      )
    if (retainedSamples == null) assert.fail('Expected retained interval samples')
    assert.deepStrictEqual(
      retainedSamples.map(sampledValue => sampledValue.value).sort((left, right) => left - right),
      [40, 50]
    )
    assert.ok(retainedSamples.some(sampledValue => sampledValue.signedMeterValue != null))

    assert.strictEqual(
      boundTransactionEventQueue(connectorStatus).bytes,
      getTransactionEventQueueBytes(queue)
    )

    const lastActiveEvent = intervalEvent(3, 30)
    lastActiveEvent.transactionEnergyActiveImportIntervalConsumption = { periodic: 30 }
    const activeConnectorStatus = {
      transactionEventQueue: [lastActiveEvent],
      transactionId,
    } as unknown as ConnectorStatus
    assert.strictEqual(shiftBoundedTransactionEvent(activeConnectorStatus, true)?.seqNo, 3)
    assert.strictEqual(activeConnectorStatus.transactionEventQueue?.length, 0)
    assert.strictEqual(
      activeConnectorStatus.transactionEnergyActiveImportIntervalCarry?.periodic,
      30
    )

    const legacyEvent = intervalEvent(4, 30)
    const historicalConnectorStatus = {
      transactionEventQueue: [legacyEvent],
    } as unknown as ConnectorStatus
    assert.strictEqual(shiftBoundedTransactionEvent(historicalConnectorStatus, true)?.seqNo, 4)
    assert.strictEqual(historicalConnectorStatus.transactionEventQueue?.length, 0)
    assert.strictEqual(
      historicalConnectorStatus.transactionEnergyActiveImportIntervalCarry,
      undefined
    )

    const zeroConnectorStatus = {
      transactionEventQueue: [intervalEvent(7, 0)],
      transactionId,
    } as unknown as ConnectorStatus
    assert.strictEqual(shiftBoundedTransactionEvent(zeroConnectorStatus, true)?.seqNo, 7)
    assert.strictEqual(zeroConnectorStatus.transactionEventQueue?.length, 0)
  })

  await it('compacts oldest Updated events to the byte target while retaining the latest update', () => {
    const transactionId = '00000000-0000-4000-8000-000000000211'
    const connectorStatus = {
      transactionEventQueue: Array.from({ length: 6 }, (_, seqNo) =>
        toQueuedEvent({
          customData: { payload: 'x'.repeat(300_000), vendorId: 'test' },
          eventType: OCPP20TransactionEventEnumType.Updated,
          seqNo,
          timestamp: new Date(seqNo * 1000),
          transactionInfo: { transactionId },
          triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        })
      ),
      transactionId,
    } as unknown as ConnectorStatus

    const result = boundTransactionEventQueue(connectorStatus)
    const queue = connectorStatus.transactionEventQueue

    assert.ok(queue != null)
    assert.strictEqual(result.overLimit, false)
    assert.ok(result.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    assert.ok(queue.length >= 1)
    assert.strictEqual(queue.at(-1)?.seqNo, 5)
    assert.ok(
      result.removedEvents.every(
        event => event.request.eventType === OCPP20TransactionEventEnumType.Updated
      )
    )
  })

  await it('evicts singleton Updated events from historical transactions to enforce the byte cap', () => {
    const connectorStatus = {
      transactionEventQueue: Array.from({ length: 4 }, (_, seqNo) =>
        toQueuedEvent({
          customData: { payload: 'x'.repeat(300_000), vendorId: 'test' },
          eventType: OCPP20TransactionEventEnumType.Updated,
          seqNo,
          timestamp: new Date(seqNo * 1000),
          transactionInfo: {
            transactionId: `00000000-0000-4000-8000-${seqNo.toString().padStart(12, '0')}`,
          },
          triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        })
      ),
    } as unknown as ConnectorStatus

    const result = boundTransactionEventQueue(connectorStatus)

    assert.strictEqual(result.overLimit, false)
    assert.ok(result.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    assert.ok((connectorStatus.transactionEventQueue?.length ?? 0) < 4)
  })

  await it('does not evict an in-flight replay while bounding a concurrent enqueue', () => {
    const transactionId = '00000000-0000-4000-8000-000000000210'
    const event = (seqNo: number, payloadSize: number): QueuedTransactionEvent =>
      toQueuedEvent({
        customData: { payload: 'x'.repeat(payloadSize), vendorId: 'test' },
        eventType: OCPP20TransactionEventEnumType.Updated,
        seqNo,
        timestamp: new Date(seqNo * 1000),
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      })
    const inFlightEvent = event(1, 900_000)
    const concurrentEvent = event(2, 300_000)
    const connectorStatus = {
      transactionEventQueue: [inFlightEvent, concurrentEvent],
      transactionId,
    } as unknown as ConnectorStatus
    setTransactionEventQueueInFlight(connectorStatus, inFlightEvent)
    try {
      boundTransactionEventQueue(connectorStatus, concurrentEvent)
    } finally {
      setTransactionEventQueueInFlight(connectorStatus)
    }

    assert.deepStrictEqual(connectorStatus.transactionEventQueue, [inFlightEvent, concurrentEvent])
  })

  await it('retains the protected newest update when it exceeds the byte cap', () => {
    const transactionId = '00000000-0000-4000-8000-000000000207'
    const baselineKey = 'AlignedDataCtrlr.Measurands'
    const request: OCPP20TransactionEventRequest = {
      eventType: OCPP20TransactionEventEnumType.Updated,
      idToken: {
        additionalInfo: Array.from({ length: 15_000 }, (_, index) => ({
          additionalIdToken: index.toString().padStart(36, '0'),
          type: 'x'.repeat(50),
        })),
        idToken: 'active-token',
        type: OCPP20IdTokenEnumType.Local,
      },
      meterValue: [
        {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
              value: 10,
            },
          ],
          timestamp: new Date(5_000),
        },
      ],
      seqNo: 5,
      timestamp: new Date(5_000),
      transactionInfo: { transactionId },
      triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
    }
    const event = {
      ...toQueuedEvent(request),
      transactionEnergyActiveImportIntervalConsumption: { [baselineKey]: 10 },
    }
    assert.ok(getTransactionEventQueueBytes([event]) > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    const connectorStatus = { transactionId } as ConnectorStatus

    const result = enqueueBoundedTransactionEvent(connectorStatus, event)

    assert.deepStrictEqual(result.removedEvents, [])
    assert.deepStrictEqual(connectorStatus.transactionEventQueue, [event])
    assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
    assert.strictEqual(result.overLimit, true)
  })
})
