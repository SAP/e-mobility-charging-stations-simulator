/**
 * CSS token contract.
 *
 * Maps semantic token names to CSS custom property names.
 * Every theme file MUST define a value for each entry.
 * Every skin MUST consume only these tokens for colors, typography, and spacing.
 */
export const TOKEN_CONTRACT = {
  'color-accent': '--color-accent',
  'color-bg': '--color-bg',
  'color-bg-active': '--color-bg-active',
  'color-bg-button': '--color-bg-button',
  'color-bg-button-hover': '--color-bg-button-hover',
  'color-bg-caption': '--color-bg-caption',
  'color-bg-header': '--color-bg-header',
  'color-bg-hover': '--color-bg-hover',
  'color-bg-input': '--color-bg-input',
  'color-bg-raised': '--color-bg-raised',
  'color-bg-sunken': '--color-bg-sunken',
  'color-bg-surface': '--color-bg-surface',
  'color-border': '--color-border',
  'color-border-row': '--color-border-row',
  'color-primary': '--color-primary',
  'color-shadow-inset': '--color-shadow-inset',
  'color-state-err': '--color-state-err',
  'color-state-idle': '--color-state-idle',
  'color-state-ok': '--color-state-ok',
  'color-state-warn': '--color-state-warn',
  'color-text': '--color-text',
  'color-text-muted': '--color-text-muted',
  'color-text-on-button': '--color-text-on-button',
  'color-text-strong': '--color-text-strong',
  'font-family': '--font-family',
  'font-size-base': '--font-size-base',
  'font-size-sm': '--font-size-sm',
  'font-size-xs': '--font-size-xs',
  'spacing-lg': '--spacing-lg',
  'spacing-md': '--spacing-md',
  'spacing-sm': '--spacing-sm',
  'spacing-xl': '--spacing-xl',
  'spacing-xs': '--spacing-xs',
} as const

export type CssCustomProperty = (typeof TOKEN_CONTRACT)[keyof typeof TOKEN_CONTRACT]
export type TokenName = keyof typeof TOKEN_CONTRACT
