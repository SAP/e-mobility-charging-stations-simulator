# E-Mobility Charging Stations Simulator - Project Overview

## Purpose

Node.js simulator for OCPP-J charging stations, part of SAP e-Mobility solution. Simulates and scales charging stations for load testing and development.

## Monorepo Structure (pnpm workspace)

3 sub-projects:

1. **Root Simulator** (`/`) — Node.js/TypeScript OCPP simulator (main project)
2. **Web UI** (`/ui/web`) — Vue 3 + Vite dashboard for monitoring/control
3. **OCPP Mock Server** (`/tests/ocpp-server`) — Python OCPP 2.0.1 mock server for testing

## Tech Stack

| Sub-project | Runtime          | Language                 | Package Manager | Test Framework          | Build Tool |
| ----------- | ---------------- | ------------------------ | --------------- | ----------------------- | ---------- |
| Simulator   | Node.js >=22.0.0 | TypeScript 6.0           | pnpm >=10.9.0   | Node.js native `--test` | esbuild    |
| Web UI      | Node.js >=22.0.0 | TypeScript 6.0 + Vue 3.5 | pnpm >=10.9.0   | Vitest                  | Vite 8     |
| OCPP Server | Python >=3.12    | Python                   | Poetry >=2.0    | pytest + pytest-asyncio | N/A        |

## Coverage Thresholds

| Sub-project | Branches      | Functions | Lines/Statements |
| ----------- | ------------- | --------- | ---------------- |
| Web UI      | 89%           | 83%       | 91%              |
| OCPP Server | 83% (overall) | —         | —                |

## Source Structure

```
src/
├── charging-station/           # CORE: charging station simulator
│   ├── ocpp/                   # OCPP protocol (SEPARATE component)
│   │   ├── 1.6/               # OCPP 1.6 implementation
│   │   ├── 2.0/               # OCPP 2.0.x implementation
│   │   ├── auth/              # Authentication subsystem (barrel: index.ts)
│   │   └── index.ts           # OCPP barrel
│   ├── broadcast-channel/     # Worker communication
│   ├── ui-server/             # UI server (HTTP + WebSocket)
│   └── index.ts               # Charging station barrel
├── types/                      # Type definitions (barrel: index.ts)
│   └── ocpp/                  # OCPP-specific types (1.6/, 2.0/)
├── utils/                      # Utilities (barrel: index.ts)
├── worker/                     # Worker thread management (barrel: index.ts)
├── performance/                # Performance statistics (barrel: index.ts)
│   └── storage/               # Storage backends (jsonfile, mongodb, none)
└── exception/                  # Error classes (barrel: index.ts)
```

## Component Boundaries

- `charging-station/` and `ocpp/` are SEPARATE components with their own barrels
- `ocpp/1.6/` and `ocpp/2.0/` are separate sub-components of ocpp
- `ocpp/auth/` is an independent subsystem with its own barrel, interfaces, and strategy pattern
- `worker/` is **fully standalone** — zero imports from other local modules. Has its own `sleep()`, `secureRandom()`, `mergeDeepRight()`. Uses `new Error()` (not `BaseError`). Portable to other projects
- `types/` is pure type definitions, depends on nothing except `worker/` (type-only)
- `utils/` depends on `types/` and `charging-station/` (type-only + 1 runtime: `getMessageTypeString`)
- `exception/` — `BaseError` has no imports; `OCPPError` imports from `types/` and `ocpp/OCPPConstants`. The barrel creates a transitive dep chain NOT usable by `utils/` (circular)

## Design Patterns

| Pattern              | Where                                                           | Detail                                                                 |
| -------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Singleton            | Bootstrap, Configuration, PerformanceStatistics, UIClient (Vue) | Lazy `getInstance()`                                                   |
| Strategy             | Auth subsystem                                                  | Local/Remote/Certificate strategies with priority chain                |
| Factory              | WorkerFactory, StorageFactory, AuthComponentFactory             | Create implementations from config                                     |
| EventEmitter         | ChargingStation, Bootstrap                                      | State change events                                                    |
| SRPC                 | UI WebSocket                                                    | `[uuid, procedureName, payload]` request/response correlation          |
| Barrel exports       | All components                                                  | `index.ts` re-exports public API                                       |
| Discriminated unions | OCPP types                                                      | `BootNotificationRequest = OCPP16BootNotificationRequest \| OCPP20...` |
| `as const` merge     | OCPP enums                                                      | `ConnectorStatusEnum = { ...OCPP16..., ...OCPP20... } as const`        |

## Auth Subsystem (`ocpp/auth/`)

- **OCPPAuthServiceImpl**: Strategy priority chain (local → remote → certificate)
- **3 strategies**: LocalAuthStrategy (cache + local auth list lookup), RemoteAuthStrategy (CSMS network calls), CertificateAuthStrategy (X.509)
- **InMemoryAuthCache**: LRU with TTL, rate limiting, periodic cleanup
- **InMemoryLocalAuthListManager**: CSMS-managed authorization list with Full/Differential updates, version tracking, capacity limits
- **AuthComponentFactory**: Creates adapters, strategies, caches, managers from config
- **AuthHelpers**: Cross-version utility functions (TTL calculation, config key reading, result formatting)
- **Version adapters**: OCPP16AuthAdapter, OCPP20AuthAdapter

## UI Server (`ui-server/`)

- **3 transports**: UIWebSocketServer (SRPC), UIMCPServer (Model Context Protocol for LLM agents), UIHttpServer (REST, deprecated)
- **AbstractUIServer**: Base with HTTP/HTTP2, auth (Basic/Protocol), rate limiting, debounced client notifications (500ms)
- **Protocol**: `[uuid, procedureName, payload]` requests, `[uuid, responsePayload]` responses, `[ServerNotification.REFRESH]` notifications

## Test Structure

```
tests/
├── charging-station/           # Mirrors src/charging-station/
│   ├── ocpp/1.6/              # OCPP 1.6 handler tests
│   ├── ocpp/2.0/              # OCPP 2.0 handler tests
│   ├── ocpp/auth/             # Auth tests
│   ├── ui-server/             # UI server tests
│   ├── mocks/                 # Mock implementations (MockWebSocket, etc.)
│   └── helpers/               # Test helpers and factories
├── types/, utils/, worker/, performance/, exception/  # Mirror src/
├── helpers/                    # Shared lifecycle helpers
└── ocpp-server/               # Python OCPP server (separate sub-project)
```

## CI Matrix

| Sub-project | Platforms              | Versions                | Gated on             |
| ----------- | ---------------------- | ----------------------- | -------------------- |
| Simulator   | Ubuntu, macOS, Windows | Node 22.x, 24.x, latest | Ubuntu + Node 24.x   |
| Web UI      | Ubuntu, macOS, Windows | Node 22.x, 24.x, latest | Ubuntu + Node 24.x   |
| OCPP Server | Ubuntu, macOS, Windows | Python 3.12, 3.13       | Ubuntu + Python 3.13 |

Gated steps (lint, typecheck, coverage, SonarCloud) run only on the gated platform. Build + test run on all platforms.

## OCPP Specification Documents (`docs/`)

```
docs/
├── ocpp16/                    # OCPP 1.6 specs, errata, security whitepaper, JSON schemas
├── ocpp2/                     # OCPP 2.0.1 specs, test cases, certification profiles
├── ocpp21/                    # OCPP 2.1 specs, errata, appendices
└── signed_meter_values-v10-1.md
```

24 markdown files covering all supported OCPP versions. Authoritative spec references for implementing OCPP commands. Indexed in QMD as `ocpp-specs` collection (see `suggested_commands` memory for search commands).

## Key Dependencies

- **ws** — WebSocket client/server
- **poolifier** — Worker thread pool management
- **ajv** — JSON schema validation (OCPP payloads)
- **winston** — Logging with daily rotation
- **@mikro-orm/** — Database ORM (SQLite, MariaDB)
- **mnemonist** — Data structures (CircularBuffer)
- **websockets** + **ocpp** — Python OCPP mock server
