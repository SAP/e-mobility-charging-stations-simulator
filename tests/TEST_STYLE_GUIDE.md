# Test Style Guide

Conventions for writing maintainable, consistent tests in the e-mobility charging stations simulator.

## Core Principles

- **Test behavior, not implementation**: Focus on what code does, not how
- **Isolation is mandatory**: Each test runs independently with fresh state
- **Determinism required**: Tests must produce identical results on every run
- **Strict assertions**: Use `assert.strictEqual`, `assert.deepStrictEqual` — never loose equality. Use `assert.ok` only for boolean/existence checks
- **Coverage target**: 80%+ on new code

---

## 1. Naming Conventions

### Test Cases

Pattern: `should [verb]` in **lowercase**

```typescript
// ✅ Good
it('should start successfully with valid configuration', async () => {})
it('should reject invalid identifier', () => {})

// ✅ Good — with spec traceability prefix (for FR-referenced tests)
it('C10.FR.07.T01 - should evict non-valid entry before valid one', () => {})
it('C10.INT.01: should wire auth cache into local strategy', async () => {})

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
  assert.strictEqual(actualPower, expectedPower)
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
  assert.strictEqual(result.status, 'Accepted')
})

it('should reject invalid connector', async () => {
  const { station } = createMockChargingStation()
  await assert.rejects(station.startTransaction(99, 'TAG'), { message: /Invalid/ })
})
```

### Mock Timers (Never Use Real Delays)

```typescript
// ✅ Good - Instant execution
it('should timeout', async t => {
  await withMockTimers(t, ['setTimeout'], async () => {
    const promise = station.sendHeartbeat()
    t.mock.timers.tick(30000)
    await assert.rejects(promise, { message: /Timeout/ })
  })
})

// ❌ Bad - Real delay (slow, flaky)
it('should timeout', async () => {
  await new Promise(r => setTimeout(r, 5000)) // NEVER
})
```

---

## 5. Platform-Specific Considerations

### Windows CI (`--test-force-exit`)

The test command uses `--test-force-exit` flag to prevent Windows CI hangs:

```json
"test": "node --import tsx --test --test-force-exit 'tests/**/*.test.ts'"
```

**Why**: Windows Named Pipes for stdout/stderr remain "ref'd" (keep event loop alive) while Unix file descriptors are auto-unref'd. Without `--test-force-exit`, the Node.js process hangs indefinitely after tests complete on Windows.

### Single Top-Level Describe Block

Each test file should have ONE top-level `await describe()` block:

```typescript
// ✅ Good - Single top-level describe
await describe('MyFeature', async () => {
  await describe('SubFeature A', async () => {
    /* ... */
  })
  await describe('SubFeature B', async () => {
    /* ... */
  })
})

// ❌ Bad - Multiple top-level describes (breaks --test-force-exit)
await describe('SubFeature A', async () => {
  /* ... */
})
await describe('SubFeature B', async () => {
  /* ... */
})
```

**Why**: Multiple top-level `await describe()` blocks cause "Promise resolution is still pending" errors with `--test-force-exit`.

---

## 6. Constants & Imports

### Single Source of Truth

```typescript
// ✅ Good - Import from canonical source
import { TEST_CHARGING_STATION_BASE_NAME, TEST_ID_TAG } from '../ChargingStationTestConstants.js'

// ❌ Bad - Duplicated constant
const TEST_STATION_NAME = 'CS-TEST-001'
```

Available constants: `tests/charging-station/ChargingStationTestConstants.ts`

---

## 7. Assertions

### Strict Only

```typescript
// ✅ Good
assert.deepStrictEqual(result, { status: 'ok' }) // Exact match
assert.strictEqual(count, 5) // Primitive
assert.strictEqual(value, true) // Explicit boolean
assert.notStrictEqual(item, undefined) // Existence check

// ❌ Bad
assert.deepEqual(result, { status: 'ok' }) // Not strict
assert.ok(value) // Too vague for specific value checks
assert.strictEqual(count == '5', true) // Type coercion
```

---

## 8. Type Safety

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
assert.strictEqual(AuthValidators.isValidIdentifierValue(123 as any), false)
```

---

## 9. Mock Factories

### Choose the Right Factory

| Factory                                    | Use Case                        | Location                             |
| ------------------------------------------ | ------------------------------- | ------------------------------------ |
| `createMockChargingStation()`              | Full OCPP protocol testing      | `helpers/StationHelpers.ts`          |
| `createStandardStation()`                  | Pre-configured OCPP 1.6 station | `ocpp/1.6/OCPP16TestUtils.ts`        |
| `createOCPP16IncomingRequestTestContext()` | OCPP 1.6 handler test context   | `ocpp/1.6/OCPP16TestUtils.ts`        |
| `createOCPP16ListenerStation()`            | OCPP 1.6 event listener tests   | `ocpp/1.6/OCPP16TestUtils.ts`        |
| `createOCPP20ListenerStation()`            | OCPP 2.0 event listener tests   | `ocpp/2.0/OCPP20TestUtils.ts`        |
| `createOCPP20RequestTestContext()`         | OCPP 2.0 request test context   | `ocpp/2.0/OCPP20TestUtils.ts`        |
| `createMockStationWithRequestTracking()`   | Verify sent OCPP requests       | `ocpp/2.0/OCPP20TestUtils.ts`        |
| `createStationWithCertificateManager()`    | Certificate operation tests     | `ocpp/2.0/OCPP20TestUtils.ts`        |
| `createMockCertificateManager()`           | Certificate manager mock        | `ocpp/2.0/OCPP20TestUtils.ts`        |
| `createMockAuthService()`                  | Auth service mock               | `ocpp/auth/helpers/MockFactories.ts` |
| `createMockAuthServiceTestStation()`       | Auth service integration tests  | `ocpp/auth/helpers/MockFactories.ts` |
| `createMockUIWebSocket()`                  | UI server WebSocket mock        | `ui-server/UIServerTestUtils.ts`     |

### Usage

```typescript
// Full station with mocks
const { station, mocks } = createMockChargingStation({
  connectorsCount: 2,
  ocppVersion: OCPPVersion.VERSION_20,
})

// Verify sent messages
assert.strictEqual(mocks.webSocket.sentMessages.length, 1)
```

---

## 10. Utility Reference

### Lifecycle Helpers (`helpers/TestLifecycleHelpers.ts`)

| Utility                           | Purpose                                  |
| --------------------------------- | ---------------------------------------- |
| `standardCleanup()`               | **MANDATORY** afterEach cleanup          |
| `flushMicrotasks()`               | Drain async side-effects from `emit()`   |
| `withMockTimers()`                | Execute test with timer mocking          |
| `createTimerScope()`              | Manual timer control                     |
| `sleep(ms)`                       | Real-time delay (avoid in tests)         |
| `createLoggerMocks()`             | Create logger spies (error, warn)        |
| `createConsoleMocks()`            | Create console spies (error, warn, info) |
| `setupConnectorWithTransaction()` | Setup connector in transaction state     |
| `clearConnectorTransaction()`     | Clear connector transaction state        |

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
| `IdTokenFixtures`                      | Pre-built IdToken fixtures      |

### Auth (`ocpp/auth/helpers/MockFactories.ts`)

| Utility                           | Purpose                     |
| --------------------------------- | --------------------------- |
| `createMockIdentifier()`          | UnifiedIdentifier factory   |
| `createMockAuthRequest()`         | AuthRequest factory         |
| `createMockAuthorizationResult()` | AuthorizationResult factory |

---

## 11. Event Listener Testing

Commands that use the post-response event listener pattern (handler validates → returns response → event triggers async action) require dedicated listener tests.

### Structure

```typescript
await describe('COMMAND_NAME event listener', async () => {
  let listenerService: OCPP16IncomingRequestService // or OCPP20
  let requestHandlerMock: ReturnType<typeof mock.fn>
  let station: ChargingStation

  beforeEach(() => {
    ;({ requestHandlerMock, station } = createOCPP16ListenerStation('test-listener'))
    listenerService = new OCPP16IncomingRequestService()
  })

  afterEach(() => {
    standardCleanup()
  })

  // 1. Registration test (always first)
  await it('should register COMMAND_NAME event listener in constructor', () => {
    assert.strictEqual(
      listenerService.listenerCount(OCPP16IncomingRequestCommand.COMMAND_NAME),
      1
    )
  })

  // 2. Accepted → fires action
  await it('should call X when response is Accepted', async () => {
    listenerService.emit(OCPP16IncomingRequestCommand.COMMAND_NAME, station, request, response)
    await flushMicrotasks()
    assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
  })

  // 3. Rejected → does NOT fire
  await it('should NOT call X when response is Rejected', () => {
    listenerService.emit(...)
    assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
  })

  // 4. Error → handled gracefully
  await it('should handle X failure gracefully', async () => {
    // Override mock to reject (mock.method for lifecycle, new factory for requestHandler)
    mock.method(listenerService as unknown as Record<string, unknown>, 'privateMethod',
      () => Promise.reject(new Error('test'))
    )
    listenerService.emit(...)
    await flushMicrotasks()
    // No crash = pass
  })
})
```

### Rules

- Use `emit()` directly on the service instance — no wrapper helpers
- Use `flushMicrotasks()` to drain async side-effects — never `await Promise.resolve()`
- Use `createOCPP16ListenerStation()` or `createOCPP20ListenerStation()` for `requestHandler` mock
- Use `mock.method()` in `beforeEach` for private lifecycle methods; override in rejection tests
- Use `listenerCount` as the first test in every listener describe block
- Listener tests go inside the same top-level describe as handler tests

---

## Summary

1. **Name**: `should [verb]` lowercase
2. **Structure**: AAA pattern, JSDoc headers
3. **Isolate**: Fresh instances in `beforeEach`, `standardCleanup()` in `afterEach`
4. **Async**: Use `async/await`, mock timers
5. **Platform**: Single top-level `describe`, `--test-force-exit` for Windows
6. **Constants**: Import from `ChargingStationTestConstants.ts`
7. **Assert**: Strict only (`assert.strictEqual`, `assert.deepStrictEqual`)
8. **Types**: No `as any`, use testable interfaces
9. **Mocks**: Use appropriate factory for your use case
10. **Utils**: Leverage lifecycle helpers and mock classes
11. **Listeners**: `emit()` direct, `flushMicrotasks()`, `listenerCount` first, accepted/rejected/error triad
