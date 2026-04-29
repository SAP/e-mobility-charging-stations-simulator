/**
 * @file contract.test.ts
 * @description Ensures every theme CSS file defines all CSS custom properties declared in TOKEN_CONTRACT.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { TOKEN_CONTRACT } from '@/shared/tokens/contract.js'

const themesDir = resolve(__dirname, '../../../../src/assets/themes')
const themeFiles = ['tokyo-night-storm.css', 'catppuccin-latte.css', 'sap-horizon.css']
const requiredProperties = Object.values(TOKEN_CONTRACT)

describe('TOKEN_CONTRACT theme compliance', () => {
  for (const themeFile of themeFiles) {
    it(`should define all contract tokens in ${themeFile}`, () => {
      const css = readFileSync(resolve(themesDir, themeFile), 'utf-8')
      for (const prop of requiredProperties) {
        expect(css, `Missing ${prop} in ${themeFile}`).toContain(`${prop}:`)
      }
    })
  }
})
