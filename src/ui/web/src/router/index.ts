import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import ChargingStationsView from '@/views/ChargingStationsView.vue';

const routes: Array<RouteRecordRaw> = [
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
