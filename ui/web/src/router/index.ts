import { createRouter, createWebHistory } from 'vue-router'
import ChargingStationsView from '@/views/ChargingStationsView.vue'
import StartTransaction from '@/components/actions/StartTransaction.vue'
import AddChargingStations from '@/components/actions/AddChargingStations.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'charging-stations',
      components: {
        default: ChargingStationsView
      }
    },
    {
      path: '/add-charging-stations',
      name: 'add-charging-stations',
      components: {
        default: ChargingStationsView,
        action: AddChargingStations
      }
    },
    {
      path: '/start-transaction/:hashId/:chargingStationId/:connectorId',
      name: 'start-transaction',
      components: {
        default: ChargingStationsView,
        action: StartTransaction
      },
      props: { default: false, action: true }
    }
  ]
})
