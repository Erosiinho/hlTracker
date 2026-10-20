import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/api';
import type {
    CoinPositioning,
    LeaderboardWindow,
    LeaderboardMetric,
} from '@/api/types';

export const useSmartMoneyStore = defineStore('smartMoney', () => {
    const coins = ref<CoinPositioning[]>([]);
    const window = ref<LeaderboardWindow>('week');
    const metric = ref<LeaderboardMetric>('pnl');
    const traders = ref(30);
    const tradersAnalyzed = ref(0);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const hasLoaded = ref(false);

    async function fetchSmartMoney() {
        loading.value = true;
        error.value = null;
        try {
            const result = await api.smartMoney.get({
                window: window.value,
                metric: metric.value,
                traders: traders.value,
            });
            coins.value = result.coins;
            tradersAnalyzed.value = result.tradersAnalyzed;
        } catch (e) {
            error.value = (e as Error).message;
            coins.value = [];
            tradersAnalyzed.value = 0;
        } finally {
            hasLoaded.value = true;
            loading.value = false;
        }
    }

    return {
        coins,
        window,
        metric,
        traders,
        tradersAnalyzed,
        loading,
        error,
        hasLoaded,
        fetchSmartMoney,
    };
});
