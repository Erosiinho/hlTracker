export default interface IPosition {
    coin: string;
    side: 'long' | 'short';
    entryPrice: number;
    leverage: number;
    size: number;
    positionValue?: number | null;
    unrealizedPnl?: number | null;
    isOpen?: boolean;
}
