# OCPP Mock Servers

Mock CSMS (Central System Management System) servers for end-to-end testing of charging station simulators:

- **`server.py`** — OCPP 2.0.1 mock CSMS
- **`server16.py`** — OCPP 1.6 mock CSMS

## Prerequisites

This project requires Python 3.12+ (see `pyproject.toml`) and [Poetry](https://python-poetry.org/) 2+.

Install Poetry:

```shell
pipx install poetry
```

Then install dependencies:

```shell
poetry install --no-root
```

## Running the Servers

OCPP 2.0.1:

```shell
poetry run python server.py
```

OCPP 1.6:

```shell
poetry run python server16.py
```

Both servers listen on `127.0.0.1:9000` by default.

## Configuration

### Server

- `--host <HOST>`: Bind address (default: `127.0.0.1`)
- `--port <PORT>`: Listening port (default: `9000`)

### Boot Behavior

- `--boot-status <STATUS>`: Fixed BootNotification response status (default: `Accepted`)
  - `Accepted` — Station registered
  - `Pending` — Station not yet registered, must retry
  - `Rejected` — Station rejected, must retry
- `--boot-status-sequence <SEQ>`: Comma-separated status sequence (e.g., `Pending,Pending,Accepted`). Returns the next status on each BootNotification, stays on the last value once exhausted.
- `--total-cost <COST>`: Total cost in TransactionEvent.Updated responses (default: `10.0`)

`--boot-status` and `--boot-status-sequence` are mutually exclusive. `--boot-status X` is shorthand for `--boot-status-sequence X`.

```shell
poetry run python server.py --boot-status Rejected
poetry run python server.py --boot-status-sequence Pending,Pending,Accepted
poetry run python server.py --total-cost 25.50
```

### Authorization

- `--auth-mode <MODE>`: Authorization mode (default: `normal`)
  - `normal` — Accept all tokens
  - `whitelist` — Only accept tokens in the whitelist
  - `blacklist` — Block tokens in the blacklist, accept all others
  - `rate_limit` — Reject all with `NotAtThisTime`
- `--whitelist TOKEN ...`: Authorized tokens (default: `valid_token test_token authorized_user`)
- `--blacklist TOKEN ...`: Blocked tokens (default: `blocked_token invalid_user`)
- `--offline`: Simulate network failure (raises `InternalError` on Authorize)
- `--auth-group-id <ID>`: Include `groupIdToken` in Authorize and TransactionEvent.Started responses
- `--auth-cache-expiry <SEC>`: Include `cacheExpiryDateTime` (now + N seconds) in Authorize and TransactionEvent.Started responses

```shell
poetry run python server.py --auth-mode whitelist --whitelist valid_token test_token
poetry run python server.py --auth-mode blacklist --blacklist blocked_token
poetry run python server.py --auth-mode rate_limit
poetry run python server.py --offline
poetry run python server.py --auth-group-id MyGroup --auth-cache-expiry 3600
```

### OCPP Commands

Send CSMS-initiated commands to connected charging stations.

#### Single command

- `--command <NAME>`: OCPP command to send (see supported commands below)
- `--delay <SEC>`: One-shot delay before sending (mutually exclusive with `--period`)
- `--period <SEC>`: Repeat interval in seconds (mutually exclusive with `--delay`)

`--delay` or `--period` is required when `--command` is specified.

```shell
poetry run python server.py --command Reset --delay 5
poetry run python server.py --command GetBaseReport --period 10
```

#### Command sequence

- `--commands <SEQ>`: Comma-separated `CMD:DELAY` pairs, executed sequentially (e.g., `RequestStartTransaction:5,RequestStopTransaction:30`)

Mutually exclusive with `--command`.

```shell
poetry run python server.py --commands "RequestStartTransaction:5,RequestStopTransaction:30"
```

#### Command-specific options

These flags customize the payload of specific commands:

- `--trigger-message <TYPE>`: TriggerMessage requested message type (default: `StatusNotification`)
  - `StatusNotification`, `BootNotification`, `Heartbeat`, `MeterValues`, `FirmwareStatusNotification`, `LogStatusNotification`, `PublishFirmwareStatusNotification`, `TransactionEvent`, `SignChargingStationCertificate`, `SignV2GCertificate`, `SignCombinedCertificate`
- `--reset-type <TYPE>`: Reset type (default: `Immediate`)
  - `Immediate` — Reset now
  - `OnIdle` — Reset when no transaction is active
- `--availability-status <STATUS>`: ChangeAvailability operational status (default: `Operative`)
  - `Operative` — Connector available
  - `Inoperative` — Connector unavailable
- `--set-variables <SPECS>`: SetVariables data as `Component.Variable=Value,...` (values must not contain commas)
- `--get-variables <SPECS>`: GetVariables data as `Component.Variable,...`
- `--local-list-tokens TOKEN ...`: Tokens to include in SendLocalList (default: test token)
- `--reservation-id <ID>`: ReserveNow/CancelReservation reservation id (default: `1`)
- `--reserve-id-token <TOKEN>`: ReserveNow id_token value the reservation is bound to (default: `reserved_token`)
- `--reserve-evse-id <ID>`: ReserveNow target EVSE id (default: `1`)

```shell
poetry run python server.py --command TriggerMessage --trigger-message BootNotification --delay 5
poetry run python server.py --command Reset --reset-type OnIdle --delay 5
poetry run python server.py --command ChangeAvailability --availability-status Inoperative --delay 5
poetry run python server.py --command SetVariables --delay 5 \
  --set-variables "OCPPCommCtrlr.HeartbeatInterval=30,TxCtrlr.EVConnectionTimeOut=60"
poetry run python server.py --command GetLocalListVersion --delay 5
poetry run python server.py --command SendLocalList --delay 5 --local-list-tokens token1 token2
poetry run python server.py --command ReserveNow --reserve-evse-id 1 --reserve-id-token mytag --reservation-id 42 --delay 5
```

## Supported OCPP 2.0.1 Messages

### Outgoing Commands (CSMS → CS)

- `CancelReservation` — Cancel a reservation
- `CertificateSigned` — Send a signed certificate to the charging station
- `ChangeAvailability` — Change connector availability
- `ClearCache` — Clear the charging station cache
- `CustomerInformation` — Request customer information
- `DataTransfer` — Send custom vendor-specific data
- `DeleteCertificate` — Delete a certificate on the charging station
- `GetBaseReport` — Request a full device model report
- `GetInstalledCertificateIds` — List installed certificate IDs
- `GetLocalListVersion` — Get the version number of the local authorization list
- `GetLog` — Request log upload
- `GetTransactionStatus` — Get status of a transaction
- `GetVariables` — Get variable values
- `InstallCertificate` — Install a CA certificate
- `RequestStartTransaction` — Remote start a transaction
- `RequestStopTransaction` — Remote stop a transaction
- `ReserveNow` — Reserve an EVSE
- `Reset` — Reset the charging station
- `SendLocalList` — Send a local authorization list update
- `SetNetworkProfile` — Set the network connection profile
- `SetVariables` — Set variable values
- `TriggerMessage` — Trigger a specific message from the station
- `UnlockConnector` — Unlock a connector
- `UpdateFirmware` — Request firmware update

### Incoming Handlers (CS → CSMS)

- `Authorize` — Handle authorization requests (configurable auth modes)
- `BootNotification` — Handle boot notification (configurable status sequence)
- `DataTransfer` — Handle vendor-specific data transfer
- `FirmwareStatusNotification` — Handle firmware update status
- `Get15118EVCertificate` — Handle ISO 15118 EV certificate requests
- `GetCertificateStatus` — Handle OCSP certificate status requests
- `Heartbeat` — Handle heartbeat messages
- `LogStatusNotification` — Handle log upload status
- `MeterValues` — Handle meter value reports
- `NotifyCustomerInformation` — Handle customer information reports
- `NotifyReport` — Handle device model report notifications
- `SecurityEventNotification` — Handle security events
- `SignCertificate` — Handle CSR signing requests
- `StatusNotification` — Handle connector status notifications
- `TransactionEvent` — Handle transaction lifecycle (Started/Updated/Ended)

### Transaction Tracking

The server tracks active transaction IDs from `TransactionEvent.Started` and uses real IDs in `RequestStopTransaction` and `GetTransactionStatus`. Falls back to a test ID when no transaction is active.

## OCPP 1.6 Server (`server16.py`)

An OCPP 1.6 mock CSMS. Runs independently of the 2.0.1 server; both share the same CLI conventions.

### Server

- `--host <HOST>`: Bind address (default: `127.0.0.1`)
- `--port <PORT>`: Listening port (default: `9000`)
- `--connector-id <ID>`: Connector id used in CSMS→CS commands (default: `1`)

### Boot Behavior

- `--boot-status <STATUS>`: Fixed BootNotification response status (default: `Accepted`)
  - `Accepted` — Station registered
  - `Pending` — Station not yet registered, must retry
  - `Rejected` — Station rejected, must retry
- `--boot-status-sequence <SEQ>`: Comma-separated status sequence (e.g., `Pending,Pending,Accepted`). Returns the next status on each BootNotification, stays on the last value once exhausted.

`--boot-status` and `--boot-status-sequence` are mutually exclusive. `--boot-status X` is shorthand for `--boot-status-sequence X`.

```shell
poetry run python server16.py --boot-status Rejected
poetry run python server16.py --boot-status-sequence Pending,Pending,Accepted
```

### Authorization

- `--auth-mode <MODE>`: Authorization mode (default: `normal`)
  - `normal` — Accept all id tags
  - `whitelist` — Only accept id tags in the whitelist
  - `blacklist` — Block id tags in the blacklist, accept all others
- `--whitelist TAG ...`: Authorized id tags (default: `valid_token test_token authorized_user`)
- `--blacklist TAG ...`: Blocked id tags (default: `blocked_token invalid_user`)
- `--offline`: Simulate network failure (raises `InternalError` on Authorize)
- `--auth-parent-id-tag <TAG>`: Include `parentIdTag` in Authorize and StartTransaction responses (default: none)

```shell
poetry run python server16.py --auth-mode whitelist --whitelist valid_token test_token
poetry run python server16.py --auth-mode blacklist --blacklist blocked_token
poetry run python server16.py --offline
poetry run python server16.py --auth-parent-id-tag ParentTag
```

### OCPP Commands

Send CSMS-initiated commands to connected charging stations.

#### Single command

- `--command <NAME>`: OCPP command to send (see supported commands below)
- `--delay <SEC>`: One-shot delay before sending (mutually exclusive with `--period`)
- `--period <SEC>`: Repeat interval in seconds (mutually exclusive with `--delay`)

`--delay` or `--period` is required when `--command` is specified.

```shell
poetry run python server16.py --command Reset --delay 5
poetry run python server16.py --command TriggerMessage --period 10
```

#### Command sequence

- `--commands <SEQ>`: Comma-separated `CMD:DELAY` pairs, executed sequentially (e.g., `RemoteStartTransaction:5,RemoteStopTransaction:30`)

Mutually exclusive with `--command`.

```shell
poetry run python server16.py --commands "RemoteStartTransaction:5,RemoteStopTransaction:30"
```

#### Command-specific options

- `--trigger-message <TYPE>`: TriggerMessage requested message type (default: `StatusNotification`)
  - `StatusNotification`, `BootNotification`, `Heartbeat`, `MeterValues`, `FirmwareStatusNotification`, `DiagnosticsStatusNotification`, `LogStatusNotification`, `SignChargePointCertificate`
- `--reset-type <TYPE>`: Reset type (default: `Hard`)
  - `Hard` — Reset now
  - `Soft` — Graceful reset
- `--availability-type <TYPE>`: ChangeAvailability type (default: `Operative`)
  - `Operative` — Connector available
  - `Inoperative` — Connector unavailable
- `--reserve-connector-id <ID>`: ReserveNow connector id (default: `1`)
- `--reserve-id-tag <TAG>`: ReserveNow id tag reserving the connector (default: `reserved_tag`)
- `--reservation-id <ID>`: ReserveNow/CancelReservation reservation id (default: `1`)

```shell
poetry run python server16.py --command TriggerMessage --trigger-message BootNotification --delay 5
poetry run python server16.py --command Reset --reset-type Soft --delay 5
poetry run python server16.py --command ChangeAvailability --availability-type Inoperative --delay 5
poetry run python server16.py --command ReserveNow --reserve-connector-id 1 --reserve-id-tag mytag --reservation-id 42 --delay 5
```

### Supported OCPP 1.6 Messages

#### Outgoing Commands (CSMS → CS)

- `TriggerMessage` — Trigger a specific message from the station
- `RemoteStartTransaction` — Remote start a transaction
- `RemoteStopTransaction` — Remote stop a transaction
- `Reset` — Reset the charging station
- `ChangeAvailability` — Change connector availability
- `UpdateFirmware` — Request firmware update
- `GetDiagnostics` — Request diagnostics upload
- `ReserveNow` — Reserve a connector
- `CancelReservation` — Cancel a reservation

#### Incoming Handlers (CS → CSMS)

- `Authorize` — Handle authorization requests (configurable auth modes)
- `BootNotification` — Handle boot notification (configurable status sequence)
- `Heartbeat` — Handle heartbeat messages
- `StartTransaction` — Handle transaction start
- `StopTransaction` — Handle transaction stop (logs signed transaction data)
- `MeterValues` — Handle meter value reports (logs `SignedData`-format samples)
- `StatusNotification` — Handle connector status notifications
- `DataTransfer` — Handle vendor-specific data transfer
- `FirmwareStatusNotification` — Handle firmware update status
- `DiagnosticsStatusNotification` — Handle diagnostics upload status

### Transaction Tracking

The server tracks active transaction IDs from `StartTransaction` and uses real IDs in `RemoteStopTransaction`. Falls back to transaction ID `1` when no transaction is active.

## Development

### Code formatting

```shell
poetry run task format
```

### Type checking

```shell
poetry run task typecheck
```

### Code linting

```shell
poetry run task lint
```

### Testing

```shell
poetry run task test
```

With coverage report:

```shell
poetry run task test_coverage
```

## Reference

- [mobilityhouse/ocpp](https://github.com/mobilityhouse/ocpp) — Python OCPP library
