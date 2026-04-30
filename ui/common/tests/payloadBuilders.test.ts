import assert from 'node:assert'
import { describe, it } from 'node:test'

import {
  OCPP20IdTokenEnumType,
  OCPP20TransactionEventEnumType,
  OCPPVersion,
} from '../src/types/ChargingStationType.js'
import { ProcedureName } from '../src/types/UIProtocol.js'
import {
  buildAuthorizePayload,
  buildIdToken,
  buildStartTransactionPayload,
  buildStopTransactionPayload,
  isOCPP20x,
} from '../src/utils/payloadBuilders.js'

await describe('payloadBuilders', async () => {
  await describe('isOCPP20x', async () => {
    await it('should return true for VERSION_20', () => {
      assert.strictEqual(isOCPP20x(OCPPVersion.VERSION_20), true)
    })

    await it('should return true for VERSION_201', () => {
      assert.strictEqual(isOCPP20x(OCPPVersion.VERSION_201), true)
    })

    await it('should return false for VERSION_16', () => {
      assert.strictEqual(isOCPP20x(OCPPVersion.VERSION_16), false)
    })

    await it('should return false for undefined', () => {
      assert.strictEqual(isOCPP20x(undefined), false)
    })
  })

  await describe('buildAuthorizePayload', async () => {
    await it('should build flat idTag payload for OCPP 1.6', () => {
      const result = buildAuthorizePayload('RFID123', OCPPVersion.VERSION_16)
      assert.deepStrictEqual(result, { idTag: 'RFID123' })
    })

    await it('should build idToken payload for OCPP 2.0', () => {
      const result = buildAuthorizePayload('RFID123', OCPPVersion.VERSION_20)
      assert.deepStrictEqual(result, {
        idToken: { idToken: 'RFID123', type: OCPP20IdTokenEnumType.ISO14443 },
      })
    })

    await it('should build idToken payload for OCPP 2.0.1', () => {
      const result = buildAuthorizePayload('RFID123', OCPPVersion.VERSION_201)
      assert.deepStrictEqual(result, {
        idToken: { idToken: 'RFID123', type: OCPP20IdTokenEnumType.ISO14443 },
      })
    })

    await it('should default to OCPP 1.6 format when version is undefined', () => {
      const result = buildAuthorizePayload('RFID123', undefined)
      assert.deepStrictEqual(result, { idTag: 'RFID123' })
    })

    await it('should throw on unsupported OCPP version', () => {
      assert.throws(
        () => buildAuthorizePayload('RFID123', '3.0' as unknown as OCPPVersion),
        (error: Error) => error.message.includes('Unsupported OCPP version')
      )
    })
  })

  await describe('buildStartTransactionPayload', async () => {
    await it('should build OCPP 1.6 payload with startTransaction procedure', () => {
      const result = buildStartTransactionPayload(1, OCPPVersion.VERSION_16, { idTag: 'TAG1' })
      assert.deepStrictEqual(result, {
        payload: { connectorId: 1, idTag: 'TAG1' },
        procedureName: ProcedureName.START_TRANSACTION,
      })
    })

    await it('should build OCPP 2.0.1 payload with transactionEvent procedure', () => {
      const result = buildStartTransactionPayload(1, OCPPVersion.VERSION_201, { idTag: 'TAG1' })
      assert.deepStrictEqual(result, {
        payload: {
          connectorId: 1,
          eventType: OCPP20TransactionEventEnumType.STARTED,
          idToken: { idToken: 'TAG1', type: OCPP20IdTokenEnumType.ISO14443 },
        },
        procedureName: ProcedureName.TRANSACTION_EVENT,
      })
    })

    await it('should include evseId for OCPP 2.0.x when provided', () => {
      const result = buildStartTransactionPayload(1, OCPPVersion.VERSION_201, {
        evseId: 2,
        idTag: 'TAG1',
      })
      assert.deepStrictEqual(result, {
        payload: {
          connectorId: 1,
          eventType: OCPP20TransactionEventEnumType.STARTED,
          evseId: 2,
          idToken: { idToken: 'TAG1', type: OCPP20IdTokenEnumType.ISO14443 },
        },
        procedureName: ProcedureName.TRANSACTION_EVENT,
      })
    })

    await it('should not include evseId for OCPP 1.6 even if provided', () => {
      const result = buildStartTransactionPayload(1, OCPPVersion.VERSION_16, {
        evseId: 2,
        idTag: 'TAG1',
      })
      assert.deepStrictEqual(result, {
        payload: { connectorId: 1, idTag: 'TAG1' },
        procedureName: ProcedureName.START_TRANSACTION,
      })
    })

    await it('should omit idTag/idToken when not provided', () => {
      const result = buildStartTransactionPayload(1, OCPPVersion.VERSION_201)
      assert.deepStrictEqual(result, {
        payload: {
          connectorId: 1,
          eventType: OCPP20TransactionEventEnumType.STARTED,
        },
        procedureName: ProcedureName.TRANSACTION_EVENT,
      })
    })
  })

  await describe('buildStopTransactionPayload', async () => {
    await it('should build OCPP 1.6 payload with stopTransaction procedure', () => {
      const result = buildStopTransactionPayload(12345, OCPPVersion.VERSION_16)
      assert.deepStrictEqual(result, {
        payload: { transactionId: 12345 },
        procedureName: ProcedureName.STOP_TRANSACTION,
      })
    })

    await it('should build OCPP 2.0.1 payload with transactionEvent procedure', () => {
      const result = buildStopTransactionPayload('uuid-123', OCPPVersion.VERSION_201, 1)
      assert.deepStrictEqual(result, {
        payload: {
          connectorId: 1,
          eventType: OCPP20TransactionEventEnumType.ENDED,
          transactionId: 'uuid-123',
        },
        procedureName: ProcedureName.TRANSACTION_EVENT,
      })
    })

    await it('should convert numeric transactionId to string for OCPP 2.0.x', () => {
      const result = buildStopTransactionPayload(99, OCPPVersion.VERSION_201, 1)
      assert.strictEqual((result.payload as Record<string, unknown>).transactionId, '99')
    })

    await it('should omit connectorId for OCPP 2.0.x when not provided', () => {
      const result = buildStopTransactionPayload('uuid-123', OCPPVersion.VERSION_201)
      assert.strictEqual((result.payload as Record<string, unknown>).connectorId, undefined)
    })
  })

  await describe('buildIdToken', async () => {
    await it('should build idToken with default ISO14443 type', () => {
      assert.deepStrictEqual(buildIdToken('TAG1'), {
        idToken: 'TAG1',
        type: OCPP20IdTokenEnumType.ISO14443,
      })
    })

    await it('should build idToken with custom type', () => {
      assert.deepStrictEqual(buildIdToken('TAG1', OCPP20IdTokenEnumType.CENTRAL), {
        idToken: 'TAG1',
        type: OCPP20IdTokenEnumType.CENTRAL,
      })
    })
  })
})
