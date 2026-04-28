/**
 * Skin registry.
 *
 * Single source of truth for available skins.
 * Each skin carries metadata and a lazy CSS loader for code splitting.
 */

import type { Component } from 'vue'

export interface SkinDefinition {
  /** Short description of the layout style. */
  readonly description: string
  /** Unique identifier used in localStorage and config.json. */
  readonly id: string
  /** Display label shown in the UI switcher. */
  readonly label: string
  /** Lazy-loads the skin's root layout component. */
  readonly loadLayout: () => Promise<{ default: Component }>
  /** Lazy-loads the skin's structural CSS file. */
  readonly loadStyles: () => Promise<unknown>
}

export const DEFAULT_SKIN = 'classic'

export const skins: readonly SkinDefinition[] = [
  {
    description: 'Table-based layout with a sticky sidebar action panel.',
    id: 'classic',
    label: 'Classic',
    loadLayout: () => import('@/skins/classic/ClassicLayout.vue'),
    loadStyles: async () => {
      return import('@/skins/classic/classic.css')
    },
  },
  {
    description: 'Responsive card grid with modal dialogs.',
    id: 'modern',
    label: 'Modern',
    loadLayout: () => import('@/skins/modern/ModernLayout.vue'),
    loadStyles: async () => {
      return import('@/skins/modern/modern.css')
    },
  },
] as const
