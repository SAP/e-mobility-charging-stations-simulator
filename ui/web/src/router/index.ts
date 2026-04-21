/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { createRouter, createWebHistory } from 'vue-router'

import AddChargingStations from '@/components/actions/AddChargingStations.vue'
import SetSupervisionUrl from '@/components/actions/SetSupervisionUrl.vue'
import StartTransaction from '@/components/actions/StartTransaction.vue'
import { ROUTE_NAMES } from '@/composables'
import V2AddStationsDialog from '@/v2/components/dialogs/AddStationsDialog.vue'
import V2AuthorizeDialog from '@/v2/components/dialogs/AuthorizeDialog.vue'
import V2SetSupervisionUrlDialog from '@/v2/components/dialogs/SetSupervisionUrlDialog.vue'
import V2StartTransactionDialog from '@/v2/components/dialogs/StartTransactionDialog.vue'
import { V2_ROUTE_NAMES } from '@/v2/composables/v2Constants'
import V2ChargingStationsView from '@/v2/views/V2ChargingStationsView.vue'
import V2NotFoundView from '@/v2/views/V2NotFoundView.vue'
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
    // ── v2 routes (opt-in, parallel UI) ──────────────────────────────
    {
      components: {
        default: V2ChargingStationsView,
      },
      name: V2_ROUTE_NAMES.V2_CHARGING_STATIONS,
      path: '/v2',
    },
    {
      components: {
        default: V2ChargingStationsView,
        'v2-action': V2AddStationsDialog,
      },
      name: V2_ROUTE_NAMES.V2_ADD_CHARGING_STATIONS,
      path: '/v2/add-charging-stations',
    },
    {
      components: {
        default: V2ChargingStationsView,
        'v2-action': V2SetSupervisionUrlDialog,
      },
      name: V2_ROUTE_NAMES.V2_SET_SUPERVISION_URL,
      path: '/v2/set-supervision-url/:hashId/:chargingStationId',
      props: { default: false, 'v2-action': true },
    },
    {
      components: {
        default: V2ChargingStationsView,
        'v2-action': V2StartTransactionDialog,
      },
      name: V2_ROUTE_NAMES.V2_START_TRANSACTION,
      path: '/v2/start-transaction/:hashId/:chargingStationId/:connectorId',
      props: { default: false, 'v2-action': true },
    },
    {
      components: {
        default: V2ChargingStationsView,
        'v2-action': V2AuthorizeDialog,
      },
      name: V2_ROUTE_NAMES.V2_AUTHORIZE,
      path: '/v2/authorize/:hashId/:chargingStationId',
      props: { default: false, 'v2-action': true },
    },
    {
      components: {
        default: V2NotFoundView,
      },
      name: V2_ROUTE_NAMES.V2_NOT_FOUND,
      path: '/v2/:pathMatch(.*)*',
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
