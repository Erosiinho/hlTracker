export type LeaderboardWindow = 'day' | 'week' | 'month' | 'allTime';
export type LeaderboardMetric = 'pnl' | 'roi' | 'vlm';

export default interface ITopTrader {
    address: string;
    displayName: string | null;
    accountValue: number;
    window: LeaderboardWindow;
    pnl: number;
    roi: number;
    vlm: number;
}
