# Task Completion Checklist

Run quality gates for each sub-project affected by your changes. See `suggested_commands` for full command reference.

## Quality Gate Order

For each sub-project: `pnpm format` → `pnpm typecheck` → `pnpm lint` → `pnpm build` (if applicable) → `pnpm test`

### 1. Root Simulator (if `src/` or `tests/` changed)

`pnpm format && pnpm typecheck && pnpm lint && pnpm build && pnpm test`

### 2. UI Common (if `ui/common/` changed)

`cd ui/common && pnpm format && pnpm typecheck && pnpm lint && pnpm test`

Note: `pnpm build` is identical to `pnpm typecheck` (source-only package, no build artifacts).

### 3. CLI (if `ui/cli/` changed)

`cd ui/cli && pnpm format && pnpm typecheck && pnpm lint && pnpm build && pnpm test`

### 4. Web UI (if `ui/web/` changed)

`cd ui/web && pnpm format && pnpm typecheck && pnpm lint && pnpm build && pnpm test:coverage`

Note: Use `test:coverage` (single-run). `pnpm test` starts Vitest in watch mode locally.

### 5. OCPP Mock Server (if `tests/ocpp-server/` changed)

`cd tests/ocpp-server && poetry run task format && poetry run task typecheck && poetry run task lint && poetry run task test`

### 6. Documentation

- Update relevant README if user-facing behavior changed (root `README.md`, `ui/cli/README.md`, `ui/web/README.md`)
- Commit messages follow Conventional Commits (enforced by hook)

### 7. OCPP Compliance (if applicable)

- Verify OCPP standard compliance for protocol changes
- Validate against JSON schemas when `ocppStrictCompliance` is enabled

### Dependency Order

If changing `ui/common`: run common gates first, then rebuild/test CLI and Web UI (they depend on it).
