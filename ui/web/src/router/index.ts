/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { createRouter, createWebHistory } from 'vue-router'

import AddChargingStations from '@/components/actions/AddChargingStations.vue'
import SetSupervisionUrl from '@/components/actions/SetSupervisionUrl.vue'
import StartTransaction from '@/components/actions/StartTransaction.vue'
import { ROUTE_NAMES } from '@/composables'
import ChargingStationsView from '@/views/ChargingStationsView.vue'
import NotFoundView from '@/views/NotFoundView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      components: {
        default: ChargingStationsView,
      },
      name: ROUTE_NAMES.CHARGING_STATIONS,
      path: '/',
    },
    {
      components: {
        action: AddChargingStations,
        default: ChargingStationsView,
      },
      name: ROUTE_NAMES.ADD_CHARGING_STATIONS,
      path: '/add-charging-stations',
    },
    {
      components: {
        action: SetSupervisionUrl,
        default: ChargingStationsView,
      },
      name: ROUTE_NAMES.SET_SUPERVISION_URL,
      path: '/set-supervision-url/:hashId/:chargingStationId',
      props: { action: true, default: false },
    },
    {
      components: {
        action: StartTransaction,
        default: ChargingStationsView,
      },
      name: ROUTE_NAMES.START_TRANSACTION,
      path: '/start-transaction/:hashId/:chargingStationId/:connectorId',
      props: { action: true, default: false },
    },
    {
      components: {
        default: NotFoundView,
      },
      name: ROUTE_NAMES.NOT_FOUND,
      path: '/:pathMatch(.*)*',
    },
  ],
})
