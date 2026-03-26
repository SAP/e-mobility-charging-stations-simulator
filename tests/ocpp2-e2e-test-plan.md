# OCPP 2.0.1 End-to-End Test Plan

E2E test scenarios for the charging station simulator's OCPP 2.0.1 stack.
Executed via MCP tools against the mock OCPP server (`tests/ocpp-server/`).

## Conventions

| Item             | Value                                                           |
| ---------------- | --------------------------------------------------------------- |
| Mock server      | `cd tests/ocpp-server && poetry run python server.py [OPTIONS]` |
| Station template | `keba-ocpp2.station-template.json`                              |
| Station ID       | `CS-KEBA-OCPP2-00001`                                           |
| EVSE / Connector | 1 / 1                                                           |
| Supervision URL  | `ws://localhost:9000`                                           |

### Execution Rules

- **Tester manages the mock server only** — start/stop/restart with options.
- All `--boot-status` and enum CLI values are **Title-Case** (`Accepted`, not `accepted`).

### Reconnection

The station auto-reconnects when the server restarts, with a **fixed 30s delay** (`reconnectExponentialDelay: false`, `ConnectionTimeOut: 30`). This means:

- After a server restart, the station takes ~30s to reconnect (WebSocket close → sleep 30s → reopen).
- The station does NOT re-send `BootNotification` if it already has `bootNotificationResponse.status = Accepted` in cache. It connects silently.
- To force a fresh boot (e.g., to clear cached Inoperative state), use `stopChargingStation`/`startChargingStation` as a **setup step**, not as a test step.

**To avoid the 30s reconnect delay between server restarts**, use this pattern:

```
1. Kill mock server
2. Start new mock server with new options
3. MCP: closeConnection (triggers CLOSE_NORMAL → resets retry count to 0)
4. MCP: openConnection (immediate reconnect, no 30s wait)
5. Wait ~5s for WebSocket handshake
6. Proceed with test
```

### Verification

A test case **passes** when ALL of:

1. MCP tool response: `"status": "success"` (no `responsesFailed`)
2. `readCombinedLog`: expected OCPP messages in correct order
3. `listChargingStations`: expected station/connector state
4. `readErrorLog`: no unexpected errors

### Server Lifecycle

Tests are grouped by server configuration to minimize restarts.
Within a group, tests execute sequentially without restart.
Between groups, use the close/open pattern above to avoid cumulative reconnect delays.

---

## A — Security

### Server: `--boot-status Accepted`

| TC  | Use Case                    | Via                             | Steps                                                       | Expected                    |
| --- | --------------------------- | ------------------------------- | ----------------------------------------------------------- | --------------------------- |
| A03 | CS-initiated cert update    | MCP `signCertificate`           | Send CSR with `certificateType: ChargingStationCertificate` | Response `status: Accepted` |
| A04 | Security event notification | MCP `securityEventNotification` | Send `type: FirmwareUpdated`                                | Response empty (success)    |

### Server: `--boot-status Accepted --command CertificateSigned --delay 5`

| TC  | Use Case                   | Via            | Steps     | Expected                                                                                                              |
| --- | -------------------------- | -------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| A02 | CSMS-initiated cert update | Server command | Wait ~15s | CertificateSigned received → Rejected (statusInfo.reasonCode: InternalError — no cert manager in keba-ocpp2 template) |

---

## B — Provisioning

### Server: `--boot-status Accepted`

| TC  | Use Case             | Via                   | Steps                              | Expected                                                                      |
| --- | -------------------- | --------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| B01 | Cold Boot — Accepted | Auto (server restart) | Restart server, wait for reconnect | BootNotification → Accepted, StatusNotification(Available), Heartbeat started |
| B04 | Offline reconnection | Server kill/restart   | Kill server, wait 10s, restart     | Station reconnects, re-sends BootNotification, returns to Available           |

### Server: `--boot-status-sequence Pending,Accepted`

| TC  | Use Case                     | Via                   | Steps                                  | Expected                                                                                       |
| --- | ---------------------------- | --------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| B02 | Cold Boot — Pending→Accepted | Auto (server restart) | Restart server, wait for 2 boot cycles | 1st BootNotification → Pending, station retries, 2nd → Accepted, StatusNotification(Available) |

### Server: `--boot-status Rejected`

| TC  | Use Case             | Via                   | Steps                              | Expected                                                                                                                                                                                                                                                 |
| --- | -------------------- | --------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B03 | Cold Boot — Rejected | Auto (server restart) | Restart server, wait for reconnect | BootNotification → Rejected → 1 retry (registrationMaxRetries defaults to 0) → Rejected → "Registration failure" log. No StatusNotification sent. Station stays in Rejected state but can still retry BootNotification on next reconnection (B03.FR.06). |

### Server: various `--command X --delay 5`

| TC   | Use Case                     | Server flags                                                                  | Expected                                                                                                        |
| ---- | ---------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| B05  | SetVariables                 | `--command SetVariables --set-variables "OCPPCommCtrlr.HeartbeatInterval=30"` | SetVariablesResponse with result status                                                                         |
| B06  | GetVariables                 | `--command GetVariables --get-variables "ChargingStation.AvailabilityState"`  | GetVariablesResponse with variable value                                                                        |
| B07  | GetBaseReport                | `--command GetBaseReport`                                                     | GetBaseReportResponse Accepted + NotifyReport sequence                                                          |
| B09  | SetNetworkProfile            | `--command SetNetworkProfile`                                                 | Response Rejected (NoSecurityDowngrade per B09.FR.01)                                                           |
| B11  | Reset (no transaction)       | `--command Reset`                                                             | Reset Accepted → StatusNotification(Unavailable) → close → re-boot → Available                                  |
| B11b | Reset OnIdle (no active txn) | `--command Reset --reset-type OnIdle`                                         | Reset Accepted → StatusNotification(Unavailable) → re-boot → Available (no transaction active, immediate reset) |

---

## C — Authorization

### Server: `--boot-status Accepted` (normal auth)

| TC  | Use Case           | Via             | Steps                                               | Expected                       |
| --- | ------------------ | --------------- | --------------------------------------------------- | ------------------------------ |
| C01 | Authorize — normal | MCP `authorize` | `idToken: {idToken: "any_token", type: "ISO14443"}` | `idTokenInfo.status: Accepted` |

### Server: `--boot-status Accepted --auth-mode whitelist --whitelist valid_token test_token`

| TC            | Use Case                    | Via             | Steps                    | Expected           |
| ------------- | --------------------------- | --------------- | ------------------------ | ------------------ |
| C01-WL-OK     | Authorize — whitelisted     | MCP `authorize` | `idToken: test_token`    | `status: Accepted` |
| C01-WL-REJECT | Authorize — not whitelisted | MCP `authorize` | `idToken: unknown_token` | `status: Blocked`  |

### Server: `--boot-status Accepted --auth-mode blacklist --blacklist blocked_token`

| TC            | Use Case                    | Via             | Steps                    | Expected           |
| ------------- | --------------------------- | --------------- | ------------------------ | ------------------ |
| C01-BL-OK     | Authorize — not blacklisted | MCP `authorize` | `idToken: good_token`    | `status: Accepted` |
| C01-BL-REJECT | Authorize — blacklisted     | MCP `authorize` | `idToken: blocked_token` | `status: Blocked`  |

### Server: `--boot-status Accepted --auth-mode rate_limit`

| TC     | Use Case                 | Via             | Steps     | Expected                |
| ------ | ------------------------ | --------------- | --------- | ----------------------- |
| C01-RL | Authorize — rate limited | MCP `authorize` | Any token | `status: NotAtThisTime` |

### Server: `--boot-status Accepted --offline`

| TC          | Use Case                    | Via             | Steps     | Expected                  |
| ----------- | --------------------------- | --------------- | --------- | ------------------------- |
| C01-OFFLINE | Authorize — network failure | MCP `authorize` | Any token | InternalError from server |

### Server: `--boot-status Accepted --auth-group-id MyGroup --auth-cache-expiry 3600`

| TC  | Use Case            | Via             | Steps     | Expected                                                                   |
| --- | ------------------- | --------------- | --------- | -------------------------------------------------------------------------- |
| C09 | GroupId in response | MCP `authorize` | Any token | `idTokenInfo.groupIdToken.idToken: MyGroup`, `cacheExpiryDateTime` present |

### Server: `--boot-status Accepted --command ClearCache --delay 5`

| TC  | Use Case         | Via            | Steps     | Expected              |
| --- | ---------------- | -------------- | --------- | --------------------- |
| C11 | Clear auth cache | Server command | Wait ~15s | ClearCache → Accepted |

---

## E — Transactions

### Server: `--boot-status Accepted`

| TC         | Use Case                    | Via                                                                                       | Steps                                                               | Expected                                                                                                             |
| ---------- | --------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| E01-ATG    | Transaction lifecycle (ATG) | MCP `startAutomaticTransactionGenerator` → wait 30s → `stopAutomaticTransactionGenerator` | Wait for full cycle                                                 | Authorize → TransactionEvent.Started(seqNo=0) → Updated(seqNo=1+, MeterValues) → Ended(seqNo=N, stoppedReason=Local) |
| E01-DIRECT | TransactionEvent direct     | MCP `transactionEvent`                                                                    | Send Started → Updated → Ended with `transactionId: "mcp-test-001"` | All 3 accepted, seqNo sequential                                                                                     |

### Server: `--boot-status Accepted --commands "RequestStartTransaction:15,RequestStopTransaction:45"`

| TC      | Use Case                   | Via             | Steps                    | Expected                                                                                                                                                                      |
| ------- | -------------------------- | --------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01+F03 | Remote Start → Remote Stop | Server commands | Wait ~60s for full cycle | RequestStartTransaction → Accepted → TransactionEvent.Started(RemoteStart) → MeterValues → RequestStopTransaction (real txn ID via tracking) → TransactionEvent.Ended(Remote) |

### Server: `--boot-status Accepted --command RequestStopTransaction --delay 5`

| TC   | Use Case                    | Via            | Steps     | Expected                                                                                                               |
| ---- | --------------------------- | -------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| F03b | Remote Stop — no active txn | Server command | Wait ~15s | RequestStopTransaction with fallback ID `test_transaction_123` → Rejected (invalid transaction ID format — not a UUID) |

### Server: `--boot-status Accepted --total-cost 25.50`

| TC  | Use Case           | Via                                                 | Steps                                    | Expected                             |
| --- | ------------------ | --------------------------------------------------- | ---------------------------------------- | ------------------------------------ |
| I02 | Running total cost | MCP `startAutomaticTransactionGenerator` → wait 30s | Check TransactionEvent.Updated responses | `totalCost: 25.5` in server response |

---

## F — Remote Control

### Server: various `--command X --delay 5`

| TC  | Use Case                             | Server flags                     | Expected                                                        |
| --- | ------------------------------------ | -------------------------------- | --------------------------------------------------------------- |
| F05 | Unlock connector                     | `--command UnlockConnector`      | UnlockConnector → Unlocked                                      |
| E14 | GetTransactionStatus (no active txn) | `--command GetTransactionStatus` | GetTransactionStatus → messagesInQueue: false, uses fallback ID |

### Server: `--boot-status Accepted --commands "RequestStartTransaction:15,GetTransactionStatus:25"`

| TC         | Use Case                             | Via             | Steps     | Expected                                                                                         |
| ---------- | ------------------------------------ | --------------- | --------- | ------------------------------------------------------------------------------------------------ |
| E14-ACTIVE | GetTransactionStatus with active txn | Server commands | Wait ~35s | GetTransactionStatus → ongoingIndicator: true, messagesInQueue: false (real txn ID via tracking) |

### Server: `--boot-status Accepted --commands "RequestStartTransaction:15,UnlockConnector:25"`

| TC      | Use Case                          | Via             | Steps     | Expected                                       |
| ------- | --------------------------------- | --------------- | --------- | ---------------------------------------------- |
| F05-TXN | UnlockConnector during active txn | Server commands | Wait ~35s | UnlockConnector → OngoingAuthorizedTransaction |

### Server: various `--command X --delay 5` (continued)

| F06-SN | TriggerMessage (StatusNotification) | `--command TriggerMessage` | TriggerMessage → Accepted → StatusNotification sent |
| F06-BN | TriggerMessage (BootNotification) | `--command TriggerMessage --trigger-message BootNotification` | TriggerMessage → Rejected(NotEnabled, F06.FR.17 — already accepted) |
| F06-HB | TriggerMessage (Heartbeat) | `--command TriggerMessage --trigger-message Heartbeat` | TriggerMessage → Accepted → Heartbeat sent |
| F06-MV | TriggerMessage (MeterValues) | `--command TriggerMessage --trigger-message MeterValues` | TriggerMessage → Accepted → MeterValues sent |
| F06-FW | TriggerMessage (FirmwareStatus) | `--command TriggerMessage --trigger-message FirmwareStatusNotification` | TriggerMessage → Accepted → FirmwareStatusNotification(Idle) sent |
| F06-LS | TriggerMessage (LogStatus) | `--command TriggerMessage --trigger-message LogStatusNotification` | TriggerMessage → Accepted → LogStatusNotification(Idle) sent |

---

## G — Availability

### Server: `--boot-status Accepted`

| TC  | Use Case           | Via                      | Steps                                                                     | Expected                       |
| --- | ------------------ | ------------------------ | ------------------------------------------------------------------------- | ------------------------------ |
| G01 | StatusNotification | MCP `statusNotification` | Send for each status: Available, Occupied, Faulted, Unavailable, Reserved | All succeed (empty response)   |
| G02 | Heartbeat          | MCP `heartbeat`          | Send 5x rapid                                                             | All succeed with `currentTime` |

### Server: various `--command ChangeAvailability --delay 5`

| TC  | Use Case                       | Server flags                                                     | Expected                                   |
| --- | ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------ |
| G03 | ChangeAvailability Operative   | `--command ChangeAvailability`                                   | Accepted + StatusNotification(Available)   |
| G04 | ChangeAvailability Inoperative | `--command ChangeAvailability --availability-status Inoperative` | Accepted + StatusNotification(Unavailable) |

---

## J — MeterValues

### Server: `--boot-status Accepted`

| TC  | Use Case                    | Via                                                    | Steps                         | Expected                                                                                                                                                                                                       |
| --- | --------------------------- | ------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J01 | Non-transaction MeterValues | MCP `meterValues`                                      | Send Voltage=230V on evseId=1 | Response empty (success)                                                                                                                                                                                       |
| J02 | Transaction MeterValues     | MCP `startAutomaticTransactionGenerator` → wait 60-90s | Check logs                    | TransactionEvent.Updated contains Voltage, Energy, Power, Current with context `Sample.Periodic`. Note: ATG start delay (15-30s) + MeterValueSampleInterval (30s) = first MeterValues ~45-60s after ATG start. |

---

## L — Firmware Management

### Server: `--boot-status Accepted --command UpdateFirmware --delay 5`

| TC  | Use Case               | Via            | Steps     | Expected                                                                                                                                               |
| --- | ---------------------- | -------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L01 | Secure Firmware Update | Server command | Wait ~40s | UpdateFirmware → Accepted → FirmwareStatusNotification: Downloading → Downloaded → Installing → Installed → SecurityEventNotification(FirmwareUpdated) |

### Server: `--boot-status Accepted`

| TC      | Use Case                   | Via                              | Steps                                  | Expected                 |
| ------- | -------------------------- | -------------------------------- | -------------------------------------- | ------------------------ |
| L01-MCP | FirmwareStatusNotification | MCP `firmwareStatusNotification` | Send `status: Installed, requestId: 1` | Response empty (success) |

---

## M — ISO 15118 Certificate Management

### Server: `--boot-status Accepted`

| TC  | Use Case                 | Via                         | Steps               | Expected                    |
| --- | ------------------------ | --------------------------- | ------------------- | --------------------------- |
| M01 | Get 15118 EV Certificate | MCP `get15118EVCertificate` | Send Install action | Response `status: Accepted` |
| M06 | Get Certificate Status   | MCP `getCertificateStatus`  | Send OCSP data      | Response `status: Accepted` |

### Server: various `--command X --delay 5`

| TC  | Use Case               | Server flags                           | Expected                                |
| --- | ---------------------- | -------------------------------------- | --------------------------------------- |
| M03 | Get installed cert IDs | `--command GetInstalledCertificateIds` | Response NotFound (cert manager absent) |
| M04 | Delete certificate     | `--command DeleteCertificate`          | Response Failed (cert manager absent)   |
| M05 | Install certificate    | `--command InstallCertificate`         | Response Failed (cert manager absent)   |

---

## N — Diagnostics

### Server: `--boot-status Accepted --command GetLog --delay 5`

| TC  | Use Case     | Via            | Steps     | Expected                                                             |
| --- | ------------ | -------------- | --------- | -------------------------------------------------------------------- |
| N01 | Retrieve Log | Server command | Wait ~15s | GetLog(DiagnosticsLog) → Accepted → LogStatusNotification(Uploading) |

### Server: `--boot-status Accepted --command CustomerInformation --delay 5`

| TC  | Use Case             | Via            | Steps     | Expected                                                                                                      |
| --- | -------------------- | -------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| N09 | Customer Information | Server command | Wait ~15s | CustomerInformation(report=true, customerIdentifier=test_customer_001) → Accepted → NotifyCustomerInformation |

### Server: `--boot-status Accepted`

| TC             | Use Case                  | Via                             | Steps                        | Expected                 |
| -------------- | ------------------------- | ------------------------------- | ---------------------------- | ------------------------ |
| N01-MCP        | LogStatusNotification     | MCP `logStatusNotification`     | Send `status: Uploaded`      | Response empty (success) |
| N09-MCP        | NotifyCustomerInformation | MCP `notifyCustomerInformation` | Send data with requestId     | Response empty (success) |
| N-NOTIF-REPORT | NotifyReport              | MCP `notifyReport`              | Send with requestId, seqNo=0 | Response empty (success) |

---

## P — DataTransfer

### Server: `--boot-status Accepted`

| TC  | Use Case             | Via                | Steps                                           | Expected                    |
| --- | -------------------- | ------------------ | ----------------------------------------------- | --------------------------- |
| P02 | DataTransfer CS→CSMS | MCP `dataTransfer` | Send `vendorId: TestVendor, messageId: TestMsg` | Response `status: Accepted` |

### Server: `--boot-status Accepted --command DataTransfer --delay 5`

| TC  | Use Case             | Via            | Steps     | Expected                                                               |
| --- | -------------------- | -------------- | --------- | ---------------------------------------------------------------------- |
| P01 | DataTransfer CSMS→CS | Server command | Wait ~15s | DataTransfer received → Response `UnknownVendorId` (no custom handler) |

---

## B12 — Reset With Active Transaction

### Server: `--boot-status Accepted --commands "RequestStartTransaction:15,Reset:30"`

| TC  | Use Case               | Via                              | Steps                    | Expected                                                                                                                                                             |
| --- | ---------------------- | -------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B12 | Reset with ongoing txn | Server commands (single session) | Wait ~60s for full cycle | RequestStartTransaction → Accepted → TransactionEvent.Started → Reset(Immediate) → station stops transaction → StatusNotification(Unavailable) → re-boot → Available |

---

## Offline / Reconnection

### Server: `--boot-status Accepted` (kill/restart cycle)

| TC       | Use Case                   | Steps                                                   | Expected                                                                                                                                                                        |
| -------- | -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B04-FULL | Server down and reconnect  | Kill server → wait 10s → restart                        | Station enters reconnection loop, reconnects, re-boots, returns to Available                                                                                                    |
| B04-TXN  | Offline during transaction | Start ATG → kill server → wait 15s → restart → stop ATG | Transaction stopped on server kill (stopTransactionsOnStopped=true). After reconnect: BootNotification → Accepted → StatusNotification(Available). No queued TransactionEvents. |

---

## Edge Cases / Negative Tests

### Server: `--boot-status Accepted`

| TC     | Description                         | Via                                                    | Expected                                    |
| ------ | ----------------------------------- | ------------------------------------------------------ | ------------------------------------------- |
| ERR-03 | Multi-measurand MeterValues         | MCP `meterValues` with Voltage+Power+Current+Energy    | All accepted                                |
| ERR-04 | FirmwareStatus all statuses         | MCP `firmwareStatusNotification` × 14 statuses         | All succeed                                 |
| ERR-05 | Orphaned LogStatusNotification      | MCP `logStatusNotification` with `requestId: 999`      | Succeeds (no prior GetLog required)         |
| ERR-06 | Orphaned FirmwareStatusNotification | MCP `firmwareStatusNotification` with `requestId: 999` | Succeeds (no prior UpdateFirmware required) |

### Server: `--boot-status Accepted --commands "RequestStartTransaction:15,RequestStartTransaction:25"`

| TC             | Description                                           | Expected                                                                             |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| E-DOUBLE-START | Second RequestStartTransaction while first txn active | First → Accepted + TransactionEvent.Started. Second → Rejected (connector occupied). |

### Server: `--boot-status-sequence Pending,Accepted --command Reset --delay 8`

| TC          | Description                  | Expected                                                                                                                               |
| ----------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| B11-PENDING | Reset while in Pending state | Station receives Reset → Accepted (Reset is not blocked by registration state). StatusNotification(Unavailable) → reconnect → re-boot. |

---

## Execution Order

Tests grouped by server configuration to minimize restarts.
Use `closeConnection`/`openConnection` between groups 8-18 to avoid cumulative reconnect delays.

| #   | Server Config                                                                               | Test Cases                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `--boot-status Accepted`                                                                    | B01, B04, A03, A04, C01, G01, G02, J01, J02, P02, E01-ATG, E01-DIRECT, L01-MCP, M01, M06, N01-MCP, N09-MCP, N-NOTIF-REPORT, ERR-03→06          |
| 2   | `--boot-status Accepted --auth-mode whitelist --whitelist valid_token test_token`           | C01-WL-OK, C01-WL-REJECT                                                                                                                       |
| 3   | `--boot-status Accepted --auth-mode blacklist --blacklist blocked_token`                    | C01-BL-OK, C01-BL-REJECT                                                                                                                       |
| 4   | `--boot-status Accepted --auth-mode rate_limit`                                             | C01-RL                                                                                                                                         |
| 5   | `--boot-status Accepted --offline`                                                          | C01-OFFLINE                                                                                                                                    |
| 6   | `--boot-status Accepted --auth-group-id MyGroup --auth-cache-expiry 3600`                   | C09                                                                                                                                            |
| 7   | `--boot-status Accepted --total-cost 25.50`                                                 | I02                                                                                                                                            |
| 8   | `--boot-status Accepted --command X --delay 5` (sequential restarts)                        | A02, B05, B06, B07, B09, B11, B11b, C11, E14, F05, F06-SN, F06-BN, F06-HB, F06-MV, F06-FW, F06-LS, G03, G04, L01, M03, M04, M05, N01, N09, P01 |
| 9   | `--boot-status Accepted --commands "RequestStartTransaction:15,RequestStopTransaction:45"`  | F01+F03                                                                                                                                        |
| 10  | `--boot-status Accepted --command RequestStopTransaction --delay 5`                         | F03b                                                                                                                                           |
| 11  | `--boot-status Accepted --commands "RequestStartTransaction:15,Reset:30"`                   | B12                                                                                                                                            |
| 12  | `--boot-status Accepted` (kill/restart cycle)                                               | B04-FULL, B04-TXN                                                                                                                              |
| 13  | `--boot-status Accepted --commands "RequestStartTransaction:15,RequestStartTransaction:25"` | E-DOUBLE-START                                                                                                                                 |
| 14  | `--boot-status Accepted --commands "RequestStartTransaction:15,GetTransactionStatus:25"`    | E14-ACTIVE                                                                                                                                     |
| 15  | `--boot-status Accepted --commands "RequestStartTransaction:15,UnlockConnector:25"`         | F05-TXN                                                                                                                                        |
| 16  | `--boot-status-sequence Pending,Accepted`                                                   | B02                                                                                                                                            |
| 17  | `--boot-status-sequence Pending,Accepted --command Reset --delay 8`                         | B11-PENDING                                                                                                                                    |
| 18  | `--boot-status Rejected`                                                                    | B03                                                                                                                                            |

## Coverage

| Block             | Implemented Use Cases Covered   | Test Count |
| ----------------- | ------------------------------- | ---------- |
| A. Security       | A02, A03, A04                   | 3          |
| B. Provisioning   | B01-B04, B05-B07, B09, B11, B12 | 11         |
| C. Authorization  | C01, C09, C11                   | 8          |
| E. Transactions   | E01, E14                        | 5          |
| F. Remote Control | F01, F03, F05, F06              | 10         |
| G. Availability   | G01-G04                         | 6          |
| I. Tariff/Cost    | I02                             | 1          |
| J. MeterValues    | J01, J02                        | 2          |
| L. Firmware       | L01                             | 2          |
| M. ISO15118 Certs | M01, M03-M06                    | 5          |
| N. Diagnostics    | N01, N09                        | 5          |
| P. DataTransfer   | P01, P02                        | 2          |
| Edge/Negative     | —                               | 7          |
| **Total**         | **34/34 commands**              | **~70**    |

### Not Testable (simulator not implemented)

D (LocalAuthList), H (Reservation), K (SmartCharging), O (DisplayMessage), N02-N08 (Monitoring).
