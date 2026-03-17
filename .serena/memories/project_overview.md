# E-Mobility Charging Stations Simulator - Project Overview

## Purpose

Node.js simulator for OCPP-J charging stations, part of SAP e-Mobility solution. Simulates and scales charging stations for load testing and development.

## Monorepo Structure (pnpm workspace)

3 sub-projects:

1. **Root Simulator** (`/`) — Node.js/TypeScript OCPP simulator (main project)
2. **Web UI** (`/ui/web`) — Vue 3 + Vite dashboard for monitoring/control
3. **OCPP Mock Server** (`/tests/ocpp-server`) — Python OCPP 2.0.1 mock server for testing

## Tech Stack

| Sub-project | Runtime          | Language               | Package Manager | Test Framework          | Build Tool |
| ----------- | ---------------- | ---------------------- | --------------- | ----------------------- | ---------- |
| Simulator   | Node.js >=22.0.0 | TypeScript 5.9         | pnpm >=10.9.0   | Node.js native `--test` | esbuild    |
| Web UI      | Node.js >=22.0.0 | TypeScript 5.9 + Vue 3 | pnpm >=10.9.0   | Vitest                  | Vite       |
| OCPP Server | Python >=3.12    | Python                 | Poetry >=2.0    | pytest + pytest-asyncio | N/A        |

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
- `worker/` is self-contained and intentionally defines its own types (portable to other projects)
- `types/` is pure type definitions, depends on nothing except `worker/` (type-only)
- `utils/` depends on `types/` and `charging-station/` (type-only + 1 runtime: `getMessageTypeString`)
- `exception/` is a leaf module with no dependencies

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

## Key Dependencies

- **ws** — WebSocket client/server
- **poolifier** — Worker thread pool management
- **ajv** — JSON schema validation (OCPP payloads)
- **winston** — Logging with daily rotation
- **@mikro-orm/** — Database ORM (SQLite, MariaDB)
- **mnemonist** — Data structures (CircularBuffer)
- **websockets** + **ocpp** — Python OCPP mock server
