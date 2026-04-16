# UI Common

Shared library for the e-mobility charging stations simulator UI clients. Provides the SRPC WebSocket client, UI protocol type definitions, configuration types, and Zod validation schemas.

## Exported API

### Types

```typescript
import type {
  ProcedureName, // enum — all 35 UI protocol procedures
  RequestPayload, // SRPC request payload interface
  ResponsePayload, // SRPC response payload interface
  ResponseStatus, // enum — 'success' | 'failure'
  AuthenticationType, // enum — 'protocol-basic-auth'
  ServerNotification, // enum — 'refresh'
  ProtocolRequest, // [UUIDv4, ProcedureName, RequestPayload]
  ProtocolResponse, // [UUIDv4, ResponsePayload]
  UIServerConfigurationSection, // UI server config type (Zod-inferred)
  Configuration, // Full config type (single or multiple servers)
  UUIDv4, // Branded UUID type
  JsonType, // JSON value type
  JsonObject, // JSON object type
} from 'ui-common'
```

### WebSocketClient

SRPC WebSocket client with dependency injection. Consumers provide a WebSocket factory so the client works in any environment.

```typescript
import { WebSocketClient, ProcedureName, Protocol, ProtocolVersion } from 'ui-common'
import type { WebSocketFactory, WebSocketLike } from 'ui-common'
import { WebSocket } from 'ws'

const factory: WebSocketFactory = (url, protocols) =>
  new WebSocket(url, protocols) as unknown as WebSocketLike

const client = new WebSocketClient(factory, {
  host: 'localhost',
  port: 8080,
  protocol: Protocol.UI,
  version: ProtocolVersion['0.0.1'],
  authentication: {
    enabled: true,
    type: 'protocol-basic-auth',
    username: 'admin',
    password: 'admin',
  },
})

await client.connect()
const response = await client.sendRequest(ProcedureName.SIMULATOR_STATE, {})
client.disconnect()
```

### Config Validation

```typescript
import { uiServerConfigSchema, configurationSchema } from 'ui-common'

const config = uiServerConfigSchema.parse(rawConfig)
const result = uiServerConfigSchema.safeParse(rawConfig)
```

### UUID Utilities

```typescript
import { randomUUID, validateUUID } from 'ui-common'

const id = randomUUID() // UUIDv4
const valid = validateUUID(id) // boolean
```

## Available Scripts

| Script               | Description                      |
| -------------------- | -------------------------------- |
| `pnpm typecheck`     | Type-check                       |
| `pnpm lint`          | Run ESLint                       |
| `pnpm format`        | Run Prettier and ESLint auto-fix |
| `pnpm test`          | Run unit tests                   |
| `pnpm test:coverage` | Run unit tests with coverage     |

## Architecture Decisions

### ADR 1: Separate Config Loading Strategies (CLI vs Web)

The CLI and Web UI load configuration from fundamentally different sources and therefore have separate, non-shared loaders.

| Aspect       | CLI (`ui/cli/src/config/loader.ts`)  | Web (`ui/web/src/composables/UIClient.ts`) |
| ------------ | ------------------------------------ | ------------------------------------------ |
| Source       | Filesystem (XDG path) + `--url` flag | HTTP fetch of `config.json`                |
| Precedence   | 3-level: defaults < file < `--url`   | Single source, no merging                  |
| Multi-server | Rejected (single server only)        | Supported (array)                          |
| Validation   | `uiServerConfigSchema.parse()`       | None (future improvement)                  |

A shared loader abstraction would couple fundamentally different I/O strategies (filesystem vs HTTP) without meaningful code reuse. The only shared piece is `uiServerConfigSchema` from this package, which the CLI already uses for validation.

### ADR 2: ClientConfig Derived from UIServerConfigurationSection

`ClientConfig` (the `WebSocketClient` constructor parameter) is derived from `UIServerConfigurationSection` (the Zod-inferred config type) rather than being a separate hand-written interface:

```typescript
// ui/common/src/client/types.ts
export type ClientConfig = Omit<UIServerConfigurationSection, 'name'>
```

`UIServerConfigurationSection` has an optional `name` field used for display purposes; `WebSocketClient` does not need it. Both consumers (`UIClient.ts` in web and `lifecycle.ts` in CLI) already pass `UIServerConfigurationSection` objects to `WebSocketClient` — TypeScript accepts this because `Omit<T, 'name'>` is structurally compatible with `T` when `name` is optional. This derivation eliminates the previous drift where `ClientConfig` used loose `string` types for `protocol` and `version` while `UIServerConfigurationSection` used the stricter `Protocol` and `ProtocolVersion` enums.
