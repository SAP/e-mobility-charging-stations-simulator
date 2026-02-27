# OCPP Specification Requirements Reference

This document serves as the **single source of truth** for OCPP specification requirements used in test expectations. It covers OCPP versions 1.6, 2.0.1, and 2.1 across all test domains.

> **Purpose**: Spec-only reference document. No implementation details.
> **Sources**: Official OCA OCPP specifications (see [References](#references))

---

## Table of Contents

1. [Lifecycle](#1-lifecycle)
2. [Connectors and EVSE](#2-connectors-and-evse)
3. [Heartbeat](#3-heartbeat)
4. [Transactions](#4-transactions)
5. [WebSocket](#5-websocket)
6. [Error Handling](#6-error-handling)
7. [Boot Notification](#7-boot-notification)
8. [Configuration](#8-configuration)
9. [Message Buffering](#9-message-buffering)
10. [Reservations](#10-reservations)
11. [References](#references)

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

| Item                  | 1.6 | 2.0.1 | 2.1 | Requirement                              |
| --------------------- | --- | ----- | --- | ---------------------------------------- |
| Unavailable status    | ✓   | ✓     | ✓   | SHALL persist across reboots (B01.FR.07) |
| Reserved status       | ✓   | ✓     | ✓   | SHALL persist across reboots (B11.FR.05) |
| Configuration changes | ✓   | ✓     | ✓   | Persisted unless volatile                |

---

## 2. Connectors and EVSE

### 2.1 Connector Model Differences

| Aspect      | OCPP 1.6             | OCPP 2.0.1 / 2.1                    |
| ----------- | -------------------- | ----------------------------------- |
| Hierarchy   | Flat: Connector only | EVSE → Connector                    |
| Connector 0 | Optional aggregate   | Connector 0 on EVSE 0 represents CS |
| Numbering   | 1-based connectors   | EVSE 0 = CS; Connector IDs per EVSE |

**Spec References:**

- OCPP 1.6: §3.7 StatusNotification
- OCPP 2.0.1: Part 1 Architecture §2.2, Part 2 §C01

### 2.2 Connector Status Values

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

### 2.3 Status Notification Requirements

| Requirement ID | Version | Requirement                                                                                    |
| -------------- | ------- | ---------------------------------------------------------------------------------------------- |
| -              | 1.6     | CS SHALL send StatusNotification when connector status changes                                 |
| B01.FR.05      | 2.0.1   | After Accepted boot, CS SHALL send StatusNotification for each Connector                       |
| B04.FR.01      | 2.0.1   | After offline > OfflineThreshold, CS SHALL send StatusNotification for all Connectors          |
| B04.FR.02      | 2.0.1   | After offline ≤ OfflineThreshold, CS SHALL send StatusNotification only for changed Connectors |

---

## 3. Heartbeat

### 3.1 Heartbeat Purpose

| Purpose                 | 1.6 | 2.0.1 | 2.1 |
| ----------------------- | --- | ----- | --- |
| Connectivity keep-alive | ✓   | ✓     | ✓   |
| Time synchronization    | ✓   | ✓     | ✓   |
| Clock correction        | ✓   | ✓     | ✓   |

**Spec References:**

- OCPP 1.6: §4.4 Heartbeat
- OCPP 2.0.1: Part 4 §5.3
- OCPP 2.1: Part 4 §5.3

### 3.2 Heartbeat Interval

| Aspect                 | 1.6                          | 2.0.1                              | 2.1                               |
| ---------------------- | ---------------------------- | ---------------------------------- | --------------------------------- |
| Source                 | HeartbeatInterval config key | BootNotificationResponse.interval  | BootNotificationResponse.interval |
| Minimum                | No spec minimum              | Configurable                       | Configurable                      |
| Adjustment on Accepted | From HeartbeatInterval       | From response interval (B01.FR.04) | From response interval            |

### 3.3 Heartbeat Optimization

| Optimization              | 1.6 | 2.0.1 | 2.1 | Description                                    |
| ------------------------- | --- | ----- | --- | ---------------------------------------------- |
| Skip on activity          | ✓   | ✓     | ✓   | Can skip if other PDU sent recently            |
| Minimum for clock         | ✓   | ✓     | ✓   | At least 1/day for clock sync                  |
| WebSocket ping substitute | ✓   | ✓     | ✓   | Ping/pong for connectivity only, not time sync |

**OCPP 1.6 §4.4:**

> "A Charging Station can skip sending Heartbeat request if another PDU has been sent within the heartbeat interval."

**OCPP 2.0.1 Part 4 §5.3:**

> "A Charging Station SHOULD NOT send heartbeats during ongoing communication with CSMS. [...] At least send one heartbeat per 24 hours if WebSocket ping/pong is used for keep-alive."

---

## 4. Transactions

### 4.1 Transaction Lifecycle

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

### 4.2 Transaction ID Requirements

| Aspect        | 1.6                                      | 2.0.1               | 2.1                 |
| ------------- | ---------------------------------------- | ------------------- | ------------------- |
| Source        | CSMS assigns in StartTransactionResponse | CS generates (UUID) | CS generates (UUID) |
| Type          | Integer                                  | String (UUID)       | String (UUID)       |
| Failure value | **-1** (Errata §3.18)                    | N/A                 | N/A                 |

**OCPP 1.6 Errata §3.18 (Critical):**

> "If StartTransaction fails (no response), the Charging Station SHALL use transactionId = -1 for subsequent StopTransaction and MeterValues."

### 4.3 Authorization Requirements

| Requirement           | 1.6                                    | 2.0.1                        | 2.1                          |
| --------------------- | -------------------------------------- | ---------------------------- | ---------------------------- |
| Pre-authorization     | Optional via AuthorizeRemoteTxRequests | Configurable                 | Configurable                 |
| Local authorization   | LocalAuthListEnabled                   | LocalAuthListCtrlrEnabled    | LocalAuthListCtrlrEnabled    |
| Remote start          | RemoteStartTransaction                 | RequestStartTransaction      | RequestStartTransaction      |
| Offline authorization | LocalAuthorizeOffline config           | OfflineTxForUnknownIdEnabled | OfflineTxForUnknownIdEnabled |

### 4.4 Meter Values Requirements

| Aspect              | 1.6                          | 2.0.1                              | 2.1                                |
| ------------------- | ---------------------------- | ---------------------------------- | ---------------------------------- |
| Measurands          | MeterValuesSampledData (CSL) | sampled/aligned contexts           | sampled/aligned contexts           |
| Interval            | MeterValueSampleInterval     | SampledDataCtrlr.TxUpdatedInterval | SampledDataCtrlr.TxUpdatedInterval |
| Transaction binding | transactionId in MeterValues | Included in TransactionEvent       | Included in TransactionEvent       |

---

## 5. WebSocket

### 5.1 OCPP-J Protocol

OCPP-J uses JSON over WebSocket with SRPC (Simple Remote Procedure Call) framework.

**Spec References:**

- OCPP 1.6-J: ocpp-j-1.6-specification
- OCPP 2.0.1: Part 4 OCPP-J Specification
- OCPP 2.1: Part 4 OCPP-J Specification

### 5.2 Message Types

| Type ID | Name            | 1.6 | 2.0.1 | 2.1 | Format                                                      |
| ------- | --------------- | --- | ----- | --- | ----------------------------------------------------------- |
| 2       | CALL            | ✓   | ✓     | ✓   | `[2, MessageId, Action, Payload]`                           |
| 3       | CALLRESULT      | ✓   | ✓     | ✓   | `[3, MessageId, Payload]`                                   |
| 4       | CALLERROR       | ✓   | ✓     | ✓   | `[4, MessageId, ErrorCode, ErrorDescription, ErrorDetails]` |
| 5       | CALLRESULTERROR | ✗   | ✗     | ✓   | `[5, MessageId, ErrorCode, ErrorDescription, ErrorDetails]` |
| 6       | SEND            | ✗   | ✗     | ✓   | `[6, Action, Payload]` (unconfirmed)                        |

**OCPP 2.1 Additions:**

- **CALLRESULTERROR (5)**: Error response to a CALLRESULT (response validation failed)
- **SEND (6)**: Unconfirmed message (no response expected)

### 5.3 WebSocket Subprotocol

| Version | Subprotocol Name | IANA Registered |
| ------- | ---------------- | --------------- |
| 1.6     | `ocpp1.6`        | Yes             |
| 2.0     | `ocpp2.0`        | Yes             |
| 2.0.1   | `ocpp2.0.1`      | Yes             |
| 2.1     | `ocpp2.1`        | Yes             |

**Negotiation Requirement (All Versions):**

> "The Charging Station SHALL include the OCPP version specific subprotocol in the Sec-WebSocket-Protocol header. The CSMS SHALL respond with the same subprotocol."

### 5.4 WebSocket Ping/Pong

| Aspect               | 1.6                   | 2.0.1                 | 2.1                   |
| -------------------- | --------------------- | --------------------- | --------------------- |
| Support required     | Recommended           | Required              | Required              |
| Interval config      | WebSocketPingInterval | WebSocketPingInterval | WebSocketPingInterval |
| Purpose              | Keep-alive only       | Keep-alive only       | Keep-alive only       |
| Time sync substitute | No                    | No                    | No                    |

**OCPP 2.0.1 Part 4 §5.3:**

> "WebSocket ping/pong SHALL NOT be used for time synchronization. The Charging Station SHALL still send Heartbeat for clock correction."

### 5.5 Connection Management

| Aspect      | 1.6                             | 2.0.1                            | 2.1                              |
| ----------- | ------------------------------- | -------------------------------- | -------------------------------- |
| URL format  | `ws(s)://host:port/path/{csId}` | Same                             | Same                             |
| Basic auth  | Optional                        | Optional                         | Optional                         |
| TLS         | Recommended                     | Required for Security Profile 2+ | Required for Security Profile 2+ |
| Certificate | Optional                        | Required for Profile 3           | Required for Profile 3           |

---

## 6. Error Handling

### 6.1 RPC Error Codes

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

**Spec References:**

- OCPP 1.6-J: §4.2 Error Codes
- OCPP 2.0.1 Part 4: §4.2.3 Error Codes
- OCPP 2.1 Part 4: §4.2.3 Error Codes

### 6.2 Error Response Requirements

| Requirement                                                             | Version | Spec Reference |
| ----------------------------------------------------------------------- | ------- | -------------- |
| Unknown MessageId in CALLRESULT/CALLERROR SHALL be logged and discarded | All     | §4.2           |
| CALLERROR SHALL contain same MessageId as failed CALL                   | All     | §4.2           |
| SecurityError SHALL be returned for messages from non-accepted CS       | 2.0.1+  | B03.FR.07      |

### 6.3 Timeout Handling

| Aspect          | 1.6                     | 2.0.1                      | 2.1                        |
| --------------- | ----------------------- | -------------------------- | -------------------------- |
| Default timeout | Implementation-specific | 30 seconds recommended     | 30 seconds recommended     |
| Timeout action  | Treat as failed         | Treat as failed            | Treat as failed            |
| Retry           | Implementation-specific | TransactionMessageAttempts | TransactionMessageAttempts |

---

## 7. Boot Notification

### 7.1 Boot Notification Flow

```
CS Power On → BootNotificationRequest → BootNotificationResponse → [StatusNotification...]
```

### 7.2 Boot Notification Request Content

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

### 7.3 Boot Notification Response Content

| Field       | 1.6 | 2.0.1 | 2.1 | Description                         |
| ----------- | --- | ----- | --- | ----------------------------------- |
| status      | ✓   | ✓     | ✓   | Accepted/Pending/Rejected           |
| currentTime | ✓   | ✓     | ✓   | CSMS current time (ISO 8601)        |
| interval    | ✓   | ✓     | ✓   | Heartbeat/retry interval in seconds |

### 7.4 Boot Notification State Requirements

| State    | Requirement                                                                    | Spec Reference |
| -------- | ------------------------------------------------------------------------------ | -------------- |
| Pending  | CS SHALL NOT send CALL messages except BootNotification                        | B02.FR.02      |
| Pending  | CS SHALL respond to CSMS messages (GetVariables, SetVariables, TriggerMessage) | B02.FR.01      |
| Pending  | CS MAY queue transactions if configured                                        | B02.FR.03      |
| Rejected | CS SHALL NOT send any OCPP message until interval expires                      | B03.FR.02      |
| Rejected | CS MAY close connection until next retry                                       | B03.FR.04      |
| Rejected | CSMS SHALL NOT initiate messages                                               | B03.FR.03      |

### 7.5 TriggerMessage After Boot (OCPP 1.6 Errata §3.40)

**Critical Clarification:**

> "After a Charging Station has been Accepted, a TriggerMessage for BootNotification SHOULD be rejected with status 'NotImplemented' or 'Rejected'."

---

## 8. Configuration

### 8.1 Configuration Model Differences

| Aspect    | OCPP 1.6            | OCPP 2.0.1 / 2.1                                |
| --------- | ------------------- | ----------------------------------------------- |
| Model     | Key-Value pairs     | Device Model (Component/Variable)               |
| Read      | GetConfiguration    | GetVariables / GetBaseReport                    |
| Write     | ChangeConfiguration | SetVariables                                    |
| Structure | Flat                | Hierarchical (Component → Variable → Attribute) |

### 8.2 Key Configuration Parameters (OCPP 1.6)

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

### 8.3 Device Model (OCPP 2.0.1 / 2.1)

| Component        | Variable                     | Description               |
| ---------------- | ---------------------------- | ------------------------- |
| OCPPCommCtrlr    | HeartbeatInterval            | Heartbeat interval        |
| OCPPCommCtrlr    | WebSocketPingInterval        | WebSocket ping interval   |
| OCPPCommCtrlr    | NetworkConfigurationPriority | Connection priority order |
| AuthCtrlr        | LocalAuthorizeOffline        | Offline authorization     |
| SampledDataCtrlr | TxUpdatedInterval            | Meter value interval      |

### 8.4 Configuration Requirements

| Requirement                          | 1.6 | 2.0.1 | 2.1 | Spec Reference  |
| ------------------------------------ | --- | ----- | --- | --------------- |
| Unknown key → UnknownKey status      | ✓   | N/A   | N/A | §7.2            |
| Unknown component → UnknownComponent | N/A | ✓     | ✓   | B05.FR.04       |
| Unknown variable → UnknownVariable   | N/A | ✓     | ✓   | B05.FR.05       |
| Read-only key → Rejected             | ✓   | ✓     | ✓   | §7.2, B05.FR.08 |
| Reboot required → RebootRequired     | ✓   | ✓     | ✓   | §7.2, B05.FR.09 |

---

## 9. Message Buffering

### 9.1 Offline Message Queue

| Aspect      | 1.6                     | 2.0.1                | 2.1                  |
| ----------- | ----------------------- | -------------------- | -------------------- |
| Required    | Recommended             | Required             | Required             |
| Queue scope | Transaction messages    | Transaction messages | Transaction messages |
| Order       | FIFO                    | FIFO                 | FIFO                 |
| Persistence | Implementation-specific | Required             | Required             |

### 9.2 Message Retry Requirements

| Parameter                       | 1.6 | 2.0.1 | 2.1 | Description              |
| ------------------------------- | --- | ----- | --- | ------------------------ |
| TransactionMessageAttempts      | ✓   | ✓     | ✓   | Number of retry attempts |
| TransactionMessageRetryInterval | ✓   | ✓     | ✓   | Seconds between retries  |

### 9.3 Queue Behavior on Reconnection

| Behavior          | 1.6                     | 2.0.1        | 2.1          | Requirement                |
| ----------------- | ----------------------- | ------------ | ------------ | -------------------------- |
| Send queued first | Recommended             | Required     | Required     | Queued messages before new |
| Maintain order    | Recommended             | Required     | Required     | FIFO order preserved       |
| Drop on overflow  | Implementation-specific | Oldest first | Oldest first | If queue full              |

**OCPP 2.0.1 B04:**

> "After connection restored, the Charging Station SHALL send queued transaction messages in order before sending new messages."

---

## 10. Reservations

### 10.1 Reservation Support

| Aspect              | 1.6                           | 2.0.1                         | 2.1                           |
| ------------------- | ----------------------------- | ----------------------------- | ----------------------------- |
| Profile             | Reservation Profile           | Core feature                  | Core feature                  |
| Commands            | ReserveNow, CancelReservation | ReserveNow, CancelReservation | ReserveNow, CancelReservation |
| Connector 0 support | ReserveConnectorZeroSupported | EVSE 0 reservation            | EVSE 0 reservation            |

### 10.2 ReserveNow Requirements

| Field                      | 1.6 | 2.0.1 | 2.1 | Description                   |
| -------------------------- | --- | ----- | --- | ----------------------------- |
| connectorId / evseId       | ✓   | ✓     | ✓   | Target connector/EVSE         |
| expiryDate                 | ✓   | ✓     | ✓   | Reservation expiry (ISO 8601) |
| idTag / idToken            | ✓   | ✓     | ✓   | Reserved for this token       |
| reservationId              | ✓   | ✓     | ✓   | Unique reservation identifier |
| parentIdTag / groupIdToken | ✓   | ✓     | ✓   | Optional group token          |

### 10.3 Reservation Status Response

| Status      | 1.6 | 2.0.1 | 2.1 | Description              |
| ----------- | --- | ----- | --- | ------------------------ |
| Accepted    | ✓   | ✓     | ✓   | Reservation successful   |
| Faulted     | ✓   | ✓     | ✓   | Connector in fault       |
| Occupied    | ✓   | ✓     | ✓   | Connector already in use |
| Rejected    | ✓   | ✓     | ✓   | Reservation rejected     |
| Unavailable | ✓   | ✓     | ✓   | Connector unavailable    |

### 10.4 Reservation Persistence

| Requirement                                               | Spec Reference                    |
| --------------------------------------------------------- | --------------------------------- |
| Reserved status SHALL persist across reboots              | B11.FR.05 (2.0.1)                 |
| Reservation SHALL expire at expiryDate                    | §8.5 (1.6), Reservation use cases |
| CS SHALL send StatusNotification when reservation expires | All versions                      |

### 10.5 Connector 0 / EVSE 0 Reservation

**OCPP 1.6:**

> "If connectorId = 0, the Charging Station SHALL reserve the next available connector."

**Configuration:** `ReserveConnectorZeroSupported` (Boolean)

**OCPP 2.0.1 / 2.1:**

> "If evseId = 0, the Charging Station SHALL reserve the entire Charging Station (any EVSE)."

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

| ID        | Section  | Summary                                    |
| --------- | -------- | ------------------------------------------ |
| B01.FR.04 | Boot     | Adjust heartbeat interval from response    |
| B01.FR.05 | Boot     | Send StatusNotification after Accepted     |
| B01.FR.07 | Boot     | Unavailable persists across reboot         |
| B02.FR.01 | Pending  | Respond to CSMS messages                   |
| B02.FR.02 | Pending  | No CALL except BootNotification            |
| B02.FR.03 | Pending  | May queue transactions                     |
| B03.FR.02 | Rejected | No messages until interval expires         |
| B03.FR.03 | Rejected | CSMS shall not initiate                    |
| B03.FR.04 | Rejected | May close connection                       |
| B03.FR.07 | Rejected | SecurityError for non-boot messages        |
| B04.FR.01 | Offline  | StatusNotification for all after threshold |
| B04.FR.02 | Offline  | StatusNotification for changed only        |
| B05.FR.04 | Config   | UnknownComponent for unknown               |
| B05.FR.05 | Config   | UnknownVariable for unknown                |
| B05.FR.08 | Config   | Rejected for read-only                     |
| B05.FR.09 | Config   | RebootRequired status                      |
| B11.FR.05 | Reset    | Reserved status persists                   |

### OCPP 1.6 Errata Referenced

| Section | Summary                                                            |
| ------- | ------------------------------------------------------------------ |
| §3.18   | transactionId = -1 on StartTransaction failure                     |
| §3.40   | TriggerMessage(BootNotification) after Accepted should be rejected |

---

_Document generated for e-mobility-charging-stations-simulator test suite._
_Last updated: 2025-02-27_
