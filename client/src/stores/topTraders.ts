import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/api';
import type {
    ITopTrader,
    LeaderboardWindow,
    LeaderboardMetric,
} from '@/api/types';

export const useTopTradersStore = defineStore('topTraders', () => {
    const traders = ref<ITopTrader[]>([]);
    const window = ref<LeaderboardWindow>('week');
    const metric = ref<LeaderboardMetric>('pnl');
    const limit = ref(50);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const hasLoaded = ref(false);

    async function fetchTopTraders() {
        loading.value = true;
        error.value = null;
        try {
            const result = await api.topTraders.get({
                window: window.value,
                metric: metric.value,
                limit: limit.value,
            });
            traders.value = result.traders;
        } catch (e) {
            error.value = (e as Error).message;
            traders.value = [];
        } finally {
            hasLoaded.value = true;
            loading.value = false;
        }
    }

    return {
        traders,
        window,
        metric,
        limit,
        loading,
        error,
        hasLoaded,
        fetchTopTraders,
    };
});
