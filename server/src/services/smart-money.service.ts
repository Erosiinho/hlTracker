import { z } from 'zod';
import pLimit from 'p-limit';
import { LeaderboardService } from './leaderboard.service';
import { WalletPositionsService } from './wallet-positions.service';

// clearinghouseState is fetched live per trader, so keep concurrency modest to
// avoid rate-limiting (HTTP 429) on Hyperliquid's free public API.
const CONCURRENCY = Number(process.env.SMART_MONEY_CONCURRENCY) || 5;
const CACHE_TTL_MS = Number(process.env.SMART_MONEY_CACHE_TTL_MS) || 60_000;

export const DEFAULT_TRADERS = 30;
export const MAX_TRADERS = 100;

export const SmartMoneyQuerySchema = z.object({
    window: z.enum(['day', 'week', 'month', 'allTime']).default('week'),
    metric: z.enum(['pnl', 'roi', 'vlm']).default('pnl'),
    traders: z.coerce
        .number()
        .int()
        .positive()
        .max(MAX_TRADERS)
        .default(DEFAULT_TRADERS),
});

export type SmartMoneyQueryDto = z.infer<typeof SmartMoneyQuerySchema>;

export interface CoinPositioning {
    coin: string;
    traderCount: number;
    longCount: number;
    shortCount: number;
    longNotional: number;
    shortNotional: number;
    totalNotional: number;
    netNotional: number;
    netSide: 'long' | 'short';
}

export interface SmartMoneyResult {
    window: SmartMoneyQueryDto['window'];
    metric: SmartMoneyQueryDto['metric'];
    tradersRequested: number;
    tradersAnalyzed: number;
    coins: CoinPositioning[];
}

interface TraderPositions {
    coin: string;
    side: 'long' | 'short';
    positionValue?: number | null;
}

/**
 * Aggregates per-coin directional positioning across a set of traders. Each
 * coin row reports how many traders are long vs short and the net notional
 * (long minus short), sorted by total notional so the most-crowded markets
 * lead. Positions with a null notional count toward the side tally but
 * contribute 0 to notional sums.
 */
export function aggregatePositioning(
    perTrader: TraderPositions[][],
): CoinPositioning[] {
    const byCoin = new Map<string, CoinPositioning>();

    for (const positions of perTrader) {
        for (const position of positions) {
            let row = byCoin.get(position.coin);
            if (!row) {
                row = {
                    coin: position.coin,
                    traderCount: 0,
                    longCount: 0,
                    shortCount: 0,
                    longNotional: 0,
                    shortNotional: 0,
                    totalNotional: 0,
                    netNotional: 0,
                    netSide: 'long',
                };
                byCoin.set(position.coin, row);
            }
            const notional = position.positionValue ?? 0;
            row.traderCount += 1;
            if (position.side === 'long') {
                row.longCount += 1;
                row.longNotional += notional;
            } else {
                row.shortCount += 1;
                row.shortNotional += notional;
            }
        }
    }

    const coins = Array.from(byCoin.values());
    for (const row of coins) {
        row.totalNotional = row.longNotional + row.shortNotional;
        row.netNotional = row.longNotional - row.shortNotional;
        row.netSide = row.netNotional >= 0 ? 'long' : 'short';
    }
    return coins.sort((a, b) => b.totalNotional - a.totalNotional);
}

export class SmartMoneyService {
    private cache = new Map<
        string,
        { result: SmartMoneyResult; fetchedAt: number }
    >();

    constructor(
        private readonly leaderboardService: LeaderboardService,
        private readonly walletPositionsService: WalletPositionsService,
    ) {}

    async getSmartMoney(input: SmartMoneyQueryDto): Promise<SmartMoneyResult> {
        const key = `${input.window}:${input.metric}:${input.traders}`;
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            return cached.result;
        }

        const { traders } = await this.leaderboardService.getTopTraders({
            window: input.window,
            metric: input.metric,
            limit: input.traders,
        });

        const limit = pLimit(CONCURRENCY);
        const settled = await Promise.all(
            traders.map((trader) =>
                limit(async () => {
                    try {
                        const { positions } =
                            await this.walletPositionsService.getOpenPositions(
                                trader.address,
                            );
                        return positions;
                    } catch {
                        // Tolerate per-wallet failures so one bad response
                        // doesn't sink the whole aggregate.
                        return null;
                    }
                }),
            ),
        );

        const perTrader = settled.filter(
            (p): p is NonNullable<typeof p> => p !== null,
        );

        const result: SmartMoneyResult = {
            window: input.window,
            metric: input.metric,
            tradersRequested: traders.length,
            tradersAnalyzed: perTrader.length,
            coins: aggregatePositioning(perTrader),
        };

        this.cache.set(key, { result, fetchedAt: Date.now() });
        return result;
    }
}
