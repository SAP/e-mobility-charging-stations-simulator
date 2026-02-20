# Decisions — OCPP 2.0.1 Certificate Management

> Architectural choices made during implementation.

## [2026-02-19T18:36:27Z] Session Start

### Storage Design

- Location: `dist/assets/configurations/<hashId>/certs/<type>/<serial>.pem`
- Format: PEM files
- Naming: Use certificate serial number for filename

### Validation Strategy

- Basic validation only: format, expiry, hash computation
- No full PKI chain validation (out of scope)
- No network OCSP calls (stub responses only)
- Hash algorithm default: SHA256

### Error Handling

- Return appropriate status enum values per OCPP spec
- Include StatusInfo with reasonCode for failures
- Log at appropriate levels (error, warn, info)

### Testing Strategy

- TDD approach: tests first, then implementation
- Mock filesystem for all tests
- Verify against JSON schemas when `ocppStrictCompliance: true`

---

## [2026-02-20T09:15:00Z] Task 9: CSR Generation Approach

### Decision: Simplified Mock CSR (Not PKCS#10 Compliant)

**Context:**
- Original implementation generated invalid CSR format (just `base64(subject|signature)`)
- Real PKCS#10 CSR requires ASN.1 DER encoding with CertificationRequestInfo structure
- Node.js crypto module does NOT have built-in PKCS#10 CSR generation

**Options Evaluated:**
1. **Add library dependency** (`@peculiar/x509` or `node-forge`)
   - ❌ Violates plan constraint: "Must NOT Add new dependencies" (line 574)
2. **Manual ASN.1 DER construction**
   - ❌ Extremely complex (hundreds of lines), high error risk
3. **OpenSSL child_process**
   - ❌ Not portable (OS/version dependencies)
4. **Simplified mock CSR** (chosen)
   - ✅ No dependencies
   - ✅ Sufficient for simulator testing
   - ✅ Aligns with project purpose (simulator, not production PKI)

**Implementation:**
- Generate RSA 2048 key pair
- Create JSON structure with subject, publicKey, timestamp
- Base64 encode JSON
- Wrap with PEM headers (`-----BEGIN CERTIFICATE REQUEST-----`)
- Clearly document as NOT PKCS#10 compliant

**Rationale:**
- This is a **simulator** for testing OCPP message flows, not production PKI
- Mock CSR tests OCPP protocol mechanics (message format, status codes, error handling)
- Real CSMS would reject this CSR, but simulator testing doesn't need real certificate signing
- Can be upgraded to library-based solution if production use needed (out of scope)

**Limitations (MUST document in code):**
- NOT cryptographically valid PKCS#10 CSR
- Cannot be used with real CSMS requiring valid CSR
- Public key is separate from signature (not properly embedded)
- No ASN.1 DER encoding

**Documentation Requirements:**
- JSDoc warning on `requestSignCertificate()` method
- Code comments explaining mock nature
- Test file comments noting this is protocol testing only

---
