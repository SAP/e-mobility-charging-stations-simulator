# Test Style Guide

This document establishes conventions for writing maintainable, consistent tests in the e-mobility charging stations simulator project.

## Testing Philosophy

Core principles guiding test implementation:

- **Test behavior, not implementation**: Focus on what code does, not how it does it
- **Isolation is mandatory**: Each test must run independently with fresh state
- **Determinism required**: Tests must produce identical results on every run
- **Coverage target**: Aim for 80%+ code coverage on new code
- **Strict assertions**: Use strict equality (`toBe`, `toStrictEqual`) to prevent false positives

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

### When to Use AAA Comments

- **Required**: Tests with 3+ setup steps or complex assertions
- **Optional**: Simple single-assertion tests where intent is obvious

**Complex test (comments required):**

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

**Simple test (comments optional):**

```typescript
it('should return true for valid identifier', () => {
  expect(isValidIdentifier('ABC123')).toBe(true)
})
```

## Async Testing Patterns

Most tests in this project are asynchronous. Follow these patterns:

### Async/Await (Preferred)

✅ **Good:**

```typescript
it('should start charging session successfully', async () => {
  // Arrange
  const station = await createChargingStation({ connectorsCount: 2 })
  const connectorId = 1

  // Act
  const result = await station.startTransaction(connectorId, 'VALID_TAG')

  // Assert
  expect(result.status).toBe('Accepted')
  expect(station.getConnectorStatus(connectorId)?.transactionStarted).toBe(true)
})
```

### Promise Rejection Testing

```typescript
it('should reject invalid connector ID', async () => {
  const station = await createChargingStation({ connectorsCount: 1 })

  await expect(station.startTransaction(99, 'TAG')).rejects.toThrow('Invalid connector')
})
```

### Timeout Handling

```typescript
it('should timeout when server does not respond', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const station = await createChargingStation()

  const responsePromise = station.sendHeartbeat()
  mock.timers.tick(30000) // Advance past timeout

  await expect(responsePromise).rejects.toThrow('Timeout')
  mock.timers.reset()
})
```

❌ **Bad (Mixing callbacks and Promises):**

```typescript
// WRONG: Never mix callback and Promise patterns
it('broken test', done => {
  someAsyncOp().then(() => {
    done() // Confusing - use async/await instead
  })
})
```

## Error & Exception Testing

Error handling is critical. Test both expected errors and edge cases:

### Testing Expected Errors

```typescript
it('should throw on invalid configuration', () => {
  expect(() => new ChargingStation(null)).toThrow('Configuration required')
})

it('should reject unauthorized tag', async () => {
  const station = await createChargingStation()

  await expect(station.authorize('INVALID_TAG')).rejects.toThrow(OCPPError)
})
```

### Testing Error Properties

```typescript
it('should include error code in OCPPError', async () => {
  const station = await createChargingStation()

  try {
    await station.sendInvalidCommand()
    expect.fail('Should have thrown')
  } catch (error) {
    expect(error).toBeInstanceOf(OCPPError)
    expect((error as OCPPError).code).toBe('GenericError')
  }
})
```

### Testing Error Recovery

```typescript
it('should recover after transient error', async () => {
  const station = await createChargingStation()
  mock.method(station, 'sendMessage', () => {
    throw new Error('Network error')
  })

  // First call fails
  await expect(station.sendHeartbeat()).rejects.toThrow('Network')

  // Restore and retry succeeds
  mock.restoreAll()
  const result = await station.sendHeartbeat()
  expect(result).toBeDefined()
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

| Utility                                 | Location                             | Purpose                                      |
| --------------------------------------- | ------------------------------------ | -------------------------------------------- |
| `createMockChargingStation()`           | `ChargingStationTestUtils.ts`        | Lightweight mock station stub                |
| `createChargingStation()`               | `ChargingStationFactory.ts`          | Full test station with OCPP services         |
| `createConnectorStatus()`               | `helpers/StationHelpers.ts`          | ConnectorStatus factory with defaults        |
| `createStationWithCertificateManager()` | `ocpp/2.0/OCPP20TestUtils.ts`        | Station with certificate manager (type-safe) |
| `MockWebSocket`                         | `mocks/MockWebSocket.ts`             | WebSocket simulation with message capture    |
| `MockIdTagsCache`                       | `mocks/MockCaches.ts`                | In-memory IdTags cache mock                  |
| `MockSharedLRUCache`                    | `mocks/MockCaches.ts`                | In-memory LRU cache mock                     |
| `waitForCondition()`                    | `helpers/StationHelpers.ts`          | Async condition waiting with timeout         |
| `cleanupChargingStation()`              | `helpers/StationHelpers.ts`          | Proper station cleanup for afterEach         |
| Auth factories                          | `ocpp/auth/helpers/MockFactories.ts` | Auth-specific mock creation                  |

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

## Test Isolation (CRITICAL)

**NEVER define mock instances at module level inside describe blocks.** Each test must get fresh instances.

❌ **Bad (Module-Level State Sharing):**

```typescript
await describe('My Test Suite', async () => {
  afterEach(() => {
    mock.restoreAll()
  })

  // WRONG: These instances are SHARED across all tests!
  const mockResponseService = new OCPP20ResponseService()
  const requestService = new OCPP20RequestService(mockResponseService)
  const mockChargingStation = createChargingStation({...})

  await it('test 1', () => { /* uses shared state */ })
  await it('test 2', () => { /* uses same shared state! Test pollution risk! */ })
})
```

✅ **Good (Fresh Instances Per Test):**

```typescript
await describe('My Test Suite', async () => {
  let mockResponseService: OCPP20ResponseService
  let requestService: OCPP20RequestService
  let mockChargingStation: TestChargingStation

  beforeEach(() => {
    // Fresh instances for every test - proper isolation
    mockResponseService = new OCPP20ResponseService()
    requestService = new OCPP20RequestService(mockResponseService)
    mockChargingStation = createChargingStation({...})
  })

  afterEach(() => {
    mock.restoreAll()
  })

  await it('test 1', () => { /* clean state */ })
  await it('test 2', () => { /* clean state */ })
})
```

**Why:** Module-level state causes:

- Test pollution (state leaks between tests)
- Flaky tests (order-dependent results)
- False positives/negatives
- Difficult debugging

**Exception:** Static constants (strings, numbers, frozen objects) CAN be at module level since they don't change.

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

**Exception - Legitimate Uses of eslint-disable:**

Some eslint-disable comments are acceptable when testing defensive code that validates inputs at runtime:

```typescript
// Testing that validators handle invalid types gracefully
// This is legitimate because the function is designed to handle runtime type errors
await it('should return false for non-string input', () => {
  // Testing runtime type validation - intentionally passing wrong type
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  expect(AuthValidators.isValidIdentifierValue(123 as any)).toBe(false)
})

// Testing async function detection requires empty function expressions
// eslint-disable-next-line @typescript-eslint/no-empty-function
expect(isAsyncFunction(() => {})).toBe(false)
```

**Acceptable Rules to Disable (with justification):**

- `@typescript-eslint/no-empty-function` - When testing function type detection
- `@typescript-eslint/no-explicit-any` - When testing runtime type validation
- `@typescript-eslint/unbound-method` - When testing method type detection
- `@cspell/spellchecker` - For intentional misspellings in test data

**Still NOT Acceptable:**

- File-level disables (`/* eslint-disable ... */` at top of file)
- Disabling rules to bypass type safety in test setup
- Disabling rules because proper interfaces haven't been created

### 6. Non-Strict Assertions

❌ **Bad:**

```typescript
// Loose equality - can cause false positives
expect(result).toEqual({ status: 'ok' }) // Ignores extra properties
expect(count == '5').toBe(true) // Type coercion
expect(value).toBeTruthy() // Too vague
```

✅ **Good:**

```typescript
// Strict equality - catches more bugs
expect(result).toStrictEqual({ status: 'ok' }) // Exact match
expect(count).toBe(5) // Type-safe
expect(value).toBe(true) // Explicit
```

**Why:** Strict assertions catch type mismatches and unexpected properties. Use `toBe()` for primitives, `toStrictEqual()` for objects.

## Summary

- **Name clearly**: Descriptive names for files, suites, and test cases
- **Structure with AAA**: Arrange, Act, Assert
- **Document minimally**: JSDoc headers required, inline comments only when necessary
- **Use canonical constants**: Single source of truth
- **Leverage mock factories**: Centralized, reusable mocks
- **Clean up always**: `afterEach()` hooks prevent test pollution
- **Avoid anti-patterns**: No `as any`, no duplication, no probabilistic tests

Following these guidelines ensures tests are maintainable, reliable, and easy to understand.
