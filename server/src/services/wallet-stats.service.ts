import {
    fetchUserFills,
    computeTraderStats,
    TraderStats,
} from '../lib/hyperliquid-api';

const INFO_API_URL =
    process.env.HYPERLIQUID_INFO_API_URL || 'https://api.hyperliquid.xyz/info';

export interface WalletStatsResult {
    address: string;
    stats: TraderStats;
}

export class WalletStatsService {
    async getStats(address: string): Promise<WalletStatsResult> {
        const fills = await fetchUserFills(INFO_API_URL, address);
        return { address, stats: computeTraderStats(fills) };
    }
}
