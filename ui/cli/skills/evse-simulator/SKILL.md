---
name: evse-simulator
description: Control and monitor an OCPP charging station simulator via CLI. Use when users ask to manage charging stations, trigger OCPP messages from stations to the CSMS, start/stop the simulator or ATG, list stations or templates, or check simulator state.
license: Apache-2.0
compatibility: Requires the simulator UI server to be running with WebSocket enabled.
metadata:
  author: SAP
---

# e-Mobility Charging Station Simulator CLI

## Status

!`evse-cli --version 2>/dev/null || echo "Not installed — see ui/cli/README.md"`

## Configuration

The CLI connects to the simulator UI server via WebSocket (SRPC protocol).

Config file location: `${XDG_CONFIG_HOME:-$HOME/.config}/evse-cli/config.json`

```json
{
  "uiServer": {
    "host": "localhost",
    "port": 8080,
    "protocol": "ui",
    "version": "0.0.1",
    "authentication": {
      "enabled": true,
      "type": "protocol-basic-auth",
      "username": "admin",
      "password": "admin"
    }
  }
}
```

Precedence: defaults < config file < `--config <path>` < `--server-url <url>`.

## Global Options

| Option               | Description                  |
| -------------------- | ---------------------------- |
| `--json`             | Machine-readable JSON output |
| `--config <path>`    | Path to config file          |
| `--server-url <url>` | WebSocket URL override       |

## Commands

### Simulator

```shell
evse-cli simulator state   # Get state, version, template statistics
evse-cli simulator start   # Start the simulator
evse-cli simulator stop    # Stop the simulator
```

### Stations

```shell
evse-cli station list                                     # List all stations
evse-cli station start [hashId...]                        # Start station(s)
evse-cli station stop [hashId...]                         # Stop station(s)
evse-cli station add -t <template> -n <count>             # Add stations
evse-cli station add -t <template> -n 2 --auto-start      # Add and auto-start
evse-cli station add -t <template> -n 1 --supervision-url ws://csms:8180/path
evse-cli station delete [hashId...]                       # Delete station(s)
evse-cli station delete --delete-config [hashId...]       # Delete with config files
```

### Templates

```shell
evse-cli template list    # List available station templates
```

### Connections

```shell
evse-cli connection open [hashId...]    # Open WebSocket to CSMS
evse-cli connection close [hashId...]   # Close WebSocket to CSMS
```

### Connectors

```shell
evse-cli connector lock --connector-id <id> [hashId...]    # Lock connector
evse-cli connector unlock --connector-id <id> [hashId...]  # Unlock connector
```

### ATG (Automatic Transaction Generator)

```shell
evse-cli atg start [hashId...]                         # Start ATG on all connectors
evse-cli atg start --connector-ids 1,2 [hashId...]     # Start on specific connectors
evse-cli atg stop [hashId...]                          # Stop ATG on all connectors
evse-cli atg stop --connector-ids 1,2 [hashId...]      # Stop on specific connectors
```

### Transactions

```shell
evse-cli transaction start --connector-id <id> --id-tag <tag> [--evse-id <id>] [hashId...]
evse-cli transaction stop --transaction-id <id> [--connector-id <id>] [hashId...]
```

Both commands auto-detect the station's OCPP version and adapt the procedure and payload. The `-p` option uses the OCPP 1.6 procedure; for 2.0.x raw payloads use `ocpp transaction-event -p`.

### OCPP Messages

Request station(s) to send OCPP messages to the CSMS:

```shell
evse-cli ocpp heartbeat [hashId...]
evse-cli ocpp boot-notification [hashId...]
evse-cli ocpp authorize --id-tag <tag> [hashId...]
evse-cli ocpp status-notification --connector-id <id> [--error-code <code>] --status <status> [--evse-id <id>] [hashId...]
evse-cli ocpp meter-values [--connector-id <id>] [--evse-id <id>] [hashId...]
evse-cli ocpp data-transfer [--vendor-id <id>] [--message-id <id>] [--data <data>] [hashId...]
```

`meter-values` requires at least one of `--connector-id` or `--evse-id` when `-p` is not provided.

Other OCPP commands (no extra options): `diagnostics-status-notification`, `firmware-status-notification`, `get-15118-ev-certificate`, `get-certificate-status`, `log-status-notification`, `notify-customer-information`, `notify-report`, `security-event-notification`, `sign-certificate`, `transaction-event`.

All OCPP and transaction commands accept `-p, --payload <json|@file|->` for custom JSON payloads:

```shell
evse-cli ocpp boot-notification -p '{"reason":"PowerUp"}' [hashId...]  # Inline
evse-cli ocpp boot-notification -p @payload.json [hashId...]           # From file
cat payload.json | evse-cli ocpp boot-notification -p - [hashId...]    # From stdin
```

### Version-aware commands

Commands with typed options (`authorize`, `meter-values`, `status-notification`, `transaction start`, `transaction stop`) auto-detect the target station's OCPP version and build the appropriate payload. Key differences:

- `--id-tag`: sent as `idTag` (1.6) or wrapped as `idToken` (2.0.x)
- `--error-code`: required for `status-notification` on 1.6 only
- `--evse-id`: OCPP 2.0.x only; derived from connector ID if omitted
- `--connector-id` on `transaction stop`: required for OCPP 2.0.x
- `--transaction-id`: integer (1.6) or UUID string (2.0.x)

When `-p` is provided, version detection is skipped and the raw payload is passed through.

### Supervision

```shell
evse-cli supervision set-url --supervision-url <url> [hashId...]
```

### Performance

```shell
evse-cli performance stats   # Get performance statistics
```

## Output Modes

- **Human** (default): borderless tables, status icons, colored output
- **JSON** (`--json`): structured JSON on stdout, parseable by scripts

## Exit Codes

| Code  | Meaning                          |
| ----- | -------------------------------- |
| `0`   | Success                          |
| `1`   | Error (connection, server, auth) |
| `130` | Interrupted (Ctrl+C)             |

## hashId Convention

Omitting `[hashId...]` applies the command to ALL stations. Pass one or more hash IDs to target specific stations. Hash IDs support prefix matching — a short unambiguous prefix works in place of the full ID. Get hash IDs from `evse-cli station list` or `evse-cli --json station list`.

## Common Workflows

### Start simulator and check state

```shell
evse-cli simulator start
evse-cli simulator state
```

### Add stations from template and start ATG

```shell
evse-cli template list
evse-cli station add -t keba-ocpp2.station-template -n 3 --auto-start
evse-cli atg start
```

### Request all stations to send OCPP Heartbeat

```shell
evse-cli ocpp heartbeat
```

### Change supervision URL and reconnect

```shell
evse-cli station stop <hashId>
evse-cli supervision set-url --supervision-url ws://new-csms:8180/path <hashId>
evse-cli station start <hashId>
```
