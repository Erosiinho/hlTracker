import TopTradersView from '@/components/TopTradersView.vue';
import SmartMoneyView from '@/components/SmartMoneyView.vue';
import FundingView from '@/components/FundingView.vue';
import LiquidationsView from '@/components/LiquidationsView.vue';
import WalletView from '@/components/WalletView.vue';
import { createRouter, createWebHistory } from 'vue-router';

const routes = [
    { path: '/', component: TopTradersView, name: 'Top traders' },
    { path: '/smart-money', component: SmartMoneyView, name: 'Smart money' },
    { path: '/funding', component: FundingView, name: 'Funding' },
    { path: '/liquidations', component: LiquidationsView, name: 'Liquidations' },
    { path: '/wallet/:address', component: WalletView, name: 'Wallet' },
];

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
});

export default router;
