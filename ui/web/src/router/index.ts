/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { createRouter, createWebHistory } from 'vue-router'

import AddChargingStations from '@/components/actions/AddChargingStations.vue'
import SetSupervisionUrl from '@/components/actions/SetSupervisionUrl.vue'
import StartTransaction from '@/components/actions/StartTransaction.vue'
import ChargingStationsView from '@/views/ChargingStationsView.vue'
import NotFoundView from '@/views/NotFoundView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      components: {
        default: ChargingStationsView,
      },
      name: 'charging-stations',
      path: '/',
    },
    {
      components: {
        action: AddChargingStations,
        default: ChargingStationsView,
      },
      name: 'add-charging-stations',
      path: '/add-charging-stations',
    },
    {
      components: {
        action: SetSupervisionUrl,
        default: ChargingStationsView,
      },
      name: 'set-supervision-url',
      path: '/set-supervision-url/:hashId/:chargingStationId',
      props: { action: true, default: false },
    },
    {
      components: {
        action: StartTransaction,
        default: ChargingStationsView,
      },
      name: 'start-transaction',
      path: '/start-transaction/:hashId/:chargingStationId/:connectorId',
      props: { action: true, default: false },
    },
    {
      components: {
        default: NotFoundView,
      },
      name: 'not-found',
      path: '/:pathMatch(.*)*',
    },
  ],
})
