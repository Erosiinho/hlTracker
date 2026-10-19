import { z } from 'zod';
import pLimit from 'p-limit';
import { LeaderboardService } from './leaderboard.service';
import { WalletPositionsService } from './wallet-positions.service';
import { MarketService } from './market.service';
import IMarketContext from '../types/IMarketContext';

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

    // Tier 3 — conviction & consensus.
    // Leverage-weighted notional (sum of notional * leverage) per side, and the
    // net: a side that is both bigger and more levered dominates.
    longWeighted: number;
    shortWeighted: number;
    netWeighted: number;
    // Fraction of traders on the majority side (0.5 = split, 1 = unanimous).
    agreement: number;
    // Notional-weighted average entry price per side — the smart-money cost
    // basis. Null when nobody holds that side.
    avgEntryLong: number | null;
    avgEntryShort: number | null;
    // Notional-weighted average liquidation price per side.
    avgLiqLong: number | null;
    avgLiqShort: number | null;

    // Tier 2 — market context (merged in by the service; null if unavailable).
    markPx?: number | null;
    funding?: number | null;
    openInterest?: number | null;
    // openInterest * markPx.
    oiNotional?: number | null;
    // Smart-money total notional / OI notional — how much of the market the
    // tracked wallets represent.
    smartMoneyOiShare?: number | null;
    // 24h price change as a fraction.
    dayChange?: number | null;

    // Liquidation cascade map: tracked wallets' liquidation notional bucketed
    // by distance from mark. Longs liquidate below mark (negative offset),
    // shorts above. Requires a mark price; null otherwise.
    liqClusters?: LiqCluster[] | null;

    // Internal: raw liquidation points carried from aggregation to the market
    // merge (which has the mark price). Stripped before the response.
    liqPoints?: LiqPoint[];
}

export interface LiqCluster {
    // Bucket centre as a fraction offset from mark (-0.05 = 5% below mark).
    offsetPct: number;
    longNotional: number;
    shortNotional: number;
}

interface LiqPoint {
    px: number;
    notional: number;
    side: 'long' | 'short';
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
    leverage?: number;
    entryPrice?: number;
    liquidationPx?: number | null;
}

// Running notional-weighted accumulators, discarded before the result is
// returned.
interface CoinAccumulator {
    row: CoinPositioning;
    entryLongW: number; // sum(entry * notional) long
    entryShortW: number;
    liqLongW: number; // sum(liq * notional) long
    liqLongN: number; // sum(notional) for positions that had a liq px
    liqShortW: number;
    liqShortN: number;
    liqPoints: LiqPoint[];
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
    const byCoin = new Map<string, CoinAccumulator>();

    for (const positions of perTrader) {
        for (const position of positions) {
            let acc = byCoin.get(position.coin);
            if (!acc) {
                acc = {
                    row: {
                        coin: position.coin,
                        traderCount: 0,
                        longCount: 0,
                        shortCount: 0,
                        longNotional: 0,
                        shortNotional: 0,
                        totalNotional: 0,
                        netNotional: 0,
                        netSide: 'long',
                        longWeighted: 0,
                        shortWeighted: 0,
                        netWeighted: 0,
                        agreement: 1,
                        avgEntryLong: null,
                        avgEntryShort: null,
                        avgLiqLong: null,
                        avgLiqShort: null,
                    },
                    entryLongW: 0,
                    entryShortW: 0,
                    liqLongW: 0,
                    liqLongN: 0,
                    liqShortW: 0,
                    liqShortN: 0,
                    liqPoints: [],
                };
                byCoin.set(position.coin, acc);
            }
            const { row } = acc;
            const notional = position.positionValue ?? 0;
            const leverage = position.leverage ?? 0;
            const entry = position.entryPrice;
            const liq = position.liquidationPx;
            if (liq != null && notional > 0) {
                acc.liqPoints.push({ px: liq, notional, side: position.side });
            }
            row.traderCount += 1;
            if (position.side === 'long') {
                row.longCount += 1;
                row.longNotional += notional;
                row.longWeighted += notional * leverage;
                if (entry != null) acc.entryLongW += entry * notional;
                if (liq != null) {
                    acc.liqLongW += liq * notional;
                    acc.liqLongN += notional;
                }
            } else {
                row.shortCount += 1;
                row.shortNotional += notional;
                row.shortWeighted += notional * leverage;
                if (entry != null) acc.entryShortW += entry * notional;
                if (liq != null) {
                    acc.liqShortW += liq * notional;
                    acc.liqShortN += notional;
                }
            }
        }
    }

    const coins = Array.from(byCoin.values()).map((acc) => {
        const { row } = acc;
        row.totalNotional = row.longNotional + row.shortNotional;
        row.netNotional = row.longNotional - row.shortNotional;
        row.netSide = row.netNotional >= 0 ? 'long' : 'short';
        row.netWeighted = row.longWeighted - row.shortWeighted;
        row.agreement =
            row.traderCount > 0
                ? Math.max(row.longCount, row.shortCount) / row.traderCount
                : 1;
        row.avgEntryLong =
            row.longNotional > 0 ? acc.entryLongW / row.longNotional : null;
        row.avgEntryShort =
            row.shortNotional > 0 ? acc.entryShortW / row.shortNotional : null;
        row.avgLiqLong =
            acc.liqLongN > 0 ? acc.liqLongW / acc.liqLongN : null;
        row.avgLiqShort =
            acc.liqShortN > 0 ? acc.liqShortW / acc.liqShortN : null;
        row.liqPoints = acc.liqPoints;
        return row;
    });
    return coins.sort((a, b) => b.totalNotional - a.totalNotional);
}

/**
 * Buckets liquidation points by their distance from mark into fixed-width
 * bins, summing notional per side. Longs land below mark (negative offset),
 * shorts above. Extreme outliers are clamped to ±`cap` (default 500%) so one
 * far-off liquidation can't skew the scale, but nothing is dropped — top
 * traders run low leverage, so their liquidations sit far from price and a
 * tight range would leave the map empty. The client scales to the actual
 * span. Pure and exported for direct testing.
 */
export function buildLiquidationClusters(
    points: LiqPoint[],
    markPx: number,
    binPct = 0.05,
    cap = 5,
): LiqCluster[] {
    if (!(markPx > 0)) return [];
    const byBin = new Map<number, LiqCluster>();
    for (const p of points) {
        let offset = (p.px - markPx) / markPx;
        if (!Number.isFinite(offset)) continue;
        offset = Math.max(-cap, Math.min(cap, offset));
        // Snap to bin centre so nearby liquidations stack into one zone.
        const bin = Math.round(offset / binPct) * binPct;
        const key = Math.round(bin / binPct);
        let cluster = byBin.get(key);
        if (!cluster) {
            cluster = { offsetPct: bin, longNotional: 0, shortNotional: 0 };
            byBin.set(key, cluster);
        }
        if (p.side === 'long') cluster.longNotional += p.notional;
        else cluster.shortNotional += p.notional;
    }
    return Array.from(byBin.values()).sort((a, b) => a.offsetPct - b.offsetPct);
}

/**
 * Merges per-coin market context (mark, funding, OI) into positioning rows.
 * Mutates and returns the same rows. Rows whose coin is absent from the
 * context map are left with null market fields.
 */
export function mergeMarketContext(
    coins: CoinPositioning[],
    contexts: Map<string, IMarketContext>,
): CoinPositioning[] {
    for (const row of coins) {
        const ctx = contexts.get(row.coin);
        const points = row.liqPoints ?? [];
        // Internal field never belongs in the response.
        delete row.liqPoints;
        if (!ctx) {
            row.liqClusters = null;
            continue;
        }
        row.markPx = ctx.markPx;
        row.funding = ctx.funding;
        row.openInterest = ctx.openInterest;
        row.oiNotional =
            ctx.openInterest != null && ctx.markPx != null
                ? ctx.openInterest * ctx.markPx
                : null;
        row.smartMoneyOiShare =
            row.oiNotional != null && row.oiNotional > 0
                ? row.totalNotional / row.oiNotional
                : null;
        row.dayChange =
            ctx.prevDayPx != null && ctx.prevDayPx > 0 && ctx.markPx != null
                ? (ctx.markPx - ctx.prevDayPx) / ctx.prevDayPx
                : null;
        row.liqClusters =
            ctx.markPx != null
                ? buildLiquidationClusters(points, ctx.markPx)
                : null;
    }
    return coins;
}

export class SmartMoneyService {
    private cache = new Map<
        string,
        { result: SmartMoneyResult; fetchedAt: number }
    >();

    constructor(
        private readonly leaderboardService: LeaderboardService,
        private readonly walletPositionsService: WalletPositionsService,
        private readonly marketService: MarketService,
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
        // Fetch per-trader positions and the (cached) market context together.
        const [settled, contexts] = await Promise.all([
            Promise.all(
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
            ),
            // A missing market snapshot must not sink positioning data.
            this.marketService.getContexts().catch(() => new Map()),
        ]);

        const perTrader = settled.filter(
            (p): p is NonNullable<typeof p> => p !== null,
        );

        const coins = mergeMarketContext(
            aggregatePositioning(perTrader),
            contexts,
        );

        const result: SmartMoneyResult = {
            window: input.window,
            metric: input.metric,
            tradersRequested: traders.length,
            tradersAnalyzed: perTrader.length,
            coins,
        };

        this.cache.set(key, { result, fetchedAt: Date.now() });
        return result;
    }
}
