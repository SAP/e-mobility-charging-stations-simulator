# OCPP 2.0.1 Certificate Management Implementation

## TL;DR

> **Quick Summary**: Implement complete OCPP 2.0.1 ISO 15118 Certificate Management (7 messages) with 100% spec compliance, TDD approach, PEM file storage, and basic validation. Create PR with passing CI.
>
> **Deliverables**:
>
> - 6 new Request/Response interface pairs in `src/types/ocpp/2.0/`
> - 4 incoming request handlers in `OCPP20IncomingRequestService.ts`
> - 3 outgoing request methods in `OCPP20RequestService.ts`
> - Certificate manager utility class with PEM storage
> - Comprehensive unit tests for all handlers
> - PR following contribution guidelines
>
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES - 5 waves with max 4 parallel tasks
> **Critical Path**: Type Definitions → CertManager → InstallCertificate Handler → SignCertificate → Final Integration

---

## Context

### Original Request

User requested implementation of certificate management in the OCPP 2.0 stack of the e-mobility charging stations simulator. Must follow official OCPP 2.0.1 specs in `docs/` with 100% compliance. A PR should be created following contribution guidelines with passing CI.

### Interview Summary

**Key Discussions**:

- **Scope**: All 7 certificate messages (M01-M06, A02-A03) - user chose "Complet"
- **Storage**: PEM files - user chose "Fichiers PEM"
- **Validation**: Basic validation (format, expiry, hash) - user chose "Validation basique"
- **Testing**: TDD approach - user confirmed
- **Compliance**: 100% spec compliance MANDATORY - user explicitly stated

**Research Findings**:

- 11 enums already exist in `Common.ts` with correct values
- 2 data types already exist (`CertificateHashDataType`, `CertificateHashDataChainType`)
- `OCSPRequestDataType` already exists (initially missed in research)
- 14 JSON schemas already exist for all certificate messages
- Only `InstallCertificateRequest/Response` interfaces exist
- No handlers implemented yet
- Handler registration pattern established at lines 135-164 of `OCPP20IncomingRequestService.ts`

### Metis Review

**Identified Gaps** (addressed):

- Certificate storage location: Use station config dir (`dist/assets/configurations/<hashId>/certs/`)
- Hash algorithm default: SHA256 (most common)
- Error behavior: Return appropriate status enum value with StatusInfo
- CSR subject fields: Use OrganizationName from SecurityCtrlr
- Test isolation: Use mock filesystem/temp directories
- EXI handling: Pass through as-is (simulator relays, doesn't interpret)
- OCSP stub: Return `Accepted` with dummy response

---

## Work Objectives

### Core Objective

Implement complete OCPP 2.0.1 Certificate Management functionality enabling the simulator to handle all certificate-related messages per the official specification.

### Concrete Deliverables

1. `src/types/ocpp/2.0/Requests.ts` - 6 new request interfaces
2. `src/types/ocpp/2.0/Responses.ts` - 6 new response interfaces
3. `src/charging-station/ocpp/2.0/OCPP20CertificateManager.ts` - Certificate utility class
4. `src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.ts` - 4 handlers added
5. `src/charging-station/ocpp/2.0/OCPP20RequestService.ts` - 3 outgoing methods added
6. Test files for all new functionality
7. PR with descriptive body following Conventional Commits

### Definition of Done

- [ ] `pnpm test` passes with all certificate tests
- [ ] `pnpm format` passes (lint)
- [ ] `pnpm build` passes (type check)
- [ ] No changes to `docs/` folder committed
- [ ] PR created following CONTRIBUTING.md guidelines
- [ ] All 7 OCPP certificate messages functional

### Must Have

- All 7 certificate message handlers/methods per OCPP 2.0.1 spec
- PEM file storage for certificates
- Basic validation (format, expiry, hash computation)
- TDD - tests written before implementation
- 100% spec compliance - exact field names, types, and enum values
- Payload validation against JSON schemas when `ocppStrictCompliance: true`

### Must NOT Have (Guardrails)

- Full PKI chain validation beyond format/expiry
- Network OCSP calls (stub responses only)
- Certificate generation (only CSR generation for SignCertificate)
- HSM integration
- EXI encoding/decoding for ISO 15118 payloads (pass-through only)
- UI components for certificate management
- OCPP 1.6 certificate functionality
- Automatic certificate renewal logic
- Changes to `docs/` folder

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision

- **Infrastructure exists**: YES (`bun test` framework)
- **Automated tests**: TDD (tests-first)
- **Framework**: `bun test`
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit Tests**: Use `bun test` with specific test patterns
- **Type Checking**: Use `pnpm build` (includes `tsc --noEmit`)
- **Linting**: Use `pnpm format`
- **API/Backend**: Use terminal commands to verify behavior

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Add certificate message type definitions [quick]
└── Task 2: Create certificate manager utility tests (TDD) [unspecified-high]

Wave 2 (After Wave 1 — core utilities):
├── Task 3: Implement certificate manager utility [unspecified-high]
└── Task 4: Write InstallCertificate handler tests (TDD) [unspecified-high]

Wave 3 (After Wave 2 — handlers, MAX PARALLEL):
├── Task 5: Implement InstallCertificate handler [unspecified-high]
├── Task 6: Write & implement DeleteCertificate handler [unspecified-high]
├── Task 7: Write & implement GetInstalledCertificateIds handler [unspecified-high]
└── Task 8: Write & implement CertificateSigned handler [unspecified-high]

Wave 4 (After Wave 3 — outgoing methods):
├── Task 9: Write & implement SignCertificate request method [unspecified-high]
└── Task 10: Write & implement Get15118EVCertificate & GetCertificateStatus [unspecified-high]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Integration QA [unspecified-high]
└── Task F4: Final PR creation [quick + git-master skill]

Critical Path: Task 1 → Task 3 → Task 5 → Task 9 → Task F4
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 4 (Wave 3)
```

### Dependency Matrix

| Task  | Depends On | Blocks                     |
| ----- | ---------- | -------------------------- |
| 1     | —          | 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| 2     | —          | 3                          |
| 3     | 1, 2       | 5, 6, 7, 8, 9, 10          |
| 4     | 1          | 5                          |
| 5     | 3, 4       | 9, F1-F4                   |
| 6     | 1, 3       | F1-F4                      |
| 7     | 1, 3       | F1-F4                      |
| 8     | 1, 3       | F1-F4                      |
| 9     | 5, 6, 7, 8 | F1-F4                      |
| 10    | 1, 3       | F1-F4                      |
| F1-F4 | 9, 10      | —                          |

### Agent Dispatch Summary

| Wave  | Tasks | Categories                                                             |
| ----- | ----- | ---------------------------------------------------------------------- |
| 1     | 2     | T1 → `quick`, T2 → `unspecified-high`                                  |
| 2     | 2     | T3 → `unspecified-high`, T4 → `unspecified-high`                       |
| 3     | 4     | T5-T8 → `unspecified-high`                                             |
| 4     | 2     | T9-T10 → `unspecified-high`                                            |
| FINAL | 4     | F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `quick` + `git-master` |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

- [x] 1. Add Certificate Message Type Definitions

  **What to do**:
  - Add 6 request interfaces to `src/types/ocpp/2.0/Requests.ts`:
    - `OCPP20DeleteCertificateRequest` with `certificateHashData: CertificateHashDataType`
    - `OCPP20GetInstalledCertificateIdsRequest` with optional `certificateType: GetCertificateIdUseEnumType[]`
    - `OCPP20CertificateSignedRequest` with `certificateChain: string`, optional `certificateType: CertificateSigningUseEnumType`
    - `OCPP20SignCertificateRequest` with `csr: string`, optional `certificateType: CertificateSigningUseEnumType`
    - `OCPP20Get15118EVCertificateRequest` with `iso15118SchemaVersion: string`, `action: CertificateActionEnumType`, `exiRequest: string`
    - `OCPP20GetCertificateStatusRequest` with `ocspRequestData: OCSPRequestDataType`
  - Add 6 response interfaces to `src/types/ocpp/2.0/Responses.ts`:
    - `OCPP20DeleteCertificateResponse` with `status: DeleteCertificateStatusEnumType`, optional `statusInfo`
    - `OCPP20GetInstalledCertificateIdsResponse` with `status: GetInstalledCertificateStatusEnumType`, optional `certificateHashDataChain`, optional `statusInfo`
    - `OCPP20CertificateSignedResponse` with `status: CertificateSignedStatusEnumType`, optional `statusInfo`
    - `OCPP20SignCertificateResponse` with `status: GenericStatusEnumType`, optional `statusInfo`
    - `OCPP20Get15118EVCertificateResponse` with `status: Iso15118EVCertificateStatusEnumType`, `exiResponse: string`, optional `statusInfo`
    - `OCPP20GetCertificateStatusResponse` with `status: GetCertificateStatusEnumType`, optional `ocspResult`, optional `statusInfo`
  - Add `OCSPRequestDataType` to `src/types/ocpp/2.0/Common.ts`:
    - `hashAlgorithm: HashAlgorithmEnumType`, `issuerNameHash: string`, `issuerKeyHash: string`, `serialNumber: string`, `responderURL: string`
  - Export all new types from index files

  **Must NOT do**:
  - Add any handler logic
  - Modify existing interfaces
  - Add documentation comments (follow existing style)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward type definitions following existing patterns
  - **Skills**: []
    - No special skills needed - pure TypeScript interface work

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 3, 4, 5, 6, 7, 8, 9, 10
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/types/ocpp/2.0/Requests.ts:1-50` - Existing request interface patterns (OCPP20BootNotificationRequest, OCPP20InstallCertificateRequest)
  - `src/types/ocpp/2.0/Responses.ts:1-50` - Existing response interface patterns
  - `src/types/ocpp/2.0/Common.ts:1-100` - Existing enum and type definitions

  **API/Type References**:
  - `src/types/ocpp/2.0/Common.ts:CertificateHashDataType` - Already exists, use for DeleteCertificateRequest
  - `src/types/ocpp/2.0/Common.ts:CertificateHashDataChainType` - Already exists, use for GetInstalledCertificateIdsResponse
  - `src/types/ocpp/2.0/Common.ts:StatusInfoType` - Already exists, use for all responses

  **Schema References** (verify field names match):
  - `src/assets/json-schemas/ocpp/2.0/DeleteCertificateRequest.json`
  - `src/assets/json-schemas/ocpp/2.0/GetInstalledCertificateIdsRequest.json`
  - `src/assets/json-schemas/ocpp/2.0/CertificateSignedRequest.json`
  - `src/assets/json-schemas/ocpp/2.0/SignCertificateRequest.json`
  - `src/assets/json-schemas/ocpp/2.0/Get15118EVCertificateRequest.json`
  - `src/assets/json-schemas/ocpp/2.0/GetCertificateStatusRequest.json`

  **WHY Each Reference Matters**:
  - Existing Requests.ts/Responses.ts show naming convention (OCPP20 prefix) and interface structure
  - Common.ts has all enums and supporting types already defined
  - JSON schemas are authoritative source for field names and types

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes (TypeScript compiles without errors)
  - [ ] All 6 request interfaces exported from `src/types/ocpp/2.0/Requests.ts`
  - [ ] All 6 response interfaces exported from `src/types/ocpp/2.0/Responses.ts`
  - [ ] `OCSPRequestDataType` exported from `src/types/ocpp/2.0/Common.ts`
  - [ ] Field names match JSON schemas exactly

  **QA Scenarios**:

  ```
  Scenario: Type definitions compile without errors
    Tool: Bash
    Preconditions: Types added to Requests.ts, Responses.ts, Common.ts
    Steps:
      1. Run `pnpm build`
      2. Check exit code is 0
      3. Verify no TypeScript errors in output
    Expected Result: Exit code 0, no "error TS" in output
    Failure Indicators: Non-zero exit code, "error TS" messages
    Evidence: .sisyphus/evidence/task-1-build-check.txt

  Scenario: Field names match JSON schema (spot check)
    Tool: Bash
    Preconditions: Types defined
    Steps:
      1. Run `grep -A5 "OCPP20DeleteCertificateRequest" src/types/ocpp/2.0/Requests.ts`
      2. Verify `certificateHashData` field exists (not `certificate` or other name)
      3. Run `grep "certificateHashData" src/assets/json-schemas/ocpp/2.0/DeleteCertificateRequest.json`
      4. Confirm schema also uses `certificateHashData`
    Expected Result: Both use identical field name `certificateHashData`
    Failure Indicators: Field name mismatch between interface and schema
    Evidence: .sisyphus/evidence/task-1-field-match.txt
  ```

  **Commit**: YES
  - Message: `feat(ocpp2): add certificate message type definitions`
  - Files: `src/types/ocpp/2.0/Requests.ts`, `src/types/ocpp/2.0/Responses.ts`, `src/types/ocpp/2.0/Common.ts`
  - Pre-commit: `pnpm build`

---

- [x] 2. Create Certificate Manager Utility Tests (TDD)

  **What to do**:
  - Create test file `tests/charging-station/ocpp/2.0/OCPP20CertificateManager.test.ts`
  - Write failing tests for:
    - `storeCertificate(stationHashId, certType, pemData)` - stores PEM file
    - `deleteCertificate(stationHashId, hashData)` - finds and deletes by hash
    - `getInstalledCertificates(stationHashId, filterTypes?)` - returns certificate list
    - `computeCertificateHash(pemData)` - returns CertificateHashDataType
    - `validateCertificateFormat(pemData)` - returns boolean
    - `getCertificatePath(stationHashId, certType, serialNumber)` - returns file path
  - Tests should verify:
    - PEM format validation (BEGIN/END markers)
    - Hash computation (SHA256 of issuer DN and public key)
    - File operations with mock filesystem
    - Error handling for invalid certificates

  **Must NOT do**:
  - Implement the actual manager class (tests only)
  - Use real filesystem (mock everything)
  - Add network calls

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: TDD requires careful test design for crypto operations
  - **Skills**: []
    - No special skills - standard bun test patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-Reset.test.ts` - Existing OCPP 2.0 test patterns
  - `tests/charging-station/ocpp/` - Utility test patterns in codebase

  **API/Type References**:
  - `src/types/ocpp/2.0/Common.ts:CertificateHashDataType` - Return type for hash computation
  - `src/types/ocpp/2.0/Common.ts:HashAlgorithmEnumType` - SHA256/384/512 enum

  **External References**:
  - RFC 5280: X.509 Certificate structure
  - Node.js `node:crypto` - createHash, X509Certificate class

  **WHY Each Reference Matters**:
  - Existing test files show bun test conventions used in project
  - CertificateHashDataType defines exact fields hash computation must return
  - RFC 5280 defines how issuerNameHash and issuerKeyHash are computed

  **Acceptance Criteria**:
  - [ ] Test file created at `tests/charging-station/ocpp/2.0/OCPP20CertificateManager.test.ts`
  - [ ] `bun test tests/charging-station/ocpp/2.0/OCPP20CertificateManager.test.ts` runs (tests fail - TDD red phase)
  - [ ] At least 10 test cases covering all methods
  - [ ] Tests use mocked filesystem (no actual file I/O)

  **QA Scenarios**:

  ```
  Scenario: Tests exist and fail (TDD red phase)
    Tool: Bash
    Preconditions: Test file created, no implementation yet
    Steps:
      1. Run `bun test tests/charging-station/ocpp/2.0/OCPP20CertificateManager.test.ts`
      2. Verify tests are discovered
      3. Confirm all tests fail (expected - no implementation)
    Expected Result: Tests discovered, all fail with import/undefined errors
    Failure Indicators: "no tests found" or tests pass unexpectedly
    Evidence: .sisyphus/evidence/task-2-tdd-red.txt

  Scenario: Test structure follows project conventions
    Tool: Bash
    Preconditions: Test file created
    Steps:
      1. Run `grep -c "describe\|it\|test" tests/charging-station/ocpp/2.0/OCPP20CertificateManager.test.ts`
      2. Verify at least 10 test cases exist
      3. Run `grep "mock\|Mock\|vi.mock\|spyOn" tests/charging-station/ocpp/2.0/OCPP20CertificateManager.test.ts`
      4. Verify filesystem is mocked
    Expected Result: ≥10 test cases, filesystem mocking present
    Failure Indicators: <10 tests, no mocking for fs operations
    Evidence: .sisyphus/evidence/task-2-test-structure.txt
  ```

  **Commit**: NO (groups with Task 3)

---

- [x] 3. Implement Certificate Manager Utility

  **What to do**:
  - Create `src/charging-station/ocpp/2.0/OCPP20CertificateManager.ts`
  - Implement all methods to make Task 2 tests pass:
    - `storeCertificate()`: Write PEM to `dist/assets/configurations/<hashId>/certs/<type>/<serial>.pem`
    - `deleteCertificate()`: Find by hash, delete file, return status
    - `getInstalledCertificates()`: Scan directory, return CertificateHashDataChainType[]
    - `computeCertificateHash()`: Use node:crypto to compute SHA256 hashes
    - `validateCertificateFormat()`: Check PEM markers, parse with X509Certificate
    - `getCertificatePath()`: Build path from components
  - Use node:crypto X509Certificate for parsing
  - Use node:fs/promises for file operations
  - Handle errors gracefully, return appropriate status enums

  **Must NOT do**:
  - Validate certificate chains (beyond format)
  - Make network calls for OCSP
  - Implement CSR generation (separate task)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Crypto operations require careful implementation
  - **Skills**: []
    - Node.js crypto knowledge built-in

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 5, 6, 7, 8, 9, 10
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/charging-station/ocpp/OCPPServiceUtils.ts` - Existing utility patterns
  - `src/utils/FileUtils.ts` (if exists) - File operation patterns

  **API/Type References**:
  - `src/types/ocpp/2.0/Common.ts:CertificateHashDataType` - Return type structure
  - `src/types/ocpp/2.0/Common.ts:CertificateHashDataChainType` - For getInstalledCertificates
  - `src/types/ocpp/2.0/Common.ts:InstallCertificateUseEnumType` - Certificate types

  **External References**:
  - Node.js docs: `crypto.X509Certificate` class
  - Node.js docs: `crypto.createHash('sha256')`

  **WHY Each Reference Matters**:
  - OCPPServiceUtils shows how utility classes are structured in this project
  - CertificateHashDataType defines exact fields that must be computed
  - Node.js X509Certificate provides parsing and hash methods

  **Acceptance Criteria**:
  - [ ] `bun test tests/charging-station/ocpp/2.0/OCPP20CertificateManager.test.ts` → all pass
  - [ ] `pnpm build` passes
  - [ ] `pnpm format` passes
  - [ ] Class exported from module

  **QA Scenarios**:

  ```
  Scenario: All certificate manager tests pass (TDD green phase)
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. Run `bun test tests/charging-station/ocpp/2.0/OCPP20CertificateManager.test.ts`
      2. Verify all tests pass
      3. Check no skipped tests
    Expected Result: All tests pass (0 failures)
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-tdd-green.txt

  Scenario: Hash computation produces correct format
    Tool: Bash (node REPL)
    Preconditions: Implementation complete
    Steps:
      1. Create test PEM certificate string
      2. Import and call computeCertificateHash()
      3. Verify returned object has: hashAlgorithm, issuerNameHash, issuerKeyHash, serialNumber
      4. Verify hashAlgorithm is 'SHA256'
      5. Verify hashes are hex strings
    Expected Result: CertificateHashDataType with all required fields
    Failure Indicators: Missing fields, wrong hash algorithm
    Evidence: .sisyphus/evidence/task-3-hash-format.txt
  ```

  **Commit**: YES
  - Message: `feat(ocpp2): implement certificate manager utility`
  - Files: `src/charging-station/ocpp/2.0/OCPP20CertificateManager.ts`, `tests/charging-station/ocpp/2.0/OCPP20CertificateManager.test.ts`
  - Pre-commit: `bun test tests/charging-station/ocpp/2.0/OCPP20CertificateManager.test.ts && pnpm build`

---

- [x] 4. Write InstallCertificate Handler Tests (TDD)

  **What to do**:
  - Create test file `tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-InstallCertificate.test.ts`
  - Write failing tests for `handleRequestInstallCertificate`:
    - Valid V2GRootCertificate → Accepted
    - Valid MORootCertificate → Accepted
    - Valid CSMSRootCertificate → Accepted
    - Valid ManufacturerRootCertificate → Accepted
    - Invalid PEM format → Rejected
    - Expired certificate → Rejected (if validation enabled)
    - Storage full → Failed
  - Mock OCPP20CertificateManager
  - Verify response matches schema

  **Must NOT do**:
  - Implement the handler (tests only)
  - Test actual file I/O (mock CertificateManager)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Handler tests require understanding OCPP patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-Reset.test.ts` - Existing OCPP 2.0 handler test pattern
  - `tests/charging-station/ocpp/1.6/` - OCPP 1.6 handler test patterns

  **Schema References**:
  - `src/assets/json-schemas/ocpp/2.0/InstallCertificateRequest.json` - Request validation
  - `src/assets/json-schemas/ocpp/2.0/InstallCertificateResponse.json` - Response format

  **WHY Each Reference Matters**:
  - Existing handler tests show mocking and assertion patterns
  - JSON schemas define exact request/response structure

  **Acceptance Criteria**:
  - [ ] Test file created
  - [ ] Tests run and fail (TDD red phase)
  - [ ] At least 7 test cases covering all scenarios
  - [ ] CertificateManager is mocked

  **QA Scenarios**:

  ```
  Scenario: InstallCertificate tests exist and fail
    Tool: Bash
    Preconditions: Test file created
    Steps:
      1. Run `bun test tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-InstallCertificate.test.ts`
      2. Verify tests discovered
      3. Confirm tests fail (no implementation yet)
    Expected Result: Tests discovered, all fail
    Failure Indicators: No tests found, tests pass unexpectedly
    Evidence: .sisyphus/evidence/task-4-tdd-red.txt
  ```

  **Commit**: NO (groups with Task 5)

---

- [x] 5. Implement InstallCertificate Handler

  **What to do**:
  - Add handler to `src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.ts`
  - Register handler in `incomingRequestHandlers` map (follow pattern at lines 135-164)
  - Handler logic:
    1. Validate certificate PEM format via CertificateManager
    2. Store certificate via CertificateManager.storeCertificate()
    3. Return `{ status: 'Accepted' }` on success
    4. Return `{ status: 'Rejected', statusInfo: { reasonCode: 'InvalidFormat' } }` on invalid
    5. Return `{ status: 'Failed', statusInfo: { reasonCode: 'StorageFull' } }` on storage error
  - Log operations at appropriate levels

  **Must NOT do**:
  - Validate certificate chain
  - Check certificate expiry (beyond format)
  - Add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: OCPP handler implementation requires understanding message flow
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7, 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.ts:135-164` - Handler registration pattern
  - `src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.ts:handleRequestReset` - Existing handler example

  **API/Type References**:
  - `src/types/ocpp/2.0/Requests.ts:OCPP20InstallCertificateRequest` - Request type (already exists)
  - `src/types/ocpp/2.0/Responses.ts:OCPP20InstallCertificateResponse` - Response type (already exists)
  - `src/types/ocpp/2.0/Common.ts:InstallCertificateStatusEnumType` - Status values

  **WHY Each Reference Matters**:
  - Lines 135-164 show exact pattern for registering new handlers
  - Existing handlers show logging, error handling, and response construction patterns

  **Acceptance Criteria**:
  - [ ] `bun test tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-InstallCertificate.test.ts` → all pass
  - [ ] Handler registered in `incomingRequestHandlers` map
  - [ ] `pnpm build` passes
  - [ ] `pnpm format` passes

  **QA Scenarios**:

  ```
  Scenario: InstallCertificate handler tests pass (TDD green)
    Tool: Bash
    Preconditions: Handler implemented
    Steps:
      1. Run `bun test tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-InstallCertificate.test.ts`
      2. Verify all tests pass
    Expected Result: All tests pass (0 failures)
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-5-tdd-green.txt

  Scenario: Handler registered correctly
    Tool: Bash
    Preconditions: Handler implemented
    Steps:
      1. Run `grep -n "InstallCertificate" src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.ts`
      2. Verify handler method exists
      3. Verify registration in incomingRequestHandlers map
    Expected Result: Handler method and registration found
    Failure Indicators: Missing method or registration
    Evidence: .sisyphus/evidence/task-5-handler-check.txt
  ```

  **Commit**: YES
  - Message: `feat(ocpp2): implement InstallCertificate handler`
  - Files: `src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.ts`, `tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-InstallCertificate.test.ts`
  - Pre-commit: `bun test tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-InstallCertificate.test.ts && pnpm build`

---

- [x] 6. Implement DeleteCertificate Handler (with tests)

  **What to do**:
  - Write tests in `tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-DeleteCertificate.test.ts`:
    - Certificate found and deleted → Accepted
    - Certificate not found → NotFound
    - Deletion failed → Failed
  - Add handler to `OCPP20IncomingRequestService.ts`
  - Handler logic:
    1. Call CertificateManager.deleteCertificate(hashData)
    2. Return appropriate status based on result
  - Register in handler map

  **Must NOT do**:
  - Delete certificates that are currently in use
  - Add cascade deletion logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Handler implementation with TDD
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 7, 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.ts` - Handler patterns
  - Task 5 implementation - Similar handler structure

  **Schema References**:
  - `src/assets/json-schemas/ocpp/2.0/DeleteCertificateRequest.json`
  - `src/assets/json-schemas/ocpp/2.0/DeleteCertificateResponse.json`

  **WHY Each Reference Matters**:
  - Follow same patterns as InstallCertificate for consistency

  **Acceptance Criteria**:
  - [ ] Tests pass
  - [ ] Handler registered
  - [ ] `pnpm build` passes

  **QA Scenarios**:

  ```
  Scenario: DeleteCertificate handler tests pass
    Tool: Bash
    Preconditions: Handler implemented
    Steps:
      1. Run `bun test tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-DeleteCertificate.test.ts`
      2. Verify all tests pass
    Expected Result: All tests pass
    Failure Indicators: Test failures
    Evidence: .sisyphus/evidence/task-6-tests.txt

  Scenario: Handler returns NotFound for missing certificate
    Tool: Bash
    Preconditions: Tests include NotFound scenario
    Steps:
      1. Run `grep -A10 "NotFound" tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-DeleteCertificate.test.ts`
      2. Verify test exists for certificate not found case
    Expected Result: NotFound test case exists
    Failure Indicators: No NotFound test
    Evidence: .sisyphus/evidence/task-6-notfound.txt
  ```

  **Commit**: YES
  - Message: `feat(ocpp2): implement DeleteCertificate handler`
  - Files: `src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.ts`, `tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-DeleteCertificate.test.ts`
  - Pre-commit: `bun test tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-DeleteCertificate.test.ts && pnpm build`

---

- [x] 7. Implement GetInstalledCertificateIds Handler (with tests)

  **What to do**:
  - Write tests in `tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-GetInstalledCertificateIds.test.ts`:
    - No filter → return all certificates
    - Filter by type → return matching only
    - No certificates → NotFound
    - Include child certificates in chain
  - Add handler to `OCPP20IncomingRequestService.ts`
  - Handler logic:
    1. Call CertificateManager.getInstalledCertificates(filterTypes)
    2. Build CertificateHashDataChainType[] response
    3. Return Accepted with data or NotFound if empty

  **Must NOT do**:
  - Return certificates from other stations
  - Include expired certificates without flag

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Handler with array response
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6, 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Schema References**:
  - `src/assets/json-schemas/ocpp/2.0/GetInstalledCertificateIdsRequest.json`
  - `src/assets/json-schemas/ocpp/2.0/GetInstalledCertificateIdsResponse.json`

  **WHY Each Reference Matters**:
  - Response schema shows array structure for certificateHashDataChain

  **Acceptance Criteria**:
  - [ ] Tests pass
  - [ ] Handler registered
  - [ ] Returns proper CertificateHashDataChainType[] structure

  **QA Scenarios**:

  ```
  Scenario: GetInstalledCertificateIds returns array structure
    Tool: Bash
    Preconditions: Handler implemented
    Steps:
      1. Run `bun test tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-GetInstalledCertificateIds.test.ts`
      2. Verify tests for empty array, single cert, multiple certs
    Expected Result: All tests pass
    Failure Indicators: Array structure tests fail
    Evidence: .sisyphus/evidence/task-7-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(ocpp2): implement GetInstalledCertificateIds handler`
  - Files: `src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.ts`, `tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-GetInstalledCertificateIds.test.ts`
  - Pre-commit: `bun test tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-GetInstalledCertificateIds.test.ts && pnpm build`

---

- [x] 8. Implement CertificateSigned Handler (with tests)

  **What to do**:
  - Write tests in `tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-CertificateSigned.test.ts`:
    - Valid certificate chain → Accepted
    - Certificate doesn't match pending CSR → Rejected
    - Invalid chain format → Rejected
    - ChargingStationCertificate triggers reconnect
    - V2GCertificate stored separately
  - Add handler to `OCPP20IncomingRequestService.ts`
  - Handler logic:
    1. Parse certificateChain (may contain multiple PEM certs)
    2. Validate format
    3. Match against pending CSR (if tracking implemented)
    4. Store certificate via CertificateManager
    5. If ChargingStationCertificate, trigger websocket reconnect
    6. Return Accepted or Rejected

  **Must NOT do**:
  - Full PKI chain validation
  - Verify CA signatures

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex handler with reconnect logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6, 7)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/charging-station/ChargingStation.ts` - Reconnect patterns

  **Schema References**:
  - `src/assets/json-schemas/ocpp/2.0/CertificateSignedRequest.json`
  - `src/assets/json-schemas/ocpp/2.0/CertificateSignedResponse.json`

  **WHY Each Reference Matters**:
  - ChargingStation.ts shows how to trigger websocket reconnect

  **Acceptance Criteria**:
  - [ ] Tests pass
  - [ ] Handler registered
  - [ ] Reconnect triggered for ChargingStationCertificate

  **QA Scenarios**:

  ```
  Scenario: CertificateSigned handler tests pass
    Tool: Bash
    Preconditions: Handler implemented
    Steps:
      1. Run `bun test tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-CertificateSigned.test.ts`
      2. Verify all tests pass
    Expected Result: All tests pass
    Failure Indicators: Test failures
    Evidence: .sisyphus/evidence/task-8-tests.txt

  Scenario: Reconnect logic exists for ChargingStationCertificate
    Tool: Bash
    Preconditions: Handler implemented
    Steps:
      1. Run `grep -n "reconnect\|Reconnect\|ChargingStationCertificate" src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.ts`
      2. Verify reconnect handling for ChargingStationCertificate type
    Expected Result: Reconnect logic present
    Failure Indicators: No reconnect handling
    Evidence: .sisyphus/evidence/task-8-reconnect.txt
  ```

  **Commit**: YES
  - Message: `feat(ocpp2): implement CertificateSigned handler`
  - Files: `src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.ts`, `tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-CertificateSigned.test.ts`
  - Pre-commit: `bun test tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-CertificateSigned.test.ts && pnpm build`

---

- [x] 9. Implement SignCertificate Request Method (with tests)

  **What to do**:
  - Write tests in `tests/charging-station/ocpp/2.0/OCPP20RequestService-SignCertificate.test.ts`:
    - CSR generation with correct format (PKCS#10, PEM)
    - OrganizationName from SecurityCtrlr config
    - ChargingStationCertificate type
    - V2GCertificate type
    - CSMS responds Accepted
    - CSMS responds Rejected
  - Add method to `src/charging-station/ocpp/2.0/OCPP20RequestService.ts`:
    - `requestSignCertificate(certificateType?)`
  - Method logic:
    1. Generate key pair (RSA 2048 or ECC 256)
    2. Create CSR with OrganizationName from config
    3. PEM encode CSR
    4. Send SignCertificateRequest
    5. Store pending CSR info for CertificateSigned matching
    6. Return response

  **Must NOT do**:
  - Implement retry logic (separate concern)
  - Store private keys in plaintext

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: CSR generation requires crypto operations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 10)
  - **Parallel Group**: Wave 4
  - **Blocks**: Final tasks
  - **Blocked By**: Tasks 5, 6, 7, 8

  **References**:

  **Pattern References**:
  - `src/charging-station/ocpp/2.0/OCPP20RequestService.ts` - Existing request method patterns

  **External References**:
  - RFC 2986: PKCS#10 CSR format
  - Node.js `crypto.generateKeyPairSync`
  - Node.js `crypto.createSign`

  **WHY Each Reference Matters**:
  - OCPP20RequestService shows how outgoing requests are structured
  - RFC 2986 defines CSR format requirements

  **Acceptance Criteria**:
  - [ ] Tests pass
  - [ ] CSR is valid PKCS#10 PEM format
  - [ ] Method exported and callable

  **QA Scenarios**:

  ```
  Scenario: SignCertificate generates valid CSR
    Tool: Bash
    Preconditions: Method implemented
    Steps:
      1. Run `bun test tests/charging-station/ocpp/2.0/OCPP20RequestService-SignCertificate.test.ts`
      2. Verify CSR format tests pass
      3. Verify CSR contains correct OrganizationName
    Expected Result: All tests pass, CSR valid
    Failure Indicators: CSR format invalid, wrong OrganizationName
    Evidence: .sisyphus/evidence/task-9-tests.txt

  Scenario: CSR is PEM encoded
    Tool: Bash
    Preconditions: Tests verify PEM format
    Steps:
      1. Run `grep -A5 "BEGIN CERTIFICATE REQUEST" tests/charging-station/ocpp/2.0/OCPP20RequestService-SignCertificate.test.ts`
      2. Verify test checks for PEM markers
    Expected Result: Test verifies PEM BEGIN/END markers
    Failure Indicators: No PEM format verification
    Evidence: .sisyphus/evidence/task-9-pem.txt
  ```

  **Commit**: YES
  - Message: `feat(ocpp2): implement SignCertificate request method`
  - Files: `src/charging-station/ocpp/2.0/OCPP20RequestService.ts`, `tests/charging-station/ocpp/2.0/OCPP20RequestService-SignCertificate.test.ts`
  - Pre-commit: `bun test tests/charging-station/ocpp/2.0/OCPP20RequestService-SignCertificate.test.ts && pnpm build`

---

- [ ] 10. Implement Get15118EVCertificate & GetCertificateStatus Methods (with tests)

  **What to do**:
  - Write tests in `tests/charging-station/ocpp/2.0/OCPP20RequestService-ISO15118.test.ts`:
    - Get15118EVCertificate: forwards EXI unmodified
    - Get15118EVCertificate: Install action
    - Get15118EVCertificate: Update action
    - GetCertificateStatus: returns OCSP response
    - GetCertificateStatus: handles failure
  - Add methods to `OCPP20RequestService.ts`:
    - `requestGet15118EVCertificate(schemaVersion, action, exiRequest)`
    - `requestGetCertificateStatus(ocspRequestData)`
  - Method logic:
    - Get15118EVCertificate: Pass through EXI, don't interpret
    - GetCertificateStatus: Send OCSP request data, return response (stub: return Accepted with dummy)

  **Must NOT do**:
  - Decode/encode EXI (pass-through only)
  - Make actual OCSP network calls (stub response)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: ISO 15118 message handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 9)
  - **Parallel Group**: Wave 4
  - **Blocks**: Final tasks
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Schema References**:
  - `src/assets/json-schemas/ocpp/2.0/Get15118EVCertificateRequest.json`
  - `src/assets/json-schemas/ocpp/2.0/GetCertificateStatusRequest.json`

  **WHY Each Reference Matters**:
  - Schemas define exact field structure for ISO 15118 messages

  **Acceptance Criteria**:
  - [ ] Tests pass
  - [ ] Methods exported
  - [ ] EXI passed through unmodified

  **QA Scenarios**:

  ```
  Scenario: Get15118EVCertificate passes EXI through
    Tool: Bash
    Preconditions: Method implemented
    Steps:
      1. Run `bun test tests/charging-station/ocpp/2.0/OCPP20RequestService-ISO15118.test.ts`
      2. Verify EXI pass-through test passes
      3. Verify no EXI decoding attempted
    Expected Result: Tests pass, EXI unchanged
    Failure Indicators: EXI modified, decoding attempted
    Evidence: .sisyphus/evidence/task-10-tests.txt

  Scenario: GetCertificateStatus returns stub response
    Tool: Bash
    Preconditions: Method implemented
    Steps:
      1. Run `grep -n "stub\|Stub\|dummy\|Dummy" tests/charging-station/ocpp/2.0/OCPP20RequestService-ISO15118.test.ts`
      2. Verify OCSP stub handling tested
    Expected Result: Stub response handling tested
    Failure Indicators: Real OCSP call attempted
    Evidence: .sisyphus/evidence/task-10-stub.txt
  ```

  **Commit**: YES
  - Message: `feat(ocpp2): implement Get15118EVCertificate and GetCertificateStatus`
  - Files: `src/charging-station/ocpp/2.0/OCPP20RequestService.ts`, `tests/charging-station/ocpp/2.0/OCPP20RequestService-ISO15118.test.ts`
  - Pre-commit: `bun test tests/charging-station/ocpp/2.0/OCPP20RequestService-ISO15118.test.ts && pnpm build`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm format` + `pnpm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Integration QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty storage, invalid certificates, concurrent operations.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Final PR Creation** — `quick` + `git-master` skill
      Verify all tests pass. Create PR following Conventional Commits: `feat(ocpp2): implement certificate management (ISO 15118)`. PR body should summarize changes, reference OCPP spec sections. Ensure no `docs/` changes.
      Output: `CI [PASS/FAIL] | PR URL | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                          | Files                                      |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------ |
| 1    | `feat(ocpp2): add certificate message type definitions`                 | Requests.ts, Responses.ts, index files     |
| 3    | `feat(ocpp2): implement certificate manager utility`                    | OCPP20CertificateManager.ts, test file     |
| 5    | `feat(ocpp2): implement InstallCertificate handler`                     | OCPP20IncomingRequestService.ts, test file |
| 6    | `feat(ocpp2): implement DeleteCertificate handler`                      | OCPP20IncomingRequestService.ts, test file |
| 7    | `feat(ocpp2): implement GetInstalledCertificateIds handler`             | OCPP20IncomingRequestService.ts, test file |
| 8    | `feat(ocpp2): implement CertificateSigned handler`                      | OCPP20IncomingRequestService.ts, test file |
| 9    | `feat(ocpp2): implement SignCertificate request method`                 | OCPP20RequestService.ts, test file         |
| 10   | `feat(ocpp2): implement Get15118EVCertificate and GetCertificateStatus` | OCPP20RequestService.ts, test file         |
| F4   | Final PR (squash merge)                                                 | All above                                  |

---

## Success Criteria

### Verification Commands

```bash
pnpm test           # Expected: All tests pass
pnpm format         # Expected: No lint errors
pnpm build          # Expected: No type errors
git diff --name-only | grep "^docs/" | wc -l  # Expected: 0 (no docs changes)
```

### Final Checklist

- [ ] All 7 certificate messages implemented
- [ ] All "Must Have" requirements present
- [ ] All "Must NOT Have" guardrails respected
- [ ] All tests pass (`pnpm test`)
- [ ] Lint passes (`pnpm format`)
- [ ] Build passes (`pnpm build`)
- [ ] No `docs/` changes committed
- [ ] PR created following CONTRIBUTING.md
