# Refactor: OCPP20ServiceUtils TransactionEvent Implementation

## TL;DR

> **Quick Summary**: Refactor PR #1607's TransactionEvent implementation to improve code quality from 6.5/10 to 9/10 by eliminating DRY violations, converting a 180-line switch statement to a lookup table, and consolidating redundant methods—all while maintaining OCPP 2.0.1 compliance.
> 
> **Deliverables**:
> - `OCPP20TransactionEventOptions` type extracted to `Transaction.ts`
> - `TriggerReasonMapping` lookup table in `OCPP20Constants.ts`
> - Refactored `selectTriggerReason()` method (~180 → ~40 lines)
> - Consolidated build/send methods (4 → 2 with overloads)
> - Reduced logging verbosity
> 
> **Estimated Effort**: Medium (~14 hours)
> **Parallel Execution**: NO - sequential (each phase depends on previous)
> **Critical Path**: Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 (CI)

---

## Context

### Original Request
Refactor PR #1607 TransactionEvent implementation following OCPP 2.0.1 specification logic, implementing with elegance, best practices adherence, and harmonization with existing codebase design.

### Interview Summary
**Key Discussions**:
- OCPP 2.0.1 compliance verified (all 21 TriggerReasons, 5 ChargingStates, 3 EventTypes)
- Code quality score: 6.5/10 with specific issues identified
- Existing codebase uses frozen readonly array pattern (NOT Map)

**Research Findings**:
- `OCPP20Constants.ts` uses `Object.freeze([...])` on arrays, not Maps
- Comprehensive test coverage exists in `OCPP20ServiceUtils-TransactionEvent.test.ts`
- Project follows conventional commits and strict OCPP naming rules

### Metis Review
**Identified Gaps** (addressed):
- Pattern correction: Use frozen readonly arrays, not Maps (CORRECTED)
- Missing baseline verification step (ADDED as Phase 0)
- Missing per-phase test verification (ADDED to each phase)
- Need to check external callers before changing method signatures (ADDED)

---

## Work Objectives

### Core Objective
Improve OCPP20ServiceUtils.ts TransactionEvent code quality from 6.5/10 to 9/10 while maintaining 100% backward compatibility and OCPP 2.0.1 compliance.

### Concrete Deliverables
- `src/types/ocpp/2.0/Transaction.ts` - New `OCPP20TransactionEventOptions` type
- `src/charging-station/ocpp/2.0/OCPP20Constants.ts` - New `TriggerReasonMapping` lookup table
- `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts` - Refactored methods

### Definition of Done
- [ ] All 894 lines of existing tests pass unchanged
- [ ] `pnpm run lint` passes with no new errors
- [ ] `pnpm run build` succeeds
- [ ] No breaking changes to public API
- [ ] Code quality measurably improved (fewer lines, less duplication)
- [ ] **PR CI passes** (all GitHub Actions workflows green)

### Must Have
- All 21 OCPP 2.0.1 TriggerReasons correctly mapped
- Backward-compatible method signatures
- Same logging prefix format: `${chargingStation.logPrefix()} ${moduleName}.methodName:`
- All edge cases preserved (unknown context → Trigger fallback)

### Must NOT Have (Guardrails)
- **NO Map pattern** - Use frozen readonly arrays per codebase convention
- **NO changes to `requestStopTransaction`** method (out of scope)
- **NO test file modifications** - Tests verify behavior, not implementation
- **NO external API breaking changes** - Use TypeScript overloads
- **NO removal of debugging-essential logs** - Consolidate, don't delete
- **NO scope creep** to adjacent methods, types, or files

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks MUST be verifiable by running commands. No manual verification.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (existing tests serve as regression suite)
- **Framework**: Node.js test runner (existing)

### Baseline Verification (MANDATORY before Phase 1)
```bash
# Capture baseline - MUST pass before any changes
pnpm test -- tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts
# Assert: All tests pass

pnpm run lint
# Assert: No errors

pnpm run build  
# Assert: Build succeeds
```

### Per-Phase Verification
After EACH phase:
```bash
pnpm test -- tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts
# Assert: Same number of tests pass as baseline

pnpm run lint
# Assert: No new lint errors
```

---

## Execution Strategy

### Sequential Execution (No Parallelization)

Each phase depends on the previous phase completing successfully:

```
Phase 0: Establish Baseline (FIRST)
    ↓
Phase 1: Extract Options Type
    ↓
Phase 2: Create Lookup Table
    ↓
Phase 3: Refactor selectTriggerReason
    ↓
Phase 4: Consolidate Methods
    ↓
Phase 5: Logging & Cleanup (LAST)
```

### Dependency Matrix

| Phase | Depends On | Blocks | Can Parallelize With |
|-------|------------|--------|---------------------|
| 0 | None | 1, 2, 3, 4, 5 | None |
| 1 | 0 | 4 | None (sequential) |
| 2 | 0 | 3 | None (sequential) |
| 3 | 2 | 4 | None (sequential) |
| 4 | 1, 3 | 5 | None (sequential) |
| 5 | 4 | None | None (sequential) |

---

## TODOs

- [x] 0. Establish Test Baseline (COMPLETE)

  **What to do**:
  - Run existing test suite and capture passing test count
  - Run lint and build to verify clean state
  - Document baseline metrics for comparison

  **Must NOT do**:
  - Modify any source files
  - Skip any verification step

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple verification commands, no code changes
  - **Skills**: `[]`
    - No special skills needed for running test commands

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (must complete first)
  - **Blocks**: All subsequent phases
  - **Blocked By**: None

  **References**:
  - `tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts` - Test file to run (894 lines)
  - `package.json:scripts.test` - Test command configuration
  - `package.json:scripts.lint` - Lint command configuration

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Verify test suite passes
    Tool: Bash
    Preconditions: Repository cloned, dependencies installed
    Steps:
      1. pnpm test -- tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts
      2. Capture output: number of passing tests
      3. Assert: Exit code is 0
      4. Assert: No test failures in output
    Expected Result: All tests pass, baseline captured
    Evidence: Test output saved to .sisyphus/evidence/phase-0-baseline.txt

  Scenario: Verify lint passes
    Tool: Bash
    Preconditions: None
    Steps:
      1. pnpm run lint
      2. Assert: Exit code is 0
    Expected Result: No lint errors
    Evidence: Lint output captured

  Scenario: Verify build succeeds
    Tool: Bash
    Preconditions: None
    Steps:
      1. pnpm run build
      2. Assert: Exit code is 0
    Expected Result: Build completes without errors
    Evidence: Build output captured
  ```

  **Commit**: NO (no code changes)

---

- [x] 1. Extract OCPP20TransactionEventOptions Type (COMPLETE)

  **What to do**:
  - Create `OCPP20TransactionEventOptions` interface in `src/types/ocpp/2.0/Transaction.ts`
  - Export the type from the types barrel file
  - Update all 4 method signatures in OCPP20ServiceUtils.ts to use the new type
  - Verify tests still pass

  **Must NOT do**:
  - Change any property names or types
  - Make optional properties required
  - Add new properties not in original definition

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward type extraction, well-defined scope
  - **Skills**: `[]`
    - Standard TypeScript refactoring

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Phase 4 (method consolidation needs this type)
  - **Blocked By**: Phase 0

  **References**:

  **Pattern References** (existing code to follow):
  - `src/types/ocpp/2.0/Transaction.ts:275-324` - Existing type definitions in target file

  **Current Duplication** (what to extract):
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:75-87` - First options object
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:232-244` - Second options object
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:849-861` - Third options object
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:929-941` - Fourth options object

  **Type Import Pattern**:
  - `src/types/ocpp/2.0/index.ts` - Barrel export file to update

  **New Type Definition**:
  ```typescript
  /**
   * Optional parameters for building and sending TransactionEvent requests.
   * Aligned with OCPP 2.0.1 TransactionEvent.req optional fields.
   */
  export interface OCPP20TransactionEventOptions {
    /** Maximum current the cable can handle (A) */
    cableMaxCurrent?: number
    /** Current charging state per OCPP 2.0.1 ChargingStateEnumType */
    chargingState?: OCPP20ChargingStateEnumType
    /** Vendor-specific custom data */
    customData?: CustomDataType
    /** EVSE identifier (1-based) */
    evseId?: number
    /** Token used for authorization */
    idToken?: OCPP20IdTokenType
    /** Meter values associated with this event */
    meterValue?: OCPP20MeterValue[]
    /** Number of phases used for charging */
    numberOfPhasesUsed?: number
    /** Whether event occurred while offline */
    offline?: boolean
    /** Remote start transaction ID */
    remoteStartId?: number
    /** Reservation ID if applicable */
    reservationId?: number
    /** Reason for stopping transaction */
    stoppedReason?: OCPP20ReasonEnumType
  }
  ```

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Type is correctly defined
    Tool: Bash
    Preconditions: Phase 0 completed
    Steps:
      1. grep -n "export interface OCPP20TransactionEventOptions" src/types/ocpp/2.0/Transaction.ts
      2. Assert: Match found (exit code 0)
      3. grep -c "cableMaxCurrent\|chargingState\|customData\|evseId\|idToken\|meterValue\|numberOfPhasesUsed\|offline\|remoteStartId\|reservationId\|stoppedReason" src/types/ocpp/2.0/Transaction.ts
      4. Assert: Count >= 11 (all properties present)
    Expected Result: Type defined with all 11 properties
    Evidence: Grep output captured

  Scenario: Type is exported from barrel
    Tool: Bash
    Preconditions: Type defined
    Steps:
      1. grep "OCPP20TransactionEventOptions" src/types/ocpp/2.0/index.ts
      2. Assert: Export statement found
    Expected Result: Type exported
    Evidence: Grep output captured

  Scenario: OCPP20ServiceUtils uses new type
    Tool: Bash
    Preconditions: Type exported
    Steps:
      1. grep -c "options: OCPP20TransactionEventOptions" src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts
      2. Assert: Count = 4 (all 4 methods updated)
      3. grep -c "options: {" src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts | head -1
      4. Assert: Inline options objects removed (count should be 0 or much less)
    Expected Result: All methods use new type
    Evidence: Grep counts captured

  Scenario: Tests still pass
    Tool: Bash
    Preconditions: Code changes complete
    Steps:
      1. pnpm test -- tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts
      2. Assert: Exit code is 0
      3. Assert: Same number of tests pass as baseline
    Expected Result: No regression
    Evidence: Test output compared to baseline
  ```

  **Commit**: YES
  - Message: `refactor(ocpp2): extract OCPP20TransactionEventOptions type`
  - Files: `src/types/ocpp/2.0/Transaction.ts`, `src/types/ocpp/2.0/index.ts`, `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts`
  - Pre-commit: `pnpm test -- tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts`

---

- [x] 2. Create TriggerReasonMapping Lookup Table (COMPLETE)

  **What to do**:
  - Add `TriggerReasonMapping` as frozen readonly array in `OCPP20Constants.ts`
  - Map all context source + qualifier combinations to TriggerReasonEnumType
  - Add `DefaultTriggerReason` constant
  - Follow existing codebase pattern (frozen arrays, NOT Maps)

  **Must NOT do**:
  - Use `Map` data structure (not the codebase pattern)
  - Miss any of the 21 TriggerReason mappings
  - Change any existing constants in the file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding constants following existing pattern
  - **Skills**: `[]`
    - Standard TypeScript

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Phase 3 (selectTriggerReason refactor uses this)
  - **Blocked By**: Phase 0

  **References**:

  **Pattern References** (CRITICAL - must follow exactly):
  - `src/charging-station/ocpp/2.0/OCPP20Constants.ts:8-43` - Frozen array pattern to follow:
    ```typescript
    static readonly ConnectorStatusTransitions: readonly ConnectorStatusTransition[] = Object.freeze([
      { to: OCPP20ConnectorStatusEnumType.Available },
      { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Occupied },
      // ...
    ])
    ```

  **Current Trigger Reason Logic** (extract from):
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:637-817` - selectTriggerReason method

  **OCPP 2.0.1 TriggerReasons** (all 21 must be mappable):
  - Authorized, CablePluggedIn, ChargingStateChanged, Deauthorized, EnergyLimitReached
  - EVCommunicationLost, EVConnectTimeout, EVDeparted, EVDetected, MeterValueClock
  - MeterValuePeriodic, RemoteStart, RemoteStop, ResetCommand, SignedDataReceived
  - StopAuthorized, TimeLimitReached, Trigger, UnlockCommand, AbnormalCondition

  **New Type and Constant Definition**:
  ```typescript
  /**
   * Mapping entry for trigger reason lookup.
   */
  interface TriggerReasonMappingEntry {
    readonly source: string
    readonly qualifier?: string
    readonly triggerReason: OCPP20TriggerReasonEnumType
  }

  /**
   * Lookup table for selecting TriggerReason based on event context.
   * Priority order: remote_command > local_authorization > cable_action > etc.
   */
  public static readonly TriggerReasonMapping: readonly TriggerReasonMappingEntry[] = Object.freeze([
    // Priority 1: Remote Commands
    { source: 'remote_command', qualifier: 'RequestStartTransaction', triggerReason: OCPP20TriggerReasonEnumType.RemoteStart },
    { source: 'remote_command', qualifier: 'RequestStopTransaction', triggerReason: OCPP20TriggerReasonEnumType.RemoteStop },
    { source: 'remote_command', qualifier: 'Reset', triggerReason: OCPP20TriggerReasonEnumType.ResetCommand },
    { source: 'remote_command', qualifier: 'UnlockConnector', triggerReason: OCPP20TriggerReasonEnumType.UnlockCommand },
    { source: 'remote_command', qualifier: 'TriggerMessage', triggerReason: OCPP20TriggerReasonEnumType.Trigger },
    // ... etc
  ])

  public static readonly DefaultTriggerReason = OCPP20TriggerReasonEnumType.Trigger
  ```

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Lookup table is defined with correct pattern
    Tool: Bash
    Preconditions: Phase 0 completed
    Steps:
      1. grep -n "TriggerReasonMapping.*readonly.*Object.freeze" src/charging-station/ocpp/2.0/OCPP20Constants.ts
      2. Assert: Match found (uses frozen readonly array pattern)
      3. grep -c "triggerReason:" src/charging-station/ocpp/2.0/OCPP20Constants.ts
      4. Assert: Count >= 15 (sufficient mappings)
    Expected Result: Lookup table follows codebase pattern
    Evidence: Grep output captured

  Scenario: DefaultTriggerReason is defined
    Tool: Bash
    Preconditions: Lookup table created
    Steps:
      1. grep "DefaultTriggerReason.*Trigger" src/charging-station/ocpp/2.0/OCPP20Constants.ts
      2. Assert: Match found
    Expected Result: Default fallback defined
    Evidence: Grep output captured

  Scenario: Build still succeeds
    Tool: Bash
    Preconditions: Constants added
    Steps:
      1. pnpm run build
      2. Assert: Exit code is 0
    Expected Result: TypeScript compiles
    Evidence: Build output captured

  Scenario: Lint passes
    Tool: Bash
    Preconditions: Build succeeds
    Steps:
      1. pnpm run lint
      2. Assert: Exit code is 0
    Expected Result: No lint errors
    Evidence: Lint output captured
  ```

  **Commit**: YES
  - Message: `refactor(ocpp2): add TriggerReasonMapping lookup table`
  - Files: `src/charging-station/ocpp/2.0/OCPP20Constants.ts`
  - Pre-commit: `pnpm run build && pnpm run lint`

---

- [x] 3. Refactor selectTriggerReason to Use Lookup Table

  **What to do**:
  - Replace 180-line switch statement with lookup table query
  - Add helper method `buildTriggerReasonKey()` to construct lookup key
  - Preserve fallback to `DefaultTriggerReason` for unknown contexts
  - Consolidate ~30 logger.debug calls to single summary log
  - Verify all existing tests still pass

  **Must NOT do**:
  - Change return value for any existing context input
  - Remove fallback behavior for unknown contexts
  - Remove all logging (consolidate, don't eliminate)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Medium complexity refactoring with clear target
  - **Skills**: `[]`
    - Standard TypeScript refactoring

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Phase 4
  - **Blocked By**: Phase 2 (needs lookup table)

  **References**:

  **Current Implementation** (to refactor):
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:637-817` - Current selectTriggerReason (180+ lines)

  **Lookup Table** (to use):
  - `src/charging-station/ocpp/2.0/OCPP20Constants.ts:TriggerReasonMapping` - Created in Phase 2

  **Logging Pattern** (to follow):
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:100-102` - Existing log format example

  **Target Implementation**:
  ```typescript
  public static selectTriggerReason (
    context: TransactionEventContext
  ): OCPP20TriggerReasonEnumType {
    const key = this.buildTriggerReasonKey(context)
    const entry = OCPP20Constants.TriggerReasonMapping.find(
      e => e.source === context.source && 
           (e.qualifier == null || e.qualifier === key.qualifier)
    )
    const triggerReason = entry?.triggerReason ?? OCPP20Constants.DefaultTriggerReason

    logger.debug(
      `${moduleName}.selectTriggerReason: source='${context.source}' → ${triggerReason}`
    )

    return triggerReason
  }

  private static buildTriggerReasonKey (context: TransactionEventContext): { source: string; qualifier?: string } {
    // Extract qualifier based on source type
    // ...
  }
  ```

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Method line count reduced
    Tool: Bash
    Preconditions: Refactoring complete
    Steps:
      1. Extract selectTriggerReason method and count lines
      2. grep -n "selectTriggerReason" src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts | head -1
      3. Count lines from start to closing brace
      4. Assert: Line count < 60 (down from 180+)
    Expected Result: Significant line reduction
    Evidence: Line count captured

  Scenario: Logger.debug calls reduced
    Tool: Bash
    Preconditions: Refactoring complete
    Steps:
      1. grep -c "logger.debug.*selectTriggerReason" src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts
      2. Assert: Count <= 3 (down from ~30)
    Expected Result: Logging consolidated
    Evidence: Grep count captured

  Scenario: All tests still pass
    Tool: Bash
    Preconditions: Refactoring complete
    Steps:
      1. pnpm test -- tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts
      2. Assert: Exit code is 0
      3. Compare test count to baseline
      4. Assert: Same number of tests pass
    Expected Result: No regression
    Evidence: Test output compared to Phase 0 baseline

  Scenario: Unknown context returns default
    Tool: Bash
    Preconditions: Tests pass
    Steps:
      1. grep -A5 "DefaultTriggerReason" src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts
      2. Assert: Fallback logic present
    Expected Result: Fallback preserved
    Evidence: Code snippet captured
  ```

  **Commit**: YES
  - Message: `refactor(ocpp2): simplify selectTriggerReason with lookup table`
  - Files: `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts`
  - Pre-commit: `pnpm test -- tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts`

---

- [x] 4. Consolidate Build/Send Methods with TypeScript Overloads

  **What to do**:
  - Use `lsp_find_references` to check for external callers of all 4 methods
  - Consolidate `buildTransactionEvent` + `buildTransactionEventWithContext` into one method with overloads
  - Consolidate `sendTransactionEvent` + `sendTransactionEventWithContext` into one method with overloads
  - Add `@deprecated` JSDoc to old method names that redirect to new signatures
  - Verify all tests still pass

  **Must NOT do**:
  - Remove existing method signatures (use overloads for backward compatibility)
  - Change return types of any method
  - Break any external callers

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: TypeScript overload pattern requires careful signature design
  - **Skills**: `[]`
    - Standard TypeScript

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Phase 5
  - **Blocked By**: Phase 1, Phase 3

  **References**:

  **Current Methods** (to consolidate):
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:69-198` - buildTransactionEvent
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:226-262` - buildTransactionEventWithContext
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:843-896` - sendTransactionEvent
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:923-976` - sendTransactionEventWithContext

  **Options Type** (from Phase 1):
  - `src/types/ocpp/2.0/Transaction.ts:OCPP20TransactionEventOptions`

  **TypeScript Overload Pattern**:
  ```typescript
  // Overload signatures
  public static buildTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    triggerReason: OCPP20TriggerReasonEnumType,
    connectorId: number,
    transactionId: string,
    options?: OCPP20TransactionEventOptions
  ): OCPP20TransactionEventRequest

  public static buildTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    context: TransactionEventContext,
    connectorId: number,
    transactionId: string,
    options?: OCPP20TransactionEventOptions
  ): OCPP20TransactionEventRequest

  // Implementation
  public static buildTransactionEvent (
    chargingStation: ChargingStation,
    eventType: OCPP20TransactionEventEnumType,
    triggerReasonOrContext: OCPP20TriggerReasonEnumType | TransactionEventContext,
    connectorId: number,
    transactionId: string,
    options: OCPP20TransactionEventOptions = {}
  ): OCPP20TransactionEventRequest {
    const triggerReason = typeof triggerReasonOrContext === 'string'
      ? triggerReasonOrContext
      : this.selectTriggerReason(triggerReasonOrContext)
    // ... implementation
  }

  /** @deprecated Use buildTransactionEvent with context parameter instead */
  public static buildTransactionEventWithContext (...) {
    return this.buildTransactionEvent(...)
  }
  ```

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Check for external callers before changes
    Tool: Bash (via LSP or grep)
    Preconditions: Phase 3 complete
    Steps:
      1. grep -r "buildTransactionEventWithContext\|sendTransactionEventWithContext" src/ --include="*.ts" | grep -v OCPP20ServiceUtils.ts
      2. Note any external callers
      3. If callers exist, ensure backward compatibility
    Expected Result: External caller impact assessed
    Evidence: Grep results captured

  Scenario: Overloads are properly defined
    Tool: Bash
    Preconditions: Consolidation complete
    Steps:
      1. grep -c "public static buildTransactionEvent" src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts
      2. Assert: Count >= 2 (overload signatures + implementation)
      3. grep -c "public static async sendTransactionEvent" src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts
      4. Assert: Count >= 2
    Expected Result: Overloads defined
    Evidence: Grep counts captured

  Scenario: Deprecated methods redirect correctly
    Tool: Bash
    Preconditions: Overloads defined
    Steps:
      1. grep -B1 "buildTransactionEventWithContext" src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts | grep "@deprecated"
      2. Assert: Deprecated annotation found
    Expected Result: Old methods marked deprecated
    Evidence: Grep output captured

  Scenario: All tests still pass
    Tool: Bash
    Preconditions: Consolidation complete
    Steps:
      1. pnpm test -- tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts
      2. Assert: Exit code is 0
      3. Assert: Same number of tests pass as baseline
    Expected Result: No regression
    Evidence: Test output compared to baseline
  ```

  **Commit**: YES
  - Message: `refactor(ocpp2): consolidate TransactionEvent build/send methods with overloads`
  - Files: `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts`
  - Pre-commit: `pnpm test -- tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts`

---

- [ ] 5. Reduce Logging Verbosity and Final Cleanup

  **What to do**:
  - Ensure all public methods have single summary debug log at entry
  - Move verbose detail to trace level or remove
  - Verify consistent log format: `${chargingStation.logPrefix()} ${moduleName}.methodName:`
  - Final lint and test verification
  - Document final metrics

  **Must NOT do**:
  - Remove logs essential for transaction debugging
  - Change log format to be inconsistent with codebase
  - Make any functional changes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Final cleanup, no complex logic changes
  - **Skills**: `[]`
    - Standard cleanup

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final phase)
  - **Blocks**: None
  - **Blocked By**: Phase 4

  **References**:

  **Logging Pattern** (to follow):
  - `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts:100-102` - Correct format example

  **Current Logging** (to review):
  - All `logger.debug` calls in OCPP20ServiceUtils.ts TransactionEvent methods

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Logging is consistent
    Tool: Bash
    Preconditions: Phase 4 complete
    Steps:
      1. grep "logger.debug.*moduleName" src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts | head -5
      2. Verify format matches pattern
    Expected Result: Consistent log format
    Evidence: Sample logs captured

  Scenario: Final test verification
    Tool: Bash
    Preconditions: All phases complete
    Steps:
      1. pnpm test -- tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts
      2. Assert: Exit code is 0
      3. Assert: Same number of tests pass as Phase 0 baseline
    Expected Result: All tests pass
    Evidence: Final test output

  Scenario: Final lint verification
    Tool: Bash
    Preconditions: Tests pass
    Steps:
      1. pnpm run lint
      2. Assert: Exit code is 0
    Expected Result: No lint errors
    Evidence: Lint output

  Scenario: Final build verification
    Tool: Bash
    Preconditions: Lint passes
    Steps:
      1. pnpm run build
      2. Assert: Exit code is 0
    Expected Result: Build succeeds
    Evidence: Build output

  Scenario: Metrics improvement documented
    Tool: Bash
    Preconditions: Build succeeds
    Steps:
      1. wc -l src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts
      2. Compare to original (~978 lines)
      3. Assert: Reduction achieved
    Expected Result: Measurable improvement
    Evidence: Before/after line counts
  ```

  **Commit**: YES
  - Message: `refactor(ocpp2): cleanup logging in TransactionEvent methods`
  - Files: `src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts`
  - Pre-commit: `pnpm test && pnpm run lint && pnpm run build`

---

- [ ] 6. Final CI Verification and PR Update

  **What to do**:
  - Run complete quality gate suite locally
  - Push all commits to remote
  - Verify PR CI passes (all GitHub Actions green)
  - If CI fails, debug and fix until green

  **Must NOT do**:
  - Skip CI verification
  - Merge with failing CI
  - Force push over existing PR history

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running commands and monitoring CI status
  - **Skills**: `['git-master']`
    - Git operations for pushing and monitoring

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final phase)
  - **Blocks**: None (completion)
  - **Blocked By**: Phase 5

  **References**:
  - `.github/workflows/ci.yml` - CI workflow definition
  - `package.json:scripts` - Quality gate commands

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Full local quality gate pass
    Tool: Bash
    Preconditions: Phase 5 complete
    Steps:
      1. pnpm install
      2. Assert: Exit code is 0
      3. pnpm run build
      4. Assert: Exit code is 0
      5. pnpm run lint
      6. Assert: Exit code is 0
      7. pnpm test
      8. Assert: Exit code is 0
    Expected Result: All quality gates pass locally
    Evidence: Command outputs captured

  Scenario: Push and verify CI
    Tool: Bash
    Preconditions: Local quality gates pass
    Steps:
      1. git push origin HEAD
      2. Assert: Push succeeds
      3. gh pr checks --watch (or poll status)
      4. Assert: All CI checks pass (green)
    Expected Result: PR CI is green
    Evidence: gh pr checks output

  Scenario: CI failure recovery (if needed)
    Tool: Bash
    Preconditions: CI failed
    Steps:
      1. gh pr checks (identify failing check)
      2. Read CI logs to identify failure cause
      3. Fix issue locally
      4. Run local quality gates again
      5. Push fix commit
      6. Repeat until CI green
    Expected Result: CI eventually passes
    Evidence: Final green CI status
  ```

  **Commit**: NO (or fix commits if CI fails)

---

## Commit Strategy

| After Phase | Message | Files | Verification |
|-------------|---------|-------|--------------
| 0 | (no commit - baseline only) | - | Tests pass |
| 1 | `refactor(ocpp2): extract OCPP20TransactionEventOptions type` | Transaction.ts, index.ts, OCPP20ServiceUtils.ts | Tests pass |
| 2 | `refactor(ocpp2): add TriggerReasonMapping lookup table` | OCPP20Constants.ts | Build + Lint |
| 3 | `refactor(ocpp2): simplify selectTriggerReason with lookup table` | OCPP20ServiceUtils.ts | Tests pass |
| 4 | `refactor(ocpp2): consolidate TransactionEvent build/send methods with overloads` | OCPP20ServiceUtils.ts | Tests pass |
| 5 | `refactor(ocpp2): cleanup logging in TransactionEvent methods` | OCPP20ServiceUtils.ts | Tests + Lint + Build |
| 6 | (push + CI verification) | - | **PR CI green** |

---

## Success Criteria

### Verification Commands
```bash
# All tests pass (same as baseline)
pnpm test -- tests/charging-station/ocpp/2.0/OCPP20ServiceUtils-TransactionEvent.test.ts

# Lint passes
pnpm run lint

# Build succeeds
pnpm run build

# Line count reduced
wc -l src/charging-station/ocpp/2.0/OCPP20ServiceUtils.ts
# Expected: < 900 lines (down from ~978)
```

### Final Checklist
- [ ] All existing tests pass (894 lines of tests unchanged)
- [ ] No new lint errors
- [ ] Build succeeds
- [ ] `OCPP20TransactionEventOptions` type extracted (DRY fix)
- [ ] `TriggerReasonMapping` lookup table created (using frozen array pattern)
- [ ] `selectTriggerReason` reduced from ~180 to ~40 lines
- [ ] Methods consolidated from 4 to 2 (with overloads)
- [ ] Backward compatibility maintained (deprecated methods still work)
- [ ] Logging consistent with codebase pattern
- [ ] **PR CI passes** (all GitHub Actions workflows green)

### CI Requirements (MANDATORY)

> **User Requirement**: "le plan doit inclure: passage de tous les quality gates du projet, CI de la PR doit passer"

The PR CI workflow (`.github/workflows/ci.yml`) must pass after all phases complete. This includes:

| CI Check | Command | Expected |
|----------|---------|----------|
| Install | `pnpm install` | Success |
| Build | `pnpm run build` | Success |
| Lint | `pnpm run lint` | 0 errors |
| Test | `pnpm test` | All pass |
| Type Check | Implicit in build | Success |

**Final Verification** (after Phase 5):
```bash
# Run full quality gate suite (same as CI)
pnpm install && pnpm run build && pnpm run lint && pnpm test

# Push to remote and verify CI status
git push origin HEAD
gh pr checks --watch  # Wait for CI to complete
```

**If CI fails**: Debug locally, fix issues, amend last commit if safe, or create fix commit. Loop until CI is green.

### Metrics

| Metric | Before | Target | Verification |
|--------|--------|--------|--------------|
| Code Quality Score | 6.5/10 | 9/10 | Qualitative |
| `selectTriggerReason` LOC | ~180 | <60 | `wc -l` on method |
| Duplicate Options Objects | 4 | 0 | `grep` count |
| Public Method Count | 4 | 2 (+2 deprecated) | `grep` count |
| File Total LOC | ~978 | <900 | `wc -l` |
