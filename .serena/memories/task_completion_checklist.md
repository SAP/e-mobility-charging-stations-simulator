# Task Completion Checklist

## After Completing Any Task

### 1. Root Simulator (always)

```bash
pnpm format
pnpm typecheck
pnpm build
pnpm test
```

### 2. Web UI (if `ui/web/` files changed)

```bash
cd ui/web
pnpm format
pnpm lint
pnpm build
pnpm test
```

### 3. OCPP Mock Server (if `tests/ocpp-server/` files changed)

```bash
cd tests/ocpp-server
poetry run task format
poetry run task lint
poetry run task typecheck
poetry run task test
```

### 4. Documentation

- Update docs if public API changed
- Commit messages follow Conventional Commits (enforced by hook)

### 5. OCPP Compliance (if applicable)

- Verify OCPP standard compliance for any protocol changes
- Validate against JSON schemas when `ocppStrictCompliance` is enabled

Refer to `code_style_conventions` memory for coding rules, and `suggested_commands` memory for full command reference.
