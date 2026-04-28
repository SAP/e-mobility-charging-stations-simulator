/**
 * @file registry.test.ts
 * @description Tests for the skin registry exports and structure.
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_SKIN, skins } from '@/shared/skins/registry.js'

describe('skin registry', () => {
  it('exports DEFAULT_SKIN as classic', () => {
    expect(DEFAULT_SKIN).toBe('classic')
  })

  it('exports skins array with at least 2 entries', () => {
    expect(skins.length).toBeGreaterThanOrEqual(2)
  })

  it('includes classic skin', () => {
    const classic = skins.find(s => s.id === 'classic')
    expect(classic).toBeDefined()
    expect(classic?.label).toBe('Classic')
    expect(typeof classic?.loadStyles).toBe('function')
  })

  it('includes modern skin', () => {
    const modern = skins.find(s => s.id === 'modern')
    expect(modern).toBeDefined()
    expect(modern?.label).toBe('Modern')
    expect(typeof modern?.loadStyles).toBe('function')
  })

  it('all skins have required fields', () => {
    for (const skin of skins) {
      expect(typeof skin.id).toBe('string')
      expect(typeof skin.label).toBe('string')
      expect(typeof skin.description).toBe('string')
      expect(typeof skin.loadStyles).toBe('function')
    }
  })

  it('skin ids are unique', () => {
    const ids = skins.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('loadStyles returns a promise for each skin', async () => {
    for (const skin of skins) {
      await expect(skin.loadStyles()).resolves.toBeDefined()
    }
  })
})
