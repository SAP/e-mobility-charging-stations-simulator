import { type RouteRecordRaw, createRouter, createWebHistory } from 'vue-router';
import ChargingStationsView from '@/views/ChargingStationsView.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'charging-stations',
    component: ChargingStationsView,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
