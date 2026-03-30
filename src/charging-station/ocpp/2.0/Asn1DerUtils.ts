import { createSign, generateKeyPairSync } from 'node:crypto'

// ASN.1 DER encoding helpers for PKCS#10 CSR generation (RFC 2986)

/**
 * Encode a small non-negative integer in DER.
 * @param value - Integer value to encode
 * @returns DER-encoded INTEGER
 */
export function derInteger(value: number): Buffer {
  if (value < 0 || value > 127) {
    throw new RangeError(`derInteger: value ${String(value)} out of supported range [0, 127]`)
  }
  return Buffer.from([0x02, 0x01, value])
}

/**
 * Encode DER length in short or long form.
 * @param length - Length value to encode
 * @returns DER-encoded length bytes
 */
export function derLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length])
  }
  if (length < 0x100) {
    return Buffer.from([0x81, length])
  }
  return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff])
}

/**
 * Wrap content in a DER SEQUENCE (tag 0x30).
 * @param items - DER-encoded items to include in the sequence
 * @returns DER-encoded SEQUENCE
 */
export function derSequence(...items: Buffer[]): Buffer {
  const content = Buffer.concat(items)
  return Buffer.concat([Buffer.from([0x30]), derLength(content.length), content])
}

/**
 * Build an X.501 Name (Subject DN) with CN and O attributes.
 * Structure: SEQUENCE { SET { SEQUENCE { OID, UTF8String } }, ... }
 * @param cn - Common Name attribute value
 * @param org - Organization attribute value
 * @returns DER-encoded X.501 Name
 */
function buildSubjectDn(cn: string, org: string): Buffer {
  const cnRdn = derSet(derSequence(derOid(OID_COMMON_NAME), derUtf8String(cn)))
  const orgRdn = derSet(derSequence(derOid(OID_ORGANIZATION), derUtf8String(org)))
  return derSequence(cnRdn, orgRdn)
}

/**
 * Encode a DER BIT STRING with zero unused bits.
 * @param data - Raw bit string content
 * @returns DER-encoded BIT STRING
 */
function derBitString(data: Buffer): Buffer {
  const content = Buffer.concat([Buffer.from([0x00]), data])
  return Buffer.concat([Buffer.from([0x03]), derLength(content.length), content])
}

/**
 * Encode a DER context-specific constructed tag [tagNumber].
 * @param tagNumber - Context tag number (0-based)
 * @param content - Content to wrap
 * @returns DER-encoded context-tagged content
 */
function derContextTag(tagNumber: number, content: Buffer): Buffer {
  const tag = 0xa0 | tagNumber
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content])
}

/**
 * Encode a DER OBJECT IDENTIFIER from pre-encoded bytes.
 * @param oidBytes - Pre-encoded OID byte values
 * @returns DER-encoded OBJECT IDENTIFIER
 */
function derOid(oidBytes: number[]): Buffer {
  return Buffer.concat([Buffer.from([0x06, oidBytes.length]), Buffer.from(oidBytes)])
}

/**
 * Wrap content in a DER SET (tag 0x31).
 * @param items - DER-encoded items to include in the set
 * @returns DER-encoded SET
 */
function derSet(...items: Buffer[]): Buffer {
  const content = Buffer.concat(items)
  return Buffer.concat([Buffer.from([0x31]), derLength(content.length), content])
}

/**
 * Encode a DER UTF8String.
 * @param str - String to encode
 * @returns DER-encoded UTF8String
 */
function derUtf8String(str: string): Buffer {
  const strBuf = Buffer.from(str, 'utf-8')
  return Buffer.concat([Buffer.from([0x0c]), derLength(strBuf.length), strBuf])
}

// Well-known OID encodings
// 1.2.840.113549.1.1.11 — sha256WithRSAEncryption
const OID_SHA256_WITH_RSA = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]
// 2.5.4.3 — commonName
const OID_COMMON_NAME = [0x55, 0x04, 0x03]
// 2.5.4.10 — organizationName
const OID_ORGANIZATION = [0x55, 0x04, 0x0a]

/**
 * Generate a PKCS#10 Certificate Signing Request (RFC 2986) using node:crypto.
 *
 * Builds a proper ASN.1 DER-encoded CSR with:
 * - RSA 2048-bit key pair
 * - SHA-256 with RSA signature
 * - Subject DN containing CN={stationId} and O={orgName}
 * @param cn - Common Name (charging station identifier)
 * @param org - Organization name
 * @returns PEM-encoded CSR string with BEGIN/END CERTIFICATE REQUEST markers
 */
export function generatePkcs10Csr(cn: string, org: string): string {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' })

  // CertificationRequestInfo ::= SEQUENCE { version, subject, subjectPKInfo, attributes }
  const version = derInteger(0) // v1(0)
  const subject = buildSubjectDn(cn, org)
  const attributes = derContextTag(0, Buffer.alloc(0)) // empty attributes [0] IMPLICIT
  const certificationRequestInfo = derSequence(version, subject, publicKeyDer, attributes)

  // Sign the CertificationRequestInfo with SHA-256
  const signer = createSign('SHA256')
  signer.update(certificationRequestInfo)
  const signature = signer.sign(privateKey)

  // AlgorithmIdentifier ::= SEQUENCE { algorithm OID, parameters NULL }
  const signatureAlgorithm = derSequence(
    derOid(OID_SHA256_WITH_RSA),
    Buffer.from([0x05, 0x00]) // NULL
  )

  // CertificationRequest ::= SEQUENCE { info, algorithm, signature }
  const csr = derSequence(certificationRequestInfo, signatureAlgorithm, derBitString(signature))

  // PEM-encode with 64-character line wrapping
  const base64 = csr.toString('base64')
  const lines = base64.match(/.{1,64}/g) ?? []
  return `-----BEGIN CERTIFICATE REQUEST-----\n${lines.join('\n')}\n-----END CERTIFICATE REQUEST-----`
}
