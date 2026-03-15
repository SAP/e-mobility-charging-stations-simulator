/**
 * @file Tests for Asn1DerUtils
 * @description Unit tests for ASN.1 DER encoding primitives and PKCS#10 CSR generation
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  derInteger,
  derLength,
  derSequence,
  generatePkcs10Csr,
} from '../../../../src/charging-station/ocpp/2.0/Asn1DerUtils.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'

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
      assert.ok(contentLines[contentLines.length - 1].length <= 64)
    })
  })
})
