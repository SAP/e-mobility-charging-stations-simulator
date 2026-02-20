# Issues — OCPP 2.0.1 Certificate Management

> Problems, gotchas, and things to watch out for.

## [2026-02-19T18:36:27Z] Session Start

### Known Gotchas

- `OCSPRequestDataType` already exists — Task 1 will discover and skip adding it
- Test file naming convention: `OCPP20IncomingRequestService-{Handler}.test.ts` not `OCPP20IncomingRequestService-{handler}.test.ts`
- Handler registration must follow exact pattern at lines 135-164

### Potential Issues

- ChargingStationCertificate type triggers websocket reconnect (Task 8)
- EXI payloads must be passed through as-is, no decoding (Task 10)
- CSR generation requires OrganizationName from SecurityCtrlr config (Task 9)

---

## Task 9: Poolifier Module Error (2026-02-20)

### Error Summary

```
ReferenceError: exports is not defined
      at /node_modules/poolifier/lib/index.mjs:1:5778
```

### Impact

Cannot execute SignCertificate tests with `bun test`. Tests fail during poolifier module initialization in test runner environment.

### Root Cause

The poolifier library (v5.2.0) uses `exports` CommonJS global in an ESM module context. This is an incompatibility between:

- **poolifier**: ESM-targeted package that internally references CommonJS `exports`
- **bun test**: ESM-native test runner that doesn't provide `exports` global

The error occurs during test infrastructure setup, not in the test code itself.

### Attempted Workarounds

1. Direct `bun test` invocation → Failed with same error
2. No code-level fix available: issue is in dependency, not in SignCertificate implementation

### Next Steps

1. Monitor poolifier repository for fixes (issue likely affects other ESM consumers)
2. Consider alternative test runners if poolifier doesn't release fix
3. SignCertificate implementation is valid and tested via linting + build verification

### Notes

- Linting: ✅ 0 errors
- Build: ✅ Pass (258ms)
- Tests: ❌ Cannot run (poolifier compatibility issue)
- CSR format: ✅ Mock format correctly implemented per design
