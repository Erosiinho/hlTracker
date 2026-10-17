export type LeaderboardWindow = 'day' | 'week' | 'month' | 'allTime';
export type LeaderboardMetric = 'pnl' | 'roi' | 'vlm';

export interface ITopTrader {
    address: string;
    displayName: string | null;
    accountValue: number;
    window: LeaderboardWindow;
    pnl: number;
    roi: number;
    vlm: number;
}

export interface TopTradersQuery {
    window: LeaderboardWindow;
    metric: LeaderboardMetric;
    limit: number;
}

export interface TopTradersResult {
    window: LeaderboardWindow;
    metric: LeaderboardMetric;
    count: number;
    traders: ITopTrader[];
}

export interface IWalletPosition {
    coin: string;
    side: 'long' | 'short';
    size: number;
    leverage: number;
    entryPrice: number;
    positionValue: number | null;
    unrealizedPnl: number | null;
    isOpen: boolean;
    returnOnEquity: number | null;
    liquidationPx: number | null;
    liquidationDistance: number | null;
    marginUsed: number | null;
    maxLeverage: number | null;
    marginType: 'cross' | 'isolated';
    cumFundingSinceOpen: number | null;
}

export interface IAccountSummary {
    accountValue: number;
    totalNotional: number;
    totalMarginUsed: number;
    effectiveLeverage: number;
    freeMargin: number;
}

export interface WalletPositionsResult {
    address: string;
    count: number;
    positions: IWalletPosition[];
    summary: IAccountSummary | null;
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
    closedTrades: number;
    wins: number;
    losses: number;
    winRate: number | null;
    avgWin: number;
    avgLoss: number;
    payoffRatio: number | null;
    totalRealizedPnl: number;
    totalFees: number;
    avgHoldingMs: number | null;
    topCoins: { coin: string; fills: number }[];
    lastActivity: number | null;
    recent: RecentFill[];
    pnlCurve: { time: number; cumPnl: number }[];
    maxDrawdown: number;
}

export interface WalletStatsResult {
    address: string;
    stats: TraderStats;
}

export interface OpenOrder {
    coin: string;
    side: 'buy' | 'sell';
    price: number;
    size: number;
    orderType: string;
    triggerPx: number | null;
    isTrigger: boolean;
    reduceOnly: boolean;
    time: number;
}

export interface WalletOrdersResult {
    address: string;
    count: number;
    orders: OpenOrder[];
}

export type FundingLevel = 'neutral' | 'elevated' | 'high' | 'extreme';

export interface FundingSignal {
    level: FundingLevel;
    crowd: 'longs' | 'shorts' | 'balanced';
    apr: number;
    note: string;
}

export interface FundingRow {
    coin: string;
    markPx: number | null;
    funding: number | null;
    predicted: number | null;
    openInterest: number | null;
    oiNotional: number | null;
    dayChange: number | null;
    signal: FundingSignal;
}

export interface FundingResult {
    coins: FundingRow[];
}

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
    longWeighted: number;
    shortWeighted: number;
    netWeighted: number;
    agreement: number;
    avgEntryLong: number | null;
    avgEntryShort: number | null;
    avgLiqLong: number | null;
    avgLiqShort: number | null;
    markPx?: number | null;
    funding?: number | null;
    openInterest?: number | null;
    oiNotional?: number | null;
    smartMoneyOiShare?: number | null;
    dayChange?: number | null;
    liqClusters?: LiqCluster[] | null;
}

export interface LiqCluster {
    offsetPct: number;
    longNotional: number;
    shortNotional: number;
}

export interface SmartMoneyQuery {
    window: LeaderboardWindow;
    metric: LeaderboardMetric;
    traders: number;
}

export interface SmartMoneyResult {
    window: LeaderboardWindow;
    metric: LeaderboardMetric;
    tradersRequested: number;
    tradersAnalyzed: number;
    coins: CoinPositioning[];
}
