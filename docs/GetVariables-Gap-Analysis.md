# OCPP 2.0.1 GetVariables (B06) Gap Analysis

Date: 2025-10-29
Scope: Charging Station implementation (`src/charging-station/ocpp/2.0`) vs OCPP 2.0.1 Edition 3 Part 2 & Part 6 for GetVariables (Use Case B06).

## 1. Legend

- Spec lines: `part2_specification.txt:<line>` or `part6_testcases.txt:<line>`
- Code lines: `<file>:<line>` for traceability
- Status codes: `GetVariableStatusEnumType.*`, `ReasonCodeEnumType.*`
- Attribute types: `Actual`, `Target`, `MinSet`, `MaxSet`

## 2. Clause Mapping Matrix

| Requirement ID                                  | Spec Lines               | Requirement Summary                               | Implementation Location(s)                                                  | Implementation Behavior                       | Conformance                   |
| ----------------------------------------------- | ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------- |
| B06.FR.01                                       | 05877–05885              | Response count equals request count               | `OCPP20IncomingRequestService.ts:239–241`; `OCPP20VariableManager.ts:65–92` | Iterates once per request element             | ✔                            |
| B06.FR.02                                       | 05890–05894              | Echo component+variable                           | Same as above; pass-through objects                                         | Original objects preserved                    | ✔                            |
| B06.FR.03                                       | 05913–05919              | Preserve provided attributeType                   | `OCPP20VariableManager.ts:194–197`                                          | Uses provided type (default if absent)        | ✔                            |
| B06.FR.04                                       | 05925–05930              | Return attributeValue for requested attributeType | `OCPP20VariableManager.ts:261–305`, `307–364`                               | Resolves, truncates, returns value            | ✔ (except empty Target edge) |
| B06.FR.05                                       | 05933–05936              | CSMS not exceed ItemsPerMessageGetVariables       | Enforcement at station `OCPP20IncomingRequestService.ts:177–215`            | Blanket rejection when exceeded               | ◐ (implementation strict)     |
| B06.FR.06                                       | 05940–05946              | UnknownComponent status, omit value               | `OCPP20VariableManager.ts:198–206`                                          | Status UnknownComponent, no value             | ✔                            |
| B06.FR.07                                       | 05950–05956              | UnknownVariable status, omit value                | `OCPP20VariableManager.ts:209–217`                                          | Status UnknownVariable, no value              | ✔                            |
| B06.FR.08                                       | 05960–05966              | NotSupportedAttributeType, omit value             | `OCPP20VariableManager.ts:238–246`                                          | Status NotSupportedAttributeType              | ✔                            |
| B06.FR.09                                       | 05969–05975              | WriteOnly retrieval rejected                      | `OCPP20VariableManager.ts:226–235`                                          | Rejected + ReasonCode WriteOnly               | ✔                            |
| B06.FR.10                                       | 05979–05984              | Accepted includes value                           | Success branches                                                            | Value present                                 | ✔                            |
| B06.FR.11                                       | 05988–05992              | Default Actual if missing                         | `OCPP20VariableManager.ts:194–197`                                          | Defaults to Actual                            | ✔                            |
| B06.FR.13                                       | 05994–06001              | Supported attribute unset → empty string          | `OCPP20VariableManager.ts:309–317`                                          | Accepts empty Target when supportsTarget=true | ✔                            |
| B06.FR.14                                       | 06008–06013              | Respect instance when provided                    | Metadata lookup uses instance                                               | Instance honored                              | ✔                            |
| B06.FR.15                                       | 06016–06023              | Missing instance for instance-only → Unknown\*    | Via `isVariableSupported` check                                             | Likely correct (untested)                     | ◐ (needs test)                |
| B06.FR.16                                       | 06030–06036              | MAY CALLERROR OccurenceConstraintViolation        | Blanket per-item rejection                                                  | No CALLERROR path                             | ◐                             |
| B06.FR.17                                       | 06040–06046              | MAY CALLERROR FormatViolation                     | Blanket per-item rejection                                                  | No CALLERROR path                             | ◐                             |
| ItemsPerMessageGetVariables                     | 45297–45306, 45312–45333 | Limit number of entries                           | Config read + enforcement                                                   | Implemented                                   | ✔ (style strict)             |
| BytesPerMessageGetVariables                     | 45371–45406              | Limit request size in bytes                       | Pre & post size checks                                                      | Implemented                                   | ✔ (style strict)             |
| Value truncation (ValueSize/ReportingValueSize) | (Need spec citation)     | Sequential truncation                             | `OCPP20VariableManager.ts:320–352`                                          | Implemented                                   | ◐ (missing spec ref)          |

Legend: ✔ conformant, ◐ partial/mismatch, ✖ non-conformant.

## 3. Gaps & Mismatches

| Category                                       | Description                                                           | Code Evidence                                                   | Spec Ref            | Impact                                          |
| ---------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------- | ----------------------------------------------- |
| Empty Target Handling                          | Should return empty string when supported attribute unset (B06.FR.13) | `OCPP20VariableManager.ts:309–317` rejects                      | 05994–06001         | Non-conformance; certification failure risk     |
| Constraint Violation Response Style            | Spec allows CALLERROR; code uses per-item blanket rejection           | `OCPP20IncomingRequestService.ts:199–215`, `218–236`, `242–263` | 06030–06046         | Divergent; tool may expect CALLERROR            |
| Blanket Rejection on Limits                    | All items rejected; no partial acceptance                             | Same lines above                                                | B06.FR.16–FR.17     | Reduced usability                               |
| Instance-only Variable Test Missing            | No test verifying B06.FR.15                                           | Absence in test file                                            | 06016–06023         | Potential hidden bug                            |
| Empty Target/Test Coverage                     | No test for empty string return case                                  | Test file lacks scenario                                        | 05994–06001         | Coverage gap                                    |
| Spec Citation for ValueSize/ReportingValueSize | Implementation present; lines not recorded in report                  | `OCPP20VariableManager.ts:320–352`                              | (Need Part 2 lines) | Traceability gap                                |
| ReasonCode Choices                             | Using NotFound for Unknown\*; spec silent                             | `OCPP20VariableManager.ts:198–206`, `209–217`                   | 05940–05956         | Likely acceptable; confirm harness expectations |

## 4. Remediation Plan (Current Confirmation: KEEP existing blanket rejection; do NOT add CALLERROR yet)

Phase 1 (Required for strict compliance without altering response style decision):

1. Implement B06.FR.13 handling (empty Target attribute):
   - Distinguish between attributeType Target & no stored value vs true invalid empty Actual.
   - Return `Accepted` with `attributeValue: ''` for supported unset Target.
2. Add tests for empty Target scenario.
3. Add test for instance-only variable missing instance (B06.FR.15).
4. Add test for write-only retrieval (already logic present) to reinforce coverage.
5. Capture spec line references for ValueSize & ReportingValueSize (update this file once lines are gathered) – documentation only.

Phase 2 (Optional, deferred per confirmation to keep current behavior):

- Partial acceptance for limits (split processing) OR CALLERROR paths gated by config.
- Adjustable rejection strategy via configuration key (future).

## 5. Detailed Remediation Steps

| Step | Action                                                                                                                                        | Target File                                                                         | Notes                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| R1   | Modify empty value branch to differentiate Target vs Actual                                                                                   | `OCPP20VariableManager.ts`                                                          | Replace rejection for empty Target with Accepted empty string |
| R2   | Add helper to check "supported attribute but not set"                                                                                         | `OCPP20VariableManager.ts`                                                          | Reuse metadata supportedAttributes list                       |
| R3   | Write new tests: `GetVariables_TargetUnsetEmptyAccepted`, `GetVariables_InstanceOnlyMissingInstance`, `GetVariables_WriteOnlyAttributeAccess` | `tests/charging-station/ocpp/2.0/OCPP20IncomingRequestService-GetVariables.test.ts` | Keep current naming convention (B06 prefix comment)           |
| R4   | Document spec line refs for ValueSize & ReportingValueSize                                                                                    | This report file                                                                    | After locating lines (Part 2)                                 |

## 6. Proposed Test Scenario Details

| Test Name                                | Scenario                                                             | Expected Result              | Spec Reference          |
| ---------------------------------------- | -------------------------------------------------------------------- | ---------------------------- | ----------------------- |
| GetVariables_TargetUnsetEmptyAccepted    | Request Target for variable supporting Target but never set          | Accepted + attributeValue "" | B06.FR.13 (05994–06001) |
| GetVariables_InstanceOnlyMissingInstance | Request variable without instance when only instance-specific exists | UnknownVariable (omit value) | B06.FR.15 (06016–06023) |
| GetVariables_WriteOnlyAttributeAccess    | Request Actual for write-only variable                               | Rejected (WriteOnly)         | B06.FR.09 (05969–05975) |

## 7. Open Questions (User Decisions Captured)

| Question                            | Decision                |
| ----------------------------------- | ----------------------- |
| Implement CALLERROR for limits now? | No (keep current style) |
| Keep blanket rejection strategy?    | Yes (for now)           |

## 8. Summary

Current implementation meets most mandatory behaviors. Primary non-conformance: handling of unsupported-but-unset Target attributes (B06.FR.13). Tests missing for several edge cases. Remediation will focus on B06.FR.13 and coverage improvements while preserving existing limit enforcement style.

## 9. Next Actions

Proceed to implement R1–R3 and update this report (R4) once spec citations for ValueSize and ReportingValueSize are gathered.
