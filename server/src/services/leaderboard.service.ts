import { z } from 'zod';
import { fetchLeaderboard, selectTopTraders } from '../lib/hyperliquid-api';
import ITopTrader from '../types/ITopTrader';

const LEADERBOARD_URL =
    process.env.LEADERBOARD_URL ||
    'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';

// The leaderboard payload is large (~40MB) and only changes slowly, so cache
// the raw rows briefly to avoid re-downloading it on every request.
const CACHE_TTL_MS = Number(process.env.LEADERBOARD_CACHE_TTL_MS) || 60_000;

export const DEFAULT_TOP_TRADERS_LIMIT = 50;
export const MAX_TOP_TRADERS_LIMIT = 500;

export const TopTradersQuerySchema = z.object({
    window: z.enum(['day', 'week', 'month', 'allTime']).default('week'),
    metric: z.enum(['pnl', 'roi', 'vlm']).default('pnl'),
    limit: z.coerce
        .number()
        .int()
        .positive()
        .max(MAX_TOP_TRADERS_LIMIT)
        .default(DEFAULT_TOP_TRADERS_LIMIT),
});

export type TopTradersQueryDto = z.infer<typeof TopTradersQuerySchema>;

export interface TopTradersResult {
    window: TopTradersQueryDto['window'];
    metric: TopTradersQueryDto['metric'];
    count: number;
    traders: ITopTrader[];
}

export class LeaderboardService {
    private cache: {
        rows: Awaited<ReturnType<typeof fetchLeaderboard>>;
        fetchedAt: number;
    } | null = null;

    private async getRows(): Promise<Awaited<ReturnType<typeof fetchLeaderboard>>> {
        const now = Date.now();
        if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
            return this.cache.rows;
        }
        const rows = await fetchLeaderboard(LEADERBOARD_URL);
        this.cache = { rows, fetchedAt: now };
        return rows;
    }

    async getTopTraders(input: TopTradersQueryDto): Promise<TopTradersResult> {
        const rows = await this.getRows();
        const traders = selectTopTraders(
            rows,
            input.window,
            input.metric,
            input.limit,
        );
        return {
            window: input.window,
            metric: input.metric,
            count: traders.length,
            traders,
        };
    }
}
