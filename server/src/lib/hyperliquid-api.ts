import IPosition from '../types/IPosition';
import ITopTrader, {
    LeaderboardWindow,
    LeaderboardMetric,
} from '../types/ITopTrader';

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
    liquidationPx: string | null;
}

interface RawAssetPosition {
    type: string;
    position: RawPosition;
}

interface RawClearinghouseState {
    assetPositions: RawAssetPosition[];
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
        return {
            coin: position.coin,
            side: szi < 0 ? 'short' : 'long',
            size: Math.abs(szi),
            leverage: position.leverage.value,
            entryPrice: parseFloat(position.entryPx),
            positionValue:
                position.positionValue != null
                    ? parseFloat(position.positionValue)
                    : null,
            unrealizedPnl:
                position.unrealizedPnl != null
                    ? parseFloat(position.unrealizedPnl)
                    : null,
            isOpen: true,
        };
    });
}
