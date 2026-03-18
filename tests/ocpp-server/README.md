# OCPP2 Mock Server

This project includes an Open Charge Point Protocol (OCPP) version 2.0.1 mock server implemented in Python.

## Prerequisites

This project requires Python 3.12+ (see `pyproject.toml`) and requires [poetry](https://python-poetry.org/) 2+ to install the required packages.

Install poetry:

```shell
pipx install poetry
```

or by using your OS packages manager.

Then install dependencies:

```shell
poetry install --no-root
```

## Running the Server

To start the server, run the `server.py` script:

```shell
poetry run task server
```

Or

```shell
poetry run python server.py
```

The server will start listening for connections on `127.0.0.1:9000` by default.

## Configuration

### Server

```shell
poetry run python server.py --host <HOST> --port <PORT>
```

- `--host <HOST>`: Server bind address (default: `127.0.0.1`)
- `--port <PORT>`: Server port (default: `9000`)

### Charging Station Behavior

```shell
poetry run python server.py --boot-status <STATUS> --total-cost <COST>
```

- `--boot-status <STATUS>`: BootNotification response status (`accepted`, `pending`, `rejected`; default: `accepted`)
- `--total-cost <COST>`: Total cost returned in TransactionEvent.Updated responses (default: `10.0`)

**Examples:**

```shell
poetry run python server.py --boot-status rejected
poetry run python server.py --total-cost 25.50
```

### Authorization Modes

The server supports configurable authorization behavior for testing OCPP 2.0.1 authentication scenarios:

```shell
poetry run python server.py --auth-mode <MODE> [--whitelist TOKEN1 TOKEN2 ...] [--blacklist TOKEN1 TOKEN2 ...] [--offline]
```

- `--auth-mode <MODE>`: Authorization mode (default: `normal`)
  - `normal` - Accept all authorization requests (default)
  - `whitelist` - Only accept tokens in the whitelist
  - `blacklist` - Block tokens in the blacklist, accept all others
  - `rate_limit` - Reject all requests with `NotAtThisTime` (simulates rate limiting)
  - `offline` - Not used directly (use `--offline` flag instead)
- `--whitelist TOKEN1 TOKEN2 ...`: Space-separated list of authorized tokens (default: `valid_token test_token authorized_user`)
- `--blacklist TOKEN1 TOKEN2 ...`: Space-separated list of blocked tokens (default: `blocked_token invalid_user`)
- `--offline`: Simulate network failure (raises InternalError on Authorize requests)

**Examples:**

```shell
poetry run python server.py --auth-mode whitelist --whitelist valid_token test_token
poetry run python server.py --auth-mode blacklist --blacklist blocked_token invalid_user
poetry run python server.py --offline
poetry run python server.py --auth-mode rate_limit
```

### OCPP Command Sending

The server can periodically send outgoing OCPP commands to connected charging stations:

```shell
poetry run python server.py --command <COMMAND_NAME> --period <SECONDS>
poetry run python server.py --command <COMMAND_NAME> --delay <SECONDS>
```

- `--command <COMMAND_NAME>`: The OCPP command to send (see supported commands below)
- `--period <SECONDS>`: Interval in seconds between repeated command sends (mutually exclusive with `--delay`)
- `--delay <SECONDS>`: One-shot delay in seconds before sending the command (mutually exclusive with `--period`)

**Example:**

```shell
poetry run python server.py --command GetBaseReport --period 5
```

## Supported OCPP Messages

### Outgoing Commands (CSMS → CS)

- `CertificateSigned` - Send a signed certificate to the charging station
- `ChangeAvailability` - Change connector availability
- `ClearCache` - Clear the charging station cache
- `CustomerInformation` - Request customer information from the charging station
- `DataTransfer` - Send custom data
- `DeleteCertificate` - Delete a certificate on the charging station
- `GetBaseReport` - Request a base configuration report
- `GetInstalledCertificateIds` - Get installed certificate IDs from the charging station
- `GetLog` - Request log upload from the charging station
- `GetTransactionStatus` - Get the status of a transaction
- `GetVariables` - Get variable values from the charging station
- `InstallCertificate` - Install a certificate on the charging station
- `RequestStartTransaction` - Request to start a transaction
- `RequestStopTransaction` - Request to stop a transaction
- `Reset` - Reset the charging station
- `SetNetworkProfile` - Set the network connection profile
- `SetVariables` - Set variable values on the charging station
- `TriggerMessage` - Trigger a specific message
- `UnlockConnector` - Unlock a specific connector
- `UpdateFirmware` - Request firmware update on the charging station

### Incoming Handlers (CS → CSMS)

- `Authorize` - Handle authorization requests (with configurable auth modes)
- `BootNotification` - Handle boot notification from charging station
- `DataTransfer` - Handle vendor-specific data transfer
- `FirmwareStatusNotification` - Handle firmware update status
- `Get15118EVCertificate` - Handle ISO 15118 EV certificate requests
- `GetCertificateStatus` - Handle OCSP certificate status requests
- `Heartbeat` - Handle heartbeat messages
- `LogStatusNotification` - Handle log upload status
- `MeterValues` - Handle meter value reports
- `NotifyCustomerInformation` - Handle customer information reports
- `NotifyReport` - Handle device model report notifications
- `SecurityEventNotification` - Handle security events
- `SignCertificate` - Handle CSR signing requests
- `StatusNotification` - Handle status notifications
- `TransactionEvent` - Handle transaction events (Started/Updated/Ended)

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

- [mobilityhouse/ocpp](https://github.com/mobilityhouse/ocpp) - Python OCPP library
