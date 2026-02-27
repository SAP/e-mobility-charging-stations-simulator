/**
 * @file Tests for OCPP20ServiceUtils TransactionEvent CableFirst
 * @description Unit tests for OCPP 2.0 cable-first transaction flow (E02)
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  ConnectorStatusEnum,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
} from '../../../../src/types/index.js'
import {
  OCPP20ChargingStateEnumType,
  type OCPP20TransactionContext,
} from '../../../../src/types/ocpp/2.0/Transaction.js'
import { generateUUID } from '../../../../src/utils/index.js'
import {
  createMockOCPP20TransactionTestStation,
  resetConnectorTransactionState,
  resetLimits,
} from './OCPP20TestUtils.js'

/**
 * E02 - Cable-First Transaction Flow Tests
 *
 * Tests for the Cable-First (Plug-in First) transaction pattern where:
 * 1. User plugs in the cable (CablePluggedIn)
 * 2. EV is detected (EVDetected)
 * 3. Authorization occurs (Authorized or implicit)
 * 4. Charging starts (ChargingStateChanged)
 * 5. Charging ends (StopAuthorized or EVDeparted)
 *
 * These tests verify the full transaction lifecycle, not just trigger reason selection
 * (which is tested in OCPP20ServiceUtils-TransactionEvent.test.ts).
 *
 * FR References:
 * - E02.FR.01: Cable plug event triggers transaction start consideration
 * - E02.FR.02: EVDetected indicates vehicle presence for charging readiness
 * - E02.FR.03: Connector status transitions reflect cable state changes
 */
await describe('E02 - Cable-First Transaction Flow', async () => {
  const mockChargingStation = createMockOCPP20TransactionTestStation()

  // Reset limits and state before tests
  resetLimits(mockChargingStation)

  afterEach(() => {
    resetConnectorTransactionState(mockChargingStation)
  })

  // =========================================================================
  // E02.FR.01: Cable Plug Event Flow Tests
  // =========================================================================
  await describe('Cable Plug Event Sequencing', async () => {
    await it('should generate CablePluggedIn event as first event in cable-first flow', () => {
      const connectorId = 1
      const transactionId = generateUUID()

      // Reset sequence number for new transaction
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Build the cable plug event (first event in cable-first flow)
      const cablePluggedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.CablePluggedIn,
        connectorId,
        transactionId
      )

      // Assert: First event should have seqNo 0
      expect(cablePluggedEvent.eventType).toBe(OCPP20TransactionEventEnumType.Started)
      expect(cablePluggedEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.CablePluggedIn)
      expect(cablePluggedEvent.seqNo).toBe(0)
      expect(cablePluggedEvent.transactionInfo.transactionId).toBe(transactionId)
    })

    await it('should sequence CablePluggedIn → EVDetected → Charging correctly', () => {
      const connectorId = 1
      const transactionId = generateUUID()

      // Reset sequence for new transaction
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Step 1: Cable plugged in (Started)
      const cablePluggedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.CablePluggedIn,
        connectorId,
        transactionId
      )

      // Step 2: EV detected (Updated)
      const evDetectedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.EVDetected,
        connectorId,
        transactionId
      )

      // Step 3: Charging starts (Updated with ChargingStateChanged)
      const chargingStartedEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.ChargingStateChanged,
        connectorId,
        transactionId,
        { chargingState: OCPP20ChargingStateEnumType.Charging }
      )

      // Assert sequence numbers follow correct order
      expect(cablePluggedEvent.seqNo).toBe(0)
      expect(evDetectedEvent.seqNo).toBe(1)
      expect(chargingStartedEvent.seqNo).toBe(2)

      // Assert all events share the same transaction ID
      expect(cablePluggedEvent.transactionInfo.transactionId).toBe(transactionId)
      expect(evDetectedEvent.transactionInfo.transactionId).toBe(transactionId)
      expect(chargingStartedEvent.transactionInfo.transactionId).toBe(transactionId)

      // Assert event types match expected pattern
      expect(cablePluggedEvent.eventType).toBe(OCPP20TransactionEventEnumType.Started)
      expect(evDetectedEvent.eventType).toBe(OCPP20TransactionEventEnumType.Updated)
      expect(chargingStartedEvent.eventType).toBe(OCPP20TransactionEventEnumType.Updated)
    })

    await it('should handle EVDeparted for cable removal ending transaction', () => {
      const connectorId = 2
      const transactionId = generateUUID()

      // Reset and setup transaction
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Start transaction with cable plug
      const startEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.CablePluggedIn,
        connectorId,
        transactionId
      )

      // End transaction with EV departure (cable removal)
      const endEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.EVDeparted,
        connectorId,
        transactionId
      )

      // Assert proper sequencing for cable-initiated start and end
      expect(startEvent.seqNo).toBe(0)
      expect(startEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.CablePluggedIn)
      expect(endEvent.seqNo).toBe(1)
      expect(endEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.EVDeparted)
      expect(endEvent.eventType).toBe(OCPP20TransactionEventEnumType.Ended)
    })
  })

  // =========================================================================
  // E02.FR.02: EV Detection Flow Tests
  // =========================================================================
  await describe('EV Detection Flow', async () => {
    await it('should include EVDetected between cable plug and charging start', () => {
      const connectorId = 1
      const transactionId = generateUUID()

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Build full cable-first flow
      const events = [
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.CablePluggedIn,
          connectorId,
          transactionId
        ),
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.EVDetected,
          connectorId,
          transactionId
        ),
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        ),
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.ChargingStateChanged,
          connectorId,
          transactionId,
          { chargingState: OCPP20ChargingStateEnumType.Charging }
        ),
      ]

      // Assert EVDetected comes after CablePluggedIn and before authorization
      expect(events[0].triggerReason).toBe(OCPP20TriggerReasonEnumType.CablePluggedIn)
      expect(events[1].triggerReason).toBe(OCPP20TriggerReasonEnumType.EVDetected)
      expect(events[2].triggerReason).toBe(OCPP20TriggerReasonEnumType.Authorized)
      expect(events[3].triggerReason).toBe(OCPP20TriggerReasonEnumType.ChargingStateChanged)

      // Assert continuous sequence numbers
      for (let i = 0; i < events.length; i++) {
        expect(events[i].seqNo).toBe(i)
      }
    })
  })

  // =========================================================================
  // E02.FR.03: Connector Status Transitions
  // =========================================================================
  await describe('Connector Status Transitions', async () => {
    await it('should track connector status through cable-first lifecycle', () => {
      const connectorId = 1

      // Get connector status object
      const connectorStatus = mockChargingStation.getConnectorStatus(connectorId)
      expect(connectorStatus).toBeDefined()
      if (connectorStatus == null) {
        throw new Error('Connector status should be defined')
      }

      // Initial state: Available
      connectorStatus.status = ConnectorStatusEnum.Available
      expect(connectorStatus.status).toBe(ConnectorStatusEnum.Available)

      // After cable plug: Preparing (implied by transaction start)
      connectorStatus.status = ConnectorStatusEnum.Preparing
      connectorStatus.transactionStarted = true
      expect(connectorStatus.status).toBe(ConnectorStatusEnum.Preparing)
      expect(connectorStatus.transactionStarted).toBe(true)

      // After EV detected and auth: Charging
      connectorStatus.status = ConnectorStatusEnum.Charging
      expect(connectorStatus.status).toBe(ConnectorStatusEnum.Charging)

      // After EV departed: Available again
      connectorStatus.status = ConnectorStatusEnum.Available
      connectorStatus.transactionStarted = false
      expect(connectorStatus.status).toBe(ConnectorStatusEnum.Available)
      expect(connectorStatus.transactionStarted).toBe(false)
    })

    await it('should preserve transaction ID through cable-first flow states', () => {
      const connectorId = 2
      const transactionId = generateUUID()

      const connectorStatus = mockChargingStation.getConnectorStatus(connectorId)
      expect(connectorStatus).toBeDefined()
      if (connectorStatus == null) {
        throw new Error('Connector status should be defined')
      }

      // Set transaction ID at start
      connectorStatus.transactionId = transactionId
      connectorStatus.transactionStarted = true
      connectorStatus.status = ConnectorStatusEnum.Preparing

      // Transition to charging
      connectorStatus.status = ConnectorStatusEnum.Charging

      // Transaction ID should persist through state changes
      expect(connectorStatus.transactionId).toBe(transactionId)
      expect(connectorStatus.transactionStarted).toBe(true)

      // Transition to finished
      connectorStatus.status = ConnectorStatusEnum.Finishing

      // Still same transaction until fully ended
      expect(connectorStatus.transactionId).toBe(transactionId)
    })
  })

  // =========================================================================
  // Full E02 Transaction Lifecycle Tests
  // =========================================================================
  await describe('Full Cable-First Transaction Lifecycle', async () => {
    await it('should support complete cable-first → charging → cable-removal flow', () => {
      const connectorId = 1
      const transactionId = generateUUID()

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Build complete cable-first transaction lifecycle
      const lifecycle = {
        cablePlugged: OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.CablePluggedIn,
          connectorId,
          transactionId
        ),
        charging: OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.ChargingStateChanged,
          connectorId,
          transactionId,
          { chargingState: OCPP20ChargingStateEnumType.Charging }
        ),
        evDeparted: OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.EVDeparted,
          connectorId,
          transactionId
        ),
      }

      // Validate lifecycle event sequence
      expect(lifecycle.cablePlugged.eventType).toBe(OCPP20TransactionEventEnumType.Started)
      expect(lifecycle.charging.eventType).toBe(OCPP20TransactionEventEnumType.Updated)
      expect(lifecycle.evDeparted.eventType).toBe(OCPP20TransactionEventEnumType.Ended)

      // Validate sequence numbers
      expect(lifecycle.cablePlugged.seqNo).toBe(0)
      expect(lifecycle.charging.seqNo).toBe(1)
      expect(lifecycle.evDeparted.seqNo).toBe(2)

      // Validate trigger reasons match cable-first pattern
      expect(lifecycle.cablePlugged.triggerReason).toBe(OCPP20TriggerReasonEnumType.CablePluggedIn)
      expect(lifecycle.charging.triggerReason).toBe(
        OCPP20TriggerReasonEnumType.ChargingStateChanged
      )
      expect(lifecycle.evDeparted.triggerReason).toBe(OCPP20TriggerReasonEnumType.EVDeparted)

      // All events should share same transaction ID
      expect(lifecycle.cablePlugged.transactionInfo.transactionId).toBe(transactionId)
      expect(lifecycle.charging.transactionInfo.transactionId).toBe(transactionId)
      expect(lifecycle.evDeparted.transactionInfo.transactionId).toBe(transactionId)
    })

    await it('should handle suspended charging states in cable-first flow', () => {
      const connectorId = 3
      const transactionId = generateUUID()

      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Cable-first flow with suspended state
      const events = [
        // 1. Cable plugged
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.CablePluggedIn,
          connectorId,
          transactionId
        ),
        // 2. Start charging
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.ChargingStateChanged,
          connectorId,
          transactionId,
          { chargingState: OCPP20ChargingStateEnumType.Charging }
        ),
        // 3. Suspended by EV
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.ChargingStateChanged,
          connectorId,
          transactionId,
          { chargingState: OCPP20ChargingStateEnumType.SuspendedEV }
        ),
        // 4. Resume charging
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.ChargingStateChanged,
          connectorId,
          transactionId,
          { chargingState: OCPP20ChargingStateEnumType.Charging }
        ),
        // 5. EV departed
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.EVDeparted,
          connectorId,
          transactionId
        ),
      ]

      // Verify sequence numbers are continuous through suspend/resume
      for (let i = 0; i < events.length; i++) {
        expect(events[i].seqNo).toBe(i)
      }

      // Verify all share same transaction ID
      for (const event of events) {
        expect(event.transactionInfo.transactionId).toBe(transactionId)
      }
    })
  })

  // =========================================================================
  // Context-Based Trigger Reason Selection for Cable Events
  // =========================================================================
  await describe('Context-Based Cable Event Trigger Selection', async () => {
    await it('should select CablePluggedIn from cable_action context with plugged_in state', () => {
      const context: OCPP20TransactionContext = {
        cableState: 'plugged_in',
        source: 'cable_action',
      }

      const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
        OCPP20TransactionEventEnumType.Started,
        context
      )

      expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.CablePluggedIn)
    })

    await it('should select EVDetected from cable_action context with detected state', () => {
      const context: OCPP20TransactionContext = {
        cableState: 'detected',
        source: 'cable_action',
      }

      const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
        OCPP20TransactionEventEnumType.Updated,
        context
      )

      expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.EVDetected)
    })

    await it('should select EVDeparted from cable_action context with unplugged state', () => {
      const context: OCPP20TransactionContext = {
        cableState: 'unplugged',
        source: 'cable_action',
      }

      const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
        OCPP20TransactionEventEnumType.Ended,
        context
      )

      expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.EVDeparted)
    })
  })

  // =========================================================================
  // Multiple Connector Independence Tests
  // =========================================================================
  await describe('Multiple Connector Independence', async () => {
    await it('should maintain independent transaction sequences on different connectors', () => {
      const transactionId1 = generateUUID()
      const transactionId2 = generateUUID()

      // Reset both connectors
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, 1)
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, 2)

      // Start transaction on connector 1
      const conn1Start = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.CablePluggedIn,
        1,
        transactionId1
      )

      // Start transaction on connector 2
      const conn2Start = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.CablePluggedIn,
        2,
        transactionId2
      )

      // Update connector 1
      const conn1Update = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.EVDetected,
        1,
        transactionId1
      )

      // Update connector 2
      const conn2Update = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.EVDetected,
        2,
        transactionId2
      )

      // Each connector should have independent sequence numbers
      expect(conn1Start.seqNo).toBe(0)
      expect(conn2Start.seqNo).toBe(0)
      expect(conn1Update.seqNo).toBe(1)
      expect(conn2Update.seqNo).toBe(1)

      // Different transaction IDs
      expect(conn1Start.transactionInfo.transactionId).toBe(transactionId1)
      expect(conn2Start.transactionInfo.transactionId).toBe(transactionId2)
      expect(conn1Start.transactionInfo.transactionId).not.toBe(
        conn2Start.transactionInfo.transactionId
      )
    })
  })
})
