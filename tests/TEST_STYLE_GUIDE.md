# Test Style Guide

Conventions for writing maintainable, consistent tests in the e-mobility charging stations simulator.

## Core Principles

- **Test behavior, not implementation**: Focus on what code does, not how
- **Isolation is mandatory**: Each test runs independently with fresh state
- **Determinism required**: Tests must produce identical results on every run
- **Strict assertions**: Use `toBe`, `toStrictEqual` — never `toEqual`, `toBeTruthy`
- **Coverage target**: 80%+ on new code

---

## 1. Naming Conventions

### Test Cases

Pattern: `should [verb]` in **lowercase**

```typescript
// ✅ Good
it('should start successfully with valid configuration', async () => {})
it('should reject invalid identifier', () => {})

// ❌ Bad
it('Should start successfully', () => {}) // Capital 'S'
it('Verify generateUUID()', () => {}) // Imperative
it('starts successfully', () => {}) // Missing 'should'
```

### Files & Suites

| Element    | Convention              | Example                                 |
| ---------- | ----------------------- | --------------------------------------- |
| Files      | `ModuleName.test.ts`    | `ChargingStation.test.ts`               |
| Suites     | Module name only        | `describe('ChargingStation', () => {})` |
| OCPP tests | Spec code + description | `describe('B11 - Reset', () => {})`     |
| Variables  | camelCase               | `mockStation`, `requestService`         |
| Constants  | SCREAMING_SNAKE_CASE    | `TEST_HEARTBEAT_INTERVAL`               |

```typescript
// ❌ Never add "test suite" suffix
describe('ChargingStation test suite', () => {})
```

---

## 2. Test Structure

### AAA Pattern (Arrange-Act-Assert)

```typescript
it('should calculate total power correctly', () => {
  // Arrange
  const { station } = createMockChargingStation()
  const expectedPower = 22000

  // Act
  const actualPower = station.getTotalPower()

  // Assert
  expect(actualPower).toBe(expectedPower)
})
```

**When to use AAA comments:**

- Required: Tests with 3+ setup steps
- Optional: Simple single-assertion tests

### File Headers (MANDATORY)

```typescript
/**
 * @file Tests for ModuleName
 * @description Brief description of what is being tested
 */
```

---

## 3. Test Isolation (CRITICAL)

### Fresh Instances Per Test

```typescript
// ✅ Good - Fresh instances in beforeEach
describe('My Test Suite', () => {
  let station: ChargingStation

  beforeEach(() => {
    const { station: s } = createMockChargingStation()
    station = s
  })

  afterEach(() => {
    standardCleanup()
  })

  it('test 1', () => {
    /* clean state */
  })
  it('test 2', () => {
    /* clean state */
  })
})

// ❌ Bad - Shared state at module level
describe('My Test Suite', () => {
  const { station } = createMockChargingStation() // SHARED!

  it('test 1', () => {
    /* polluted state */
  })
  it('test 2', () => {
    /* same polluted state */
  })
})
```

### Mandatory Cleanup

```typescript
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

afterEach(() => {
  standardCleanup() // ALWAYS call this
})
```

`standardCleanup()` clears caches, resets singletons, ensures isolation.

---

## 4. Async & Timers

### Async/Await (Preferred)

```typescript
it('should start charging session', async () => {
  const { station } = createMockChargingStation()
  const result = await station.startTransaction(1, 'VALID_TAG')
  expect(result.status).toBe('Accepted')
})

it('should reject invalid connector', async () => {
  const { station } = createMockChargingStation()
  await expect(station.startTransaction(99, 'TAG')).rejects.toThrow('Invalid')
})
```

### Mock Timers (Never Use Real Delays)

```typescript
// ✅ Good - Instant execution
it('should timeout', async t => {
  await withMockTimers(t, ['setTimeout'], async () => {
    const promise = station.sendHeartbeat()
    t.mock.timers.tick(30000)
    await expect(promise).rejects.toThrow('Timeout')
  })
})

// ❌ Bad - Real delay (slow, flaky)
it('should timeout', async () => {
  await new Promise(r => setTimeout(r, 5000)) // NEVER
})
```

---

## 5. Constants & Imports

### Single Source of Truth

```typescript
// ✅ Good - Import from canonical source
import { TEST_CHARGING_STATION_BASE_NAME, TEST_ID_TAG } from '../ChargingStationTestConstants.js'

// ❌ Bad - Duplicated constant
const TEST_STATION_NAME = 'CS-TEST-001'
```

Available constants: `tests/charging-station/ChargingStationTestConstants.ts`

---

## 6. Assertions

### Strict Only

```typescript
// ✅ Good
expect(result).toStrictEqual({ status: 'ok' }) // Exact match
expect(count).toBe(5) // Primitive
expect(value).toBe(true) // Explicit boolean
expect(item).toBeDefined() // Existence check

// ❌ Bad
expect(result).toEqual({ status: 'ok' }) // Ignores extra properties
expect(value).toBeTruthy() // Too vague
expect(count == '5').toBe(true) // Type coercion
```

---

## 7. Type Safety

### No `as any` Casts

```typescript
// ✅ Good - Use testable interfaces
const testable = createTestableOCPP20RequestService(requestService)
testable.buildRequestPayload(station, command)

// ❌ Bad - Breaks type safety
;(requestService as any).buildRequestPayload(station, command)
```

### Exception: Runtime Type Validation Tests

```typescript
// Acceptable when testing defensive code
// eslint-disable-next-line @typescript-eslint/no-explicit-any
expect(AuthValidators.isValidIdentifierValue(123 as any)).toBe(false)
```

---

## 8. Mock Factories

### Choose the Right Factory

| Factory                                  | Use Case                         | Location                             |
| ---------------------------------------- | -------------------------------- | ------------------------------------ |
| `createMockChargingStation()`            | Full OCPP protocol testing       | `ChargingStationTestUtils.ts`        |
| `createMockAuthServiceTestStation()`     | Auth service tests (lightweight) | `ocpp/auth/helpers/MockFactories.ts` |
| `createMockStationWithRequestTracking()` | Verify sent OCPP requests        | `ocpp/2.0/OCPP20TestUtils.ts`        |

### Usage

```typescript
// Full station with mocks
const { station, mocks } = createMockChargingStation({
  connectorsCount: 2,
  ocppVersion: OCPPVersion.VERSION_20,
})

// Verify sent messages
expect(mocks.webSocket.sentMessages).toContain(expectedMessage)
```

---

## 9. Utility Reference

### Lifecycle Helpers (`helpers/TestLifecycleHelpers.ts`)

| Utility                           | Purpose                              |
| --------------------------------- | ------------------------------------ |
| `standardCleanup()`               | **MANDATORY** afterEach cleanup      |
| `withMockTimers()`                | Execute test with timer mocking      |
| `createTimerScope()`              | Manual timer control                 |
| `setupConnectorWithTransaction()` | Setup connector in transaction state |
| `clearConnectorTransaction()`     | Clear connector transaction state    |

### Mock Classes (`mocks/`)

| Class                | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `MockWebSocket`      | WebSocket simulation with message capture |
| `MockIdTagsCache`    | In-memory IdTags cache                    |
| `MockSharedLRUCache` | In-memory LRU cache                       |

### OCPP 2.0 (`ocpp/2.0/OCPP20TestUtils.ts`)

| Utility                                | Purpose                         |
| -------------------------------------- | ------------------------------- |
| `createTestableOCPP20RequestService()` | Type-safe private method access |
| `createMockCertificateManager()`       | Certificate operations mock     |
| `IdTokenFixtures`                      | Pre-built IdToken fixtures      |
| `TransactionContextFixtures`           | Transaction context fixtures    |

### Auth (`ocpp/auth/helpers/MockFactories.ts`)

| Utility                           | Purpose                     |
| --------------------------------- | --------------------------- |
| `createMockIdentifier()`          | UnifiedIdentifier factory   |
| `createMockAuthRequest()`         | AuthRequest factory         |
| `createMockAuthorizationResult()` | AuthorizationResult factory |
| `expectAcceptedAuthorization()`   | Assert accepted result      |

---

## Summary

1. **Name**: `should [verb]` lowercase
2. **Structure**: AAA pattern, JSDoc headers
3. **Isolate**: Fresh instances in `beforeEach`, `standardCleanup()` in `afterEach`
4. **Async**: Use `async/await`, mock timers
5. **Constants**: Import from `ChargingStationTestConstants.ts`
6. **Assert**: Strict only (`toBe`, `toStrictEqual`)
7. **Types**: No `as any`, use testable interfaces
