import type {
    TopTradersQuery,
    TopTradersResult,
    WalletPositionsResult,
    WalletStatsResult,
    WalletOrdersResult,
    SmartMoneyQuery,
    SmartMoneyResult,
    FundingResult,
} from './types';

const API_BASE_URL =
    import.meta.env.VITE_API_URL || 'http://192.168.68.3:3000/api';

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const error = await response
            .json()
            .catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'API Error');
    }
    return response.json();
}

export const api = {
    topTraders: {
        async get(query: TopTradersQuery): Promise<TopTradersResult> {
            const params = new URLSearchParams({
                window: query.window,
                metric: query.metric,
                limit: String(query.limit),
            });
            const response = await fetch(
                `${API_BASE_URL}/top-traders?${params.toString()}`,
            );
            return handleResponse<TopTradersResult>(response);
        },
    },

    wallets: {
        async getPositions(address: string): Promise<WalletPositionsResult> {
            const response = await fetch(
                `${API_BASE_URL}/wallets/${address}/positions`,
            );
            return handleResponse<WalletPositionsResult>(response);
        },

        async getStats(address: string): Promise<WalletStatsResult> {
            const response = await fetch(
                `${API_BASE_URL}/wallets/${address}/stats`,
            );
            return handleResponse<WalletStatsResult>(response);
        },

        async getOrders(address: string): Promise<WalletOrdersResult> {
            const response = await fetch(
                `${API_BASE_URL}/wallets/${address}/orders`,
            );
            return handleResponse<WalletOrdersResult>(response);
        },
    },

    funding: {
        async get(): Promise<FundingResult> {
            const response = await fetch(`${API_BASE_URL}/funding`);
            return handleResponse<FundingResult>(response);
        },
    },

    smartMoney: {
        async get(query: SmartMoneyQuery): Promise<SmartMoneyResult> {
            const params = new URLSearchParams({
                window: query.window,
                metric: query.metric,
                traders: String(query.traders),
            });
            const response = await fetch(
                `${API_BASE_URL}/smart-money?${params.toString()}`,
            );
            return handleResponse<SmartMoneyResult>(response);
        },
    },
};
