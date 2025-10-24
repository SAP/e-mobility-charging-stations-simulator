# Task Completion Checklist

## After Completing Any Task

### 1. Code Quality Checks

- [ ] Run `pnpm lint` to check for linting issues
- [ ] Run `pnpm format` to format code and fix auto-fixable issues
- [ ] Ensure TypeScript compilation passes (part of build process)

### 2. Testing

- [ ] Run `pnpm test` to ensure all tests pass
- [ ] If new functionality added, ensure appropriate tests are included
- [ ] Check test coverage if relevant: `pnpm coverage`

### 3. Build Verification

- [ ] Run `pnpm build` to ensure production build succeeds
- [ ] For development changes, verify `pnpm build:dev` works

### 4. Documentation

- [ ] Update relevant documentation if public API changed
- [ ] Ensure commit messages follow Conventional Commits format
- [ ] Update CHANGELOG.md if needed for user-facing changes

### 5. OCPP Compliance (if applicable)

- [ ] Verify OCPP standard compliance
- [ ] Check that new OCPP commands/responses follow specification exactly
- [ ] Validate against JSON schemas when `ocppStrictCompliance` is enabled

## Git Workflow

- Use Conventional Commits format for commit messages
- Branch from `main` for new features
- Ensure all quality gates pass before merging

## Pre-commit Hooks

The project uses husky for pre-commit hooks that automatically:

- Run linting
- Run formatting
- Validate commit messages
