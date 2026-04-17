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
node dist/cli.js [global-options] <command> [subcommand] [options]
```

### Global Options

| Option                | Description                                       |
| --------------------- | ------------------------------------------------- |
| `-V, --version`       | Print version                                     |
| `-C, --config <path>` | Path to configuration file                        |
| `--json`              | Machine-readable JSON output on stdout            |
| `--server-url <url>`  | WebSocket URL (overrides config host/port/secure) |
| `-h, --help`          | Show help                                         |

### Commands

#### simulator

```shell
node dist/cli.js simulator state   # Get simulator state and statistics
node dist/cli.js simulator start   # Start the simulator
node dist/cli.js simulator stop    # Stop the simulator
```

#### station

```shell
node dist/cli.js station list                          # List all charging stations
node dist/cli.js station start [hashId...]             # Start station(s)
node dist/cli.js station stop [hashId...]              # Stop station(s)
node dist/cli.js station add -t <template> -n <count>  # Add stations from template
node dist/cli.js station delete [hashId...]            # Delete station(s)
```

**`station add` options:**

| Option                    | Required | Description               |
| ------------------------- | -------- | ------------------------- |
| `-t, --template <name>`   | Yes      | Station template name     |
| `-n, --count <n>`         | Yes      | Number of stations to add |
| `--supervision-url <url>` | No       | Override supervision URL  |
| `--auto-start`            | No       | Auto-start added stations |

#### template

```shell
node dist/cli.js template list     # List available station templates
```

#### connection

```shell
node dist/cli.js connection open [hashId...]   # Open WebSocket connection
node dist/cli.js connection close [hashId...]  # Close WebSocket connection
```

#### connector

```shell
node dist/cli.js connector lock --connector-id <id> [hashId...]   # Lock connector
node dist/cli.js connector unlock --connector-id <id> [hashId...]  # Unlock connector
```

#### atg

```shell
node dist/cli.js atg start [hashId...] [--connector-ids <ids...>]  # Start ATG
node dist/cli.js atg stop [hashId...]  [--connector-ids <ids...>]  # Stop ATG
```

#### transaction

```shell
node dist/cli.js transaction start --connector-id <id> --id-tag <tag> [hashId...]
node dist/cli.js transaction stop --transaction-id <id> [hashId...]
```

#### ocpp

Send OCPP commands directly to charging stations:

```shell
node dist/cli.js ocpp heartbeat [hashId...]
node dist/cli.js ocpp authorize --id-tag <tag> [hashId...]
node dist/cli.js ocpp boot-notification [hashId...]
```

Available OCPP commands: `authorize`, `boot-notification`, `data-transfer`, `diagnostics-status-notification`, `firmware-status-notification`, `get-15118-ev-certificate`, `get-certificate-status`, `heartbeat`, `log-status-notification`, `meter-values`, `notify-customer-information`, `notify-report`, `security-event-notification`, `sign-certificate`, `status-notification`, `transaction-event`.

#### performance

```shell
node dist/cli.js performance stats  # Get performance statistics
```

#### supervision

```shell
node dist/cli.js supervision set-url --supervision-url <url> [hashId...]  # Set supervision URL
```

### JSON Output Mode

Use `--json` for machine-readable output on stdout:

```shell
node dist/cli.js --json simulator state
# {"status":"success","state":{...}}
```

Errors are written to stdout as JSON in `--json` mode.

### Using hashIds

Most station commands accept optional `[hashId...]` variadic arguments. Omitting them applies the command to all stations:

```shell
# All stations:
node dist/cli.js station start

# Specific stations:
node dist/cli.js station start abc123 def456
```

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
