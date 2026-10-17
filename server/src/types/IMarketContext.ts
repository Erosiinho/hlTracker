// Per-coin market context from Hyperliquid's public metaAndAssetCtxs endpoint.
export default interface IMarketContext {
    coin: string;
    markPx: number | null;
    oraclePx: number | null;
    prevDayPx: number | null;
    // Hourly funding rate as a fraction (0.0000125 = 0.00125%/hr).
    funding: number | null;
    // Open interest in coin units.
    openInterest: number | null;
    // 24h notional volume (USD).
    dayNotionalVolume: number | null;
}
