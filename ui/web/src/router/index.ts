import { createRouter, createWebHistory } from 'vue-router'
import ChargingStationsView from '@/views/ChargingStationsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'charging-stations',
      components: {
        default: ChargingStationsView
      }
    }
  ]
})
