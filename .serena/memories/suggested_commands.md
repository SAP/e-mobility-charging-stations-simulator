# Development Commands and Workflow

## Root Simulator (`/`)

### Install & Build

```bash
pnpm install                    # Install all dependencies (root + ui/common + ui/cli + ui/web)
pnpm build                      # Production build (esbuild)
pnpm build:dev                  # Development build with source maps
pnpm clean:dist                 # Remove dist/
```

### Run

```bash
pnpm start                      # Build + run production
pnpm start:dev                  # Build + run dev with source maps
pnpm start:dev:debug            # Build + run with Node inspector
```

### Code Quality

```bash
pnpm format                     # Prettier + ESLint auto-fix (run this first)
pnpm typecheck                  # TypeScript type check (no emit)
pnpm lint                       # ESLint check only
pnpm lint:fix                   # ESLint auto-fix only
```

### Test

```bash
pnpm test                       # Run all tests (Node.js native test runner)
pnpm test:debug                 # Run tests with debugger
pnpm test:coverage              # Tests with LCOV coverage → coverage/lcov.info
```

---

## UI Common (`/ui/common`)

**IMPORTANT**: Shared library. Run commands from `ui/common/` directory. Build this first — ui/cli and ui/web depend on it.

### Build & Quality

```bash
cd ui/common
pnpm build                      # Typecheck (same as typecheck — no build artifacts, source-only package)
pnpm typecheck                  # tsc --noEmit (identical to build)
pnpm lint                       # ESLint check only
pnpm format                     # Prettier + ESLint auto-fix
pnpm test                       # Node.js native test runner (node:test + node:assert)
pnpm test:coverage              # Tests with coverage
```

---

## CLI (`/ui/cli`)

**IMPORTANT**: Separate sub-project. Run commands from `ui/cli/` directory. Depends on ui/common.

### Build & Quality

```bash
cd ui/cli
pnpm build                      # esbuild bundle → dist/cli.js
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # ESLint check only
pnpm format                     # Prettier + ESLint auto-fix
pnpm test                       # Node.js native test runner (node:test + node:assert)
pnpm test:coverage              # Tests with coverage
pnpm test:integration           # Integration tests (requires built CLI)
```

### Run

```bash
node dist/cli.js --help                        # Show help
node dist/cli.js --config <path> station list  # List stations with config
node dist/cli.js --json simulator state        # Get state in JSON mode
node dist/cli.js skill show                    # Print embedded agent skill
node dist/cli.js skill install                 # Install agent skill locally
```

### Features

- **Short hash prefix matching**: Use truncated hash IDs (e.g., `e9041c`) instead of full 96-char hashes
- **Custom payloads**: `-p '{"key":"val"}'`, `-p @file.json`, or stdin via `-p -`
- **Human output**: Borderless tables with status icons, colors, connector info
- **JSON output**: `--json` flag for machine-readable output

---

## Web UI (`/ui/web`)

**IMPORTANT**: Separate sub-project. Run commands from `ui/web/` directory. Depends on ui/common.

### Build & Run

```bash
cd ui/web
pnpm build                      # Vite production build
pnpm dev                        # Vite dev server with hot-reload (port 5173)
pnpm start                      # Build + serve via Node.js HTTP server (port 3030)
pnpm preview                    # Build + Vite preview
```

### Code Quality

```bash
pnpm format                     # Prettier + ESLint auto-fix
pnpm typecheck                  # vue-tsc type checking (no emit)
pnpm lint                       # ESLint check only
pnpm test                       # Vitest (watch mode locally — use `vitest run` for single-run)
pnpm test:coverage              # Vitest single-run with V8 coverage
```

---

## OCPP Mock Server (`/tests/ocpp-server`)

**IMPORTANT**: Python sub-project. Uses Poetry, not pnpm.

### Install & Run

```bash
cd tests/ocpp-server
poetry install --no-root
poetry run task server                                              # Start (127.0.0.1:9000)
poetry run python server.py --host 0.0.0.0 --port 8080             # Custom host/port
poetry run python server.py --boot-status rejected                  # Custom boot status
poetry run python server.py --auth-mode whitelist --whitelist t1 t2 # Auth mode
poetry run python server.py --command GetBaseReport --period 5      # Periodic command
```

### Code Quality

```bash
poetry run task format           # Ruff auto-fix + format
poetry run task typecheck        # Mypy type check
poetry run task lint             # Ruff check + format check
poetry run task test             # pytest
poetry run task test_coverage    # pytest with coverage
```

---

## Pre-Commit Hooks (automatic on `git commit`)

1. **lint-staged**: Prettier + ESLint on staged files (root + ui/\* + ocpp-server)
2. **commitlint**: Conventional Commits format

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `revert`. Max 100 chars.

---

## OCPP Spec Search (QMD)

Collection `ocpp-specs` — OCPP 1.6, 2.0.1, 2.1 specs from `docs/`.

- `CI=true` disables LLM ops → prefix `env -u CI` on `qmd query` / `qmd vsearch`
- `qmd search` (BM25 only) works without it
- Re-index: `qmd update --pull && qmd embed`

---

## Docker

```bash
cd docker
make                             # Build + start simulator + web UI containers
make clean                       # Stop + remove
make docker-push-ecr             # Build, tag, push to AWS ECR
```
