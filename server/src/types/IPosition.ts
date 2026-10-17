export default interface IPosition {
    coin: string;
    side: 'long' | 'short';
    entryPrice: number;
    leverage: number;
    size: number;
    positionValue?: number | null;
    unrealizedPnl?: number | null;
    isOpen?: boolean;

    // Richer per-position risk fields from clearinghouseState (Tier 1).
    returnOnEquity?: number | null;
    liquidationPx?: number | null;
    // Mark - liquidation distance as a fraction of mark (0.1 = 10% away).
    // Derived from positionValue/size vs liquidationPx, so no mark fetch needed.
    liquidationDistance?: number | null;
    marginUsed?: number | null;
    maxLeverage?: number | null;
    marginType?: 'cross' | 'isolated';
    // Funding paid (positive) or earned (negative) since the position opened.
    cumFundingSinceOpen?: number | null;
}

// Account-level roll-up from clearinghouseState's marginSummary.
export interface IAccountSummary {
    accountValue: number;
    totalNotional: number;
    totalMarginUsed: number;
    // totalNotional / accountValue — how levered the whole book is.
    effectiveLeverage: number;
    // accountValue - totalMarginUsed — dry powder.
    freeMargin: number;
}
