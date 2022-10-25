import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import ChargingStationsView from '@/views/ChargingStationsView.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'charging-stations',
    component: ChargingStationsView,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
