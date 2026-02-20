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

The server will start listening for connections on port 9000.

## Running the server with OCPP command sending

### Command Line Interface

```shell
poetry run task server --command <COMMAND_NAME> --period <SECONDS>
```

**Options:**

- `--command <COMMAND_NAME>`: The OCPP command to send (see available commands below)
- `--period <SECONDS>`: Interval in seconds between command sends

**Example:**

```shell
poetry run task server --command GetBaseReport --period 5
```

### Available Outgoing Commands

- `ClearCache` - Clear the charging station cache
- `GetBaseReport` - Request a base configuration report
- `GetVariables` - Get variable values from the charging station
- `SetVariables` - Set variable values on the charging station
- `RequestStartTransaction` - Request to start a transaction
- `RequestStopTransaction` - Request to stop a transaction
- `Reset` - Reset the charging station
- `UnlockConnector` - Unlock a specific connector
- `ChangeAvailability` - Change connector availability
- `TriggerMessage` - Trigger a specific message
- `DataTransfer` - Send custom data

## Authorization Testing Modes

The server supports configurable authorization behavior for testing OCPP 2.0 authentication scenarios:

### Command Line Options

```shell
poetry run python server.py --auth-mode <MODE> [--whitelist TOKEN1 TOKEN2 ...] [--blacklist TOKEN1 TOKEN2 ...] [--offline]
```

**Auth Options:**

- `--auth-mode <MODE>`: Authorization mode (default: `normal`)
  - `normal` - Accept all authorization requests (default)
  - `whitelist` - Only accept tokens in the whitelist
  - `blacklist` - Block tokens in the blacklist, accept all others
  - `rate_limit` - Reject all requests with `NotAtThisTime` (simulates rate limiting)
  - `offline` - Not used directly (use `--offline` flag instead)
- `--whitelist TOKEN1 TOKEN2 ...`: Space-separated list of authorized tokens (default: `valid_token test_token authorized_user`)
- `--blacklist TOKEN1 TOKEN2 ...`: Space-separated list of blocked tokens (default: `blocked_token invalid_user`)
- `--offline`: Simulate network failure (raises ConnectionError on Authorize requests)

### Examples

**Whitelist mode** (only accept specific tokens):

```shell
poetry run python server.py --auth-mode whitelist --whitelist valid_token test_token
```

**Blacklist mode** (block specific tokens):

```shell
poetry run python server.py --auth-mode blacklist --blacklist blocked_token invalid_user
```

**Offline mode** (simulate network failure):

```shell
poetry run python server.py --offline
```

**Rate limit simulation**:

```shell
poetry run python server.py --auth-mode rate_limit
```

### Testing the Server

To run the test suite and validate all implemented commands:

```shell
poetry run task test
```

## Overview of the Server Scripts

### Server.py

The server script waits for connections from clients. When a client connects, the server creates a new instance of the `ChargePoint` class. This class includes methods for handling various OCPP messages, most of which return a dummy response.

The server script uses the `websockets` and `ocpp` libraries to facilitate the implementation.

## Development

### Code formatting

```shell
poetry run task format
```

### Code linting

```shell
poetry run task lint
```

## Note

Primarily, this software is intended for testing applications. The server script don't adhere to the full OCPP specifications and it is advised not to use them in a production environment without additional development.

For reference:
https://github.com/mobilityhouse/ocpp
