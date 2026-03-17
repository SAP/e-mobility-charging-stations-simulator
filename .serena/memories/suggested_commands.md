# Development Commands and Workflow

## Root Simulator (`/`)

### Install & Build

```bash
pnpm install                    # Install all dependencies (root + ui/web)
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
pnpm lint                       # ESLint check only
pnpm lint:fix                   # ESLint auto-fix only
pnpm typecheck                  # TypeScript type check (no emit)
```

### Test

```bash
pnpm test                       # Run all tests (Node.js native test runner)
pnpm test:debug                 # Run tests with debugger
pnpm test:coverage              # Tests with LCOV coverage → coverage/lcov.info
```

---

## Web UI (`/ui/web`)

**IMPORTANT**: This is a separate sub-project. Run commands from `ui/web/` directory.

### Install & Build

```bash
cd ui/web
pnpm build                      # Vite production build
pnpm clean:dist                 # Remove dist/
```

### Run

```bash
pnpm dev                        # Vite dev server with hot-reload (port 5173)
pnpm start                      # Build + serve via Node.js HTTP server (port 3030)
pnpm preview                    # Build + Vite preview
```

### Code Quality

```bash
pnpm format                     # Prettier + ESLint auto-fix
pnpm lint                       # ESLint check only
pnpm lint:fix                   # ESLint auto-fix only
```

### Test

```bash
pnpm test                       # Run Vitest tests
pnpm test:coverage              # Vitest with V8 coverage
```

---

## OCPP Mock Server (`/tests/ocpp-server`)

**IMPORTANT**: This is a Python sub-project. Uses Poetry for dependency management.

### Install

```bash
cd tests/ocpp-server
pipx install poetry              # Install Poetry (if needed)
poetry install --no-root         # Install dependencies
```

### Run

```bash
poetry run task server                                    # Start server (127.0.0.1:9000)
poetry run python server.py --host 0.0.0.0 --port 8080   # Custom host/port
poetry run python server.py --boot-status rejected        # Custom boot status
poetry run python server.py --auth-mode whitelist --whitelist token1 token2
poetry run python server.py --command GetBaseReport --period 5
```

### Code Quality

```bash
poetry run task format           # Ruff auto-fix + format
poetry run task lint             # Ruff check + format check
poetry run task typecheck        # Mypy type check
```

### Test

```bash
poetry run task test             # Run pytest
poetry run task test_coverage    # Pytest with coverage report
```

---

## Pre-Commit Hooks (automatic on `git commit`)

1. **lint-staged**: Prettier + ESLint on staged files (root + ui/web + ocpp-server)
2. **commitlint**: Enforces Conventional Commits format on commit messages

### Conventional Commits Format

```
<type>[optional scope]: <description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `revert`
Header max length: 100 characters.

---

## Docker

```bash
cd docker
make                             # Build + start simulator + web UI containers
make clean                       # Stop containers + remove images
make docker-push-ecr             # Build, tag, push to AWS ECR
```
