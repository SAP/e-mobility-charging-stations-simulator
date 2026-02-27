import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
} from '../../../../src/types/index.js'
import {
  OCPP20ChargingStateEnumType,
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenType,
  type OCPP20TransactionContext,
} from '../../../../src/types/ocpp/2.0/Transaction.js'
import { generateUUID } from '../../../../src/utils/index.js'
import {
  createMockOCPP20TransactionTestStation,
  resetConnectorTransactionState,
  resetLimits,
} from './OCPP20TestUtils.js'

/**
 * E03 IdToken-First Transaction Flow Tests (OCPP 2.0.1)
 *
 * Tests the IdToken-first pre-authorization flow where a user presents
 * their ID token BEFORE connecting the cable.
 *
 * Key E03 Functional Requirements:
 * - E03.FR.01: When IdToken presented first, CS SHALL verify with CSMS
 * - E03.FR.02: CSMS SHALL verify IdToken validity
 * - E03.FR.05: CS SHALL handle EVConnectionTimeOut
 * - E03.FR.06: If cable not connected within timeout, CS SHALL cancel authorization
 * - E03.FR.13: triggerReason SHALL be Authorized for IdToken-first
 *
 * Key Difference from E02 (Cable-First):
 * - E03: Authorization -> Cable connection -> Charging
 * - E02: Cable connection -> EV detection -> Authorization -> Charging
 */
await describe('E03 - IdToken-First Pre-Authorization Flow', async () => {
  const mockChargingStation = createMockOCPP20TransactionTestStation()

  // Reset limits and state before tests
  resetLimits(mockChargingStation)

  afterEach(() => {
    resetConnectorTransactionState(mockChargingStation)
  })

  // =========================================================================
  // E03.FR.13: Trigger Reason Selection for IdToken-First
  // =========================================================================
  await describe('E03.FR.13 - Trigger Reason Selection', async () => {
    await it('Should select Authorized trigger for IdToken-first transaction start', () => {
      // E03.FR.13: triggerReason SHALL be Authorized for IdToken-first
      const context: OCPP20TransactionContext = {
        authorizationMethod: 'idToken',
        source: 'local_authorization',
      }

      const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
        OCPP20TransactionEventEnumType.Started,
        context
      )

      expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.Authorized)
    })

    await it('Should select groupIdToken trigger for group authorization', () => {
      const context: OCPP20TransactionContext = {
        authorizationMethod: 'groupIdToken',
        source: 'local_authorization',
      }

      const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
        OCPP20TransactionEventEnumType.Started,
        context
      )

      expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.Authorized)
    })

    await it('Should differentiate IdToken-first from Cable-first by trigger reason', () => {
      // IdToken-first: Authorized trigger
      const idTokenFirstContext: OCPP20TransactionContext = {
        authorizationMethod: 'idToken',
        source: 'local_authorization',
      }

      // Cable-first: CablePluggedIn trigger
      const cableFirstContext: OCPP20TransactionContext = {
        cableState: 'plugged_in',
        source: 'cable_action',
      }

      const idTokenTrigger = OCPP20ServiceUtils.selectTriggerReason(
        OCPP20TransactionEventEnumType.Started,
        idTokenFirstContext
      )

      const cableTrigger = OCPP20ServiceUtils.selectTriggerReason(
        OCPP20TransactionEventEnumType.Started,
        cableFirstContext
      )

      expect(idTokenTrigger).toBe(OCPP20TriggerReasonEnumType.Authorized)
      expect(cableTrigger).toBe(OCPP20TriggerReasonEnumType.CablePluggedIn)
      expect(idTokenTrigger).not.toBe(cableTrigger)
    })
  })

  // =========================================================================
  // E03.FR.01: IdToken Inclusion in TransactionEvent
  // =========================================================================
  await describe('E03.FR.01 - IdToken in TransactionEvent', async () => {
    await it('Should include idToken in first TransactionEvent after authorization', () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const idToken: OCPP20IdTokenType = {
        idToken: 'VALID_TOKEN_E03_001',
        type: OCPP20IdTokenEnumType.ISO14443,
      }

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Build Started event with idToken (E03.FR.01: IdToken must be in first event)
      const startedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId,
        { idToken }
      )

      expect(startedEvent.idToken).toBeDefined()
      expect(startedEvent.idToken?.idToken).toBe('VALID_TOKEN_E03_001')
      expect(startedEvent.idToken?.type).toBe(OCPP20IdTokenEnumType.ISO14443)
      expect(startedEvent.eventType).toBe(OCPP20TransactionEventEnumType.Started)
      expect(startedEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.Authorized)
    })

    await it('Should not include idToken in subsequent events (E03.FR.01 compliance)', () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const idToken: OCPP20IdTokenType = {
        idToken: 'VALID_TOKEN_E03_002',
        type: OCPP20IdTokenEnumType.ISO14443,
      }

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // First event includes idToken
      const startedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId,
        { idToken }
      )

      // Second event should NOT include idToken (flag is set after first inclusion)
      const updatedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.ChargingStateChanged,
        connectorId,
        transactionId,
        { chargingState: OCPP20ChargingStateEnumType.Charging, idToken }
      )

      expect(startedEvent.idToken).toBeDefined()
      expect(updatedEvent.idToken).toBeUndefined()
    })

    await it('Should support various IdToken types for E03 flow', () => {
      const connectorId = 1
      const transactionId = generateUUID()

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Test ISO14443 (RFID)
      const rfidToken: OCPP20IdTokenType = {
        idToken: 'RFID_TAG_123456',
        type: OCPP20IdTokenEnumType.ISO14443,
      }

      const rfidEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId,
        { idToken: rfidToken }
      )

      expect(rfidEvent.idToken?.type).toBe(OCPP20IdTokenEnumType.ISO14443)

      // Reset for eMAID test
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)
      const connectorStatus = mockChargingStation.getConnectorStatus(connectorId)
      if (connectorStatus != null) {
        connectorStatus.transactionIdTokenSent = undefined
      }

      // Test eMAID (contract identifier)
      const emaidToken: OCPP20IdTokenType = {
        idToken: 'DE*ABC*E123456*1',
        type: OCPP20IdTokenEnumType.eMAID,
      }

      const emaidEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        generateUUID(),
        { idToken: emaidToken }
      )

      expect(emaidEvent.idToken?.type).toBe(OCPP20IdTokenEnumType.eMAID)
      expect(emaidEvent.idToken?.idToken).toBe('DE*ABC*E123456*1')
    })
  })

  // =========================================================================
  // Full E03 IdToken-First Transaction Lifecycle
  // =========================================================================
  await describe('Full IdToken-First Transaction Lifecycle', async () => {
    await it('Should support complete IdToken-first to cable to charging to end flow', () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const idToken: OCPP20IdTokenType = {
        idToken: 'LIFECYCLE_TOKEN_001',
        type: OCPP20IdTokenEnumType.ISO14443,
      }

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // E03 Step 1: IdToken presented and authorized (Started with Authorized trigger)
      const authorizedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId,
        { idToken }
      )

      // E03 Step 2: Cable connected (Updated event)
      const cableConnectedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.CablePluggedIn,
        connectorId,
        transactionId
      )

      // E03 Step 3: Charging starts
      const chargingEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.ChargingStateChanged,
        connectorId,
        transactionId,
        { chargingState: OCPP20ChargingStateEnumType.Charging }
      )

      // E03 Step 4: Transaction ends
      const endedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.StopAuthorized,
        connectorId,
        transactionId
      )

      // Validate event sequence
      expect(authorizedEvent.eventType).toBe(OCPP20TransactionEventEnumType.Started)
      expect(authorizedEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.Authorized)
      expect(authorizedEvent.idToken).toBeDefined()
      expect(authorizedEvent.seqNo).toBe(0)

      expect(cableConnectedEvent.eventType).toBe(OCPP20TransactionEventEnumType.Updated)
      expect(cableConnectedEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.CablePluggedIn)
      expect(cableConnectedEvent.idToken).toBeUndefined() // E03.FR.01: idToken only in first event
      expect(cableConnectedEvent.seqNo).toBe(1)

      expect(chargingEvent.eventType).toBe(OCPP20TransactionEventEnumType.Updated)
      expect(chargingEvent.seqNo).toBe(2)

      expect(endedEvent.eventType).toBe(OCPP20TransactionEventEnumType.Ended)
      expect(endedEvent.seqNo).toBe(3)

      // All events share same transaction ID
      expect(authorizedEvent.transactionInfo.transactionId).toBe(transactionId)
      expect(cableConnectedEvent.transactionInfo.transactionId).toBe(transactionId)
      expect(chargingEvent.transactionInfo.transactionId).toBe(transactionId)
      expect(endedEvent.transactionInfo.transactionId).toBe(transactionId)
    })

    await it('Should differentiate E03 lifecycle from E02 Cable-First lifecycle', () => {
      const connectorId = 1
      const e03TransactionId = generateUUID()
      const e02TransactionId = generateUUID()
      const idToken: OCPP20IdTokenType = {
        idToken: 'COMPARE_TOKEN_001',
        type: OCPP20IdTokenEnumType.ISO14443,
      }

      // E03 IdToken-First: Starts with Authorized trigger
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)
      const connectorStatus = mockChargingStation.getConnectorStatus(connectorId)
      if (connectorStatus != null) {
        connectorStatus.transactionIdTokenSent = undefined
      }

      const e03Start = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        e03TransactionId,
        { idToken }
      )

      // E02 Cable-First: Starts with CablePluggedIn trigger
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)
      if (connectorStatus != null) {
        connectorStatus.transactionIdTokenSent = undefined
      }

      const e02Start = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.CablePluggedIn,
        connectorId,
        e02TransactionId
      )

      // Key difference: E03 starts with Authorized, E02 starts with CablePluggedIn
      expect(e03Start.triggerReason).toBe(OCPP20TriggerReasonEnumType.Authorized)
      expect(e02Start.triggerReason).toBe(OCPP20TriggerReasonEnumType.CablePluggedIn)

      // E03 includes idToken in first event, E02 may not
      expect(e03Start.idToken).toBeDefined()
      expect(e02Start.idToken).toBeUndefined()
    })
  })

  // =========================================================================
  // E03.FR.05/06: EVConnectionTimeOut Handling
  // =========================================================================
  await describe('E03.FR.05/06 - EVConnectionTimeOut', async () => {
    await it('Should support authorization cancellation event (cable not connected)', () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const idToken: OCPP20IdTokenType = {
        idToken: 'TIMEOUT_TOKEN_001',
        type: OCPP20IdTokenEnumType.ISO14443,
      }

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // E03.FR.05: User authorizes with IdToken
      const authorizedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId,
        { idToken }
      )

      // E03.FR.06: Cable not connected within timeout - transaction ends with Timeout
      const timeoutEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.EVConnectTimeout,
        connectorId,
        transactionId
      )

      expect(authorizedEvent.eventType).toBe(OCPP20TransactionEventEnumType.Started)
      expect(authorizedEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.Authorized)

      expect(timeoutEvent.eventType).toBe(OCPP20TransactionEventEnumType.Ended)
      expect(timeoutEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.EVConnectTimeout)
      expect(timeoutEvent.seqNo).toBe(1)

      // Same transaction ID for both events
      expect(authorizedEvent.transactionInfo.transactionId).toBe(
        timeoutEvent.transactionInfo.transactionId
      )
    })

    await it('Should track sequence numbers correctly for timeout scenario', () => {
      const connectorId = 1
      const transactionId = generateUUID()

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Started (seqNo: 0)
      const startEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )

      // Ended due to timeout (seqNo: 1)
      const endEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.EVConnectTimeout,
        connectorId,
        transactionId
      )

      expect(startEvent.seqNo).toBe(0)
      expect(endEvent.seqNo).toBe(1)
    })
  })

  // =========================================================================
  // Authorization Status Handling
  // =========================================================================
  await describe('Authorization Status in E03 Flow', async () => {
    await it('Should support Deauthorized trigger for rejected authorization', () => {
      const context: OCPP20TransactionContext = {
        authorizationMethod: 'idToken',
        isDeauthorized: true,
        source: 'local_authorization',
      }

      const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
        OCPP20TransactionEventEnumType.Ended,
        context
      )

      expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.Deauthorized)
    })

    await it('Should handle transaction end after token revocation', () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const idToken: OCPP20IdTokenType = {
        idToken: 'REVOKED_TOKEN_001',
        type: OCPP20IdTokenEnumType.ISO14443,
      }

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Transaction started with authorization
      const startEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId,
        { idToken }
      )

      // Transaction ended due to deauthorization (e.g., token revoked mid-session)
      const revokedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.Deauthorized,
        connectorId,
        transactionId
      )

      expect(startEvent.eventType).toBe(OCPP20TransactionEventEnumType.Started)
      expect(revokedEvent.eventType).toBe(OCPP20TransactionEventEnumType.Ended)
      expect(revokedEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.Deauthorized)
    })

    await it('Should support StopAuthorized trigger for normal transaction end', () => {
      const context: OCPP20TransactionContext = {
        authorizationMethod: 'stopAuthorized',
        source: 'local_authorization',
      }

      const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
        OCPP20TransactionEventEnumType.Ended,
        context
      )

      expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.StopAuthorized)
    })
  })

  // =========================================================================
  // E03.FR.07/08: Sequence Numbers and Transaction ID
  // =========================================================================
  await describe('E03.FR.07/08 - Sequence Numbers and Transaction ID', async () => {
    await it('Should maintain continuous sequence numbers throughout E03 lifecycle', () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const idToken: OCPP20IdTokenType = {
        idToken: 'SEQ_TOKEN_001',
        type: OCPP20IdTokenEnumType.ISO14443,
      }

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      const events = [
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId,
          { idToken }
        ),
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.CablePluggedIn,
          connectorId,
          transactionId
        ),
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.ChargingStateChanged,
          connectorId,
          transactionId
        ),
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        ),
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        ),
      ]

      // E03.FR.07: Sequence numbers must be continuous
      events.forEach((event, index) => {
        expect(event.seqNo).toBe(index)
      })
    })

    await it('Should use unique transaction ID (E03.FR.08)', () => {
      const connectorId = 1

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      const transaction1Id = generateUUID()
      const transaction2Id = generateUUID()

      // E03.FR.08: transactionId MUST be unique
      expect(transaction1Id).not.toBe(transaction2Id)

      const event1 = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transaction1Id
      )

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      const event2 = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transaction2Id
      )

      expect(event1.transactionInfo.transactionId).toBe(transaction1Id)
      expect(event2.transactionInfo.transactionId).toBe(transaction2Id)
      expect(event1.transactionInfo.transactionId).not.toBe(event2.transactionInfo.transactionId)
    })
  })

  // =========================================================================
  // Multiple Connector Independence
  // =========================================================================
  await describe('Multiple Connector Independence in E03 Flow', async () => {
    await it('Should handle independent E03 transactions on different connectors', () => {
      const connector1 = 1
      const connector2 = 2
      const transaction1Id = generateUUID()
      const transaction2Id = generateUUID()
      const token1: OCPP20IdTokenType = {
        idToken: 'USER_A_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      }
      const token2: OCPP20IdTokenType = {
        idToken: 'USER_B_TOKEN',
        type: OCPP20IdTokenEnumType.eMAID,
      }

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connector1)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connector2)

      // User A authorizes on connector 1
      const conn1Event1 = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connector1,
        transaction1Id,
        { idToken: token1 }
      )

      // User B authorizes on connector 2
      const conn2Event1 = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connector2,
        transaction2Id,
        { idToken: token2 }
      )

      // User A plugs cable
      const conn1Event2 = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.CablePluggedIn,
        connector1,
        transaction1Id
      )

      // User B plugs cable
      const conn2Event2 = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.CablePluggedIn,
        connector2,
        transaction2Id
      )

      // Verify independent sequence numbers
      expect(conn1Event1.seqNo).toBe(0)
      expect(conn1Event2.seqNo).toBe(1)
      expect(conn2Event1.seqNo).toBe(0)
      expect(conn2Event2.seqNo).toBe(1)

      // Verify independent transaction IDs
      expect(conn1Event1.transactionInfo.transactionId).toBe(transaction1Id)
      expect(conn2Event1.transactionInfo.transactionId).toBe(transaction2Id)
      expect(transaction1Id).not.toBe(transaction2Id)

      // Verify independent idTokens
      expect(conn1Event1.idToken?.idToken).toBe('USER_A_TOKEN')
      expect(conn2Event1.idToken?.idToken).toBe('USER_B_TOKEN')
    })
  })
})
