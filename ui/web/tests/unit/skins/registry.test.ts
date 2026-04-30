/**
 * @file Tests for skin registry
 * @description Tests for the skin registry exports and structure.
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_SKIN } from '@/core/index.js'
import { skins } from '@/skins/registry.js'

describe('registry', () => {
  it('should export DEFAULT_SKIN as modern', () => {
    expect(DEFAULT_SKIN).toBe('modern')
  })

  it('should export skins array with exactly 2 entries', () => {
    expect(skins.length).toBe(2)
  })

  it('should include classic skin', () => {
    const classic = skins.find(s => s.id === 'classic')
    expect(classic).toBeDefined()
    expect(classic?.label).toBe('Classic')
    expect(typeof classic?.loadStyles).toBe('function')
  })

  it('should include modern skin', () => {
    const modern = skins.find(s => s.id === 'modern')
    expect(modern).toBeDefined()
    expect(modern?.label).toBe('Modern')
    expect(typeof modern?.loadStyles).toBe('function')
  })

  it('should have required fields for all skins', () => {
    for (const skin of skins) {
      expect(typeof skin.id).toBe('string')
      expect(typeof skin.label).toBe('string')
      expect(typeof skin.loadStyles).toBe('function')
    }
  })

  it('should have unique skin ids', () => {
    const ids = skins.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('should return a promise from loadStyles for each skin', async () => {
    for (const skin of skins) {
      await expect(skin.loadStyles()).resolves.toBeDefined()
    }
  })

  it('should resolve loadLayout to a valid component module', async () => {
    for (const skin of skins) {
      const mod = await skin.loadLayout()
      expect(mod).toBeDefined()
      expect(mod.default).toBeDefined()
      expect(typeof mod.default === 'object' || typeof mod.default === 'function').toBe(true)
    }
  })
})
