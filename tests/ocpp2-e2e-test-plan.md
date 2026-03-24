# OCPP 2.0.1 End-to-End Test Plan

Comprehensive test scenarios for validating the e-mobility charging station simulator's OCPP 2.0.1 stack.
Executed via MCP tools against the Python mock OCPP server (`tests/ocpp-server/server.py`).

## Conventions

- **Mock server**: `tests/ocpp-server/server.py` — managed by the tester (start/stop/restart with options)
- **Simulator**: Already running with 1 OCPP 2.0.1 station — **not managed** by the tester
- **Station template**: `keba-ocpp2.station-template.json`
- **Station ID**: `CS-KEBA-OCPP2-00001`
- **Station hashId**: `e9041c294a82a2d6aa194a801c3ba39d6b24d1cb16c0a0b3db4e37c9fe4e80cbb0808843f66a320b3f58df0288c8e98a`
- **EVSE ID**: 1, **Connector ID**: 1
- **Default supervision URL**: `ws://localhost:9000`
- **Mock server startup**: `cd tests/ocpp-server && poetry run python server.py [OPTIONS]`
- **Reconnect**: Station auto-reconnects when server restarts (~30s). Wait for `BootNotification` Accepted before proceeding.

### Server Lifecycle Pattern

```
1. Kill previous server instance (Ctrl+C or SIGTERM)
2. Start server with new options:  poetry run python server.py [OPTIONS]
3. Wait for station reconnection (check via listChargingStations → bootNotificationResponse.status)
4. Execute test cases
5. Verify results (logs, station state, MCP responses)
```

### Verification Methods

- **MCP state**: `listChargingStations` → inspect station data, connector status, EVSE status
- **MCP logs**: `readCombinedLog` → check OCPP message exchange
- **MCP error logs**: `readErrorLog` → check for unexpected errors
- **MCP response**: Direct tool response (status: success/failure, responsesFailed)

### IMPORTANT: Enum Casing

The mock server uses Python `ocpp` library enums which are **Title-Case**:

- `--boot-status Accepted` (NOT `accepted`)
- `--boot-status Rejected` (NOT `rejected`)
- `--boot-status Pending` (NOT `pending`)

### IMPORTANT: Do NOT Touch the Simulator

The OCPP mock server is the only component managed during testing.
**NEVER** call `stopChargingStation`, `startChargingStation`, `addChargingStations`, or `deleteChargingStations`.
The simulator auto-reconnects when the mock server restarts (~30s backoff).

### Pass/Fail Criteria

A test case **passes** when ALL of the following are true:

1. MCP tool response contains `"status": "success"` (no `responsesFailed`)
2. `readCombinedLog` contains the expected OCPP message names in the correct order
3. `listChargingStations` shows the expected station/connector state after the test
4. `readErrorLog` contains no unexpected errors caused by the test

A test case **fails** if any expected result is not met.

### Timestamp Convention

All `<ISO8601>` placeholders must be replaced with the current UTC timestamp at execution time,
e.g., `2026-03-24T17:30:00.000Z`. The MCP tools may auto-generate timestamps where applicable.

---

## Test Group 1 — Provisioning: Boot Accepted (Normal Flow)

### Server Setup

```bash
poetry run python server.py --boot-status accepted
```

### TC-B01: Cold Boot — Accepted

**OCPP Use Case**: B01 — Cold Boot Charging Station

**Pre-conditions**: Server running with `--boot-status accepted`

**Steps**:

1. `stopChargingStation` (hashIds: [station])
2. Wait 5s
3. `startChargingStation` (hashIds: [station])
4. Wait 10s for boot cycle
5. `listChargingStations`

**Expected Results**:

- `bootNotificationResponse.status` = `Accepted`
- `bootNotificationResponse.interval` = 60
- `bootNotificationResponse.currentTime` is a valid ISO 8601 timestamp
- EVSE 1 / Connector 1 status = `Available`
- `readCombinedLog` shows: BootNotificationRequest sent, BootNotificationResponse received with Accepted
- `readCombinedLog` shows: StatusNotification sent for connector with Available status

---

## Test Group 2 — Provisioning: Boot Rejected

### Server Setup

```bash
poetry run python server.py --boot-status rejected
```

Wait for station reconnection attempt.

### TC-B03: Cold Boot — Rejected

**OCPP Use Case**: B03 — Cold Boot Charging Station - Rejected

**Pre-conditions**: Server running with `--boot-status rejected`

**Steps**:

1. `stopChargingStation` (hashIds: [station])
2. Wait 5s
3. `startChargingStation` (hashIds: [station])
4. Wait 15s (station will retry)
5. `listChargingStations`
6. `readCombinedLog`

**Expected Results**:

- `bootNotificationResponse.status` = `Rejected`
- Station keeps retrying BootNotification at configured interval
- No StatusNotification sent (station not accepted)
- Log shows repeated BootNotification attempts

---

## Test Group 3 — Provisioning: Boot Pending

### Server Setup

```bash
poetry run python server.py --boot-status pending
```

### TC-B02: Cold Boot — Pending

**OCPP Use Case**: B02 — Cold Boot Charging Station - Pending

**Pre-conditions**: Server running with `--boot-status pending`

**Steps**:

1. `stopChargingStation` (hashIds: [station])
2. Wait 5s
3. `startChargingStation` (hashIds: [station])
4. Wait 15s
5. `listChargingStations`
6. `readCombinedLog`

**Expected Results**:

- `bootNotificationResponse.status` = `Pending`
- Station retries BootNotification at the interval specified in response
- Station should not send messages other than BootNotification while Pending
- Log shows repeated BootNotification attempts with Pending responses

---

## Test Group 4 — Core Messaging (Normal Mode)

### Server Setup

```bash
poetry run python server.py --boot-status accepted
```

Wait for station reconnection and Accepted boot.

### TC-G02: Heartbeat

**OCPP Use Case**: G02 — Heartbeat

**Steps**:

1. `heartbeat` (hashIds: [station])
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows HeartbeatRequest sent
- Log shows HeartbeatResponse received with `currentTime` timestamp

### TC-G01: StatusNotification

**OCPP Use Case**: G01 — Status Notification

**Steps**:

1. `statusNotification` with ocpp20Payload:
   ```json
   {
     "timestamp": "<ISO8601>",
     "connectorStatus": "Available",
     "evseId": 1,
     "connectorId": 1
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows StatusNotificationRequest sent with connector status
- Log shows StatusNotificationResponse received (empty)

### TC-B06-MCP: BootNotification (Manual Trigger)

**OCPP Use Case**: B01 — BootNotification

**Steps**:

1. `bootNotification` with ocpp20Payload:
   ```json
   {
     "reason": "PowerUp",
     "chargingStation": {
       "model": "KC-P30-ESS400C2-E0R",
       "vendorName": "Keba AG"
     }
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows BootNotificationRequest sent
- Response contains status = Accepted, interval = 60

### TC-J01: MeterValues (Non-Transaction)

**OCPP Use Case**: J01 — Sending Meter Values not related to a transaction

**Steps**:

1. `meterValues` with ocpp20Payload:
   ```json
   {
     "evseId": 1,
     "meterValue": [
       {
         "timestamp": "<ISO8601>",
         "sampledValue": [
           {
             "value": 230.0,
             "measurand": "Voltage",
             "unitOfMeasure": { "unit": "V" }
           }
         ]
       }
     ]
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows MeterValuesRequest sent
- Log shows MeterValuesResponse received (empty)

### TC-P01: DataTransfer (CP → CSMS)

**OCPP Use Case**: P01 — DataTransfer

**Steps**:

1. `dataTransfer` with ocpp20Payload:
   ```json
   {
     "vendorId": "TestVendor",
     "messageId": "TestMessage",
     "data": "test_payload"
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows DataTransferRequest sent with vendorId
- Log shows DataTransferResponse with status = Accepted

### TC-A04: SecurityEventNotification

**OCPP Use Case**: A04 — Security Event Notification

**Steps**:

1. `securityEventNotification` with ocpp20Payload:
   ```json
   {
     "type": "FirmwareUpdated",
     "timestamp": "<ISO8601>"
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows SecurityEventNotificationRequest sent
- Log shows SecurityEventNotificationResponse received

### TC-L01-FW: FirmwareStatusNotification

**OCPP Use Case**: L01 — Firmware Status Notification

**Steps**:

1. `firmwareStatusNotification` with ocpp20Payload:
   ```json
   {
     "status": "Installed",
     "requestId": 1
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows FirmwareStatusNotificationRequest sent with status Installed

### TC-N01-LOG: LogStatusNotification

**OCPP Use Case**: N01 — Log Status Notification

**Steps**:

1. `logStatusNotification` with ocpp20Payload:
   ```json
   {
     "status": "Uploaded",
     "requestId": 1
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows LogStatusNotificationRequest sent

### TC-B07: NotifyReport

**OCPP Use Case**: B07 — Get Base Report / Notify Report

**Steps**:

1. `notifyReport` with ocpp20Payload:
   ```json
   {
     "requestId": 1,
     "generatedAt": "<ISO8601>",
     "seqNo": 0,
     "tbc": false
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows NotifyReportRequest sent

### TC-N02: NotifyCustomerInformation

**OCPP Use Case**: N02 — Customer Information Notification

**Steps**:

1. `notifyCustomerInformation` with ocpp20Payload:
   ```json
   {
     "data": "Customer information payload",
     "seqNo": 0,
     "generatedAt": "<ISO8601>",
     "requestId": 1
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows NotifyCustomerInformationRequest sent

### TC-M01: Get15118EVCertificate

**OCPP Use Case**: M01 — Certificate installation EV

**Steps**:

1. `get15118EVCertificate` with ocpp20Payload:
   ```json
   {
     "iso15118SchemaVersion": "urn:iso:15118:2:2013:MsgDef",
     "action": "Install",
     "exiRequest": "bW9ja19leGlfcmVxdWVzdA=="
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows Get15118EVCertificateRequest sent
- Response contains status = Accepted

### TC-M06: GetCertificateStatus

**OCPP Use Case**: M06 — Get V2G Charging Station Certificate status

**Steps**:

1. `getCertificateStatus` with ocpp20Payload:
   ```json
   {
     "ocspRequestData": {
       "hashAlgorithm": "SHA256",
       "issuerNameHash": "mock_issuer_name_hash",
       "issuerKeyHash": "mock_issuer_key_hash",
       "serialNumber": "mock_serial",
       "responderURL": "https://ocsp.example.com"
     }
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows GetCertificateStatusRequest sent
- Response status = Accepted

### TC-A03: SignCertificate

**OCPP Use Case**: A03 — Update Charging Station Certificate initiated by CS

**Steps**:

1. `signCertificate` with ocpp20Payload:
   ```json
   {
     "csr": "-----BEGIN CERTIFICATE REQUEST-----\nMIIBkTCB+wIBADBFMQswCQYD\n-----END CERTIFICATE REQUEST-----",
     "certificateType": "ChargingStationCertificate"
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- MCP response status = `success`
- Log shows SignCertificateRequest sent
- Response status = Accepted

---

## Test Group 5 — CSMS-Initiated Commands (Server → CS)

For each command, the server is started with `--command <Name> --delay 3`.
The station must be booted and connected first.

### Server Setup Pattern (per sub-test)

```bash
# Kill previous server, then:
poetry run python server.py --boot-status accepted --command <CommandName> --delay 5
```

Wait for station boot + 5s delay for command.

### TC-F06-TRIGGER: TriggerMessage

**OCPP Use Case**: F06 — Trigger Message

**Server**: `--command TriggerMessage --delay 5`

**Steps**:

1. Start server, wait for boot + command delivery (~15s)
2. `readCombinedLog`

**Expected Results**:

- Log shows TriggerMessage received from CSMS requesting StatusNotification
- Log shows TriggerMessageResponse sent with status = Accepted
- Log shows StatusNotificationRequest sent (triggered)

### TC-C01-CACHE: ClearCache

**OCPP Use Case**: C11 — Clear Authorization Data in Authorization Cache

**Server**: `--command ClearCache --delay 5`

**Steps**:

1. Start server, wait for boot + command delivery (~15s)
2. `readCombinedLog`

**Expected Results**:

- Log shows ClearCache received from CSMS
- Log shows ClearCacheResponse sent with status = Accepted

### TC-B07-GBR: GetBaseReport (Server-Initiated)

**OCPP Use Case**: B07 — Get Base Report

**Server**: `--command GetBaseReport --delay 5`

**Steps**:

1. Start server, wait for boot + command delivery (~15s)
2. `readCombinedLog`
3. `listChargingStations` (check if report data available)

**Expected Results**:

- Log shows GetBaseReport received requesting FullInventory
- Log shows GetBaseReportResponse sent with status = Accepted
- Log shows one or more NotifyReportRequests sent with device model data

### TC-B06-GV: GetVariables (Server-Initiated)

**OCPP Use Case**: B06 — Get Variables

**Server**: `--command GetVariables --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`

**Expected Results**:

- Log shows GetVariables received for ChargingStation.AvailabilityState
- Log shows GetVariablesResponse sent with variable result data

### TC-B05-SV: SetVariables (Server-Initiated)

**OCPP Use Case**: B05 — Set Variables

**Server**: `--command SetVariables --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`
3. `listChargingStations` (check HeartbeatInterval changed to 30)

**Expected Results**:

- Log shows SetVariables received for HeartbeatInterval = 30
- Log shows SetVariablesResponse sent with result status
- Station configuration updated (HeartbeatInterval = 30)

### TC-G03: ChangeAvailability (Server-Initiated)

**OCPP Use Case**: G03 — Change Availability EVSE/Connector

**Server**: `--command ChangeAvailability --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`
3. `listChargingStations`

**Expected Results**:

- Log shows ChangeAvailability received with operationalStatus = Operative
- Log shows ChangeAvailabilityResponse sent with status = Accepted

### TC-B11: Reset (Server-Initiated, Without Ongoing Transaction)

**OCPP Use Case**: B11 — Reset Without Ongoing Transaction

**Server**: `--command Reset --delay 5`

**Steps**:

1. Start server, wait ~15s (station resets)
2. Wait additional 30s (resetTime config = 30000ms)
3. `listChargingStations`
4. `readCombinedLog`

**Expected Results**:

- Log shows Reset received with type = Immediate
- Log shows ResetResponse sent with status = Accepted
- Station reboots and sends new BootNotification
- Station returns to Available after reset

### TC-F05: UnlockConnector (Server-Initiated)

**OCPP Use Case**: F05 — Remotely Unlock Connector

**Server**: `--command UnlockConnector --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`

**Expected Results**:

- Log shows UnlockConnector received for evseId=1, connectorId=1
- Log shows UnlockConnectorResponse sent with status = Unlocked

### TC-P02: DataTransfer (CSMS → CS)

**OCPP Use Case**: P01 — DataTransfer (CSMS-initiated)

**Server**: `--command DataTransfer --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`

**Expected Results**:

- Log shows DataTransfer received from CSMS (vendorId=TestVendor)
- Log shows DataTransferResponse sent with status = Accepted

### TC-B09: SetNetworkProfile (Server-Initiated)

**OCPP Use Case**: B09 — Setting a new NetworkConnectionProfile

**Server**: `--command SetNetworkProfile --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`

**Expected Results**:

- Log shows SetNetworkProfile received
- Log shows SetNetworkProfileResponse sent with status = Accepted
- Note: Per README, SetNetworkProfile validates and accepts but does NOT persist (B09.FR.01)

### TC-N01-GL: GetLog (Server-Initiated)

**OCPP Use Case**: N01 — Retrieve Log Information

**Server**: `--command GetLog --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`

**Expected Results**:

- Log shows GetLog received for DiagnosticsLog
- Log shows GetLogResponse sent with status = Accepted
- Log shows subsequent LogStatusNotification sent (Idle or uploading)

### TC-L01-UF: UpdateFirmware (Server-Initiated)

**OCPP Use Case**: L01 — Secure Firmware Update

**Server**: `--command UpdateFirmware --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog` (check firmware update lifecycle)

**Expected Results**:

- Log shows UpdateFirmware received
- Log shows UpdateFirmwareResponse sent with status = Accepted
- Log shows FirmwareStatusNotification sequence: Downloading → Downloaded → Installing → Installed
- Note: Per README, signature verification always succeeds (SignatureVerified)

### TC-A02: CertificateSigned (Server-Initiated)

**OCPP Use Case**: A02 — Update Charging Station Certificate by request of CSMS

**Server**: `--command CertificateSigned --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`

**Expected Results**:

- Log shows CertificateSigned received with certificate chain
- Log shows CertificateSignedResponse sent (Accepted or Rejected depending on certificate validity)

### TC-N02-CI: CustomerInformation (Server-Initiated)

**OCPP Use Case**: N02 — Customer Information

**Server**: `--command CustomerInformation --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`

**Expected Results**:

- Log shows CustomerInformation received with report=true, clear=false
- Log shows CustomerInformationResponse sent with status = Accepted
- Log shows subsequent NotifyCustomerInformation sent with customer data

### TC-M04: DeleteCertificate (Server-Initiated)

**OCPP Use Case**: M04 — Delete a specific certificate from a Charging Station

**Server**: `--command DeleteCertificate --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`

**Expected Results**:

- Log shows DeleteCertificate received with certificate hash data
- Log shows DeleteCertificateResponse sent (Accepted or NotFound)

### TC-M03: GetInstalledCertificateIds (Server-Initiated)

**OCPP Use Case**: M03 — Retrieve list of available certificates

**Server**: `--command GetInstalledCertificateIds --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`

**Expected Results**:

- Log shows GetInstalledCertificateIds received for CSMSRootCertificate
- Log shows GetInstalledCertificateIdsResponse sent with list (or empty)

### TC-M05: InstallCertificate (Server-Initiated)

**OCPP Use Case**: M05 — Install CA certificate in a Charging Station

**Server**: `--command InstallCertificate --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`

**Expected Results**:

- Log shows InstallCertificate received for CSMSRootCertificate
- Log shows InstallCertificateResponse sent (Accepted or Rejected)

### TC-E14: GetTransactionStatus (Server-Initiated, No Transaction)

**OCPP Use Case**: E14 — Check transaction status

**Server**: `--command GetTransactionStatus --delay 5`

**Steps**:

1. Start server, wait ~15s
2. `readCombinedLog`

**Expected Results**:

- Log shows GetTransactionStatus received for transaction_id=test_transaction_123
- Log shows GetTransactionStatusResponse sent with messagesInQueue=false (no matching transaction)

---

## Test Group 6 — Remote Transaction Lifecycle (Normal Auth)

### Server Setup

```bash
poetry run python server.py --boot-status accepted
```

Wait for station reconnection and Accepted boot.

### TC-F01: Remote Start Transaction

**OCPP Use Case**: F01/F02 — Remote Start Transaction

**Pre-conditions**: Station booted, connector Available, no active transaction

**Steps**:

1. Verify state: `listChargingStations` → connector status = Available, transactionStarted = false
2. Start server with: `--command RequestStartTransaction --delay 5`
3. Wait ~15s for server to send RequestStartTransaction
4. `listChargingStations`
5. `readCombinedLog`

**Expected Results**:

- Log shows RequestStartTransaction received (idToken=test_token, type=ISO14443, evseId=1)
- Log shows RequestStartTransactionResponse sent with status = Accepted
- Log shows TransactionEvent.Started sent (seqNo=0, triggerReason=RemoteStart)
- Connector status changes to Occupied
- `transactionStarted` = true
- `transactionId` is a non-empty UUID string

### TC-F03: Remote Stop Transaction

**OCPP Use Case**: F03 — Remote Stop Transaction

**Pre-conditions**: Server running with `--boot-status accepted`, connector Available

> **Note**: This test is self-contained. It starts its own transaction via ATG, then triggers
> a remote stop from the server. The mock server's `RequestStopTransaction` uses a hardcoded
> `transaction_id="test_transaction_123"` which will NOT match the ATG-generated UUID.
> The expected behavior is that the station rejects the stop request (transaction not found).
> To test a _successful_ remote stop, use the MCP `stopAutomaticTransactionGenerator` tool instead.

**Steps**:

1. Verify no active transaction: `listChargingStations` → transactionStarted = false
2. Start ATG: `startAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])
3. Wait 10s for transaction to start
4. `listChargingStations` → verify transactionStarted = true, note transactionId
5. `stopAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])
6. Wait 10s for transaction to end
7. `listChargingStations` → verify transactionStarted = false
8. `readCombinedLog`

**Expected Results**:

- TransactionEvent.Started sent with triggerReason (seqNo=0)
- During transaction: periodic TransactionEvent.Updated with MeterValues
- After ATG stop: TransactionEvent.Ended sent with stoppedReason = Local
- Connector status returns to Available
- transactionStarted = false

### TC-F03b: Remote Stop — Transaction Not Found

**Pre-conditions**: Server configured to send RequestStopTransaction, no active transaction

**Server**: Kill and restart with `--command RequestStopTransaction --delay 5`

**Steps**:

1. Wait for boot + command delivery (~15s)
2. `readCombinedLog`

**Expected Results**:

- Log shows RequestStopTransaction received with transaction_id="test_transaction_123"
- Station responds with status = Rejected (no matching transaction found)
- No TransactionEvent.Ended sent

### TC-E01-ATG: Transaction via Automatic Transaction Generator

**OCPP Use Case**: E01-E06 — Transaction lifecycle

**Pre-conditions**: Station booted, connector Available, server running with normal auth

**Steps**:

1. `startAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])
2. Wait 30s for transaction to start and run
3. `listChargingStations` (check transaction state)
4. `readCombinedLog` (check TransactionEvent sequence)
5. Wait for ATG transaction to complete (configured duration)
6. `stopAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])
7. `listChargingStations`
8. `readCombinedLog`

**Expected Results**:

- Log shows Authorize request sent (if requireAuthorize=true)
- Log shows TransactionEvent.Started (seqNo=0)
- Log shows periodic TransactionEvent.Updated with MeterValues (seqNo=1,2,...)
- Log shows TransactionEvent.Ended (final seqNo)
- During transaction: connector status = Occupied, transactionStarted = true
- After transaction: connector status = Available, transactionStarted = false

### TC-J02: MeterValues During Transaction

**OCPP Use Case**: J02 — Sending transaction related Meter Values

**Pre-conditions**: Active transaction (started via ATG or remote start)

**Steps**:

1. Start ATG: `startAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])
2. Wait 30s
3. `readCombinedLog` — inspect MeterValues

**Expected Results**:

- TransactionEvent.Started contains meter values with context Transaction.Begin
- TransactionEvent.Updated contains periodic meter values (Power.Active.Import, Current.Import, Voltage, Energy.Active.Import.Register)
- TransactionEvent.Ended contains meter values with context Transaction.End
- seqNo values are sequential (0, 1, 2, ...)

### TC-I01: Total Cost in TransactionEvent.Updated Response

**OCPP Use Case**: I02 — Show EV Driver Running Total Cost During Charging

**Pre-conditions**: Server running with `--total-cost 25.50`

**Server**: Kill and restart with `--boot-status accepted --total-cost 25.50`

**Steps**:

1. Wait for station reconnection and Accepted boot
2. Start ATG: `startAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])
3. Wait 30s (enough for periodic TransactionEvent.Updated exchanges)
4. `readCombinedLog` — look for TransactionEvent.Updated response containing totalCost
5. `stopAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])

**Expected Results**:

- TransactionEvent.Updated responses from CSMS include `totalCost: 25.5`
- Station logs the received total cost value

### TC-E01-DIRECT: TransactionEvent via MCP Tool (Direct Send)

**OCPP Use Case**: E01 — Start Transaction options (direct MCP control)

**Pre-conditions**: Server running with `--boot-status accepted`, connector Available

**Steps**:

1. `transactionEvent` with ocpp20Payload:
   ```json
   {
     "eventType": "Started",
     "timestamp": "<ISO8601>",
     "triggerReason": "Authorized",
     "seqNo": 0,
     "transactionInfo": {
       "transactionId": "mcp-direct-test-001"
     },
     "idToken": {
       "idToken": "test_token",
       "type": "ISO14443"
     }
   }
   ```
2. `transactionEvent` with ocpp20Payload:
   ```json
   {
     "eventType": "Updated",
     "timestamp": "<ISO8601>",
     "triggerReason": "MeterValuePeriodic",
     "seqNo": 1,
     "transactionInfo": {
       "transactionId": "mcp-direct-test-001"
     },
     "meterValue": [
       {
         "timestamp": "<ISO8601>",
         "sampledValue": [{ "value": 1500.0, "measurand": "Power.Active.Import" }]
       }
     ]
   }
   ```
3. `transactionEvent` with ocpp20Payload:
   ```json
   {
     "eventType": "Ended",
     "timestamp": "<ISO8601>",
     "triggerReason": "StopAuthorized",
     "seqNo": 2,
     "transactionInfo": {
       "transactionId": "mcp-direct-test-001",
       "stoppedReason": "Local"
     }
   }
   ```
4. `readCombinedLog`

**Expected Results**:

- All 3 TransactionEvent requests sent successfully (MCP status = success)
- Server responds to each: Started (with idTokenInfo), Updated (with totalCost), Ended (empty)
- Sequence: Started (seqNo=0) → Updated (seqNo=1) → Ended (seqNo=2)

---

## Test Group 7 — Authorization: Whitelist Mode

### Server Setup

```bash
poetry run python server.py --boot-status accepted --auth-mode whitelist --whitelist valid_token test_token
```

### TC-C01-WL-OK: Authorize with Whitelisted Token

**OCPP Use Case**: C01 — EV Driver Authorization using RFID

**Steps**:

1. `authorize` with ocpp20Payload:
   ```json
   {
     "idToken": {
       "idToken": "test_token",
       "type": "ISO14443"
     }
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- Log shows AuthorizeRequest sent with idToken=test_token
- Log shows AuthorizeResponse received with status = Accepted

### TC-C01-WL-REJECT: Authorize with Non-Whitelisted Token

**Steps**:

1. `authorize` with ocpp20Payload:
   ```json
   {
     "idToken": {
       "idToken": "unknown_token",
       "type": "ISO14443"
     }
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- Log shows AuthorizeRequest sent with idToken=unknown_token
- Log shows AuthorizeResponse received with status = Blocked

### TC-E05-WL: Start Transaction — Unauthorized Token (Whitelist)

**OCPP Use Case**: E05 — Start Transaction - Id not Accepted

**Pre-conditions**: Server with whitelist that does NOT include the token used in RequestStartTransaction

> **Note**: The mock server's `_send_request_start_transaction()` sends `idToken=test_token`.
> The whitelist is set to `valid_token` only, so `test_token` is NOT whitelisted.
> When the station processes the RemoteStart, it sends Authorize or TransactionEvent.Started.
> The server resolves auth status based on whitelist → returns Blocked.

**Server**: `--boot-status accepted --auth-mode whitelist --whitelist valid_token --command RequestStartTransaction --delay 5`

**Steps**:

1. Wait for boot + command delivery (~15s)
2. `readCombinedLog`
3. `listChargingStations`

**Expected Results**:

- Station receives RequestStartTransaction from CSMS with idToken=test_token
- Station accepts the CSMS command (RequestStartTransactionResponse status = Accepted)
- Station sends Authorize or TransactionEvent.Started to CSMS
- Server responds with idTokenInfo.status = Blocked (test_token not in whitelist)
- Station aborts the transaction due to authorization failure
- Connector returns to Available
- No active transaction remains

---

## Test Group 8 — Authorization: Blacklist Mode

### Server Setup

```bash
poetry run python server.py --boot-status accepted --auth-mode blacklist --blacklist blocked_token invalid_user
```

### TC-C01-BL-OK: Authorize with Non-Blacklisted Token

**Steps**:

1. `authorize` with ocpp20Payload:
   ```json
   {
     "idToken": {
       "idToken": "any_valid_token",
       "type": "ISO14443"
     }
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- AuthorizeResponse status = Accepted

### TC-C01-BL-REJECT: Authorize with Blacklisted Token

**Steps**:

1. `authorize` with ocpp20Payload:
   ```json
   {
     "idToken": {
       "idToken": "blocked_token",
       "type": "ISO14443"
     }
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- AuthorizeResponse status = Blocked

---

## Test Group 9 — Authorization: Rate Limit Mode

### Server Setup

```bash
poetry run python server.py --boot-status accepted --auth-mode rate_limit
```

### TC-C01-RL: Authorize Rejected — Rate Limit

**Steps**:

1. `authorize` with ocpp20Payload:
   ```json
   {
     "idToken": {
       "idToken": "any_token",
       "type": "ISO14443"
     }
   }
   ```
2. `readCombinedLog`

**Expected Results**:

- AuthorizeResponse status = NotAtThisTime
- No transaction should start

---

## Test Group 10 — Authorization: Offline / Network Failure

### Server Setup

```bash
poetry run python server.py --boot-status accepted --offline
```

### TC-C01-OFFLINE: Authorize — Network Failure

**OCPP Use Case**: B04 — Offline Behavior Idle Charging Station

**Steps**:

1. `authorize` with ocpp20Payload:
   ```json
   {
     "idToken": {
       "idToken": "any_token",
       "type": "ISO14443"
     }
   }
   ```
2. `readCombinedLog`
3. `readErrorLog`

**Expected Results**:

- Server raises InternalError on Authorize request
- Station receives OCPP error response
- Error log shows authorization failure
- Transaction should not start

---

## Test Group 11 — Connection Management

### Server Setup

```bash
poetry run python server.py --boot-status accepted
```

### TC-CONN-01: Close and Reopen Connection

**Steps**:

1. `listChargingStations` → verify connected
2. `closeConnection` (hashIds: [station])
3. Wait 5s
4. `listChargingStations` → verify disconnected/reconnecting
5. `openConnection` (hashIds: [station])
6. Wait 15s (reconnect + boot)
7. `listChargingStations` → verify reconnected and Accepted

**Expected Results**:

- After close: station shows disconnected state
- After open: station reconnects, sends BootNotification, gets Accepted
- Connector returns to Available

### TC-CONN-02: Set Supervision URL

**Steps**:

1. Note current supervision URL via `listChargingStations` → supervisionUrl
2. `setSupervisionUrl` (hashIds: [station], url: "ws://127.0.0.1:9000")
   (Use 127.0.0.1 instead of localhost to force a reconnection to a different resolved URL)
3. Wait 15s
4. `listChargingStations` → verify reconnected and booted
5. `setSupervisionUrl` (hashIds: [station], url: "ws://localhost:9000")
   (Restore original URL)
6. Wait 15s
7. `listChargingStations`

**Expected Results**:

- Station disconnects from old URL and reconnects to new URL
- BootNotification sent and Accepted after each URL change
- Connector returns to Available

---

## Test Group 12 — Station Lifecycle Management

### Server Setup

```bash
poetry run python server.py --boot-status accepted
```

### TC-SIM-01: Stop and Start Charging Station

**Steps**:

1. `listChargingStations` → verify running
2. `stopChargingStation` (hashIds: [station])
3. Wait 5s
4. `listChargingStations` → verify stopped
5. `startChargingStation` (hashIds: [station])
6. Wait 15s
7. `listChargingStations` → verify running, booted, Available

**Expected Results**:

- Stop: station marked as stopped, WebSocket disconnected
- Start: station reconnects, BootNotification Accepted, connector Available

### TC-SIM-02: Add and Delete Charging Station

**Steps**:

1. `addChargingStations` (template: "keba-ocpp2.station-template", numberOfStations: 1, options: { autoStart: true, autoRegister: true, supervisionUrls: "ws://localhost:9000" })
2. Wait 15s
3. `listChargingStations` → verify 2 stations
4. Note hashId of new station
5. `deleteChargingStations` (hashIds: [new station hashId])
6. `listChargingStations` → verify 1 station

**Expected Results**:

- New station added, connects, sends BootNotification, gets Accepted
- Delete removes the station cleanly

---

## Test Group 13 — CSMS-Initiated Commands with Periodic Execution

### Server Setup

```bash
poetry run python server.py --boot-status accepted --command GetBaseReport --period 10
```

### TC-PERIODIC: Periodic GetBaseReport

**Steps**:

1. Start server with periodic GetBaseReport every 10s
2. Wait 45s (expect ~3-4 GetBaseReport cycles)
3. `readCombinedLog`

**Expected Results**:

- Log shows multiple GetBaseReport received at ~10s intervals
- Each GetBaseReport triggers GetBaseReportResponse + NotifyReport sequence
- Station handles repeated requests without errors

---

## Test Group 14 — Reset With Active Transaction

### Server Setup

```bash
poetry run python server.py --boot-status accepted
```

### TC-B12: Reset With Ongoing Transaction

**OCPP Use Case**: B12 — Reset With Ongoing Transaction

**Steps**:

1. Start ATG: `startAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])
2. Wait 10s (transaction should be active)
3. `listChargingStations` → verify transactionStarted = true
4. Restart server: `--command Reset --delay 3`
5. Wait 15s
6. `readCombinedLog`
7. Wait 30s (resetTime)
8. `listChargingStations`

**Expected Results**:

- Log shows Reset received while transaction active
- If `stopTransactionsOnStopped` = true (default): TransactionEvent.Ended sent before reset
- Station resets and sends new BootNotification
- After reset: connector Available, no active transaction

---

## Test Group 15 — Error and Edge Cases

### Server Setup

```bash
poetry run python server.py --boot-status accepted
```

### TC-ERR-01: StatusNotification with All Statuses

**Steps**:
For each status in [Available, Occupied, Reserved, Unavailable, Faulted]:

1. `statusNotification` with connectorStatus = <status>
2. Verify MCP response = success

### TC-ERR-02: Heartbeat Rapid Fire

**Steps**:

1. Send 5 `heartbeat` calls in rapid succession
2. `readCombinedLog`

**Expected Results**:

- All 5 heartbeats sent and responded to
- No errors in error log

### TC-ERR-03: MeterValues with Multiple Measurands

**Steps**:

1. `meterValues` with payload containing multiple sampledValues:
   - Voltage (V), Power.Active.Import (W), Current.Import (A), Energy.Active.Import.Register (Wh)
2. Verify all accepted

### TC-ERR-04: FirmwareStatusNotification — All Statuses

**Steps**:
For each status in [Downloaded, DownloadFailed, Downloading, DownloadScheduled, DownloadPaused, Idle, InstallationFailed, Installing, Installed, InstallRebooting, InstallScheduled, InstallVerificationFailed, InvalidSignature, SignatureVerified]:

1. `firmwareStatusNotification` with ocpp20Payload: { "status": "<status>", "requestId": 1 }
2. Verify MCP response = success

---

## Test Group 16 — Full Offline / Reconnection Behavior

### Server Setup

```bash
poetry run python server.py --boot-status accepted
```

### TC-B04-OFFLINE: Offline Behavior — Server Down and Reconnect

**OCPP Use Case**: B04 — Offline Behavior Idle Charging Station

**Pre-conditions**: Station booted and connected (Accepted), connector Available

**Steps**:

1. `listChargingStations` → verify connected, bootNotificationResponse.status = Accepted
2. Kill mock server (Ctrl+C / SIGTERM)
3. Wait 10s
4. `listChargingStations` → observe station state (should show disconnected/reconnecting)
5. `readCombinedLog` → verify reconnection attempts in logs
6. Restart mock server: `poetry run python server.py --boot-status accepted`
7. Wait 30s (auto-reconnect + boot cycle)
8. `listChargingStations` → verify reconnected, bootNotificationResponse.status = Accepted
9. `readCombinedLog` → verify full reconnection sequence

**Expected Results**:

- After server kill: station enters reconnection loop with exponential backoff
- Log shows WebSocket connection lost / reconnection attempts
- After server restart: station reconnects automatically
- New BootNotification sent and Accepted
- StatusNotification sent for all connectors
- Connector returns to Available
- No errors in `readErrorLog` (reconnection is expected behavior)

### TC-B04-OFFLINE-TXN: Offline During Active Transaction

**OCPP Use Case**: B04 + E04 — Offline Behavior + Transaction started while CS offline

**Pre-conditions**: Station booted and connected, server running

**Steps**:

1. Start ATG: `startAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])
2. Wait 10s → `listChargingStations` → verify transactionStarted = true
3. Kill mock server (Ctrl+C / SIGTERM)
4. Wait 15s (station loses connection during active transaction)
5. `listChargingStations` → check transaction state
6. `readCombinedLog` → check transaction event queueing
7. Restart server: `poetry run python server.py --boot-status accepted`
8. Wait 30s
9. `stopAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])
10. Wait 10s
11. `listChargingStations`
12. `readCombinedLog` → check queued event delivery

**Expected Results**:

- Transaction events generated during offline period are queued (offline=true flag per E04.FR.03)
- After reconnection: station re-boots, then delivers queued TransactionEvent messages
- Or: `stopTransactionsOnStopped=true` causes TransactionEvent.Ended before disconnect
- Connector eventually returns to Available after transaction cleanup

---

## Test Group 17 — Advanced Edge Cases and Negative Tests

### Server Setup

```bash
poetry run python server.py --boot-status accepted
```

### TC-E-DOUBLE-START: Duplicate RequestStartTransaction During Active Transaction

**OCPP Use Case**: E02 — Concurrent transaction blocking

**Pre-conditions**: Station booted, connector Available

**Steps**:

1. Start ATG: `startAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])
2. Wait 10s → `listChargingStations` → verify transactionStarted = true
3. Kill server, restart: `--boot-status accepted --command RequestStartTransaction --delay 3`
4. Wait 15s (server sends RequestStartTransaction while transaction already active)
5. `readCombinedLog`
6. `stopAutomaticTransactionGenerator` (hashIds: [station], connectorIds: [1])

**Expected Results**:

- Station rejects the second RequestStartTransaction (connector already occupied / transactionPending)
- Log shows RequestStartTransactionResponse with status = Rejected
- Original transaction continues unaffected

### TC-E-STOP-NONE: RequestStopTransaction When No Transaction Active

**OCPP Use Case**: E06 — Stop Transaction edge case

**Pre-conditions**: Station booted, connector Available, NO active transaction

**Server**: Restart with `--command RequestStopTransaction --delay 5`

**Steps**:

1. `listChargingStations` → verify transactionStarted = false
2. Wait for server to send RequestStopTransaction (~15s)
3. `readCombinedLog`

**Expected Results**:

- Log shows RequestStopTransaction received for transaction_id="test_transaction_123"
- Station responds with status = Rejected (no matching transaction)
- No TransactionEvent.Ended sent
- Connector stays Available

### TC-B11-PENDING: Reset While Station in Pending Boot State

**Pre-conditions**: Server configured for Pending boot

**Server**: Restart with `--boot-status pending --command Reset --delay 8`

**Steps**:

1. Station connects and gets BootNotification Pending
2. Server sends Reset after 8s delay (while station in Pending state)
3. Wait 30s
4. `readCombinedLog`

**Expected Results**:

- Station receives Reset while in Pending registration state
- Station should either accept the reset or ignore it (implementation-dependent)
- Log shows the Reset request and response
- Station reboots and retries BootNotification

### TC-ERR-05: LogStatusNotification Without Prior GetLog

**Steps**:

1. `logStatusNotification` with ocpp20Payload: { "status": "Idle", "requestId": 999 }
2. `readCombinedLog`

**Expected Results**:

- MCP response status = success (server accepts notification regardless)
- No errors — the station sends the notification, server acknowledges

### TC-ERR-06: FirmwareStatusNotification Without Prior UpdateFirmware

**Steps**:

1. `firmwareStatusNotification` with ocpp20Payload: { "status": "Idle", "requestId": 999 }
2. `readCombinedLog`

**Expected Results**:

- MCP response status = success
- No errors — orphaned notification handled gracefully

---

## Summary: Test Coverage Matrix

| OCPP Functional Block     | Use Cases Covered              | Test Cases | Server Config Required                           |
| ------------------------- | ------------------------------ | ---------- | ------------------------------------------------ |
| **A. Security**           | A02, A03, A04                  | 4          | Normal, CertificateSigned command                |
| **B. Provisioning**       | B01-B04, B05-B07, B09, B11-B12 | 12         | Normal, Rejected, Pending, various commands      |
| **C. Authorization**      | C01, C05, C11                  | 7          | Normal, Whitelist, Blacklist, RateLimit, Offline |
| **E. Transactions**       | E01-E06, E14                   | 8          | Normal, Whitelist, Direct MCP                    |
| **F. Remote Control**     | F01-F03, F05, F06              | 6          | Normal + commands                                |
| **G. Availability**       | G01-G03                        | 4          | Normal + ChangeAvailability command              |
| **I. Tariff/Cost**        | I02                            | 1          | Normal + --total-cost                            |
| **J. MeterValues**        | J01, J02                       | 2          | Normal                                           |
| **L. FirmwareManagement** | L01                            | 3          | Normal + UpdateFirmware command                  |
| **M. ISO15118 Certs**     | M01, M03-M06                   | 5          | Normal + cert commands                           |
| **N. Diagnostics**        | N01, N02                       | 4          | Normal + GetLog/CustomerInfo commands            |
| **P. DataTransfer**       | P01                            | 2          | Normal + DataTransfer command                    |
| **Connection Mgmt**       | —                              | 2          | Normal                                           |
| **Station Lifecycle**     | —                              | 2          | Normal                                           |
| **Offline/Reconnect**     | B04, E04                       | 2          | Normal (server kill/restart)                     |
| **Periodic Commands**     | —                              | 1          | Normal + periodic command                        |
| **Edge/Negative Cases**   | —                              | 10         | Normal, Pending + Reset                          |
| **TOTAL**                 |                                | **~75**    | **10 distinct server configs**                   |

### Server Configurations Required (ordered execution)

| #   | Config                                                                                | Tests Covered                   |
| --- | ------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | `--boot-status accepted`                                                              | Groups 4, 6, 11, 12, 15, 16, 17 |
| 2   | `--boot-status rejected`                                                              | Group 2                         |
| 3   | `--boot-status pending`                                                               | Group 3                         |
| 4   | `--boot-status accepted --auth-mode whitelist --whitelist valid_token test_token`     | Group 7                         |
| 5   | `--boot-status accepted --auth-mode blacklist --blacklist blocked_token invalid_user` | Group 8                         |
| 6   | `--boot-status accepted --auth-mode rate_limit`                                       | Group 9                         |
| 7   | `--boot-status accepted --offline`                                                    | Group 10                        |
| 8   | `--boot-status accepted --command <X> --delay 5` (multiple restarts)                  | Group 5                         |
| 9   | `--boot-status accepted --command GetBaseReport --period 10`                          | Group 13                        |
| 10  | `--boot-status accepted --total-cost 25.50`                                           | TC-I01                          |
| 11  | `--boot-status pending --command Reset --delay 8`                                     | TC-B11-PENDING                  |

### Review Status

- **Reviewed by**: Momus (Plan Critic) — cross-validated against all 7 criteria
- **Verdict**: APPROVED WITH CHANGES
- **Changes applied**:
  - ✅ Fixed TC-F03 (was broken: hardcoded transaction_id + server restart killed transaction)
  - ✅ Added TC-F03b (Remote Stop — Transaction Not Found)
  - ✅ Added TC-I01 (--total-cost verification)
  - ✅ Added TC-E01-DIRECT (direct transactionEvent MCP tool test)
  - ✅ Added Test Group 16 (full offline/reconnection: TC-B04-OFFLINE, TC-B04-OFFLINE-TXN)
  - ✅ Added Test Group 17 (advanced edge cases: double start, stop-none, reset-pending, orphaned notifications)
  - ✅ Fixed TC-CONN-02 (was trivial: same URL → now uses different host)
  - ✅ Added pass/fail criteria and timestamp convention
  - ✅ Updated summary matrix with new test count (~75 test cases)
