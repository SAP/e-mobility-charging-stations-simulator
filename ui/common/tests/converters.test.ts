import assert from 'node:assert'
import { describe, it } from 'node:test'

import { convertToBoolean, convertToInt } from '../src/utils/converters.js'

await describe('converters', async () => {
  await describe('convertToBoolean', async () => {
    await it('should return true for boolean true', () => {
      assert.strictEqual(convertToBoolean(true), true)
    })

    await it('should return false for boolean false', () => {
      assert.strictEqual(convertToBoolean(false), false)
    })

    await it('should return true for string "true"', () => {
      assert.strictEqual(convertToBoolean('true'), true)
    })

    await it('should return true for string "True"', () => {
      assert.strictEqual(convertToBoolean('True'), true)
    })

    await it('should return true for string "TRUE"', () => {
      assert.strictEqual(convertToBoolean('TRUE'), true)
    })

    await it('should return true for string "1"', () => {
      assert.strictEqual(convertToBoolean('1'), true)
    })

    await it('should return true for numeric 1', () => {
      assert.strictEqual(convertToBoolean(1), true)
    })

    await it('should return false for string "false"', () => {
      assert.strictEqual(convertToBoolean('false'), false)
    })

    await it('should return false for string "0"', () => {
      assert.strictEqual(convertToBoolean('0'), false)
    })

    await it('should return false for numeric 0', () => {
      assert.strictEqual(convertToBoolean(0), false)
    })

    await it('should return false for numeric 2', () => {
      assert.strictEqual(convertToBoolean(2), false)
    })

    await it('should return false for null', () => {
      assert.strictEqual(convertToBoolean(null), false)
    })

    await it('should return false for undefined', () => {
      assert.strictEqual(convertToBoolean(undefined), false)
    })

    await it('should return false for empty string', () => {
      assert.strictEqual(convertToBoolean(''), false)
    })

    await it('should return false for arbitrary string', () => {
      assert.strictEqual(convertToBoolean('hello'), false)
    })

    await it('should return true for whitespace-padded " true "', () => {
      assert.strictEqual(convertToBoolean(' true '), true)
    })

    await it('should return true for whitespace-padded " 1 "', () => {
      assert.strictEqual(convertToBoolean(' 1 '), true)
    })
  })

  await describe('convertToInt', async () => {
    await it('should return integer for integer input', () => {
      assert.strictEqual(convertToInt(42), 42)
    })

    await it('should truncate float 42.7 to 42', () => {
      assert.strictEqual(convertToInt(42.7), 42)
    })

    await it('should truncate float -42.7 to -42', () => {
      assert.strictEqual(convertToInt(-42.7), -42)
    })

    await it('should parse string integer "42"', () => {
      assert.strictEqual(convertToInt('42'), 42)
    })

    await it('should parse string integer "-42"', () => {
      assert.strictEqual(convertToInt('-42'), -42)
    })

    await it('should return 0 for null', () => {
      assert.strictEqual(convertToInt(null), 0)
    })

    await it('should return 0 for undefined', () => {
      assert.strictEqual(convertToInt(undefined), 0)
    })

    await it('should throw Error for non-numeric string "abc"', () => {
      assert.throws(() => {
        convertToInt('abc')
      }, Error)
    })

    await it('should throw Error for empty string', () => {
      assert.throws(() => {
        convertToInt('')
      }, Error)
    })
  })
})
