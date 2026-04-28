import { createRouter, createWebHistory } from 'vue-router'

import { ROUTE_NAMES } from '@/composables'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      component: { render: () => null },
      name: ROUTE_NAMES.CHARGING_STATIONS,
      path: '/',
    },
    {
      components: {
        action: () => import('@/skins/classic/components/actions/AddChargingStations.vue'),
      },
      name: ROUTE_NAMES.ADD_CHARGING_STATIONS,
      path: '/add-charging-stations',
    },
    {
      components: {
        action: () => import('@/skins/classic/components/actions/SetSupervisionUrl.vue'),
      },
      name: ROUTE_NAMES.SET_SUPERVISION_URL,
      path: '/set-supervision-url/:hashId/:chargingStationId',
      props: { action: true },
    },
    {
      components: {
        action: () => import('@/skins/classic/components/actions/StartTransaction.vue'),
      },
      name: ROUTE_NAMES.START_TRANSACTION,
      path: '/start-transaction/:hashId/:chargingStationId/:connectorId',
      props: { action: true },
    },
    {
      components: {
        action: {
          template: '<p style="padding: 1rem; text-align: center;">404 — Page not found</p>',
        },
      },
      name: ROUTE_NAMES.NOT_FOUND,
      path: '/:pathMatch(.*)*',
    },
  ],
})
