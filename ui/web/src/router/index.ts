import { type SKIN_IDS } from 'ui-common'
import { h } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { useToast } from 'vue-toast-notification'

import { ROUTE_NAMES } from '@/composables'
import { useSkin } from '@/shared/composables/useSkin.js'
import { DEFAULT_SKIN } from '@/skins/registry.js'

declare module 'vue-router' {
  interface RouteMeta {
    skinOnly?: (typeof SKIN_IDS)[number]
  }
}

/** Placeholder component for routes where the skin layout handles all rendering. */
const PassthroughRoute = { render: () => null } as const

/**
 * Routes serve the classic skin's action panel (sidebar forms via named `action` view).
 * The modern skin uses modal dialogs instead of router navigation.
 * The home route (`/`) renders null because layout components handle content directly.
 * Routes with `meta.skinOnly` are guarded and redirect to `/` for other skins.
 *
 * NOTE: Classic action routes directly import from `@/skins/classic/components/actions/`.
 * This coupling is intentional — only the classic skin uses router-based navigation panels.
 * If a third skin needs router-based panels, consider a dynamic route registration pattern.
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      component: PassthroughRoute,
      name: ROUTE_NAMES.CHARGING_STATIONS,
      path: '/',
    },
    {
      components: {
        action: () => import('@/skins/classic/components/actions/AddChargingStations.vue'),
      },
      meta: { skinOnly: DEFAULT_SKIN },
      name: ROUTE_NAMES.ADD_CHARGING_STATIONS,
      path: '/add-charging-stations',
    },
    {
      components: {
        action: () => import('@/skins/classic/components/actions/SetSupervisionUrl.vue'),
      },
      meta: { skinOnly: DEFAULT_SKIN },
      name: ROUTE_NAMES.SET_SUPERVISION_URL,
      path: '/set-supervision-url/:hashId/:chargingStationId',
      props: { action: true },
    },
    {
      components: {
        action: () => import('@/skins/classic/components/actions/StartTransaction.vue'),
      },
      meta: { skinOnly: DEFAULT_SKIN },
      name: ROUTE_NAMES.START_TRANSACTION,
      path: '/start-transaction/:hashId/:chargingStationId/:connectorId',
      props: { action: true },
    },
    {
      component: {
        render: () =>
          h(
            'p',
            {
              style:
                'padding: var(--spacing-md, 1rem); text-align: center; color: var(--color-text, inherit)',
            },
            '404 — Page not found'
          ),
      },
      name: ROUTE_NAMES.NOT_FOUND,
      path: '/:pathMatch(.*)*',
    },
  ],
})

router.beforeEach(to => {
  if (to.meta.skinOnly != null) {
    const { activeSkinId } = useSkin()
    if (to.meta.skinOnly !== activeSkinId.value) {
      const $toast = useToast()
      $toast.info('This page is not available in the current skin.')
      return { name: ROUTE_NAMES.CHARGING_STATIONS }
    }
  }
})
