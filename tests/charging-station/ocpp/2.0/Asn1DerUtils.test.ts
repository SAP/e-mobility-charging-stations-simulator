/**
 * @file Tests for Asn1DerUtils
 * @description Unit tests for ASN.1 DER encoding, parsing, and PKCS#10 CSR generation
 */

import assert from 'node:assert/strict'
import { hash, X509Certificate } from 'node:crypto'
import { afterEach, describe, it } from 'node:test'

import {
  derInteger,
  derLength,
  derSequence,
  extractDerIssuer,
  generatePkcs10Csr,
  readDerLength,
  skipDerElement,
} from '../../../../src/charging-station/ocpp/2.0/Asn1DerUtils.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { VALID_X509_PEM_CERTIFICATE } from './OCPP20CertificateTestData.js'

await describe('ASN.1 DER encoding utilities', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('derInteger', async () => {
    await it('should encode 0 as valid DER INTEGER', () => {
      const result = derInteger(0)
      assert.deepStrictEqual(result, Buffer.from([0x02, 0x01, 0x00]))
    })

    await it('should encode 127 as valid DER INTEGER', () => {
      const result = derInteger(127)
      assert.deepStrictEqual(result, Buffer.from([0x02, 0x01, 0x7f]))
    })

    await it('should throw RangeError for value 128', () => {
      assert.throws(() => derInteger(128), RangeError)
    })

    await it('should throw RangeError for negative value', () => {
      assert.throws(() => derInteger(-1), RangeError)
    })
  })

  await describe('derLength', async () => {
    await it('should encode short form length (<128)', () => {
      const result = derLength(42)
      assert.deepStrictEqual(result, Buffer.from([42]))
    })

    await it('should encode single-byte long form length (128-255)', () => {
      const result = derLength(200)
      assert.deepStrictEqual(result, Buffer.from([0x81, 200]))
    })

    await it('should encode two-byte long form length (>=256)', () => {
      const result = derLength(300)
      assert.deepStrictEqual(result, Buffer.from([0x82, 0x01, 0x2c]))
    })

    await it('should encode boundary value 127 in short form', () => {
      const result = derLength(127)
      assert.deepStrictEqual(result, Buffer.from([0x7f]))
    })

    await it('should encode boundary value 128 in long form', () => {
      const result = derLength(128)
      assert.deepStrictEqual(result, Buffer.from([0x81, 0x80]))
    })
  })

  await describe('derSequence', async () => {
    await it('should wrap content with SEQUENCE tag 0x30', () => {
      const inner = Buffer.from([0x01, 0x02])
      const result = derSequence(inner)
      assert.strictEqual(result[0], 0x30)
      assert.strictEqual(result[1], 2)
      assert.deepStrictEqual(result.subarray(2), inner)
    })

    await it('should concatenate multiple items', () => {
      const a = Buffer.from([0xaa])
      const b = Buffer.from([0xbb])
      const result = derSequence(a, b)
      assert.strictEqual(result[0], 0x30)
      assert.strictEqual(result[1], 2)
      assert.strictEqual(result[2], 0xaa)
      assert.strictEqual(result[3], 0xbb)
    })

    await it('should handle empty content', () => {
      const result = derSequence(Buffer.alloc(0))
      assert.deepStrictEqual(result, Buffer.from([0x30, 0x00]))
    })
  })

  await describe('generatePkcs10Csr', async () => {
    await it('should produce valid PEM-encoded CSR', () => {
      const csr = generatePkcs10Csr('TestStation', 'TestOrg')
      assert.match(csr, /^-----BEGIN CERTIFICATE REQUEST-----\n/)
      assert.match(csr, /\n-----END CERTIFICATE REQUEST-----$/)
    })

    await it('should contain base64-encoded content with 64-char lines', () => {
      const csr = generatePkcs10Csr('TestStation', 'TestOrg')
      const lines = csr.split('\n')
      const contentLines = lines.slice(1, -1)
      for (const line of contentLines.slice(0, -1)) {
        assert.strictEqual(line.length, 64)
      }
      assert.ok(
        contentLines[contentLines.length - 1].length <= 64,
        'last line length should be at most 64 characters'
      )
    })
  })

  await describe('readDerLength', async () => {
    await it('should round-trip with derLength for short form', () => {
      const encoded = derLength(42)
      const result = readDerLength(encoded, 0)
      assert.strictEqual(result.length, 42)
      assert.strictEqual(result.end, encoded.length)
    })

    await it('should round-trip with derLength for single-byte long form', () => {
      const encoded = derLength(200)
      const result = readDerLength(encoded, 0)
      assert.strictEqual(result.length, 200)
      assert.strictEqual(result.end, encoded.length)
    })

    await it('should round-trip with derLength for two-byte long form', () => {
      const encoded = derLength(300)
      const result = readDerLength(encoded, 0)
      assert.strictEqual(result.length, 300)
      assert.strictEqual(result.end, encoded.length)
    })

    await it('should throw RangeError for empty buffer', () => {
      assert.throws(() => readDerLength(Buffer.alloc(0), 0), RangeError)
    })

    await it('should throw RangeError for numBytes > 3', () => {
      const buf = Buffer.from([0x84, 0x01, 0x00, 0x00, 0x00])
      assert.throws(() => readDerLength(buf, 0), RangeError)
    })
  })

  await describe('skipDerElement', async () => {
    await it('should skip a short TLV element', () => {
      const buf = Buffer.from([0x02, 0x01, 0x00])
      const nextOffset = skipDerElement(buf, 0)
      assert.strictEqual(nextOffset, 3)
    })

    await it('should skip a longer TLV element', () => {
      const buf = Buffer.from([0x30, 0x03, 0xaa, 0xbb, 0xcc, 0xff])
      const nextOffset = skipDerElement(buf, 0)
      assert.strictEqual(nextOffset, 5)
    })

    await it('should throw RangeError for offset beyond buffer', () => {
      assert.throws(() => skipDerElement(Buffer.from([0x02]), 5), RangeError)
    })
  })

  await describe('extractDerIssuer', async () => {
    await it('should extract DER issuer bytes from a real X.509 certificate', () => {
      const x509 = new X509Certificate(VALID_X509_PEM_CERTIFICATE)
      const issuerDer = extractDerIssuer(x509.raw)

      assert.ok(Buffer.isBuffer(issuerDer))
      assert.ok(issuerDer.length > 0)
      assert.strictEqual(issuerDer[0], 0x30)
    })

    await it('should extract issuer that differs from hashing the string DN', () => {
      const x509 = new X509Certificate(VALID_X509_PEM_CERTIFICATE)
      const issuerDer = extractDerIssuer(x509.raw)
      const derHash = hash('sha256', issuerDer, 'hex')
      const stringHash = hash('sha256', x509.issuer, 'hex')
      assert.notStrictEqual(derHash, stringHash)
    })

    await it('should produce consistent output for the same certificate', () => {
      const x509 = new X509Certificate(VALID_X509_PEM_CERTIFICATE)
      const first = extractDerIssuer(x509.raw)
      const second = extractDerIssuer(x509.raw)
      assert.deepStrictEqual(first, second)
    })

    await it('should throw RangeError for truncated DER data', () => {
      assert.throws(() => extractDerIssuer(Buffer.from([0x30, 0x03])), RangeError)
    })
  })
})
