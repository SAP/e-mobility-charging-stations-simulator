/**
 * CSS token contract.
 *
 * Typography and spacing tokens are provided by `base.css` (shared across all themes).
 * Color tokens (`color-*`) and `color-scheme` must be defined per theme file.
 * When adding a new theme, ensure all `color-*` tokens below are defined in your theme CSS.
 *
 * Every theme file MUST define a value for each token (as `--{token-name}`).
 */
export const TOKEN_CONTRACT = [
  'color-accent',
  'color-bg',
  'color-bg-active',
  'color-bg-button',
  'color-bg-button-hover',
  'color-bg-caption',
  'color-bg-header',
  'color-bg-hover',
  'color-bg-input',
  'color-bg-raised',
  'color-bg-sunken',
  'color-bg-surface',
  'color-border',
  'color-border-row',
  'color-primary',
  'color-shadow-inset',
  'color-state-err',
  'color-state-idle',
  'color-state-ok',
  'color-state-warn',
  'color-text',
  'color-text-muted',
  'color-text-on-button',
  'color-text-strong',
  'font-family',
  'font-size-base',
  'font-size-sm',
  'font-size-xs',
  'spacing-lg',
  'spacing-md',
  'spacing-sm',
  'spacing-xl',
  'spacing-xs',
] as const

export type CssCustomProperty = `--${TokenName}`
export type TokenName = (typeof TOKEN_CONTRACT)[number]

/**
 * Dev-mode runtime check that all required CSS custom properties are defined.
 * Uses requestAnimationFrame to ensure styles are applied before checking.
 * @param source - The composable/module name for the warning prefix (e.g. 'useSkin', 'useTheme')
 * @param contextId - The skin/theme id that was just applied
 */
export function validateTokenContract (source: string, contextId: string): void {
  if (!import.meta.env.DEV || typeof document === 'undefined') return
  requestAnimationFrame(() => {
    const style = getComputedStyle(document.documentElement)
    for (const token of TOKEN_CONTRACT) {
      const prop: CssCustomProperty = `--${token}`
      if (!style.getPropertyValue(prop).trim()) {
        console.warn(`[${source}] Missing CSS token '${prop}' after applying '${contextId}'`)
      }
    }
  })
}
