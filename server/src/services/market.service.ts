import {
    fetchMetaAndAssetCtxs,
    normalizeMarketContexts,
} from '../lib/hyperliquid-api';
import IMarketContext from '../types/IMarketContext';

const INFO_API_URL =
    process.env.HYPERLIQUID_INFO_API_URL || 'https://api.hyperliquid.xyz/info';

// A single metaAndAssetCtxs call covers every coin and changes slowly, so a
// short cache keeps the smart-money path to one extra request per refresh.
const CACHE_TTL_MS = Number(process.env.MARKET_CACHE_TTL_MS) || 30_000;

export class MarketService {
    private cache: {
        contexts: Map<string, IMarketContext>;
        fetchedAt: number;
    } | null = null;

    /** Per-coin market context (mark, funding, OI, …), keyed by coin. */
    async getContexts(): Promise<Map<string, IMarketContext>> {
        const now = Date.now();
        if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
            return this.cache.contexts;
        }
        const raw = await fetchMetaAndAssetCtxs(INFO_API_URL);
        const contexts = normalizeMarketContexts(raw);
        this.cache = { contexts, fetchedAt: now };
        return contexts;
    }
}
