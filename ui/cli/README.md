# CLI

Command-line tool to manage the e-mobility charging stations simulator via its WebSocket UI service (SRPC protocol).

## Prerequisites

The simulator must have its UI server enabled. Add a `uiServer` section to the simulator configuration:

```json
{
  "uiServer": {
    "enabled": true,
    "type": "ws",
    "authentication": {
      "enabled": true,
      "type": "protocol-basic-auth",
      "username": "admin",
      "password": "admin"
    }
  }
}
```

See the [simulator configuration](../../README.md#charging-stations-simulator-configuration).

## Installation

### Quick install

```shell
cd ui/cli
./install.sh
```

This builds the CLI and installs it to `~/.local/bin/evse-cli`. Options:

| Flag              | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `--bin-dir <dir>` | Install to a custom directory (default: `~/.local/bin`) |
| `--no-build`      | Skip the build step (use existing `dist/cli.js`)        |

Ensure `~/.local/bin` is in your `$PATH`:

```shell
export PATH="$HOME/.local/bin:$PATH"
```

### Manual build

```shell
pnpm install
pnpm --filter cli build
node ui/cli/dist/cli.js --help
```

## Configuration

The CLI reads its configuration from the XDG config directory:

```
${XDG_CONFIG_HOME:-$HOME/.config}/evse-cli/config.json
```

The install script creates a default config file. To override, edit `~/.config/evse-cli/config.json`:

```json
{
  "uiServer": {
    "host": "localhost",
    "port": 8080,
    "protocol": "ui",
    "version": "0.0.1",
    "secure": false,
    "authentication": {
      "enabled": true,
      "type": "protocol-basic-auth",
      "username": "admin",
      "password": "admin"
    }
  }
}
```

### Configuration precedence

Defaults < config file < `--config <path>` < `--server-url <url>` (highest priority).

Use `--config <path>` to load a specific config file instead of the XDG default.

| Option     | Default     |
| ---------- | ----------- |
| `host`     | `localhost` |
| `port`     | `8080`      |
| `protocol` | `ui`        |
| `version`  | `0.0.1`     |
| `secure`   | `false`     |

## Usage

```shell
evse-cli [global-options] <command> [subcommand] [options]
```

### Global Options

| Option                | Description                                       |
| --------------------- | ------------------------------------------------- |
| `-V, --version`       | Print version                                     |
| `-C, --config <path>` | Path to configuration file                        |
| `--json`              | Machine-readable JSON output on stdout            |
| `--server-url <url>`  | WebSocket URL (overrides config host/port/secure) |
| `-h, --help`          | Show help                                         |

### Using hashIds

Most commands accept optional `[hashId...]` arguments to target specific stations. Omitting them applies the command to all stations.

Hash IDs support **prefix matching** — you can use a short prefix instead of the full ID. The CLI resolves it automatically:

```shell
# Full hash:
evse-cli station start e9041c294a82a2d6aa194a801c3ba39d6b24d1cb...

# Short prefix (copied from `station list` output):
evse-cli station start e9041c294a82

# Even shorter (as long as it's unambiguous):
evse-cli station start e904
```

If a prefix matches multiple stations, the CLI returns an error.

### Simulator Commands

#### simulator

```shell
evse-cli simulator state   # Get simulator state and statistics
evse-cli simulator start   # Start the simulator
evse-cli simulator stop    # Stop the simulator
```

#### station

```shell
evse-cli station list                          # List all charging stations
evse-cli station start [hashId...]             # Start station(s)
evse-cli station stop [hashId...]              # Stop station(s)
evse-cli station add -t <template> -n <count>  # Add stations from template
evse-cli station delete [hashId...]            # Delete station(s)
```

**`station add` options:**

| Option                    | Required | Description               |
| ------------------------- | -------- | ------------------------- |
| `-t, --template <name>`   | Yes      | Station template name     |
| `-n, --count <n>`         | Yes      | Number of stations to add |
| `--supervision-url <url>` | No       | Override supervision URL  |
| `--auto-start`            | No       | Auto-start added stations |

**`station delete` options:**

| Option            | Required | Description                   |
| ----------------- | -------- | ----------------------------- |
| `--delete-config` | No       | Also delete persistent config |

#### template

```shell
evse-cli template list     # List available station templates
```

#### connection

```shell
evse-cli connection open [hashId...]   # Open WebSocket connection to CSMS
evse-cli connection close [hashId...]  # Close WebSocket connection to CSMS
```

#### connector

```shell
evse-cli connector lock --connector-id <id> [hashId...]    # Lock connector
evse-cli connector unlock --connector-id <id> [hashId...]  # Unlock connector
```

#### atg

```shell
evse-cli atg start [hashId...] [--connector-ids <ids...>]  # Start ATG
evse-cli atg stop [hashId...]  [--connector-ids <ids...>]  # Stop ATG
```

#### transaction

```shell
evse-cli transaction start --connector-id <id> --id-tag <tag> [--evse-id <id>] [hashId...]
evse-cli transaction stop --transaction-id <id> [--connector-id <id>] [hashId...]
```

Both commands auto-detect the station's OCPP version and adapt the procedure and payload (see [Version-aware commands](#version-aware-commands)). The `-p, --payload` option uses the OCPP 1.6 procedure; for 2.0.x raw payloads use `ocpp transaction-event -p`.

#### ocpp

Request charging station(s) to send OCPP messages to the CSMS:

```shell
evse-cli ocpp heartbeat [hashId...]                                                                              # Heartbeat
evse-cli ocpp authorize --id-tag <tag> [hashId...]                                                               # Authorize
evse-cli ocpp boot-notification [hashId...]                                                                      # BootNotification
evse-cli ocpp status-notification --connector-id <id> [--error-code <code>] --status <status> [--evse-id <id>] [hashId...]  # StatusNotification
evse-cli ocpp meter-values --connector-id <id> [--evse-id <id>] [hashId...]                                      # MeterValues
evse-cli ocpp data-transfer [--vendor-id <id>] [--message-id <id>] [--data <json>] [hashId...]                   # DataTransfer
```

Other OCPP commands (no extra options): `diagnostics-status-notification`, `firmware-status-notification`, `get-15118-ev-certificate`, `get-certificate-status`, `log-status-notification`, `notify-customer-information`, `notify-report`, `security-event-notification`, `sign-certificate`, `transaction-event`.

All OCPP and transaction commands accept `-p, --payload <json|@file|->` to pass a custom JSON payload:

```shell
evse-cli ocpp boot-notification -p '{"reason":"PowerUp"}' [hashId...]        # Inline JSON
evse-cli ocpp boot-notification -p @collections/boot.json [hashId...]        # From file
cat boot.json | jq '.reason = "RemoteReset"' | evse-cli ocpp boot-notification -p - [hashId...]  # From stdin
```

The payload is merged with command-specific options (e.g., `--id-tag`, `--connector-id`). Command options take precedence over payload fields.

#### Version-aware commands

Commands with typed options (`authorize`, `meter-values`, `status-notification`, `transaction start`, `transaction stop`) auto-detect the target station's OCPP version and build the appropriate payload:

| Option             | OCPP 1.6                           | OCPP 2.0.x                                  |
| ------------------ | ---------------------------------- | ------------------------------------------- |
| `--id-tag`         | Sent as `idTag`                    | Wrapped as `idToken` (type: ISO14443)       |
| `--connector-id`   | Sent as `connectorId`              | Sent as `connectorId` (server derives EVSE) |
| `--evse-id`        | N/A                                | Sent as `evseId`                            |
| `--error-code`     | Required for `status-notification` | N/A                                         |
| `--transaction-id` | Integer                            | UUID string                                 |

When `-p` is provided, version detection is skipped and the raw payload is passed through as-is.

#### supervision

```shell
evse-cli supervision set-url --supervision-url <url> [hashId...]  # Set supervision URL
```

#### performance

```shell
evse-cli performance stats  # Get performance statistics
```

### Local Commands

#### skill

Install the embedded [Agent Skills](https://agentskills.io) skill for AI agent integration:

```shell
evse-cli skill show                # Print the SKILL.md to stdout
evse-cli skill install             # Install to .agents/skills/evse-simulator/
evse-cli skill install --global    # Install to ~/.agents/skills/evse-simulator/
evse-cli skill install --force     # Overwrite existing installation
```

Works with OpenCode, Claude Code, GitHub Copilot, Cursor, and other compatible agents.

### Output Modes

| Mode            | Flag     | Description                            |
| --------------- | -------- | -------------------------------------- |
| Human (default) | —        | Colored tables, status icons, counters |
| JSON            | `--json` | Structured JSON on stdout              |

Hash IDs are truncated in human mode for readability. Use `--json` for full hash IDs.

Errors in `--json` mode are written to stdout as structured JSON.

## Exit Codes

| Code  | Meaning                                                    |
| ----- | ---------------------------------------------------------- |
| `0`   | Success                                                    |
| `1`   | Error (connection, server, authentication, or usage error) |
| `130` | Interrupted (SIGINT / Ctrl+C)                              |
| `143` | Terminated (SIGTERM)                                       |

## Environment Variables

| Variable   | Description                                                      |
| ---------- | ---------------------------------------------------------------- |
| `NO_COLOR` | Disable color output (see [no-color.org](https://no-color.org/)) |

## Available Scripts

| Script                  | Description                                |
| ----------------------- | ------------------------------------------ |
| `pnpm build`            | Build the CLI to `dist/`                   |
| `pnpm start`            | Run the built CLI                          |
| `pnpm typecheck`        | Type-check without building                |
| `pnpm lint`             | Run ESLint                                 |
| `pnpm lint:fix`         | Run ESLint with auto-fix                   |
| `pnpm format`           | Run Prettier and ESLint auto-fix           |
| `pnpm test`             | Run unit tests                             |
| `pnpm test:coverage`    | Run unit tests with coverage               |
| `pnpm test:integration` | Run integration tests (requires built CLI) |
