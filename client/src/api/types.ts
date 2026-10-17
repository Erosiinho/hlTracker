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
}

export interface WalletPositionsResult {
    address: string;
    count: number;
    positions: IWalletPosition[];
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
