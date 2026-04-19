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

| Script               | Description                               |
| -------------------- | ----------------------------------------- |
| `pnpm build`         | Type-check (same as typecheck, no output) |
| `pnpm typecheck`     | Type-check                                |
| `pnpm lint`          | Run ESLint                                |
| `pnpm format`        | Run Prettier and ESLint auto-fix          |
| `pnpm test`          | Run unit tests                            |
| `pnpm test:coverage` | Run unit tests with coverage              |
