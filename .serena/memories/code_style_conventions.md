# Code Style and Conventions

## TypeScript Conventions

- **Naming**: camelCase for variables/functions/methods, PascalCase for classes/types/enums/interfaces, SCREAMING_SNAKE_CASE for test constants
- **Async**: Prefer async/await over raw Promises; fire-and-forget wrapped in `void`; handle rejections with try/catch
- **Error handling**: Typed errors (`BaseError`, `OCPPError`) with structured properties; avoid generic `Error`; use `instanceof` guards (not `as` casts)
- **Null safety**: Avoid non-null assertions (`!`); use optional chaining (`?.`) and nullish coalescing (`??`)
- **Type safety**: Prefer explicit types over `any`; use type guards and discriminated unions; no `as any`, `@ts-ignore`, `@ts-expect-error`

## Enums

- **`enum`** (not `const enum`) for all enumerations — 0 `const enum` in project
- **`as const` objects** for cross-version OCPP enum merges (e.g., `IncomingRequestCommand = { ...OCPP16..., ...OCPP20... } as const`)
- Pattern: `enum` for individual definitions, `as const` for composition of multiple enums

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
- **Per-station state**: WeakMap-based isolation per station (not singleton properties)

## Logging

- **Winston** logger with 4 levels: `error`, `warn`, `info`, `debug`
- **Format**: `${chargingStation.logPrefix()} ${moduleName}.methodName: Message`
- **Daily rotation** enabled by default; configurable max files/size
- **Log config**: `src/utils/Configuration.ts` canonical defaults

## Configuration

- **Canonical defaults**: single source of truth in `src/utils/Configuration.ts`
- **Singleton pattern**: `Configuration.getConfigurationSection<T>(section)`
- **Merge precedence**: defaults < config file < environment overrides
- **Auto-reload**: file watcher on `src/assets/config.json`
- **Sections**: `log`, `storage`, `uiServer`, `worker`, `stationTemplateUrls`, `supervisionUrls`

## Testing Conventions

Full guide: `tests/TEST_STYLE_GUIDE.md`. Key points:

- **Assertions**: `node:assert/strict` — strict only; `assert.ok` only for boolean/existence
- **Naming**: `should [verb]` lowercase; files as `ModuleName.test.ts`
- **Structure**: Single top-level `await describe()` per file; AAA pattern
- **Isolation**: Fresh instances in `beforeEach`; `standardCleanup()` in `afterEach` (mandatory)
- **No real delays**: Use `withMockTimers()` for timer-dependent tests

## Common Pitfalls

- **`const enum`**: Never use — project uses regular `enum` only
- **`new Date(externalString)`**: Never use — always `convertToDate()`
- **ESLint cache**: Clear `.eslintcache` if lint results seem stale after config changes
- **Web UI is independent**: Always run its quality gates separately from `ui/web/` directory
- **OCPP server is Python**: Uses Poetry, not pnpm
- **macOS + Node 22**: Known flaky test (`RequestStopTransaction` listener) — skipped in CI
