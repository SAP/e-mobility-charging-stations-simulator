# Test Style Guide

This document establishes conventions for writing maintainable, consistent tests in the e-mobility charging stations simulator project.

## Naming Conventions

### Test Case Naming (MANDATORY)

Use consistent `should [verb]` pattern in **lowercase**:

✅ **Good:**

```typescript
it('should start successfully with valid configuration', async () => {})
it('should reject invalid identifier', () => {})
it('should handle Reset request with Immediate type', async () => {})
```

❌ **Bad:**

```typescript
// Inconsistent capitalization
it('Should start successfully', () => {}) // Capital 'S'

// Imperative style
it('Verify generateUUID()', () => {}) // Not declarative

// Missing 'should'
it('starts successfully', () => {}) // No 'should'
```

### Files & Suites

- **Files**: Use descriptive names matching the module under test: `ModuleName.test.ts`
- **Test suites**: Use `describe()` with clear, specific descriptions
- **OCPP tests**: Use requirement codes: `describe('B11 & B12 - Reset', () => {})`
- **Auth tests**: Reference spec sections: `describe('G03.FR.01 - AuthCache Conformance', () => {})`
- **Variables**: Use camelCase for variables, functions, and test helpers
- **Constants**: Use SCREAMING_SNAKE_CASE for test constants

**Example:**

```typescript
describe('ChargingStation lifecycle', () => {
  it('should start successfully with valid configuration', async () => {
    // test implementation
  })
})
```

## Test Structure (AAA Pattern)

Follow the Arrange-Act-Assert pattern for clarity:

1. **Arrange**: Set up test data, mocks, and preconditions
2. **Act**: Execute the code under test
3. **Assert**: Verify the expected outcome

**Example:**

```typescript
it('should calculate total power correctly', () => {
  // Arrange
  const station = createMockChargingStation()
  const expectedPower = 22000

  // Act
  const actualPower = station.getTotalPower()

  // Assert
  expect(actualPower).toBe(expectedPower)
})
```

## Comments & JSDoc

### File Headers

Every test file MUST include a JSDoc header:

```typescript
/**
 * @file Tests for ModuleName
 * @description Brief description of what is being tested
 */
```

### Inline Comments

- Use comments sparingly - prefer self-documenting test names
- Comment WHY, not WHAT (the code shows what)
- Document non-obvious setup or complex assertions

## Constants

**ALWAYS use consolidated test constants from the canonical source:**

- ✅ Import from: `tests/charging-station/ChargingStationTestConstants.ts`
- ❌ NEVER duplicate constants in individual test files
- ❌ NEVER create inline magic values

**Good:**

```typescript
import { TEST_CHARGING_STATION_BASE_NAME } from '../ChargingStationTestConstants.js'
```

**Bad:**

```typescript
// Don't do this!
const TEST_STATION_NAME = 'CS-TEST-001' // Duplicate constant
```

## Mocks & Factories

### When to Use Mock Factories

Use centralized mock factories for complex objects:

- `createChargingStation()` - From `ChargingStationFactory.ts`
- `createMockChargingStation()` - From `ChargingStationTestUtils.ts`
- Auth mocks - From `tests/charging-station/ocpp/auth/helpers/MockFactories.ts`

**Example:**

```typescript
import { createChargingStation } from '../ChargingStationFactory.js'

const station = await createChargingStation({
  ocppVersion: OCPPVersion.VERSION_20,
  numberOfConnectors: 2,
})
```

### Shared Test Utilities

The following utilities are available for reuse across test files:

| Utility                       | Location                             | Purpose                                   |
| ----------------------------- | ------------------------------------ | ----------------------------------------- |
| `createMockChargingStation()` | `ChargingStationTestUtils.ts`        | Lightweight mock station stub             |
| `createChargingStation()`     | `ChargingStationFactory.ts`          | Full test station with OCPP services      |
| `createConnectorStatus()`     | `helpers/StationHelpers.ts`          | ConnectorStatus factory with defaults     |
| `MockWebSocket`               | `mocks/MockWebSocket.ts`             | WebSocket simulation with message capture |
| `MockIdTagsCache`             | `mocks/MockCaches.ts`                | In-memory IdTags cache mock               |
| `MockSharedLRUCache`          | `mocks/MockCaches.ts`                | In-memory LRU cache mock                  |
| `waitForCondition()`          | `helpers/StationHelpers.ts`          | Async condition waiting with timeout      |
| `cleanupChargingStation()`    | `helpers/StationHelpers.ts`          | Proper station cleanup for afterEach      |
| Auth factories                | `ocpp/auth/helpers/MockFactories.ts` | Auth-specific mock creation               |

**DO NOT duplicate these utilities.** Import and reuse them.

```typescript
// Good: Import shared utilities
import { createMockChargingStation, cleanupChargingStation } from './ChargingStationTestUtils.js'
import { waitForCondition } from './helpers/StationHelpers.js'
```

### Mocking Best Practices

- Use `mock.method()` for function mocking (Node.js native)
- Use `mock.timers` for time-dependent tests
- Keep mocks focused - mock only what's necessary
- Verify mock calls when behavior depends on them

## Cleanup Hooks

**ALWAYS include `afterEach()` cleanup to prevent test pollution:**

```typescript
afterEach(() => {
  mock.restoreAll()
  mock.timers.reset()
  // Clean up any resources created in tests
})
```

### What to Clean Up

- Mock timers: `mock.timers.reset()`
- Mock functions: `mock.restoreAll()`
- Charging stations: `await chargingStation.stop()`
- File handles, network connections, database connections
- Any global state modifications

**Missing cleanup causes flaky tests and false positives.**

## Anti-Patterns to Avoid

### 1. Inline `as any` Casts

❌ **Bad:**

```typescript
;(incomingRequestService as any).handleRequestReset(station, request)
```

✅ **Good:**

```typescript
import { createTestableIncomingRequestService } from '../__testable__/index.js'

const testable = createTestableIncomingRequestService(incomingRequestService)
await testable.handleRequestReset(station, request)
```

**Why:** Type safety prevents bugs. Use testable interfaces instead of breaking the type system.

### 2. Duplicate Constants

❌ **Bad:**

```typescript
// In multiple test files:
const TEST_STATION_NAME = 'CS-TEST-001'
```

✅ **Good:**

```typescript
import { TEST_CHARGING_STATION_BASE_NAME } from '../ChargingStationTestConstants.js'
```

**Why:** Single source of truth. Changes propagate automatically, reduces maintenance burden.

### 3. Missing Cleanup

❌ **Bad:**

```typescript
describe('Tests', () => {
  it('test 1', () => {
    /* ... */
  })
  it('test 2', () => {
    /* ... */
  })
  // No afterEach cleanup!
})
```

✅ **Good:**

```typescript
describe('Tests', () => {
  afterEach(() => {
    mock.restoreAll()
    // Clean up resources
  })

  it('test 1', () => {
    /* ... */
  })
  it('test 2', () => {
    /* ... */
  })
})
```

**Why:** Test isolation. Each test should run independently without side effects.

### 4. Probabilistic Assertions

❌ **Bad:**

```typescript
const successRate = calculateSuccessRate()
expect(successRate).toBeGreaterThan(50) // Flaky!
```

✅ **Good:**

```typescript
const result = await authenticateUser(mockCredentials)
expect(result.success).toBe(true)
expect(result.token).toBeDefined()
```

**Why:** Tests must be deterministic. Use mocks to control behavior, not probabilistic thresholds.

### 5. Over-Use of `eslint-disable`

❌ **Bad:**

```typescript
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
```

✅ **Good:**

```typescript
// Use proper types and testable interfaces - no disables needed
```

**Why:** Disabling linting rules hides real problems. Fix the underlying type issues instead.

## Summary

- **Name clearly**: Descriptive names for files, suites, and test cases
- **Structure with AAA**: Arrange, Act, Assert
- **Document minimally**: JSDoc headers required, inline comments only when necessary
- **Use canonical constants**: Single source of truth
- **Leverage mock factories**: Centralized, reusable mocks
- **Clean up always**: `afterEach()` hooks prevent test pollution
- **Avoid anti-patterns**: No `as any`, no duplication, no probabilistic tests

Following these guidelines ensures tests are maintainable, reliable, and easy to understand.
