import {
    fetchPredictedFundings,
    normalizePredictedFundings,
    classifyFunding,
    FundingSignal,
} from '../lib/hyperliquid-api';
import { MarketService } from './market.service';

const INFO_API_URL =
    process.env.HYPERLIQUID_INFO_API_URL || 'https://api.hyperliquid.xyz/info';

const CACHE_TTL_MS = Number(process.env.FUNDING_CACHE_TTL_MS) || 30_000;

export interface FundingRow {
    coin: string;
    markPx: number | null;
    // Current hourly funding rate (fraction).
    funding: number | null;
    // Predicted next hourly funding (fraction) from predictedFundings.
    predicted: number | null;
    openInterest: number | null;
    oiNotional: number | null;
    dayChange: number | null;
    signal: FundingSignal;
}

export interface FundingResult {
    coins: FundingRow[];
}

export class FundingService {
    private cache: { result: FundingResult; fetchedAt: number } | null = null;

    constructor(private readonly marketService: MarketService) {}

    async getFunding(): Promise<FundingResult> {
        const now = Date.now();
        if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
            return this.cache.result;
        }

        const [contexts, predictedRaw] = await Promise.all([
            this.marketService.getContexts(),
            // Predicted funding is a bonus column; a failure must not sink the
            // page, so degrade to an empty map.
            fetchPredictedFundings(INFO_API_URL).catch(() => []),
        ]);
        const predicted = normalizePredictedFundings(predictedRaw);

        const coins: FundingRow[] = Array.from(contexts.values()).map((ctx) => ({
            coin: ctx.coin,
            markPx: ctx.markPx,
            funding: ctx.funding,
            predicted: predicted.get(ctx.coin) ?? null,
            openInterest: ctx.openInterest,
            oiNotional:
                ctx.openInterest != null && ctx.markPx != null
                    ? ctx.openInterest * ctx.markPx
                    : null,
            dayChange:
                ctx.prevDayPx != null && ctx.prevDayPx > 0 && ctx.markPx != null
                    ? (ctx.markPx - ctx.prevDayPx) / ctx.prevDayPx
                    : null,
            signal: classifyFunding(ctx.funding),
        }));

        // Most extreme funding first — that's where the crowding/reversal read
        // matters most.
        coins.sort(
            (a, b) => Math.abs(b.funding ?? 0) - Math.abs(a.funding ?? 0),
        );

        const result: FundingResult = { coins };
        this.cache = { result, fetchedAt: now };
        return result;
    }
}
