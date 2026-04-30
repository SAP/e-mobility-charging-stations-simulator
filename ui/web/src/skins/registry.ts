/**
 * Skin registry.
 *
 * Single source of truth for available skins.
 * Each skin carries metadata and a lazy CSS loader for code splitting.
 *
 * Convention: All skin CSS MUST scope rules to `html[data-skin='<id>']` to prevent
 * style bleeding when multiple skin stylesheets are loaded in the DOM simultaneously.
 */

import type { Component } from 'vue'

import { type SKIN_IDS } from 'ui-common'

export interface SkinDefinition {
  /** Unique identifier used in localStorage and config.json. */
  readonly id: (typeof SKIN_IDS)[number]
  /** Display label shown in the UI switcher. */
  readonly label: string
  /** Lazy-loads the skin's root layout component. */
  readonly loadLayout: () => Promise<{ default: Component }>
  /** Lazy-loads the skin's structural CSS file. */
  readonly loadStyles: () => Promise<unknown>
}

export const skins: readonly SkinDefinition[] = [
  {
    id: 'classic',
    label: 'Classic',
    loadLayout: () => import('@/skins/classic/ClassicLayout.vue'),
    loadStyles: () => import('@/skins/classic/classic.css'),
  },
  {
    id: 'modern',
    label: 'Modern',
    loadLayout: () => import('@/skins/modern/ModernLayout.vue'),
    loadStyles: () => import('@/skins/modern/modern.css'),
  },
] as const
