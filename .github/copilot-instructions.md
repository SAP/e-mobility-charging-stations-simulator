# Copilot Instructions (repository-wide, language-agnostic)

These instructions guide GitHub Copilot to generate changes consistent with this repository's conventions, regardless of programming language.

## Glossary

- **Tunables**: user-adjustable parameters that shape behavior, exposed via options or configuration files.
- **Canonical defaults**: the single, authoritative definition of all tunables and their defaults.

## Core principles

- **Single source of truth**: maintain a canonical defaults map for configuration tunables. Derive all user-facing options automatically.
- **Naming coherence**: prefer semantically accurate names across code, documentation, and outputs. Avoid synonyms that create ambiguity.
- **English-only**: code, tests, logs, comments, and documentation must be in English.
- **Small, verifiable changes**: prefer minimal diffs that keep public behavior stable unless explicitly requested.
- **Tests-first mindset**: add or update minimal tests before refactoring or feature changes.

## Options and configuration

- **Dynamic generation**: derive CLI and configuration options automatically from canonical defaults. Avoid manual duplication.
- **Merge precedence**: defaults < user options < explicit overrides (highest precedence). Never silently drop user-provided values.
- **Validation**: enforce constraints (choices, ranges, types) at the option layer with explicit typing.
- **Help text**: provide concrete examples for complex options, especially override mechanisms.

## Statistical conventions

- **Divergence metrics**: document direction explicitly (e.g., KL(A||B) vs KL(B||A)); normalize distributions; add epsilon to avoid numerical issues.
- **Effect sizes**: report alongside test statistics and p-values; use standard formulas; document directional interpretation.
- **Distribution comparisons**: use multiple complementary metrics (parametric and non-parametric).
- **Multiple testing**: document corrections or acknowledge their absence.

## Reporting conventions

- **Structure**: start with run configuration, then stable section order for comparability.
- **Format**: use structured formats (e.g., tables) for metrics; avoid free-form text for data.
- **Interpretation**: include threshold guidelines; avoid overclaiming certainty.
- **Artifacts**: timestamp outputs; include configuration metadata.

## Implementation guidance for Copilot

- **Before coding**:
  - Locate and analyze relevant existing code.
  - Identify canonical defaults and naming patterns.
- **When coding**:
  - Follow TypeScript/Node.js and OCPP-specific conventions below.
- **When adding a tunable**:
  - Add to defaults with safe value.
  - Update documentation and serialization.
- **When implementing analytical methods**:
  - Follow statistical conventions above.
- **When refactoring**:
  - Keep APIs stable; provide aliases if renaming.
  - Update code, tests, and docs atomically.

## TypeScript/Node.js conventions

- **Naming**: Use camelCase for variables/functions/methods, PascalCase for classes/types/enums/interfaces.
- **Async operations**: Prefer async/await over raw Promises; handle rejections explicitly with try/catch.
- **Error handling**: Use typed errors (BaseError, OCPPError) with structured properties; avoid generic Error.
- **Worker communication**: Use broadcast channels for decoupled worker-main thread messaging.
- **Null safety**: Avoid non-null assertions (!); use optional chaining (?.) and nullish coalescing (??).
- **Type safety**: Prefer explicit types over any; use type guards and discriminated unions where appropriate.
- **Promise patterns**: Return Promises from async operations; store resolvers/rejectors in Maps for request/response flows.
- **Immutability**: Avoid mutating shared state; clone objects before modification when needed.

## OCPP-specific conventions

- **Command naming**: Follow OCPP standard naming exactly (e.g., RemoteStartTransaction, BootNotification, StatusNotification).
- **Version handling**: Clearly distinguish between OCPP 1.6 and 2.x implementations in separate namespaces/files.
- **Payload validation**: Validate against OCPP JSON schemas when ocppStrictCompliance is enabled.
- **Message format**: Use standard SRPC format: [messageTypeId, messageId, action, payload] or [messageTypeId, messageId, payload].
- **UUID tracking**: Use UUIDs to correlate requests with responses; store pending operations in Maps with UUID keys.
- **Response handling**: Wait for all expected responses before resolving broadcast requests.

## Quality gates

- Build/lint/type checks pass (where applicable).
- Tests pass (where applicable).
- Documentation updated to reflect changes.
- Logs use appropriate levels (error, warn, info, debug).

## Examples

### Naming coherence

**Good** (consistent style, clear semantics):

```typescript
const thresholdValue = 0.06
const processingMode = 'piecewise'
type ChargingStationStatus = 'Available' | 'Preparing' | 'Charging'
```

**Bad** (mixed styles, ambiguous):

```typescript
const threshold_value = 0.06    // inconsistent case style
const thresholdAim = 0.06       // synonym creates ambiguity
type charging_station_status    // wrong casing for type
```

### Promise-based request/response pattern

**Good** (proper async flow):

```typescript
protected handleProtocolRequest(
  uuid: string,
  procedureName: ProcedureName,
  payload: RequestPayload
): Promise<ResponsePayload> {
  return new Promise<ResponsePayload>((resolve, reject) => {
    this.pendingRequests.set(uuid, { reject, resolve })
    this.sendBroadcastChannelRequest(uuid, procedureName, payload)
  })
}
```

**Bad** (returns void, no Promise):

```typescript
protected handleProtocolRequest(
  uuid: string,
  procedureName: ProcedureName,
  payload: RequestPayload
): void {
  this.sendBroadcastChannelRequest(uuid, procedureName, payload)
  // Response never reaches caller!
}
```

### Statistical reporting

```markdown
| Metric      | Value | Interpretation        |
| ----------- | ----- | --------------------- |
| KL(A‖B)     | 0.023 | < 0.1: low divergence |
| Effect size | 0.12  | small to medium       |
```

---

By following these instructions, Copilot should propose changes that are consistent and maintainable across languages.
