/**
 * @file Tests for router configuration
 * @description Tests for the skin-aware router guard (skinOnly meta).
 */
import { describe, expect, it, vi } from 'vitest'

import { ROUTE_NAMES } from '@/core'
import { router } from '@/router/index.js'

vi.mock('@/shared/composables/useSkin.js', async importOriginal => {
  const { readonly, ref } = await import('vue')
  const activeSkinId = ref('modern')
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    SKIN_STORAGE_KEY: 'ecs-ui-skin',
    useSkin: () => ({
      activeSkinId: readonly(activeSkinId),
      isSwitching: readonly(ref(false)),
      lastError: readonly(ref(null)),
      skins: [],
      switchSkin: vi.fn(),
    }),
  }
})

describe('router', () => {
  it('should redirect classic-only routes when active skin is not classic', async () => {
    await router.push('/add-charging-stations')
    expect(router.currentRoute.value.name).toBe(ROUTE_NAMES.CHARGING_STATIONS)
  })

  it('should allow non-guarded routes regardless of skin', async () => {
    await router.push('/')
    expect(router.currentRoute.value.name).toBe(ROUTE_NAMES.CHARGING_STATIONS)
  })
})
