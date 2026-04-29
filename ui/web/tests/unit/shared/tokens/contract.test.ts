/**
 * @file Tests for TOKEN_CONTRACT theme compliance
 * @description Ensures every theme CSS file defines all CSS custom properties declared in TOKEN_CONTRACT.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { TOKEN_CONTRACT } from '@/shared/tokens/contract.js'

const themesDir = resolve(__dirname, '../../../../src/assets/themes')
const themeFiles = ['tokyo-night-storm.css', 'catppuccin-latte.css', 'sap-horizon.css']
const baseCss = readFileSync(resolve(themesDir, 'base.css'), 'utf-8')

describe('TOKEN_CONTRACT', () => {
  it.each(themeFiles)('should define all contract tokens in %s', themeFile => {
    const css = readFileSync(resolve(themesDir, themeFile), 'utf-8') + '\n' + baseCss
    for (const token of TOKEN_CONTRACT) {
      const prop = `--${token}`
      const propRegex = new RegExp(`^\\s*${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'm')
      expect(css, `Missing ${prop} in ${themeFile} or base.css`).toMatch(propRegex)
    }
  })
})
