# Code Style and Conventions

## TypeScript Conventions

- **Naming**: camelCase for variables/functions/methods, PascalCase for classes/types/enums/interfaces, SCREAMING_SNAKE_CASE for all constants (production and test)
- **Constant unit suffixes**: Time/size constants MUST include unit in name: `_MS`, `_SECONDS`, `_BYTES`. Counts/ratios/strings: no suffix. No inline `// Ms` comments — the name IS the documentation
- **Async**: Prefer async/await over raw Promises; fire-and-forget wrapped in `void`; handle rejections with try/catch
- **Error handling**: Typed errors (`BaseError`, `OCPPError`) with structured properties; avoid generic `Error`; use `instanceof` guards (not `as` casts)
- **BaseError import constraint**: `src/utils/` CANNOT import from `exception/index.js` (barrel) — causes circular dep via `OCPPError → OCPPConstants → utils/Constants`. `new Error()` is acceptable in utils/ and worker/
- **Null safety**: Avoid non-null assertions (`!`); use optional chaining (`?.`) and nullish coalescing (`??`)
- **Type safety**: Prefer explicit types over `any`; use type guards and discriminated unions; no `as any`, `@ts-ignore`, `@ts-expect-error`

## Enums & Type Merging

- **`enum`** (not `const enum`) for all enumerations — 0 `const enum` in project
- **`as const` objects** for cross-version OCPP enum merges (e.g., `ConnectorStatusEnum = { ...OCPP16ChargePointStatus, ...OCPP20ConnectorStatusEnumType } as const`)
- Pattern: `enum` for individual definitions, `as const` for composition of multiple enums
- **Discriminated unions** for cross-version request/response types: `type BootNotificationRequest = OCPP16BootNotificationRequest | OCPP20BootNotificationRequest`
- **Type barrel chain**: `ocpp/1.6/*.ts` + `ocpp/2.0/*.ts` → unified `ocpp/*.ts` → `types/index.ts`
- **Configuration type composition**: Intersection types (`A & B & C`), not inheritance

## Imports

- **`import type`** enforced by `@typescript-eslint/consistent-type-imports` ESLint rule with `fixStyle: 'separate-type-imports'`
- **`import { type X }` (inline)**: used only in mixed imports where both types and values come from the same module
- **`node:` prefix**: mandatory for all Node.js built-in modules (100% adoption)
- **`.js` extension**: mandatory on all relative imports (ESM + `moduleResolution: "NodeNext"`)
- **`.d.ts` files**: `consistent-type-imports` rule disabled (inline `import()` is the standard pattern in ambient declarations)

## Date Handling

- **`convertToDate()`** (`src/utils/Utils.ts`) is the ONLY way to convert incoming JSON date strings to `Date`
- **Never** use `new Date(externalValue)` directly — always `convertToDate()`
- **Naming convention**: `...Date` suffix for converted `Date` objects (e.g., `validFromDate`, `validToDate`, `startScheduleDate`); `...Time` suffix for numeric timestamps (e.g., `retrieveTime`, `installTime`)
- **Outgoing**: `convertDateToISOString()` converts `Date` → string before sending JSON payloads
- **Incoming**: conversion done manually in handlers with `convertToDate()` where needed

## OCPP-specific Conventions

- **Command naming**: Follow OCPP standard naming exactly (e.g., `RemoteStartTransaction`, `BootNotification`)
- **Enumeration naming**: OCPP spec names exactly (e.g., `ConnectorStatusEnumType`); prefix with `OCPP16`/`OCPP20` for version-specific enums
- **Version handling**: OCPP 1.6 and 2.0.x in separate directories/namespaces
- **Payload validation**: Against OCPP JSON schemas when `ocppStrictCompliance` is enabled
- **Message format**: SRPC format: `[messageTypeId, messageId, action, payload]`
- **Per-station state**: Instance-based (each `ChargingStation` owns its own Maps/state). `WeakMap` used only in `OCPP20IncomingRequestService.stationsState` for handler-scoped state keyed by station reference

### Request Architecture

- **Single path**: `requestHandler()` → `buildRequestPayload()` → `sendMessage()` — no bypasses
- **`buildRequestPayload()`** enriches where needed (1.6: meterStart/idTag/timestamp; 2.0: CSR generation), passthrough otherwise
- **Service utils** (`buildTransactionEvent`, `buildStatusNotificationRequest`, `buildMeterValue`, etc.) build complex payloads upstream before calling `requestHandler`
- **Broadcast channel handlers** are simple passthroughs to `requestHandler` — no state management or flow duplication
- **Request/Response correlation**: UUID Map with resolve/reject/timeout per pending request
- **Payload validation**: AJV against OCPP JSON schemas when `ocppStrictCompliance` is enabled
- **Version dispatch**: `OCPPServiceOperations.ts` provides version-agnostic operations (startTransaction, stopTransaction, isIdTagAuthorized) that dispatch to version-specific handlers

## Logging

- **Winston** logger with 4 levels: `error`, `warn`, `info`, `debug`
- **Format**: `${chargingStation.logPrefix()} ${moduleName}.methodName: Message`
- **Daily rotation** enabled by default; configurable max files/size
- **Log config**: `src/utils/Configuration.ts` canonical defaults
- **`console.*` is acceptable ONLY** in: `start.ts` (entry point), `Configuration.ts`/`ConfigurationMigration.ts` (static init, logger not ready), `ErrorUtils.ts` (uncaught handlers, logger may be null), `WorkerUtils.ts` (standalone, no logger access). Everywhere else: use `logger`

## Configuration

- **Canonical defaults**: single source of truth in `src/utils/Configuration.ts`
- **Singleton pattern**: `Configuration.getConfigurationSection<T>(section)`
- **Merge precedence**: defaults < config file < environment overrides
- **Auto-reload**: file watcher on `src/assets/config.json`
- **Sections**: `log`, `storage`, `uiServer`, `worker`, `stationTemplateUrls`, `supervisionUrls`

## Testing Conventions

Full guide: `tests/TEST_STYLE_GUIDE.md`. Key points:

- **Assertions**: `node:assert/strict` — strict only; `assert.ok` only for boolean/existence; never loose equality
- **Naming**: `should [verb]` lowercase; files as `ModuleName.test.ts`; OCPP tests: spec code prefix (e.g., `B11 - Reset`)
- **Structure**: Single top-level `await describe()` per file (CRITICAL for Windows CI `--test-force-exit`); AAA pattern with comments
- **File headers**: Mandatory `@file` + `@description` JSDoc
- **Isolation**: Fresh instances in `beforeEach`; `standardCleanup()` in `afterEach` (mandatory); `cleanupChargingStation()` for station instances
- **No real delays**: Use `withMockTimers(t, ['setTimeout'], async () => {...})` for timer tests
- **Mocking**: `t.mock.method()` for spying; `mock.fn()` for stubs; all restored by `standardCleanup()`
- **Async side-effects**: Use `flushMicrotasks()` for event emitter draining (not `await Promise.resolve()`)
- **Station factory**: `createMockChargingStation(options?)` returns `{ station, mocks }` with MockWebSocket, parentPortMessages, file system mocks
- **Auth factories**: `createMockAuthRequest()`, `createMockAuthorizationResult()`, `createMockAuthService()` in `tests/charging-station/ocpp/auth/helpers/MockFactories.ts`
- **Transaction setup**: `setupConnectorWithTransaction(station, connectorId, { transactionId, idTag? })`
- **Re-export hub**: `tests/charging-station/ChargingStationTestUtils.ts` aggregates all test utilities
- **`__testable__` pattern**: `ocpp/1.6/__testable__/` and `ocpp/2.0/__testable__/` directories expose internal classes (e.g., `OCPP20VariableManagerTestable`, `OCPP20RequestServiceTestable`) for unit testing private internals. Import from `__testable__/index.ts` barrel in tests only

## Utility Usage Rules

- **Emptiness checks**: Use `isEmpty()` / `isNotEmptyArray()` instead of `.length === 0` / `.size > 0` (except in worker/)
- **Number parsing**: Use `convertToInt()` / `convertToFloat()` instead of `Number.parseInt()` / `Number.parseFloat()`. Exception: when NaN fallback is needed (e.g., `getLimitFromSampledValueTemplateCustomValue` — keep `Number.parseFloat`)
- **Cloning**: Use `clone()` — never `JSON.parse(JSON.stringify())`
- **Random**: Use `secureRandom()` / `generateUUID()` — not direct `randomBytes()` / `randomUUID()` (except in worker/ which has its own copies)

## Vue UI Conventions

- **Route names**: Use `ROUTE_NAMES` constant object from `composables/Constants.ts` — never hardcode route strings
- **Placeholders**: Use `EMPTY_VALUE_PLACEHOLDER` constant for unknown/missing values — never hardcode `'Ø'`
- **localStorage keys**: Use `UI_SERVER_CONFIGURATION_INDEX_KEY` and `TOGGLE_BUTTON_KEY_PREFIX` constants
- **Separate package**: UI Web cannot import from the backend `src/` — shared logic is duplicated in `composables/Utils.ts`

## Common Pitfalls

- **ESLint cache**: Clear `.eslintcache` if lint results seem stale after config changes
- **Web UI is independent**: Always run its quality gates separately from `ui/web/` directory
- **OCPP server is Python**: Uses Poetry, not pnpm. Linter is ruff (not pylint/flake8). Type checker is mypy
- **Barrel circular deps**: `src/utils/` must NOT import from `src/exception/index.js` — import directly from `BaseError.js` if absolutely needed

## Python Conventions (tests/ocpp-server/)

- **Naming**: SCREAMING_SNAKE_CASE constants with unit suffixes (`_SECONDS`), snake_case functions, PascalCase classes
- **Constants**: Module-level, grouped by category (server config, auth, defaults)
- **ruff S105**: Constants with "TOKEN" in name trigger false positive — suppress with `# noqa: S105`
- **Async**: `async/await` throughout, `asyncio_mode = "auto"` in pytest
- **Testing**: pytest fixtures for charge point variants (normal, whitelist, blacklist, offline, rate_limit, command); parametrized tests for command paths
- **Server architecture**: `ChargePoint` class inherits `ocpp.v201.ChargePoint`, uses `_COMMAND_HANDLERS` ClassVar for dispatch, `Timer` class for delayed/periodic commands
- **No thin wrappers**: Inline `require_value=True/False` at call sites rather than creating one-liner wrapper functions
