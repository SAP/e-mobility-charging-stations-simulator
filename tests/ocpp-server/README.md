# OCPP2 Mock Server

An OCPP 2.0.1 mock CSMS (Central System Management System) for end-to-end testing of charging station simulators.

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

## Running the Server

```shell
poetry run python server.py
```

The server listens on `127.0.0.1:9000` by default.

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
- `--auth-cache-expiry <SEC>`: Include `cacheExpiryDateTime` (now + N seconds) in Authorize responses

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
  - `StatusNotification`, `BootNotification`, `Heartbeat`, `MeterValues`, `FirmwareStatusNotification`, `LogStatusNotification`, `SignCertificate`
- `--reset-type <TYPE>`: Reset type (default: `Immediate`)
  - `Immediate` — Reset now
  - `OnIdle` — Reset when no transaction is active
- `--availability-status <STATUS>`: ChangeAvailability operational status (default: `Operative`)
  - `Operative` — Connector available
  - `Inoperative` — Connector unavailable
- `--set-variables <SPECS>`: SetVariables data as `Component.Variable=Value,...`
- `--get-variables <SPECS>`: GetVariables data as `Component.Variable,...`

```shell
poetry run python server.py --command TriggerMessage --trigger-message BootNotification --delay 5
poetry run python server.py --command Reset --reset-type OnIdle --delay 5
poetry run python server.py --command ChangeAvailability --availability-status Inoperative --delay 5
poetry run python server.py --command SetVariables --delay 5 \
  --set-variables "OCPPCommCtrlr.HeartbeatInterval=30,TxCtrlr.EVConnectionTimeOut=60"
```

## Supported OCPP 2.0.1 Messages

### Outgoing Commands (CSMS → CS)

- `CertificateSigned` — Send a signed certificate to the charging station
- `ChangeAvailability` — Change connector availability
- `ClearCache` — Clear the charging station cache
- `CustomerInformation` — Request customer information
- `DataTransfer` — Send custom vendor-specific data
- `DeleteCertificate` — Delete a certificate on the charging station
- `GetBaseReport` — Request a full device model report
- `GetInstalledCertificateIds` — List installed certificate IDs
- `GetLog` — Request log upload
- `GetTransactionStatus` — Get status of a transaction
- `GetVariables` — Get variable values
- `InstallCertificate` — Install a CA certificate
- `RequestStartTransaction` — Remote start a transaction
- `RequestStopTransaction` — Remote stop a transaction
- `Reset` — Reset the charging station
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
