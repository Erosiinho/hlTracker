import TopTradersView from '@/components/TopTradersView.vue';
import SmartMoneyView from '@/components/SmartMoneyView.vue';
import { createRouter, createWebHistory } from 'vue-router';

const routes = [
    { path: '/', component: TopTradersView, name: 'Top traders' },
    { path: '/smart-money', component: SmartMoneyView, name: 'Smart money' },
];

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
});

export default router;
