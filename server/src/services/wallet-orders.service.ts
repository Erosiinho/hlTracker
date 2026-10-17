import {
    fetchFrontendOpenOrders,
    normalizeOpenOrders,
    OpenOrder,
} from '../lib/hyperliquid-api';

const INFO_API_URL =
    process.env.HYPERLIQUID_INFO_API_URL || 'https://api.hyperliquid.xyz/info';

export interface WalletOrdersResult {
    address: string;
    count: number;
    orders: OpenOrder[];
}

export class WalletOrdersService {
    async getOpenOrders(address: string): Promise<WalletOrdersResult> {
        const raw = await fetchFrontendOpenOrders(INFO_API_URL, address);
        const orders = normalizeOpenOrders(raw);
        // Resting triggers (TP/SL) and limits read best grouped by coin, then
        // by price.
        orders.sort((a, b) =>
            a.coin === b.coin ? b.price - a.price : a.coin.localeCompare(b.coin),
        );
        return { address, count: orders.length, orders };
    }
}
