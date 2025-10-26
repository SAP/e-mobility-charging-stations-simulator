# Project Context

## Purpose

The e-Mobility Charging Stations Simulator provides a scalable, configurable load and behavior simulator for sets of EV charging stations speaking the OCPP-J protocol (1.6 and partially 2.0.x). It is used for functional testing, performance/load testing, integration validation, and experimentation within SAP e-Mobility and for community contributors. It emulates station lifecycle, transactions, firmware flows, metering, statistics and supervision URL dynamics.

## Tech Stack

- Runtime: Node.js (>=20.11.0) + Worker Threads
- Language: TypeScript (~5.9) (ESM modules; `type: module`)
- Build: esbuild bundling (custom scripts) + PNPM workspaces
- Package Manager: pnpm (>=9)
- Testing: Native Node test runner (`node --test`) + `@std/expect` assertions + c8 coverage
- Linting: ESLint flat config with TypeScript strict type checking, jsdoc, perfectionist, vue, cspell, neostandard style
- Formatting: Prettier (printWidth 100, singleQuote, no semicolons, trailingComma es5)
- UI: Vue-based Web UI (under `ui/web`) communicating via HTTP or WebSocket SRPC protocol
- Protocol Simulation: OCPP-J 1.6 (core + profiles) and partial 2.0.x; JSON Schema validation (ajv + ajv-formats)
- Concurrency & Pools: Worker Threads + `poolifier` for dynamic/fixed/workerSet strategies
- Persistence / Storage: Optional performance storage (JSON file / MongoDB) + Mikro-ORM (MariaDB / SQLite drivers available) for entity modeling if enabled
- Logging: winston + winston-daily-rotate-file (structured, rotating logs)
- Utilities: date-fns, chalk, mnemonist, ws, tar
- CI/CD & Releases: GitHub Actions (lint/test/build/codeql/release-please) + release-please automation

## Project Conventions

### Code Style

- Source: TypeScript with strict type checking (typescript-eslint strictTypeChecked + stylisticTypeChecked).
- Naming: camelCase for variables/functions; PascalCase for classes/interfaces/enums/types; UPPER_SNAKE_CASE for constants where applicable; exact OCPP enumeration names.
- Imports: ESM `import` syntax, relative paths kept short; avoid default exports except where single primary module.
- Formatting: Prettier enforced (printWidth 100, singleQuote=true, semi=false, trailingComma=es5, arrowParens=avoid). Auto-run via lint-staged on committed files.
- Lint: ESLint flat config; no lint errors permitted in CI. Spellchecking via cspell plugin for domain-specific terms.
- Avoid `any`; prefer explicit types, discriminated unions, and type guards. Optional chaining (`?.`) + nullish coalescing (`??`) for safety.
- Errors: Use `BaseError` and `OCPPError` in OCPP stack for structured error handling; include contextual properties.
- Logging: Use `Logger` utility wrapping winston; correct severity (error>warn>info>debug). No console.log in committed code.
- Immutability: Avoid shared mutable state; configuration objects cloned before modification.
- No non-English terms in code, docs, comments, logs.

### Architecture Patterns

- Modular layering around `ChargingStation`, `ChargingStationWorker`, and OCPP services (`src/charging-station/ocpp/<version>/`).
- Worker abstraction: Strategy-based selection (`workerSet`, `fixedPool`, `dynamicPool`) leveraging `poolifier` + custom worker management in `worker/` directory.
- Configuration hierarchy (template → generated station config → runtime overrides) with automatic reload watchers.
- Protocol handling: Separation of request/response services per OCPP version; strict validation via ajv when `ocppStrictCompliance` enabled.
- SRPC UI protocol over WebSocket/HTTP with procedure dispatch and correlation using UUID.
- Broadcasting & async coordination: Broadcast channels / message maps for pending requests resolution.
- Performance statistics subsystem pluggable storage backend (`none|jsonfile|mongodb`).
- Persistence model optionally via Mikro-ORM (entities compiled with dedicated tsconfig).
- Single source of truth for tunables: canonical defaults defined in config templates; merging precedence defaults < template < station config < runtime options.
- Separation of domain (charging stations simulation) from infrastructure (logging, storage, worker pools, UI server).

### Testing Strategy

- Test framework: Native Node test runner (`node --test`) invoked through glob; assertions via `@std/expect`.
- Coverage: c8 with lcov & html reports; thresholds enforced indirectly through CI review (no explicit thresholds currently documented).
- Test scope: Unit tests for utilities, configuration handling, errors, OCPP services behaviors, worker utilities, performance statistics calculations.
- Determinism: Randomness minimized or parameterized; probability-based features (ATG) tested with controlled inputs.
- No flaky tests accepted; asynchronous tests await promises explicitly.
- New behavior: Add minimal tests before or alongside implementation; refactoring requires test stability.

### Git Workflow

- Branching model: `main` for active development; maintenance branches `vX` (major) and `vX.Y` (minor) for released lines.
- Commits follow Conventional Commits and validated by commitlint (`@commitlint/config-conventional`).
- Pre-commit hooks (husky): Lint & formatting (lint-staged) + commit message validation.
- PR process: CI (lint, type-check, tests, build) + CodeQL security analysis; release-please manages automated versioning/changelogs.
- Merge strategy: Squash or regular merges allowed (follow repository settings); maintain clear atomic changes.

## Domain Context

- Focus: Simulating large fleets of EV charging stations speaking OCPP-J for integration and load testing of CSMS (Charge Station Management Systems) and related services.
- Dual OCPP stack for OCPP-J 1.6 and 2.0.1.
- Automatic Transaction Generator (ATG): Probabilistic simulation of charging sessions with configurable durations, delays, authorization flows, connector affinity.
- Configuration templates define station capabilities (power, connectors, firmware version patterns, metering, etc.).
- UI protocol: Procedural control (start/stop simulator/stations, add/delete, trigger OCPP commands, manage ATG) via HTTP or WebSocket SRPC.
- Performance metrics: Collect & optionally persist statistics to analyze throughput, latencies, resource usage.

## Important Constraints

- Node.js >=20.11 runtime features (Worker Threads, ESM) required.
- Strict OCPP JSON schema validation when `ocppStrictCompliance` is true; deviations require explicit config relaxation (e.g., out-of-order meter values).
- Simulator must avoid blocking operations in worker threads; heavy tasks delegated or streamed.
- Memory footprint scalability: workerSet auto sizing formula ensures balanced distribution.
- Security: No real credentials beyond optional supervision basic auth; avoid storing sensitive PII; logs sanitized (RFID tags considered test data only).
- Licensing: Apache-2.0; contributions must respect REUSE compliance (license headers / metadata).
- Configuration reload only for designated file sets; persisted station-specific states preserved where specified.

## External Dependencies

- OCPP Server(s): Supervision URLs provided (external CSMS endpoints) for protocol interactions.
- Performance Storage: Optional MongoDB instance (via URI) or JSON file storage; may require external service.
- Databases: MariaDB / SQLite (via Mikro-ORM) if enabled for extended persistence (currently optional paths).
- Logging: File system (rotating log files) + optional console; no external log aggregator baked in.
- Release Automation: GitHub Release Please (GitHub API).

## Glossary / Key Concepts

- Supervision URL: Target URL(s) for station-server OCPP communications.
- Station Template: Parameterized JSON blueprint for generating multiple station instances.
- HashId: Unique identifier per simulated station (derived/persistent across restarts).
- ATG: Automatic Transaction Generator component that drives simulated charging sessions.
- SRPC: Simple Remote Procedure Call used for UI control over WebSocket/HTTP.

## Configuration Precedence & Mutation

1. Template (`src/assets/station-templates/*.json`)
2. Generated station config (`dist/assets/configurations/<hashId>.json`)
3. Runtime procedure overrides (UI protocol commands)

Persisted sections (e.g., configurationKey subset, ATG statuses) are retained across template changes unless explicitly regenerated.

## Quality Gates

- Lint (ESLint) passes with no errors; warnings minimized (spellchecker may auto-fix).
- Type checking (tsc / typescript-eslint project service) succeeds.
- Tests pass with stable coverage; new code paths covered.
- Prettier formatting enforced.
- Conventional Commit messages validated.
- Release automation validation (release-please) on version bumps.

## Spec Authoring Guidance (OpenSpec Alignment)

- New behavior or capabilities require change proposal prior to implementation (see `openspec/AGENTS.md`).
- Bug fixes do not require proposals if restoring documented behavior.
- Requirements wording uses SHALL/MUST for normative statements; include at least one Scenario per Requirement.
- Keep architecture changes minimal (<100 LOC) unless justified by scaling/performance data.

## Maintenance & Evolution

- Incremental expansion of OCPP 2.0.x coverage guided by real integration needs.
- Performance tuning informed by collected statistics; complexity added only if baseline insufficient.
- Backward compatibility for public procedure names and configuration keys unless marked BREAKING in a proposal.

## Non-Goals

- Real hardware control or physical charging operations.
- Proprietary protocol extensions beyond generic vendor key handling.

## Observability & Metrics

- Log-based statistics at configurable intervals (`log.statisticsInterval`).
- Optional persisted performance storage for offline analysis.

## Security Considerations

- Basic Auth credentials if provided stored only in config JSON; avoid committing secrets.
- WebSocket/HTTP UI server authentication optional; disabled by default—enable for controlled environments.
- No dynamic code execution from untrusted input; JSON schemas guard payload structure.

## Extensibility Points

- Add new OCPP commands by extending versioned service modules and updating template command support maps.
- Introduce new worker strategies via `worker/` abstractions (proposal if architectural change).
- Add new performance storage backends by extending storage interface (ensure configuration validation).
- UI procedures: Add procedure name + handler; document in README and project spec.

## External Integration Scenarios

- Load testing against a CSMS: Generate N stations with variable power/connectors; start ATG to create transactions.
- Firmware upgrade simulation: Use `firmwareUpgrade` template section to emulate version step and reset behavior.
- Dynamic supervision URL switching: Use procedure to set new URL across station fleet.

## Risks & Mitigations

- Risk: Overloading system resources with too many stations → Mitigation: auto sizing & configurable pool limits.
- Risk: Schema drift in OCPP support → Mitigation: JSON schema validation toggled via strict compliance flag.
- Risk: Incomplete OCPP 2.0.x stack leading to false assumptions → Mitigation: Explicit README note and spec separation per version.
- Risk: Log volume & rotation issues → Mitigation: Daily rotation + configurable maxFiles/maxSize.

## Change Process Summary

- Use verb-led change IDs (add-/update-/refactor-/remove-) for proposals.
- Validate proposals with `openspec validate --strict` before implementation.
- Archive after deployment; keep specs authoritative.
