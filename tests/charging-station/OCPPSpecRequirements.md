# OCPP Specification Requirements Reference

This document serves as the **single source of truth** for OCPP specification requirements used in test expectations. It covers OCPP versions 1.6, 2.0.1, and 2.1 across all test domains.

> **Purpose**: Spec-only reference document. No implementation details.
> **Sources**: Official OCA OCPP specifications (see [References](#references))

---

## Table of Contents

1. [Lifecycle](#1-lifecycle)
2. [Boot Notification](#2-boot-notification)
3. [Connectors and EVSE](#3-connectors-and-evse)
4. [Heartbeat](#4-heartbeat)
5. [Transactions](#5-transactions)
6. [Configuration](#6-configuration)
7. [WebSocket](#7-websocket)
8. [Message Buffering](#8-message-buffering)
9. [Reservations](#9-reservations)
10. [Error Handling](#10-error-handling)
11. [References](#references)
12. [Appendix A: Cross-Version Quick Reference](#appendix-a-cross-version-quick-reference)
13. [Appendix B: Requirement ID Index](#appendix-b-requirement-id-index)

---

## 1. Lifecycle

### 1.1 Charging Station States

The lifecycle of a charging station includes boot, registration, operation, and shutdown phases.

#### 1.1.1 Registration States (All Versions)

| State    | OCPP 1.6 | OCPP 2.0.1 | OCPP 2.1 | Description                             |
| -------- | -------- | ---------- | -------- | --------------------------------------- |
| Accepted | ✓        | ✓          | ✓        | CS registered and operational           |
| Pending  | ✓        | ✓          | ✓        | CSMS needs more info; limited operation |
| Rejected | ✓        | ✓          | ✓        | CSMS refuses registration               |

**Spec References:**

- OCPP 1.6: §4.2 BootNotification
- OCPP 2.0.1: §B01, §B02, §B03 (Cold Boot use cases)
- OCPP 2.1: §B01, §B02, §B03

#### 1.1.2 State Transition Requirements

| Transition          | 1.6 | 2.0.1 | 2.1 | Requirement                                                     |
| ------------------- | --- | ----- | --- | --------------------------------------------------------------- |
| Boot → Pending      | ✓   | ✓     | ✓   | CS SHALL retry after interval (§4.2)                            |
| Boot → Rejected     | ✓   | ✓     | ✓   | CS SHALL NOT send messages except BootNotification (B03.FR.02)  |
| Pending → Accepted  | ✓   | ✓     | ✓   | CS SHALL send StatusNotification for each connector (B01.FR.05) |
| Rejected → Accepted | ✓   | ✓     | ✓   | CS proceeds as B01 Cold Boot                                    |

#### 1.1.3 Reboot Persistence Requirements

| Item                  | 1.6 | 2.0.1 | 2.1 | Requirement                                 |
| --------------------- | --- | ----- | --- | ------------------------------------------- |
| Unavailable status    | ✓   | ✓     | ✓   | SHALL persist across reboots (B01.FR.07)    |
| Reserved status       | ✓   | ✓     | ✓   | SHALL persist across reboots (B11.FR.05)    |
| Configuration changes | ✓   | ✓     | ✓   | Persisted unless volatile                   |
| Charging profiles     | ✓   | ✓     | ✓   | SHALL persist across reboots (Errata §3.37) |

---

## 2. Boot Notification

### 2.1 Boot Notification Flow

```
CS Power On → BootNotificationRequest → BootNotificationResponse → [StatusNotification...]
```

**OCPP 1.6 Errata §3.11:**

> "After a restart (for instance due to a remote reset command, power outage, firmware update, software error etc.) the Charge Point MUST again contact the Central System and SHALL send a BootNotification request."

### 2.2 Boot Notification Request Content

| Field                                                  | 1.6 | 2.0.1 | 2.1 | Required            |
| ------------------------------------------------------ | --- | ----- | --- | ------------------- |
| chargePointVendor / chargingStation.vendorName         | ✓   | ✓     | ✓   | Yes                 |
| chargePointModel / chargingStation.model               | ✓   | ✓     | ✓   | Yes                 |
| chargePointSerialNumber / chargingStation.serialNumber | ✓   | ✓     | ✓   | No                  |
| chargeBoxSerialNumber                                  | ✓   | ✗     | ✗   | No (deprecated 1.6) |
| firmwareVersion / chargingStation.firmwareVersion      | ✓   | ✓     | ✓   | No                  |
| iccid                                                  | ✓   | ✗     | ✗   | No                  |
| imsi                                                   | ✓   | ✗     | ✗   | No                  |
| meterType                                              | ✓   | ✗     | ✗   | No                  |
| meterSerialNumber                                      | ✓   | ✗     | ✗   | No                  |
| reason                                                 | ✗   | ✓     | ✓   | No                  |

### 2.3 Boot Notification Response Content

| Field       | 1.6 | 2.0.1 | 2.1 | Description                         |
| ----------- | --- | ----- | --- | ----------------------------------- |
| status      | ✓   | ✓     | ✓   | Accepted/Pending/Rejected           |
| currentTime | ✓   | ✓     | ✓   | CSMS current time (ISO 8601)        |
| interval    | ✓   | ✓     | ✓   | Heartbeat/retry interval in seconds |

### 2.4 Boot Notification State Requirements

#### 2.4.1 Accepted State (B01 - Cold Boot)

| ID        | Requirement                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------- |
| B01.FR.01 | CS SHALL send BootNotificationRequest to CSMS with configuration information                         |
| B01.FR.02 | CSMS SHALL respond to indicate acceptance status                                                     |
| B01.FR.03 | CS SHALL send BootNotificationRequest each time it boots or reboots                                  |
| B01.FR.04 | CS SHALL use interval from response as heartbeat interval                                            |
| B01.FR.05 | After Accepted, CS SHALL send StatusNotification for each connector                                  |
| B01.FR.06 | CS SHALL synchronize internal clock with CSMS currentTime (when using Heartbeat TimeSource)          |
| B01.FR.07 | Unavailable status SHALL persist across reboots                                                      |
| B01.FR.08 | CS SHALL NOT send other requests before successful BootNotification (except TriggerMessage response) |
| B01.FR.09 | CS SHALL indicate reason for BootNotification in reason field (OCPP 2.0.1+)                          |
| B01.FR.10 | CSMS SHALL respond with CALLERROR: SecurityError for non-boot messages before Accepted               |
| B01.FR.11 | CSMS SHALL check SerialNumber against Certificate CN (Security Profile 3)                            |
| B01.FR.12 | CSMS SHALL close WebSocket on SerialNumber mismatch (Security Profile 3)                             |
| B01.FR.13 | Reserved state MUST persist across reboots                                                           |

#### 2.4.2 Pending State (B02)

| ID        | Requirement                                                                            |
| --------- | -------------------------------------------------------------------------------------- |
| B02.FR.01 | CS SHALL respond to CSMS messages (GetVariables, SetVariables, TriggerMessage)         |
| B02.FR.02 | CS SHALL NOT send CALL messages except BootNotification                                |
| B02.FR.03 | CS MAY queue transactions if configured                                                |
| B02.FR.04 | CS SHALL NOT send BootNotification earlier than interval value (unless TriggerMessage) |
| B02.FR.05 | CS SHALL respond Rejected to RequestStartTransaction/RequestStopTransaction            |
| B02.FR.06 | Communication channel SHALL NOT be closed during Pending state                         |
| B02.FR.07 | If interval = 0, CS SHALL choose waiting interval to avoid flooding                    |
| B02.FR.08 | If interval > 0, CS SHALL send BootNotification after interval expires                 |
| B02.FR.09 | CSMS SHALL respond with CALLERROR: SecurityError for unauthorized messages             |

#### 2.4.3 Rejected State (B03)

| ID        | Requirement                                                                               |
| --------- | ----------------------------------------------------------------------------------------- |
| B03.FR.01 | CS MAY allow locally authorized transactions if configured                                |
| B03.FR.02 | CS SHALL NOT send any OCPP message until interval expires                                 |
| B03.FR.03 | CSMS SHALL NOT initiate messages during Rejected state                                    |
| B03.FR.04 | CS MAY close connection until next retry                                                  |
| B03.FR.05 | If interval = 0, CS SHALL choose waiting interval                                         |
| B03.FR.06 | If interval > 0, CS SHALL retry BootNotification after interval                           |
| B03.FR.07 | CSMS SHALL return SecurityError for messages from non-accepted CS                         |
| B03.FR.08 | CS SHALL respond with CALLERROR: SecurityError if CSMS sends non-response during Rejected |

### 2.5 TriggerMessage After Boot (OCPP 1.6 Errata §3.40)

**Critical Clarification:**

> "After a Charging Station has been Accepted, a TriggerMessage for BootNotification SHOULD be rejected with status 'NotImplemented' or 'Rejected'."

---

## 3. Connectors and EVSE

### 3.1 Connector Model Differences

| Aspect      | OCPP 1.6             | OCPP 2.0.1 / 2.1                    |
| ----------- | -------------------- | ----------------------------------- |
| Hierarchy   | Flat: Connector only | EVSE → Connector                    |
| Connector 0 | Optional aggregate   | Connector 0 on EVSE 0 represents CS |
| Numbering   | 1-based connectors   | EVSE 0 = CS; Connector IDs per EVSE |

**Connector Numbering Requirements (OCPP 1.6 §3.8):**

| Requirement                                                     |
| --------------------------------------------------------------- |
| ConnectorIds MUST always be numbered the same way               |
| ID of first connector MUST be 1                                 |
| Additional connectors MUST be sequentially numbered (no gaps)   |
| ConnectorIds MUST NOT be higher than total number of connectors |

**Spec References:**

- OCPP 1.6: §3.7 StatusNotification, §3.8 Connector numbering
- OCPP 2.0.1: Part 1 Architecture §2.2, Part 2 §C01

### 3.2 Connector Status Values

#### OCPP 1.6 Connector Status (§3.7)

| Status        | Description                                      |
| ------------- | ------------------------------------------------ |
| Available     | Connector available for new session              |
| Preparing     | Connector plugged, pending authorization         |
| Charging      | Charging in progress                             |
| SuspendedEVSE | Charging suspended by EVSE                       |
| SuspendedEV   | Charging suspended by EV                         |
| Finishing     | Transaction stopped, connector not yet available |
| Reserved      | Connector reserved for specific idTag            |
| Unavailable   | Connector not available (administrative)         |
| Faulted       | Connector in fault condition                     |

#### OCPP 2.0.1 / 2.1 Connector Status (ConnectorStatusEnumType)

| Status      | Description                        |
| ----------- | ---------------------------------- |
| Available   | Connector operative and available  |
| Occupied    | Connector has vehicle connected    |
| Reserved    | Reserved for specific token        |
| Unavailable | Not available for new transactions |
| Faulted     | Error condition                    |

### 3.3 Status Notification Requirements

| Requirement ID | Version | Requirement                                                                                    |
| -------------- | ------- | ---------------------------------------------------------------------------------------------- |
| Errata §3.19   | 1.6     | CS SHALL send StatusNotification when connector status changes                                 |
| B01.FR.05      | 2.0.1   | After Accepted boot, CS SHALL send StatusNotification for each Connector                       |
| B04.FR.01      | 2.0.1   | After offline > OfflineThreshold, CS SHALL send StatusNotification for all Connectors          |
| B04.FR.02      | 2.0.1   | After offline ≤ OfflineThreshold, CS SHALL send StatusNotification only for changed Connectors |

**LocalListConflict (OCPP 1.6 §3.5.2):**

> "When conflicts occur between local authorization list and StartTransaction.conf validity, the Charge Point SHALL inform the Central System by sending a StatusNotification with ConnectorId set to 0, and ErrorCode set to 'LocalListConflict'."

### 3.4 Connector Status Transition Matrix (OCPP 1.6 §3.7)

The following matrix defines valid status transitions for connectors (connectorId > 0):

| From \ To         | Available | Preparing | Charging | SuspendedEV | SuspendedEVSE | Finishing | Reserved | Unavailable | Faulted |
| ----------------- | --------- | --------- | -------- | ----------- | ------------- | --------- | -------- | ----------- | ------- |
| **Available**     | -         | A2        | A3       | A4          | A5            | -         | A7       | A8          | A9      |
| **Preparing**     | B1        | -         | B3       | B4          | B5            | B6        | -        | -           | B9      |
| **Charging**      | C1        | -         | -        | C4          | C5            | C6        | -        | C8          | C9      |
| **SuspendedEV**   | D1        | -         | D3       | -           | D5            | D6        | -        | D8          | D9      |
| **SuspendedEVSE** | E1        | -         | E3       | E4          | -             | E6        | -        | E8          | E9      |
| **Finishing**     | F1        | F2        | -        | -           | -             | -         | -        | F8          | F9      |
| **Reserved**      | G1        | G2        | -        | -           | -             | -         | -        | G8          | G9      |
| **Unavailable**   | H1        | H2        | H3       | H4          | H5            | -         | -        | -           | H9      |
| **Faulted**       | I1        | I2        | I3       | I4          | I5            | I6        | I7       | I8          | -       |

> **Note**: For connectorId = 0, only Available, Unavailable, and Faulted are applicable.

#### Transition Event Descriptions

| Code | Description                                                                                 |
| ---- | ------------------------------------------------------------------------------------------- |
| A2   | Usage initiated (plug inserted, idTag presented, RemoteStartTransaction received)           |
| A3   | Charging starts without authorization (no auth means on CP)                                 |
| A7   | ReserveNow message received                                                                 |
| A8   | ChangeAvailability sets connector to Unavailable                                            |
| A9   | Fault detected preventing charging                                                          |
| B1   | Usage ended (plug removed, timeout via ConnectionTimeOut, second idTag presentation)        |
| B3   | All prerequisites met, charging starts                                                      |
| B6   | Timeout: usage initiated but idTag not presented within timeout                             |
| C4   | Charging suspended by EV (S2 opened)                                                        |
| C5   | Charging suspended by EVSE (smart charging, invalid authorization in StartTransaction.conf) |
| C6   | Transaction stopped by user or RemoteStopTransaction                                        |

### 3.5 MinimumStatusDuration (OCPP 1.6)

| Aspect        | Value                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Key           | `MinimumStatusDuration`                                                                                |
| Type          | integer (seconds)                                                                                      |
| Accessibility | RW                                                                                                     |
| Required      | Optional                                                                                               |
| Description   | Minimum duration a connector status must be stable before sending StatusNotification to Central System |

**Spec Reference (OCPP 1.6 §4.9):**

> "To limit the number of transitions, the Charge Point MAY omit sending a StatusNotification.req if it was active for less time than defined in the optional configuration key MinimumStatusDuration."

**Implementation Notes:**

- Manufacturer MAY implement default minimal status duration independent of this setting
- Setting to 0 SHALL NOT override manufacturer's default minimum
- High values may delay all StatusNotifications

### 3.6 OfflineThreshold (OCPP 2.0.1 / 2.1)

| Aspect      | Value                                                          |
| ----------- | -------------------------------------------------------------- |
| Component   | OCPPCommCtrlr                                                  |
| Variable    | OfflineThreshold                                               |
| Type        | integer (seconds)                                              |
| Mutability  | ReadWrite                                                      |
| Required    | Yes (OCPP 2.0.1)                                               |
| Description | Threshold determining post-offline StatusNotification behavior |

**Requirements (B04 - Offline Behavior):**

| Requirement | Condition                         | Action                                                       |
| ----------- | --------------------------------- | ------------------------------------------------------------ |
| B04.FR.01   | Offline period > OfflineThreshold | CS SHALL send StatusNotification for ALL connectors          |
| B04.FR.02   | Offline period ≤ OfflineThreshold | CS SHALL send StatusNotification only for CHANGED connectors |

---

## 4. Heartbeat

### 4.1 Heartbeat Purpose

| Purpose                 | 1.6 | 2.0.1 | 2.1 |
| ----------------------- | --- | ----- | --- |
| Connectivity keep-alive | ✓   | ✓     | ✓   |
| Time synchronization    | ✓   | ✓     | ✓   |
| Clock correction        | ✓   | ✓     | ✓   |

**Spec References:**

- OCPP 1.6: §4.4 Heartbeat
- OCPP 2.0.1: Part 4 §5.3
- OCPP 2.1: Part 4 §5.3

### 4.2 Heartbeat Interval

| Aspect                 | 1.6                          | 2.0.1                              | 2.1                               |
| ---------------------- | ---------------------------- | ---------------------------------- | --------------------------------- |
| Source                 | HeartbeatInterval config key | BootNotificationResponse.interval  | BootNotificationResponse.interval |
| Minimum                | No spec minimum              | Configurable                       | Configurable                      |
| Adjustment on Accepted | From HeartbeatInterval       | From response interval (B01.FR.04) | From response interval            |

### 4.3 Heartbeat Optimization

| Optimization              | 1.6 | 2.0.1 | 2.1 | Description                                    |
| ------------------------- | --- | ----- | --- | ---------------------------------------------- |
| Skip on activity          | ✓   | ✓     | ✓   | Can skip if other PDU sent recently            |
| Minimum for clock         | ✓   | ✓     | ✓   | At least 1/day for clock sync                  |
| WebSocket ping substitute | ✓   | ✓     | ✓   | Ping/pong for connectivity only, not time sync |

**OCPP 1.6 §4.4:**

> "A Charging Station can skip sending Heartbeat request if another PDU has been sent within the heartbeat interval."

**Activity that qualifies for skip:**

- BootNotification, StatusNotification, MeterValues
- StartTransaction, StopTransaction
- Any CALL message to CSMS

**OCPP 2.0.1 Part 4 §5.3:**

> "A Charging Station SHOULD NOT send heartbeats during ongoing communication with CSMS. [...] At least send one heartbeat per 24 hours if WebSocket ping/pong is used for keep-alive."

---

## 5. Transactions

### 5.1 Transaction Lifecycle

#### OCPP 1.6 Transaction Flow

```
StartTransaction → [MeterValues...] → StopTransaction
```

| Message          | Direction | Purpose                              |
| ---------------- | --------- | ------------------------------------ |
| StartTransaction | CS → CSMS | Begin transaction, get transactionId |
| MeterValues      | CS → CSMS | Periodic meter readings              |
| StopTransaction  | CS → CSMS | End transaction with final meter     |

#### OCPP 2.0.1 / 2.1 Transaction Flow

```
TransactionEvent(Started) → [TransactionEvent(Updated)...] → TransactionEvent(Ended)
```

| Event Type | Purpose                        |
| ---------- | ------------------------------ |
| Started    | Transaction begins             |
| Updated    | Periodic updates, meter values |
| Ended      | Transaction terminates         |

### 5.2 Transaction ID Requirements

| Aspect        | 1.6                                      | 2.0.1               | 2.1                 |
| ------------- | ---------------------------------------- | ------------------- | ------------------- |
| Source        | CSMS assigns in StartTransactionResponse | CS generates (UUID) | CS generates (UUID) |
| Type          | Integer                                  | String (UUID)       | String (UUID)       |
| Failure value | **-1** (Errata §3.18)                    | N/A                 | N/A                 |

**OCPP 1.6 Errata §3.18 (Critical):**

> "If the Charge Point was unable to deliver the StartTransaction.req despite repeated attempts, or if the Central System was unable to deliver the StartTransaction.conf response, then the Charge Point will not receive a transactionId. In that case, the Charge Point SHALL send any Transaction related messages for this transaction to the Central System with a transactionId = -1."

**Prerequisite for -1**: CS must have made repeated retry attempts before using transactionId = -1.

### 5.3 Transaction Start Requirements (OCPP 2.0.1 E01)

| ID        | Requirement                                                                                |
| --------- | ------------------------------------------------------------------------------------------ |
| E01.FR.01 | Transaction MAY start on ParkingBayOccupancy trigger                                       |
| E01.FR.02 | Transaction MAY start on EVConnected trigger                                               |
| E01.FR.03 | Transaction MAY start on Authorized trigger                                                |
| E01.FR.04 | Transaction MAY start on DataSigned trigger                                                |
| E01.FR.05 | Transaction MAY start on PowerPathClosed trigger                                           |
| E01.FR.06 | Transaction MAY start on EnergyTransfer trigger                                            |
| E01.FR.07 | CS SHALL include seqNo in TransactionEventRequest; seqNo SHOULD start at 0 per transaction |
| E01.FR.08 | transactionId generated by CS MUST be unique for each transaction                          |
| E01.FR.09 | CS SHALL add configured measurands to meterValue with context = Transaction.Begin          |
| E01.FR.10 | CS SHALL include IdTokenType information in TransactionEventRequest                        |
| E01.FR.11 | CSMS SHALL verify validity of identifier                                                   |
| E01.FR.12 | CSMS SHALL include authorization status value in TransactionEventResponse                  |
| E01.FR.13 | Next TransactionEventRequest SHALL contain reservationId when consuming reservation        |
| E01.FR.14 | CS SHALL NOT start another transaction on different Connector of same EVSE                 |
| E01.FR.15 | CS SHALL set triggerReason appropriately                                                   |
| E01.FR.16 | evse field SHALL only be included in first TransactionEvent (Started)                      |
| E01.FR.17 | CS SHALL add measurands with context = Transaction.Begin when EVSE unknown at start        |
| E01.FR.18 | CS SHALL send TransactionEvent(Updated) on charging state change                           |
| E01.FR.19 | CS SHALL handle EV suspension appropriately                                                |
| E01.FR.20 | CS SHALL handle EVSE suspension appropriately                                              |

### 5.4 Cable Plugin First (OCPP 2.0.1 E02)

| ID        | Requirement                                                                     |
| --------- | ------------------------------------------------------------------------------- |
| E02.FR.01 | When cable connected first, CS SHALL wait for authorization                     |
| E02.FR.02 | CS SHALL verify authorization with CSMS                                         |
| E02.FR.03 | On valid authorization, CS SHALL start transaction                              |
| E02.FR.04 | On invalid authorization, CS SHALL reject start                                 |
| E02.FR.05 | CS SHALL handle cable disconnect during authorization wait                      |
| E02.FR.06 | CS SHALL track cable connection state                                           |
| E02.FR.07 | CS SHALL maintain seqNo per EVSE for TransactionEvents                          |
| E02.FR.08 | transactionId MUST be unique                                                    |
| E02.FR.09 | CS SHALL include meter values with context = Transaction.Begin                  |
| E02.FR.10 | CS SHALL include meter values with context = Transaction.End                    |
| E02.FR.11 | CS SHALL include meter values with context = Sample.Periodic during transaction |
| E02.FR.13 | CS SHALL track charging state transitions                                       |
| E02.FR.14 | CS SHALL include measurands as configured                                       |
| E02.FR.15 | triggerReason SHALL be CablePluggedIn for cable-first start                     |
| E02.FR.16 | triggerReason SHALL be Authorized when authorization completes                  |
| E02.FR.17 | triggerReason SHALL be appropriate for state transitions                        |
| E02.FR.18 | CS SHALL handle SuspendedEV state                                               |
| E02.FR.19 | CS SHALL handle SuspendedEVSE state                                             |
| E02.FR.20 | CS SHALL handle Charging state                                                  |
| E02.FR.21 | CS SHALL include phase information when available                               |

### 5.5 IdToken First (OCPP 2.0.1 E03)

| ID        | Requirement                                                          |
| --------- | -------------------------------------------------------------------- |
| E03.FR.01 | When IdToken presented first, CS SHALL verify with CSMS              |
| E03.FR.02 | CSMS SHALL verify IdToken validity                                   |
| E03.FR.03 | If reservation exists, CS SHALL honor it                             |
| E03.FR.05 | CS SHALL handle EVConnectionTimeOut                                  |
| E03.FR.06 | If cable not connected within timeout, CS SHALL cancel authorization |
| E03.FR.07 | CS SHALL maintain seqNo for TransactionEvents                        |
| E03.FR.08 | transactionId MUST be unique                                         |
| E03.FR.09 | CS SHALL include meter values at transaction start                   |
| E03.FR.10 | CS SHALL include meter values at transaction end                     |
| E03.FR.11 | CS SHALL include periodic meter values                               |
| E03.FR.12 | CS SHALL handle charging state transitions                           |
| E03.FR.13 | triggerReason SHALL be Authorized for IdToken-first                  |
| E03.FR.14 | CS SHALL include phase information when available                    |
| E03.FR.15 | CS SHALL handle timeout scenarios appropriately                      |

### 5.6 Transaction Sequence Numbers (OCPP 2.0.1 / 2.1)

OCPP 2.0.1+ uses sequence numbers in TransactionEventRequest messages to ensure complete transaction data delivery.

| Aspect           | Requirement                                                                             |
| ---------------- | --------------------------------------------------------------------------------------- |
| Per-EVSE counter | CS maintains a counter for each EVSE tracking TransactionEventRequest messages          |
| Starting value   | CS SHOULD set seqNo to 0 when transaction starts (continuously increasing also allowed) |
| Increment        | CS SHALL increase seqNo by 1 after each TransactionEventRequest                         |
| Purpose          | Allows CSMS to verify it received all messages (seqNo a to seqNo o with no gaps)        |

**Completeness Check at CSMS:**

1. Received TransactionEventRequest with eventType=Started, seqNo = `a`
2. Received TransactionEventRequest with eventType=Ended, seqNo = `o` (where o > a)
3. Received TransactionEventRequest for every integer `n` between `a` and `o`

**Spec References:**

- OCPP 2.0.1 Part 2 §1.3.2: Sequence numbers
- E01.FR.07: seqNo field requirements

### 5.7 Authorization Requirements

| Requirement           | 1.6                                    | 2.0.1                        | 2.1                          |
| --------------------- | -------------------------------------- | ---------------------------- | ---------------------------- |
| Pre-authorization     | Optional via AuthorizeRemoteTxRequests | Configurable                 | Configurable                 |
| Local authorization   | LocalAuthListEnabled                   | LocalAuthListCtrlrEnabled    | LocalAuthListCtrlrEnabled    |
| Remote start          | RemoteStartTransaction                 | RequestStartTransaction      | RequestStartTransaction      |
| Offline authorization | LocalAuthorizeOffline config           | OfflineTxForUnknownIdEnabled | OfflineTxForUnknownIdEnabled |

**OCPP 1.6 §4.1 Authorization:**

> "A Charge Point MUST NOT send an Authorization.req before stopping a transaction if the presented idTag is the same as the idTag presented to start the transaction."

**Offline ID Handling (OCPP 1.6 §3.5.4):**

- Identifiers in Local Authorization List with status other than 'Accepted' (Invalid, Restricted, Expired) MUST be rejected
- Identifiers that were valid but are expired due to passage of time MUST be rejected

### 5.8 StopTransactionOnInvalidId (OCPP 1.6)

| Aspect        | Value                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Key           | `StopTransactionOnInvalidId`                                                                    |
| Type          | boolean                                                                                         |
| Required      | Yes                                                                                             |
| Accessibility | RW                                                                                              |
| Description   | Whether CS stops transaction when receiving non-Accepted authorization in StartTransaction.conf |

**Behavior:**

| StopTransactionOnInvalidId | Action                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------ |
| true                       | Stop transaction normally; set Reason to DeAuthorized; keep cable locked if possible |
| false                      | Only stop energy delivery; transaction remains open                                  |

**Spec Reference (OCPP 1.6 §4.10):**

> "When StopTransactionOnInvalidId is set to true: stop the transaction normally as stated in Stop Transaction. The Reason field in the Stop Transaction request should be set to DeAuthorized."

### 5.9 Meter Values Configuration (OCPP 1.6)

#### MeterValuesSampledData

| Aspect        | Value                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| Key           | `MeterValuesSampledData`                                                        |
| Type          | CSL (Comma Separated List)                                                      |
| Required      | Yes                                                                             |
| Accessibility | RW                                                                              |
| Default       | `Energy.Active.Import.Register`                                                 |
| Description   | Measurands to include in MeterValues.req every MeterValueSampleInterval seconds |

**OCPP 1.6 Errata §3.15:**

> "When the value of the configuration variable MeterValueSampleInterval and/or ClockAlignedDataInterval has been set to a value greater than zero, the Charge Point SHALL send MeterValues at the given interval(s)."

**OCPP 1.6 Errata §3.14.4 (Unsupported Measurands):**

> "If the comma separated list contains one or more measurands that are not supported by this Charge Point, the Charge Point SHALL respond with ChangeConfiguration.conf with status = Rejected. No changes SHALL be made to the current configuration."

**OCPP 1.6 Errata §3.14.3 (Multi-phase):**

> "When a Charge Point can measure the same measurand on multiple locations or phases, all possible locations and/or phases SHALL be reported when configured in one of the relevant configuration keys."

#### MeterValuesAlignedData

| Aspect        | Value                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------- |
| Key           | `MeterValuesAlignedData`                                                                      |
| Type          | CSL (Comma Separated List)                                                                    |
| Required      | Yes                                                                                           |
| Accessibility | RW                                                                                            |
| Description   | Measurands to include in clock-aligned MeterValues.req every ClockAlignedDataInterval seconds |

#### Related Configuration Keys

| Key                             | Type    | Description                                             |
| ------------------------------- | ------- | ------------------------------------------------------- |
| MeterValueSampleInterval        | integer | Seconds between sampled meter value transmissions       |
| ClockAlignedDataInterval        | integer | Seconds between clock-aligned meter value transmissions |
| MeterValuesSampledDataMaxLength | integer | Maximum items in MeterValuesSampledData list (R)        |
| MeterValuesAlignedDataMaxLength | integer | Maximum items in MeterValuesAlignedData list (R)        |

**Spec Reference (OCPP 1.6 §4.7 Meter Values):**

> "MeterValuesSampledData is a comma separated list that prescribes the set of measurands to be included in a MeterValues.req PDU, every MeterValueSampleInterval seconds."

### 5.10 Meter Values Requirements

| Aspect              | 1.6                          | 2.0.1                              | 2.1                                |
| ------------------- | ---------------------------- | ---------------------------------- | ---------------------------------- |
| Measurands          | MeterValuesSampledData (CSL) | sampled/aligned contexts           | sampled/aligned contexts           |
| Interval            | MeterValueSampleInterval     | SampledDataCtrlr.TxUpdatedInterval | SampledDataCtrlr.TxUpdatedInterval |
| Transaction binding | transactionId in MeterValues | Included in TransactionEvent       | Included in TransactionEvent       |

### 5.11 Reset and Transaction Handling (OCPP 1.6 Errata §3.36)

> "After receipt of a Reset.req, the Charge Point SHALL send a StopTransaction.req for any ongoing transaction before performing the reset. If the Charge Point fails to receive a StopTransaction.conf from the Central System, it SHALL queue the StopTransaction.req."

---

## 6. Configuration

### 6.1 Configuration Model Differences

| Aspect    | OCPP 1.6            | OCPP 2.0.1 / 2.1                                |
| --------- | ------------------- | ----------------------------------------------- |
| Model     | Key-Value pairs     | Device Model (Component/Variable)               |
| Read      | GetConfiguration    | GetVariables / GetBaseReport                    |
| Write     | ChangeConfiguration | SetVariables                                    |
| Structure | Flat                | Hierarchical (Component → Variable → Attribute) |

### 6.2 Key Configuration Parameters (OCPP 1.6)

| Key                       | Type    | Description                         |
| ------------------------- | ------- | ----------------------------------- |
| HeartbeatInterval         | Integer | Seconds between heartbeats          |
| ConnectionTimeOut         | Integer | Seconds to wait for connection      |
| MeterValueSampleInterval  | Integer | Seconds between meter value samples |
| NumberOfConnectors        | Integer | Number of connectors (read-only)    |
| AuthorizeRemoteTxRequests | Boolean | Whether to authorize remote starts  |
| LocalAuthorizeOffline     | Boolean | Allow offline authorization         |
| LocalPreAuthorize         | Boolean | Pre-authorize locally before CSMS   |
| WebSocketPingInterval     | Integer | Seconds between WebSocket pings     |

### 6.3 Device Model (OCPP 2.0.1 / 2.1)

| Component        | Variable                     | Description               |
| ---------------- | ---------------------------- | ------------------------- |
| OCPPCommCtrlr    | HeartbeatInterval            | Heartbeat interval        |
| OCPPCommCtrlr    | WebSocketPingInterval        | WebSocket ping interval   |
| OCPPCommCtrlr    | NetworkConfigurationPriority | Connection priority order |
| AuthCtrlr        | LocalAuthorizeOffline        | Offline authorization     |
| SampledDataCtrlr | TxUpdatedInterval            | Meter value interval      |

### 6.4 SetVariables Requirements (OCPP 2.0.1 B05)

| ID        | Requirement                                                                                |
| --------- | ------------------------------------------------------------------------------------------ |
| B05.FR.01 | CS SHALL respond with SetVariableResponse containing equal number of SetVariableResult     |
| B05.FR.02 | Every SetVariableResult SHALL contain same component and variable combination              |
| B05.FR.03 | SetVariableResult SHALL contain same attributeType as request                              |
| B05.FR.04 | Set attributeStatus to UnknownComponent for unknown component                              |
| B05.FR.05 | Set attributeStatus to UnknownVariable for unknown variable                                |
| B05.FR.06 | Set attributeStatus to NotSupportedAttributeType for unknown attributeType                 |
| B05.FR.07 | Set attributeStatus to Rejected for incorrectly formatted values                           |
| B05.FR.08 | Set attributeStatus to Rejected for read-only variables                                    |
| B05.FR.09 | Set attributeStatus to RebootRequired when change requires reboot                          |
| B05.FR.10 | Set attributeStatus to Accepted when successfully set                                      |
| B05.FR.11 | CSMS SHALL NOT send more SetVariableData than ItemsPerMessageSetVariables                  |
| B05.FR.12 | SetVariableResult SHALL contain attributeType Actual when not specified in request         |
| B05.FR.13 | CSMS SHALL NOT include multiple SetVariableData with same Component/Variable/AttributeType |

### 6.5 Configuration Requirements

| Requirement                          | 1.6 | 2.0.1 | 2.1 | Spec Reference  |
| ------------------------------------ | --- | ----- | --- | --------------- |
| Unknown key → UnknownKey status      | ✓   | N/A   | N/A | §7.2            |
| Unknown component → UnknownComponent | N/A | ✓     | ✓   | B05.FR.04       |
| Unknown variable → UnknownVariable   | N/A | ✓     | ✓   | B05.FR.05       |
| Read-only key → Rejected             | ✓   | ✓     | ✓   | §7.2, B05.FR.08 |
| Reboot required → RebootRequired     | ✓   | ✓     | ✓   | §7.2, B05.FR.09 |

### 6.6 ClearCache Handling (OCPP 1.6 Errata §3.23)

> "When the Authorization Cache is not implemented and the Charge Point receives a ClearCache.req message, the Charge Point SHALL respond with ClearCache.conf with the status: Rejected."

---

## 7. WebSocket

### 7.1 OCPP-J Protocol

OCPP-J uses JSON over WebSocket with SRPC (Simple Remote Procedure Call) framework.

**Spec References:**

- OCPP 1.6-J: ocpp-j-1.6-specification
- OCPP 2.0.1: Part 4 OCPP-J Specification
- OCPP 2.1: Part 4 OCPP-J Specification

### 7.2 Message Types

| Type ID | Name            | 1.6 | 2.0.1 | 2.1 | Format                                                      |
| ------- | --------------- | --- | ----- | --- | ----------------------------------------------------------- |
| 2       | CALL            | ✓   | ✓     | ✓   | `[2, MessageId, Action, Payload]`                           |
| 3       | CALLRESULT      | ✓   | ✓     | ✓   | `[3, MessageId, Payload]`                                   |
| 4       | CALLERROR       | ✓   | ✓     | ✓   | `[4, MessageId, ErrorCode, ErrorDescription, ErrorDetails]` |
| 5       | CALLRESULTERROR | ✗   | ✗     | ✓   | `[5, MessageId, ErrorCode, ErrorDescription, ErrorDetails]` |
| 6       | SEND            | ✗   | ✗     | ✓   | `[6, MessageId, Action, Payload]` (unconfirmed)             |

**OCPP 2.1 Additions:**

- **CALLRESULTERROR (5)**: Error response to a CALLRESULT when response validation fails
  - Used when the **response itself** (not the request) is malformed
  - MessageId MUST match the CALLRESULT that caused the error
  - Triggered by response validation failure

- **SEND (6)**: Unconfirmed message (no response expected)
  - Format includes Action field (unlike CALLRESULT)
  - Receiver SHALL NOT respond with CALLRESULT or CALLERROR to a SEND
  - Sender MAY send SEND messages without waiting for prior CALL responses (asynchronous)
  - Used for frequent periodic data (e.g., `NotifyPeriodicEventStream`)

### 7.3 WebSocket Subprotocol

| Version | Subprotocol Name | IANA Registered |
| ------- | ---------------- | --------------- |
| 1.6     | `ocpp1.6`        | Yes             |
| 2.0     | `ocpp2.0`        | Yes             |
| 2.0.1   | `ocpp2.0.1`      | Yes             |
| 2.1     | `ocpp2.1`        | Yes             |

**Negotiation Requirement (All Versions):**

> "The Charging Station SHALL include the OCPP version specific subprotocol in the Sec-WebSocket-Protocol header. The CSMS SHALL respond with the same subprotocol."

### 7.4 WebSocket Ping/Pong

| Aspect               | 1.6                   | 2.0.1                 | 2.1                   |
| -------------------- | --------------------- | --------------------- | --------------------- |
| Support required     | Recommended           | Required              | Required              |
| Interval config      | WebSocketPingInterval | WebSocketPingInterval | WebSocketPingInterval |
| Purpose              | Keep-alive only       | Keep-alive only       | Keep-alive only       |
| Time sync substitute | No                    | No                    | No                    |

**OCPP 2.0.1 Part 4 §5.3:**

> "WebSocket ping/pong SHALL NOT be used for time synchronization. The Charging Station SHALL still send Heartbeat for clock correction."

### 7.5 Connection Management

| Aspect        | 1.6                             | 2.0.1                            | 2.1                                |
| ------------- | ------------------------------- | -------------------------------- | ---------------------------------- |
| URL format    | `ws(s)://host:port/path/{csId}` | Same                             | Same                               |
| Basic auth    | Optional                        | Optional                         | Optional                           |
| TLS           | Recommended                     | Required for Security Profile 2+ | Required for Security Profile 2+   |
| Certificate   | Optional                        | Required for Profile 3           | Required for Profile 3             |
| CS ID max len | N/A                             | N/A                              | 48 characters (EMI3 compatibility) |
| CS ID chars   | N/A                             | N/A                              | Colon (`:`) SHALL NOT be used      |

**OCPP 2.1 Part 4 §3.1.2 (NEW):**

- Charging Station identity maximum length: 48 characters (EMI3 compatibility)
- Colon (`:`) character SHALL NOT be used in identifier (basic auth parsing conflict)
- URL encoding required per RFC3986

**Connection Persistence:**

- CS SHALL keep WebSocket connection open continuously
- On reconnect, CS SHOULD NOT send BootNotification unless elements changed

### 7.6 Reconnection Back-Off (OCPP 2.0.1 / 2.1)

| Parameter               | Description                          |
| ----------------------- | ------------------------------------ |
| RetryBackOffWaitMinimum | Initial back-off wait time (seconds) |
| RetryBackOffRandomRange | Random jitter added (seconds)        |
| RetryBackOffRepeatTimes | Maximum doublings before max reached |

**Back-Off Algorithm (OCPP 2.0.1 Part 4 §5.4):**

1. On connection failure, wait: `RetryBackOffWaitMinimum + random(0, RetryBackOffRandomRange)`
2. On each subsequent failure, double the wait time (up to `RetryBackOffRepeatTimes` doublings)
3. After max doublings, continue reconnecting at maximum interval
4. Randomization REQUIRED to prevent thundering herd

> "The Charging Station SHALL implement exponential back-off with randomization when reconnecting to avoid thundering herd."

### 7.7 TLS Fragment Length Negotiation (OCPP 2.1 §5.2)

| Aspect         | Value                                        |
| -------------- | -------------------------------------------- |
| Default TLS    | 16 KB (16,384 bytes) records                 |
| Minimum        | 0.5 KB, 1 KB, 2 KB, or 4 KB (negotiable)     |
| Recommendation | 2 KB practical minimum (99% of messages fit) |
| Mechanism      | RFC 6066 Section 4 TLS extension             |

**Resource-constrained CS:**

- SHOULD negotiate smaller fragment size
- If negotiation fails, MAY unilaterally allocate less memory

---

## 8. Message Buffering

### 8.1 Offline Message Queue

| Aspect      | 1.6                     | 2.0.1                | 2.1                  |
| ----------- | ----------------------- | -------------------- | -------------------- |
| Required    | MUST (§3.7)             | Required             | Required             |
| Queue scope | Transaction messages    | Transaction messages | Transaction messages |
| Order       | FIFO (chronological)    | FIFO                 | FIFO                 |
| Persistence | Implementation-specific | Required             | Required             |

**OCPP 1.6 §3.7 (Critical):**

> "When offline, the Charge Point MUST queue any transaction-related messages that it would have sent to the Central System if the Charge Point had been online."

> "The Charge Point SHOULD deliver transaction-related messages to the Central System in chronological order as soon as possible."

### 8.2 Message Retry Requirements

| Parameter                       | 1.6 | 2.0.1 | 2.1 | Description              |
| ------------------------------- | --- | ----- | --- | ------------------------ |
| TransactionMessageAttempts      | ✓   | ✓     | ✓   | Number of retry attempts |
| TransactionMessageRetryInterval | ✓   | ✓     | ✓   | Seconds between retries  |

**Exponential Backoff Formula (OCPP 1.6 §3.7.1):**

> "Before every retransmission, it SHOULD wait as many seconds as specified in its TransactionMessageRetryInterval key, multiplied by the number of preceding transmissions of this same message."

| Attempt | Wait Time                           |
| ------- | ----------------------------------- |
| 1       | TransactionMessageRetryInterval × 1 |
| 2       | TransactionMessageRetryInterval × 2 |
| 3       | TransactionMessageRetryInterval × 3 |
| n       | TransactionMessageRetryInterval × n |

### 8.3 Queue Behavior on Reconnection

| Behavior          | 1.6                      | 2.0.1        | 2.1          | Requirement                |
| ----------------- | ------------------------ | ------------ | ------------ | -------------------------- |
| Send queued first | Required                 | Required     | Required     | Queued messages before new |
| Maintain order    | Required (chronological) | Required     | Required     | FIFO order preserved       |
| Drop on overflow  | Oldest first             | Oldest first | Oldest first | If queue full              |

**OCPP 2.0.1 B04:**

> "After connection restored, the Charging Station SHALL send queued transaction messages in order before sending new messages."

### 8.4 Queue Overflow Handling

**OCPP 1.6 §3.7 (Implicit):**

When queue is full, drop oldest non-essential messages first.

**OCPP 2.0.1 E04.FR.07-08 (Explicit):**

| ID        | Requirement                                                                              |
| --------- | ---------------------------------------------------------------------------------------- |
| E04.FR.03 | Offline flag SHALL be set to TRUE for any TransactionRequest that occurred while offline |
| E04.FR.07 | During low memory, CS MAY drop intermediate transaction messages                         |
| E04.FR.08 | CS SHALL NOT drop Started or Ended events; MAY drop intermediate Updated events          |

**Message Drop Pattern:**

- NEVER drop: TransactionEvent(Started), TransactionEvent(Ended)
- MAY drop: TransactionEvent(Updated) - drop 1st, 3rd, 5th... (keep every other)
- Priority: Preserve billing-critical messages (start/end with meter values)

### 8.5 Non-Transaction Message Handling

**OCPP 1.6 §3.7:**

> "New messages that are not transaction-related MAY be delivered immediately."

Transaction messages must queue and order; non-transaction messages can interleave.

---

## 9. Reservations

### 9.1 Reservation Support

| Aspect              | 1.6                           | 2.0.1                         | 2.1                           |
| ------------------- | ----------------------------- | ----------------------------- | ----------------------------- |
| Profile             | Reservation Profile           | Core feature                  | Core feature                  |
| Commands            | ReserveNow, CancelReservation | ReserveNow, CancelReservation | ReserveNow, CancelReservation |
| Connector 0 support | ReserveConnectorZeroSupported | EVSE 0 reservation            | EVSE 0 reservation            |

### 9.2 ReserveNow Requirements

| Field                      | 1.6 | 2.0.1 | 2.1 | Description                   |
| -------------------------- | --- | ----- | --- | ----------------------------- |
| connectorId / evseId       | ✓   | ✓     | ✓   | Target connector/EVSE         |
| expiryDate                 | ✓   | ✓     | ✓   | Reservation expiry (ISO 8601) |
| idTag / idToken            | ✓   | ✓     | ✓   | Reserved for this token       |
| reservationId              | ✓   | ✓     | ✓   | Unique reservation identifier |
| parentIdTag / groupIdToken | ✓   | ✓     | ✓   | Optional group token          |

### 9.3 Reservation Status Response

| Status      | 1.6 | 2.0.1 | 2.1 | Description              |
| ----------- | --- | ----- | --- | ------------------------ |
| Accepted    | ✓   | ✓     | ✓   | Reservation successful   |
| Faulted     | ✓   | ✓     | ✓   | Connector in fault       |
| Occupied    | ✓   | ✓     | ✓   | Connector already in use |
| Rejected    | ✓   | ✓     | ✓   | Reservation rejected     |
| Unavailable | ✓   | ✓     | ✓   | Connector unavailable    |

### 9.4 Reservation Conflict Matrix (OCPP 1.6 §5.13)

| Condition                                             | Response    |
| ----------------------------------------------------- | ----------- |
| Connector available and not reserved                  | Accepted    |
| Connector has same reservationId (replacement)        | Accepted    |
| Connector reserved for same or different idTag        | Occupied    |
| Connector in Faulted state                            | Faulted     |
| Connector in Unavailable state                        | Unavailable |
| ConnectorId 0 and ReserveConnectorZeroSupported=false | Rejected    |
| No connectors available                               | Rejected    |

**Reservation Replacement (OCPP 1.6 §5.13):**

> "If reservationId matches an existing reservation, the Charge Point SHALL replace that reservation with the new one."

### 9.5 Reservation Expiry Behavior

**OCPP 1.6 §5.13:**

| Event                     | Requirement                                            |
| ------------------------- | ------------------------------------------------------ |
| expiryDate reached        | Reservation SHALL be terminated                        |
| Reservation expires       | CS SHALL send StatusNotification (status change)       |
| Transaction starts        | Reservation terminated when idTag matches on connector |
| Connector Faulted/Unavail | Reservation terminated                                 |

**OCPP 2.0.1 H04.FR.01:**

> "When reservation expires, Charging Station SHALL send ReservationStatusUpdateRequest with status = Expired."

### 9.6 Reservation Persistence

| Requirement                                               | Spec Reference                    |
| --------------------------------------------------------- | --------------------------------- |
| Reserved status SHALL persist across reboots              | B11.FR.05 (2.0.1)                 |
| Reservation SHALL expire at expiryDate                    | §8.5 (1.6), Reservation use cases |
| CS SHALL send StatusNotification when reservation expires | All versions                      |

### 9.7 Connector 0 / EVSE 0 Reservation

**OCPP 1.6:**

> "If connectorId = 0, the Charging Station SHALL reserve the next available connector."

**Configuration:** `ReserveConnectorZeroSupported` (Boolean)

> "If ReserveConnectorZeroSupported is not set or set to false, the Charge Point SHALL return 'Rejected'."

**OCPP 2.0.1 / 2.1:**

> "If evseId = 0, the Charging Station SHALL reserve the entire Charging Station (any EVSE)."

**OCPP 2.0.1 H01.FR.07:**

> "CS SHALL make sure that at any time one EVSE remains available for reserved IdTokenType."

### 9.8 Transaction Consuming Reservation (OCPP 1.6 §5.13)

> "Reservation SHALL be terminated when transaction is started for reserved idTag on reserved connector."

**Parent IdTag Matching:**

> "In order to determine the parent idTag, the Charge Point MAY look it up in Local Authorization List."

---

## 10. Error Handling

### 10.1 RPC Error Codes

| Error Code                    | 1.6 | 2.0.1 | 2.1 | Description                                |
| ----------------------------- | --- | ----- | --- | ------------------------------------------ |
| NotImplemented                | ✓   | ✓     | ✓   | Action not implemented                     |
| NotSupported                  | ✓   | ✓     | ✓   | Action recognized but not supported        |
| InternalError                 | ✓   | ✓     | ✓   | Internal error during processing           |
| ProtocolError                 | ✓   | ✓     | ✓   | Payload incomplete or incorrect            |
| SecurityError                 | ✓   | ✓     | ✓   | Security policy violation                  |
| FormationViolation            | ✓   | ✓     | ✓   | Payload syntactically incorrect            |
| PropertyConstraintViolation   | ✓   | ✓     | ✓   | Property value constraint violated         |
| OccurrenceConstraintViolation | ✓   | ✓     | ✓   | Required property missing or too many      |
| TypeConstraintViolation       | ✓   | ✓     | ✓   | Property type incorrect                    |
| GenericError                  | ✓   | ✓     | ✓   | Any other error                            |
| RpcFrameworkError             | ✗   | ✓     | ✓   | RPC framework error (2.0.1+)               |
| MessageTypeNotSupported       | ✗   | ✓     | ✓   | Message type ID not supported              |
| FormatViolation               | ✗   | ✗     | ✓   | 2.1: More specific than FormationViolation |

**OCPP 2.1 Error Code Transition:**

- Both `FormationViolation` and `FormatViolation` exist in 2.1 for backwards compatibility
- Implementations SHOULD prefer `FormatViolation` for new messages in 2.1

**Spec References:**

- OCPP 1.6-J: §4.2 Error Codes
- OCPP 2.0.1 Part 4: §4.2.3 Error Codes
- OCPP 2.1 Part 4: §4.2.3 Error Codes

### 10.2 Error Response Requirements

| Requirement                                                             | Version | Spec Reference |
| ----------------------------------------------------------------------- | ------- | -------------- |
| Unknown MessageId in CALLRESULT/CALLERROR SHALL be logged and discarded | All     | §4.2           |
| CALLERROR SHALL contain same MessageId as failed CALL                   | All     | §4.2           |
| SecurityError SHALL be returned for messages from non-accepted CS       | 2.0.1+  | B03.FR.07      |

### 10.3 Timeout Handling

| Aspect          | 1.6                     | 2.0.1                      | 2.1                        |
| --------------- | ----------------------- | -------------------------- | -------------------------- |
| Default timeout | Implementation-specific | 30 seconds recommended     | 30 seconds recommended     |
| Timeout action  | Treat as failed         | Treat as failed            | Treat as failed            |
| Retry           | Implementation-specific | TransactionMessageAttempts | TransactionMessageAttempts |

### 10.4 Smart Charging Error Handling (OCPP 1.6)

**Invalid ChargingRateUnit (Errata §3.24, §3.38):**

> "If an invalid value is used for chargingRateUnit in GetCompositeSchedule.req or SetChargingProfile.req, then Charge Point SHALL respond with CALLERROR: PropertyConstraintViolation."

**Invalid ConnectorId (Errata §3.39):**

> "If an invalid value for connectorId is used in SetChargingProfile.req, then the Charge Point SHALL respond with CALLERROR: PropertyConstraintViolation."

**Smart Charging Not Supported (Errata §3.39):**

> "If the Charge Point does not support smart charging, then it SHALL respond with CALLERROR: NotSupported."

---

## References

### OCPP 1.6

| Document                 | Description                    |
| ------------------------ | ------------------------------ |
| OCPP 1.6 Edition 2       | Core specification             |
| OCPP-J 1.6 Specification | JSON/WebSocket protocol        |
| OCPP 1.6 Errata Sheet    | Clarifications and corrections |

### OCPP 2.0.1

| Document                        | Description                |
| ------------------------------- | -------------------------- |
| Part 0: Introduction            | Overview                   |
| Part 1: Architecture & Topology | System architecture        |
| Part 2: Specification           | Use cases and requirements |
| Part 3: JSON Schemas            | Message schemas            |
| Part 4: OCPP-J Specification    | JSON/WebSocket protocol    |
| Part 5: Certification Profiles  | Certification requirements |
| Part 6: Test Cases              | Certification test cases   |
| Errata 2025-09                  | Latest corrections         |

### OCPP 2.1

| Document                     | Description                                           |
| ---------------------------- | ----------------------------------------------------- |
| Part 4: OCPP-J Specification | JSON/WebSocket protocol (incl. CALLRESULTERROR, SEND) |

---

## Appendix A: Cross-Version Quick Reference

### A.1 Message Name Mapping

| Function           | OCPP 1.6               | OCPP 2.0.1 / 2.1             |
| ------------------ | ---------------------- | ---------------------------- |
| Boot               | BootNotification       | BootNotification             |
| Heartbeat          | Heartbeat              | Heartbeat                    |
| Status             | StatusNotification     | StatusNotification           |
| Start transaction  | StartTransaction       | TransactionEvent (Started)   |
| Stop transaction   | StopTransaction        | TransactionEvent (Ended)     |
| Meter values       | MeterValues            | TransactionEvent (Updated)   |
| Authorize          | Authorize              | Authorize                    |
| Remote start       | RemoteStartTransaction | RequestStartTransaction      |
| Remote stop        | RemoteStopTransaction  | RequestStopTransaction       |
| Get config         | GetConfiguration       | GetVariables / GetBaseReport |
| Set config         | ChangeConfiguration    | SetVariables                 |
| Reset              | Reset                  | Reset                        |
| Reserve            | ReserveNow             | ReserveNow                   |
| Cancel reservation | CancelReservation      | CancelReservation            |

### A.2 Reconnection Behavior

| Aspect            | OCPP 1.6 | OCPP 2.0.1 / 2.1                                                          |
| ----------------- | -------- | ------------------------------------------------------------------------- |
| Back-off required | No       | Yes (exponential)                                                         |
| Randomization     | No       | Required                                                                  |
| Config parameters | N/A      | RetryBackOffWaitMinimum, RetryBackOffRandomRange, RetryBackOffRepeatTimes |

**OCPP 2.0.1 Part 4 §5.4:**

> "The Charging Station SHALL implement exponential back-off with randomization when reconnecting to avoid thundering herd."

**Back-Off Formula:**

```
wait_time = min(RetryBackOffWaitMinimum × 2^attempt, max_wait) + random(0, RetryBackOffRandomRange)
```

### A.3 Security Profiles

| Profile | Auth Method        | TLS | Certificate |
| ------- | ------------------ | --- | ----------- |
| 0       | None               | No  | No          |
| 1       | Basic Auth         | No  | No          |
| 2       | Basic Auth         | Yes | Server only |
| 3       | Client Certificate | Yes | Mutual TLS  |

---

## Appendix B: Requirement ID Index

### OCPP 2.0.1 Requirements Referenced

| ID        | Section  | Summary                                          |
| --------- | -------- | ------------------------------------------------ |
| B01.FR.01 | Boot     | CS SHALL send BootNotificationRequest            |
| B01.FR.02 | Boot     | CSMS SHALL respond with acceptance status        |
| B01.FR.03 | Boot     | CS SHALL send BootNotification on each boot      |
| B01.FR.04 | Boot     | Adjust heartbeat interval from response          |
| B01.FR.05 | Boot     | Send StatusNotification after Accepted           |
| B01.FR.06 | Boot     | Synchronize clock with CSMS time                 |
| B01.FR.07 | Boot     | Unavailable persists across reboot               |
| B01.FR.08 | Boot     | No other requests before successful boot         |
| B01.FR.09 | Boot     | Include reason field in BootNotification         |
| B01.FR.10 | Boot     | SecurityError for non-boot messages              |
| B01.FR.11 | Boot     | Check SerialNumber against Certificate CN        |
| B01.FR.12 | Boot     | Close WebSocket on SerialNumber mismatch         |
| B01.FR.13 | Boot     | Reserved state persists across reboot            |
| B02.FR.01 | Pending  | Respond to CSMS messages                         |
| B02.FR.02 | Pending  | No CALL except BootNotification                  |
| B02.FR.03 | Pending  | May queue transactions                           |
| B02.FR.04 | Pending  | Respect interval before retry                    |
| B02.FR.05 | Pending  | Reject RequestStartTransaction                   |
| B02.FR.06 | Pending  | Keep connection open                             |
| B02.FR.07 | Pending  | Choose interval if zero                          |
| B02.FR.08 | Pending  | Retry after interval expires                     |
| B02.FR.09 | Pending  | SecurityError for unauthorized messages          |
| B03.FR.01 | Rejected | May allow local transactions                     |
| B03.FR.02 | Rejected | No messages until interval expires               |
| B03.FR.03 | Rejected | CSMS SHALL NOT initiate                          |
| B03.FR.04 | Rejected | May close connection                             |
| B03.FR.05 | Rejected | Choose interval if zero                          |
| B03.FR.06 | Rejected | Retry after interval                             |
| B03.FR.07 | Rejected | SecurityError for non-boot messages              |
| B03.FR.08 | Rejected | SecurityError if CSMS sends during rejected      |
| B04.FR.01 | Offline  | StatusNotification for all after threshold       |
| B04.FR.02 | Offline  | StatusNotification for changed only              |
| B05.FR.01 | Config   | Respond with equal SetVariableResult count       |
| B05.FR.02 | Config   | Match component/variable in result               |
| B05.FR.03 | Config   | Match attributeType in result                    |
| B05.FR.04 | Config   | UnknownComponent for unknown                     |
| B05.FR.05 | Config   | UnknownVariable for unknown                      |
| B05.FR.06 | Config   | NotSupportedAttributeType for unknown type       |
| B05.FR.07 | Config   | Rejected for invalid format                      |
| B05.FR.08 | Config   | Rejected for read-only                           |
| B05.FR.09 | Config   | RebootRequired status                            |
| B05.FR.10 | Config   | Accepted when successfully set                   |
| B05.FR.11 | Config   | CSMS respects ItemsPerMessage limit              |
| B05.FR.12 | Config   | Default attributeType is Actual                  |
| B05.FR.13 | Config   | No duplicate SetVariableData                     |
| B11.FR.05 | Reset    | Reserved status persists                         |
| E01.FR.01 | Trans    | Transaction may start on ParkingBayOccupancy     |
| E01.FR.02 | Trans    | Transaction may start on EVConnected             |
| E01.FR.03 | Trans    | Transaction may start on Authorized              |
| E01.FR.04 | Trans    | Transaction may start on DataSigned              |
| E01.FR.05 | Trans    | Transaction may start on PowerPathClosed         |
| E01.FR.06 | Trans    | Transaction may start on EnergyTransfer          |
| E01.FR.07 | Trans    | seqNo requirements in TransactionEvent           |
| E01.FR.08 | Trans    | transactionId MUST be unique                     |
| E01.FR.09 | Trans    | Include measurands at Transaction.Begin          |
| E01.FR.10 | Trans    | Include IdTokenType information                  |
| E01.FR.11 | Trans    | CSMS verifies identifier validity                |
| E01.FR.12 | Trans    | CSMS includes authorization status               |
| E01.FR.13 | Trans    | Include reservationId when consuming reservation |
| E01.FR.14 | Trans    | No second transaction on same EVSE               |
| E01.FR.15 | Trans    | Set triggerReason appropriately                  |
| E01.FR.16 | Trans    | evse field only in first TransactionEvent        |
| E01.FR.17 | Trans    | Measurands when EVSE unknown at start            |
| E01.FR.18 | Trans    | TransactionEvent on charging state change        |
| E01.FR.19 | Trans    | Handle EV suspension                             |
| E01.FR.20 | Trans    | Handle EVSE suspension                           |
| E04.FR.03 | Offline  | Offline flag for offline transactions            |
| E04.FR.07 | Offline  | May drop intermediate messages in low memory     |
| E04.FR.08 | Offline  | Never drop Started/Ended events                  |
| H01.FR.07 | Reserve  | Keep one EVSE available for reserved token       |
| H04.FR.01 | Reserve  | ReservationStatusUpdate on expiry                |

### OCPP 1.6 Errata Referenced

| Section | Summary                                                            |
| ------- | ------------------------------------------------------------------ |
| §3.8    | Connector numbering requirements (1-based, sequential, no gaps)    |
| §3.11   | BootNotification after restart requirement                         |
| §3.14.3 | Multi-phase measurand reporting                                    |
| §3.14.4 | Unsupported measurands rejection                                   |
| §3.15   | MeterValues SHALL be sent when interval > 0                        |
| §3.18   | transactionId = -1 on StartTransaction failure                     |
| §3.19   | StatusNotification SHALL be sent on status change (clarification)  |
| §3.23   | ClearCache rejection when not implemented                          |
| §3.24   | Invalid ChargingRateUnit error handling                            |
| §3.36   | StopTransaction before Reset                                       |
| §3.37   | ChargingProfile persistence across reboots                         |
| §3.38   | GetCompositeSchedule error handling                                |
| §3.39   | SetChargingProfile error handling (connectorId, NotSupported)      |
| §3.40   | TriggerMessage(BootNotification) after Accepted should be rejected |
| §5.13   | ReserveNow conflict resolution and expiry behavior                 |

---

_Document generated for e-mobility-charging-stations-simulator test suite._
_Last updated: 2025-02-27_
