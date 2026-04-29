/**
 * CSS token contract.
 *
 * Color tokens are mandatory for all skins. Typography and spacing tokens are
 * theme defaults that skins MAY override with their own structural tokens
 * (e.g., --skin-space-*, --skin-font).
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
