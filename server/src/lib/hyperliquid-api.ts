import IPosition, { IAccountSummary } from '../types/IPosition';
import IMarketContext from '../types/IMarketContext';
import ITopTrader, {
    LeaderboardWindow,
    LeaderboardMetric,
} from '../types/ITopTrader';

/** Parses a Hyperliquid numeric string, returning null for missing values. */
function num(value: string | null | undefined): number | null {
    if (value == null) return null;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
}

interface RawWindowPerformance {
    pnl: string;
    roi: string;
    vlm: string;
}

interface RawLeaderboardRow {
    ethAddress: string;
    accountValue: string;
    displayName: string | null;
    // Tuples of [window, performance], e.g. ["day", { pnl, roi, vlm }].
    windowPerformances: [LeaderboardWindow, RawWindowPerformance][];
}

interface RawLeaderboardResponse {
    leaderboardRows: RawLeaderboardRow[];
}

async function fetchLeaderboardRows(url: string): Promise<RawLeaderboardRow[]> {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'hyperliquid-positions-watcher/1.0' },
    });
    if (!response.ok) {
        throw new Error(`Leaderboard fetch error ${response.status}`);
    }
    const body = (await response.json()) as RawLeaderboardResponse;
    return body.leaderboardRows;
}

export async function fetchLeaderboard(url: string): Promise<RawLeaderboardRow[]> {
    return fetchLeaderboardRows(url);
}

/**
 * Projects raw leaderboard rows onto a single window and returns the top
 * traders ranked by the chosen metric (descending). Rows missing the window
 * are skipped rather than treated as zero.
 */
export function selectTopTraders(
    rows: RawLeaderboardRow[],
    window: LeaderboardWindow,
    metric: LeaderboardMetric,
    limit: number,
): ITopTrader[] {
    const traders: ITopTrader[] = [];
    for (const row of rows) {
        const entry = row.windowPerformances.find(([name]) => name === window);
        if (!entry) {
            continue;
        }
        const perf = entry[1];
        traders.push({
            address: row.ethAddress.toLowerCase(),
            displayName: row.displayName,
            accountValue: parseFloat(row.accountValue),
            window,
            pnl: parseFloat(perf.pnl),
            roi: parseFloat(perf.roi),
            vlm: parseFloat(perf.vlm),
        });
    }
    return traders
        .sort((a, b) => b[metric] - a[metric])
        .slice(0, limit);
}

interface RawPosition {
    coin: string;
    szi: string;
    leverage: { type: string; value: number };
    entryPx: string;
    positionValue: string | null;
    unrealizedPnl: string | null;
    returnOnEquity: string | null;
    liquidationPx: string | null;
    marginUsed: string | null;
    maxLeverage: number | null;
    cumFunding?: { allTime: string; sinceOpen: string; sinceChange: string };
}

interface RawAssetPosition {
    type: string;
    position: RawPosition;
}

interface RawMarginSummary {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
}

interface RawClearinghouseState {
    assetPositions: RawAssetPosition[];
    marginSummary?: RawMarginSummary;
}

export async function fetchClearinghouseState(
    apiUrl: string,
    address: string,
    dex?: string,
): Promise<RawClearinghouseState> {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
            dex
                ? { type: 'clearinghouseState', user: address, dex }
                : { type: 'clearinghouseState', user: address },
        ),
    });
    if (!response.ok) {
        throw new Error(`Hyperliquid info API error ${response.status} for ${address}`);
    }
    return (await response.json()) as RawClearinghouseState;
}

export function normalizeClearinghouseState(
    raw: RawClearinghouseState,
): IPosition[] {
    return raw.assetPositions.map(({ position }) => {
        const szi = parseFloat(position.szi);
        const size = Math.abs(szi);
        const positionValue = num(position.positionValue);
        const liquidationPx = num(position.liquidationPx);

        // Mark price is recoverable from notional/size, so liquidation
        // distance needs no separate mark-price fetch.
        const markPx =
            positionValue != null && size > 0 ? positionValue / size : null;
        const liquidationDistance =
            markPx != null && markPx > 0 && liquidationPx != null
                ? Math.abs(markPx - liquidationPx) / markPx
                : null;

        return {
            coin: position.coin,
            side: szi < 0 ? 'short' : 'long',
            size,
            leverage: position.leverage.value,
            entryPrice: parseFloat(position.entryPx),
            positionValue,
            unrealizedPnl: num(position.unrealizedPnl),
            returnOnEquity: num(position.returnOnEquity),
            liquidationPx,
            liquidationDistance,
            marginUsed: num(position.marginUsed),
            maxLeverage: position.maxLeverage ?? null,
            marginType:
                position.leverage.type === 'isolated' ? 'isolated' : 'cross',
            cumFundingSinceOpen: num(position.cumFunding?.sinceOpen),
            isOpen: true,
        };
    });
}

/**
 * Account-level roll-up from marginSummary. Returns null when the payload has
 * no summary (e.g. an empty/unknown account).
 */
export function extractAccountSummary(
    raw: RawClearinghouseState,
): IAccountSummary | null {
    const s = raw.marginSummary;
    if (!s) return null;
    const accountValue = num(s.accountValue) ?? 0;
    const totalNotional = num(s.totalNtlPos) ?? 0;
    const totalMarginUsed = num(s.totalMarginUsed) ?? 0;
    return {
        accountValue,
        totalNotional,
        totalMarginUsed,
        effectiveLeverage: accountValue > 0 ? totalNotional / accountValue : 0,
        freeMargin: accountValue - totalMarginUsed,
    };
}

/* ---- market context (metaAndAssetCtxs) --------------------------------- */

interface RawAssetMeta {
    name: string;
}

interface RawAssetCtx {
    funding: string;
    openInterest: string;
    prevDayPx: string;
    dayNtlVlm: string;
    oraclePx: string;
    markPx: string;
}

// metaAndAssetCtxs responds with a [meta, assetCtxs] tuple; the two arrays are
// positionally aligned by coin.
type RawMetaAndAssetCtxs = [{ universe: RawAssetMeta[] }, RawAssetCtx[]];

export async function fetchMetaAndAssetCtxs(
    apiUrl: string,
): Promise<RawMetaAndAssetCtxs> {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    if (!response.ok) {
        throw new Error(`Hyperliquid metaAndAssetCtxs error ${response.status}`);
    }
    return (await response.json()) as RawMetaAndAssetCtxs;
}

export function normalizeMarketContexts(
    raw: RawMetaAndAssetCtxs,
): Map<string, IMarketContext> {
    const [meta, ctxs] = raw;
    const byCoin = new Map<string, IMarketContext>();
    meta.universe.forEach((asset, i) => {
        const ctx = ctxs[i];
        if (!ctx) return;
        byCoin.set(asset.name, {
            coin: asset.name,
            markPx: num(ctx.markPx),
            oraclePx: num(ctx.oraclePx),
            prevDayPx: num(ctx.prevDayPx),
            funding: num(ctx.funding),
            openInterest: num(ctx.openInterest),
            dayNotionalVolume: num(ctx.dayNtlVlm),
        });
    });
    return byCoin;
}

/* ---- trade history / stats (userFills) --------------------------------- */

interface RawFill {
    coin: string;
    px: string;
    sz: string;
    side: 'B' | 'A';
    time: number;
    startPosition: string;
    dir: string;
    closedPnl: string;
    fee: string;
}

export async function fetchUserFills(
    apiUrl: string,
    address: string,
): Promise<RawFill[]> {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'userFills', user: address }),
    });
    if (!response.ok) {
        throw new Error(
            `Hyperliquid userFills error ${response.status} for ${address}`,
        );
    }
    return (await response.json()) as RawFill[];
}

export interface RecentFill {
    coin: string;
    dir: string;
    side: 'long' | 'short';
    price: number;
    size: number;
    closedPnl: number;
    time: number;
}

export interface TraderStats {
    // Realized stats over closing fills (those that booked PnL).
    closedTrades: number;
    wins: number;
    losses: number;
    winRate: number | null;
    avgWin: number;
    avgLoss: number;
    // avgWin / |avgLoss| — expectancy-friendly payoff ratio.
    payoffRatio: number | null;
    totalRealizedPnl: number;
    totalFees: number;
    // Average time a round-trip (0 -> position -> 0) stayed open, in ms.
    avgHoldingMs: number | null;
    // Most-traded coins by fill count, richest first.
    topCoins: { coin: string; fills: number }[];
    lastActivity: number | null;
    recent: RecentFill[];
    // Cumulative realized-PnL equity curve, one point per booking fill,
    // oldest-first. Enables a PnL chart without any snapshot DB.
    pnlCurve: { time: number; cumPnl: number }[];
    // Largest peak-to-trough drop on the realized-PnL curve, in USD (>= 0).
    maxDrawdown: number;
}

/**
 * Derives realized trading stats from a wallet's fills. Pure and exported so
 * it can be unit-tested without HTTP.
 *
 * Win rate is measured per closing fill (any fill that booked non-zero
 * closedPnl). Holding time is measured over round-trips: the span from the
 * fill that lifts the position off zero to the fill that returns it to zero,
 * reconstructed from each fill's signed size and reported startPosition.
 */
export function computeTraderStats(fills: RawFill[]): TraderStats {
    // Hyperliquid returns fills newest-first; work oldest-first for round-trips.
    const chronological = [...fills].sort((a, b) => a.time - b.time);

    let wins = 0;
    let losses = 0;
    let winSum = 0;
    let lossSum = 0;
    let totalRealizedPnl = 0;
    let totalFees = 0;

    const fillsPerCoin = new Map<string, number>();
    const openTimePerCoin = new Map<string, number>();
    const holdingSpans: number[] = [];
    const pnlCurve: { time: number; cumPnl: number }[] = [];
    let peak = 0;
    let maxDrawdown = 0;
    const EPSILON = 1e-9;

    for (const fill of chronological) {
        const pnl = num(fill.closedPnl) ?? 0;
        const fee = num(fill.fee) ?? 0;
        totalRealizedPnl += pnl;
        totalFees += fee;
        fillsPerCoin.set(fill.coin, (fillsPerCoin.get(fill.coin) ?? 0) + 1);

        if (Math.abs(pnl) > EPSILON) {
            if (pnl > 0) {
                wins += 1;
                winSum += pnl;
            } else {
                losses += 1;
                lossSum += pnl;
            }
            // Equity curve + running peak-to-trough drawdown on realized PnL.
            pnlCurve.push({ time: fill.time, cumPnl: totalRealizedPnl });
            if (totalRealizedPnl > peak) peak = totalRealizedPnl;
            const drawdown = peak - totalRealizedPnl;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        // Round-trip tracking: startPosition is the signed size before the
        // fill; applying this fill's signed size gives the size after it.
        const start = num(fill.startPosition) ?? 0;
        const signed = (num(fill.sz) ?? 0) * (fill.side === 'B' ? 1 : -1);
        const after = start + signed;
        const wasFlat = Math.abs(start) <= EPSILON;
        const isFlat = Math.abs(after) <= EPSILON;
        if (wasFlat && !isFlat) {
            openTimePerCoin.set(fill.coin, fill.time);
        } else if (!wasFlat && isFlat) {
            const openedAt = openTimePerCoin.get(fill.coin);
            if (openedAt != null) {
                holdingSpans.push(fill.time - openedAt);
                openTimePerCoin.delete(fill.coin);
            }
        }
    }

    const closedTrades = wins + losses;
    const topCoins = Array.from(fillsPerCoin.entries())
        .map(([coin, count]) => ({ coin, fills: count }))
        .sort((a, b) => b.fills - a.fills)
        .slice(0, 5);

    const recent: RecentFill[] = fills.slice(0, 15).map((f) => ({
        coin: f.coin,
        dir: f.dir,
        side: f.side === 'B' ? 'long' : 'short',
        price: num(f.px) ?? 0,
        size: num(f.sz) ?? 0,
        closedPnl: num(f.closedPnl) ?? 0,
        time: f.time,
    }));

    return {
        closedTrades,
        wins,
        losses,
        winRate: closedTrades > 0 ? wins / closedTrades : null,
        avgWin: wins > 0 ? winSum / wins : 0,
        avgLoss: losses > 0 ? lossSum / losses : 0,
        payoffRatio:
            wins > 0 && losses > 0 && lossSum !== 0
                ? winSum / wins / Math.abs(lossSum / losses)
                : null,
        totalRealizedPnl,
        totalFees,
        avgHoldingMs:
            holdingSpans.length > 0
                ? holdingSpans.reduce((a, b) => a + b, 0) / holdingSpans.length
                : null,
        topCoins,
        lastActivity: fills.length > 0 ? fills[0].time : null,
        recent,
        pnlCurve,
        maxDrawdown,
    };
}

/* ---- predicted funding (predictedFundings) ----------------------------- */

// predictedFundings responds with [coin, [[venue, { fundingRate, … }], …]]
// tuples. We keep Hyperliquid's own perp prediction ("HlPerp").
type RawPredictedFundings = [string, [string, { fundingRate: string } | null][]][];

export async function fetchPredictedFundings(
    apiUrl: string,
): Promise<RawPredictedFundings> {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'predictedFundings' }),
    });
    if (!response.ok) {
        throw new Error(`Hyperliquid predictedFundings error ${response.status}`);
    }
    return (await response.json()) as RawPredictedFundings;
}

export function normalizePredictedFundings(
    raw: RawPredictedFundings,
): Map<string, number> {
    const byCoin = new Map<string, number>();
    if (!Array.isArray(raw)) return byCoin;
    for (const entry of raw) {
        const [coin, venues] = entry;
        if (!coin || !Array.isArray(venues)) continue;
        const hl = venues.find(([venue]) => venue === 'HlPerp');
        const rate = num(hl?.[1]?.fundingRate);
        if (rate != null) byCoin.set(coin, rate);
    }
    return byCoin;
}

/* ---- funding signal (reversal / crowding read) ------------------------- */

export type FundingLevel = 'neutral' | 'elevated' | 'high' | 'extreme';

export interface FundingSignal {
    level: FundingLevel;
    // Which side is paying funding, i.e. the crowded side.
    crowd: 'longs' | 'shorts' | 'balanced';
    // Annualized funding rate (fraction; 0.4 = 40% APR).
    apr: number;
    // Plain-language read, including explicit reversal/squeeze language.
    note: string;
}

/**
 * Turns an hourly funding rate into a crowding/reversal read. Positive funding
 * means longs pay shorts (crowded longs); negative means the reverse. The
 * larger the magnitude, the more one-sided — and the higher the odds of a
 * squeeze/mean-reversion against the crowd. Pure and unit-tested.
 *
 * APR thresholds (|annualized|): <10% neutral, <35% elevated, <100% high,
 * otherwise extreme.
 */
export function classifyFunding(hourlyRate: number | null): FundingSignal {
    if (hourlyRate == null || !Number.isFinite(hourlyRate)) {
        return { level: 'neutral', crowd: 'balanced', apr: 0, note: 'No funding data.' };
    }
    const apr = hourlyRate * 24 * 365;
    const absApr = Math.abs(apr);
    const crowd =
        hourlyRate > 0 ? 'longs' : hourlyRate < 0 ? 'shorts' : 'balanced';

    let level: FundingLevel;
    if (absApr < 0.1) level = 'neutral';
    else if (absApr < 0.35) level = 'elevated';
    else if (absApr < 1.0) level = 'high';
    else level = 'extreme';

    let note: string;
    if (level === 'neutral') {
        note = 'Funding balanced — no crowding signal.';
    } else {
        const crowded = crowd === 'longs' ? 'Longs' : 'Shorts';
        const squeeze =
            crowd === 'longs'
                ? 'long squeeze / pullback down'
                : 'short squeeze / bounce up';
        if (level === 'elevated') {
            note = `${crowded} paying — mild ${crowd} crowding.`;
        } else if (level === 'high') {
            note = `${crowded} paying heavily — crowded ${crowd}, watch for ${squeeze}.`;
        } else {
            note = `Funding extreme — ${crowd} very overcrowded, elevated ${squeeze} / reversal risk.`;
        }
    }
    return { level, crowd, apr, note };
}

/* ---- open orders (frontendOpenOrders) ---------------------------------- */

interface RawOpenOrder {
    coin: string;
    side: 'A' | 'B';
    limitPx: string;
    sz: string;
    timestamp: number;
    orderType?: string;
    triggerPx?: string;
    isTrigger?: boolean;
    reduceOnly?: boolean;
}

export interface OpenOrder {
    coin: string;
    // Buy lifts/adds a long; sell trims/adds a short.
    side: 'buy' | 'sell';
    price: number;
    size: number;
    orderType: string;
    triggerPx: number | null;
    isTrigger: boolean;
    reduceOnly: boolean;
    time: number;
}

export async function fetchFrontendOpenOrders(
    apiUrl: string,
    address: string,
): Promise<RawOpenOrder[]> {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'frontendOpenOrders', user: address }),
    });
    if (!response.ok) {
        throw new Error(
            `Hyperliquid frontendOpenOrders error ${response.status} for ${address}`,
        );
    }
    return (await response.json()) as RawOpenOrder[];
}

export function normalizeOpenOrders(raw: RawOpenOrder[]): OpenOrder[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((o) => ({
        coin: o.coin,
        side: o.side === 'B' ? 'buy' : 'sell',
        price: num(o.limitPx) ?? 0,
        size: num(o.sz) ?? 0,
        orderType: o.orderType ?? 'Limit',
        triggerPx: num(o.triggerPx ?? null),
        isTrigger: Boolean(o.isTrigger),
        reduceOnly: Boolean(o.reduceOnly),
        time: o.timestamp,
    }));
}
