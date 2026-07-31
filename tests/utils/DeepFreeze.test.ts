/**
 * @file Tests for DeepFreeze
 * @description Unit tests for the recursive deep-freeze utility.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { deepFreeze } from '../../src/utils/index.js'

await describe('DeepFreeze', async () => {
  await it('should return the same reference it was given', () => {
    const object = { a: 1 }
    assert.strictEqual(deepFreeze(object), object)
  })

  await it('should freeze the top-level object', () => {
    const object = deepFreeze({ a: 1 })
    assert.strictEqual(Object.isFrozen(object), true)
  })

  await it('should recursively freeze nested objects and arrays', () => {
    const object = deepFreeze({ list: [{ x: 1 }], nested: { deep: { value: 1 } } })
    assert.strictEqual(Object.isFrozen(object.nested), true)
    assert.strictEqual(Object.isFrozen(object.nested.deep), true)
    assert.strictEqual(Object.isFrozen(object.list), true)
    assert.strictEqual(Object.isFrozen(object.list[0]), true)
  })

  await it('should make nested mutation throw in strict mode', () => {
    const object = deepFreeze({ nested: { value: 1 } })
    assert.throws(() => {
      object.nested.value = 2
    }, TypeError)
  })

  await it('should return primitives and null unchanged', () => {
    assert.strictEqual(deepFreeze(42), 42)
    assert.strictEqual(deepFreeze('str'), 'str')
    assert.strictEqual(deepFreeze(null), null)
  })

  await it('should be idempotent on an already deep-frozen graph', () => {
    const object = deepFreeze({ nested: { value: 1 } })
    assert.strictEqual(deepFreeze(object), object)
    assert.strictEqual(Object.isFrozen(object.nested), true)
  })

  await it('should freeze children of an already shallow-frozen input', () => {
    const object = Object.freeze({ nested: { value: 1 } })
    assert.strictEqual(Object.isFrozen(object), true)
    assert.strictEqual(Object.isFrozen(object.nested), false)
    deepFreeze(object)
    assert.strictEqual(Object.isFrozen(object.nested), true)
  })

  await it('should terminate and freeze a self-referential graph', () => {
    const object: Record<string, unknown> = { value: 1 }
    object.self = object
    assert.strictEqual(deepFreeze(object), object)
    assert.strictEqual(Object.isFrozen(object), true)
  })

  await it('should freeze symbol-keyed data properties without invoking getters', () => {
    const nestedKey = Symbol('nested')
    const symbolNested = { value: 1 }
    let getterCalls = 0
    const object = {
      get lazy () {
        getterCalls++
        return { value: 1 }
      },
      [nestedKey]: symbolNested,
    }
    deepFreeze(object)
    assert.strictEqual(Object.isFrozen(symbolNested), true)
    assert.strictEqual(getterCalls, 0)
  })

  await it('should freeze non-enumerable string-keyed data properties', () => {
    const hidden = { value: 1 }
    const object = {}
    Object.defineProperty(object, 'hidden', { enumerable: false, value: hidden })
    deepFreeze(object)
    assert.strictEqual(Object.isFrozen(hidden), true)
  })

  await it('should treat array-buffer views as opaque leaves without throwing', () => {
    const object = { view: new Uint8Array([1, 2, 3]) }
    assert.strictEqual(deepFreeze(object), object)
    assert.strictEqual(Object.isFrozen(object), true)
    assert.strictEqual(Object.isFrozen(object.view), false)
  })
})
