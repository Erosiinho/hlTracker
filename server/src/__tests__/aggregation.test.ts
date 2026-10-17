import { describe, it, expect } from 'vitest';
import {
    selectTopTraders,
    computeTraderStats,
    classifyFunding,
} from '../lib/hyperliquid-api';
import {
    aggregatePositioning,
    mergeMarketContext,
    buildLiquidationClusters,
} from '../services/smart-money.service';
import IMarketContext from '../types/IMarketContext';

function row(
    address: string,
    accountValue: string,
    perf: Partial<Record<'day' | 'week', { pnl: string; roi: string; vlm: string }>>,
) {
    return {
        ethAddress: address,
        accountValue,
        displayName: null,
        windowPerformances: Object.entries(perf).map(([w, p]) => [w, p]),
    } as any;
}

describe('selectTopTraders', () => {
    const rows = [
        row('0xAAA', '100', { week: { pnl: '10', roi: '0.1', vlm: '1000' } }),
        row('0xBBB', '200', { week: { pnl: '50', roi: '0.02', vlm: '9000' } }),
        row('0xCCC', '300', { day: { pnl: '999', roi: '9', vlm: '5' } }),
    ];

    it('ranks by the chosen metric descending and lowercases addresses', () => {
        const top = selectTopTraders(rows, 'week', 'pnl', 10);
        expect(top.map((t) => t.address)).toEqual(['0xbbb', '0xaaa']);
        expect(top[0].pnl).toBe(50);
    });

    it('ranks by roi independently of pnl', () => {
        const top = selectTopTraders(rows, 'week', 'roi', 10);
        expect(top.map((t) => t.address)).toEqual(['0xaaa', '0xbbb']);
    });

    it('skips rows missing the requested window', () => {
        const top = selectTopTraders(rows, 'week', 'pnl', 10);
        expect(top.map((t) => t.address)).not.toContain('0xccc');
    });

    it('respects the limit', () => {
        expect(selectTopTraders(rows, 'week', 'pnl', 1)).toHaveLength(1);
    });
});

describe('aggregatePositioning', () => {
    it('tallies long/short counts and net notional per coin, sorted by total', () => {
        const result = aggregatePositioning([
            [
                { coin: 'BTC', side: 'long', positionValue: 100 },
                { coin: 'ETH', side: 'short', positionValue: 50 },
            ],
            [
                { coin: 'BTC', side: 'short', positionValue: 30 },
                { coin: 'ETH', side: 'short', positionValue: 20 },
            ],
        ]);

        expect(result.map((c) => c.coin)).toEqual(['BTC', 'ETH']);

        const btc = result[0];
        expect(btc.longCount).toBe(1);
        expect(btc.shortCount).toBe(1);
        expect(btc.totalNotional).toBe(130);
        expect(btc.netNotional).toBe(70);
        expect(btc.netSide).toBe('long');

        const eth = result[1];
        expect(eth.shortCount).toBe(2);
        expect(eth.netSide).toBe('short');
        expect(eth.netNotional).toBe(-70);
    });

    it('treats a null notional as zero but still counts the side', () => {
        const [row] = aggregatePositioning([
            [{ coin: 'SOL', side: 'long', positionValue: null }],
        ]);
        expect(row.longCount).toBe(1);
        expect(row.totalNotional).toBe(0);
    });

    it('computes conviction, agreement and notional-weighted averages', () => {
        const [btc] = aggregatePositioning([
            [
                {
                    coin: 'BTC',
                    side: 'long',
                    positionValue: 100,
                    leverage: 10,
                    entryPrice: 60000,
                    liquidationPx: 55000,
                },
            ],
            [
                {
                    coin: 'BTC',
                    side: 'long',
                    positionValue: 300,
                    leverage: 5,
                    entryPrice: 62000,
                    liquidationPx: 58000,
                },
            ],
            [
                {
                    coin: 'BTC',
                    side: 'short',
                    positionValue: 100,
                    leverage: 2,
                    entryPrice: 61000,
                    liquidationPx: 70000,
                },
            ],
        ]);

        // leverage-weighted: long 100*10 + 300*5 = 2500, short 100*2 = 200.
        expect(btc.longWeighted).toBe(2500);
        expect(btc.shortWeighted).toBe(200);
        expect(btc.netWeighted).toBe(2300);
        // 2 of 3 traders are long.
        expect(btc.agreement).toBeCloseTo(2 / 3);
        // notional-weighted entry: (60000*100 + 62000*300) / 400 = 61500.
        expect(btc.avgEntryLong).toBeCloseTo(61500);
        expect(btc.avgEntryShort).toBeCloseTo(61000);
        expect(btc.avgLiqShort).toBeCloseTo(70000);
    });
});

describe('mergeMarketContext', () => {
    function ctx(partial: Partial<IMarketContext>): IMarketContext {
        return {
            coin: partial.coin ?? 'BTC',
            markPx: partial.markPx ?? null,
            oraclePx: null,
            prevDayPx: partial.prevDayPx ?? null,
            funding: partial.funding ?? null,
            openInterest: partial.openInterest ?? null,
            dayNotionalVolume: null,
        };
    }

    it('merges mark/funding/OI and derives OI share and day change', () => {
        const coins = aggregatePositioning([
            [{ coin: 'BTC', side: 'long', positionValue: 1000 }],
        ]);
        const [btc] = mergeMarketContext(
            coins,
            new Map([
                [
                    'BTC',
                    ctx({
                        markPx: 100,
                        prevDayPx: 80,
                        funding: 0.0001,
                        openInterest: 100,
                    }),
                ],
            ]),
        );
        expect(btc.funding).toBe(0.0001);
        expect(btc.oiNotional).toBe(10000); // 100 * 100
        expect(btc.smartMoneyOiShare).toBeCloseTo(0.1); // 1000 / 10000
        expect(btc.dayChange).toBeCloseTo(0.25); // (100-80)/80
    });

    it('leaves market fields null when the coin is absent from context', () => {
        const coins = aggregatePositioning([
            [{ coin: 'DOGE', side: 'short', positionValue: 5 }],
        ]);
        const [doge] = mergeMarketContext(coins, new Map());
        expect(doge.funding).toBeUndefined();
    });
});

describe('computeTraderStats', () => {
    // Newest-first, as Hyperliquid returns them.
    const fills = [
        {
            coin: 'BTC',
            px: '110',
            sz: '1',
            side: 'A' as const,
            time: 3000,
            startPosition: '1',
            dir: 'Close Long',
            closedPnl: '10',
            fee: '0.5',
        },
        {
            coin: 'BTC',
            px: '100',
            sz: '1',
            side: 'B' as const,
            time: 1000,
            startPosition: '0',
            dir: 'Open Long',
            closedPnl: '0',
            fee: '0.5',
        },
        {
            coin: 'ETH',
            px: '50',
            sz: '2',
            side: 'A' as const,
            time: 2500,
            startPosition: '2',
            dir: 'Close Long',
            closedPnl: '-6',
            fee: '0.2',
        },
        {
            coin: 'ETH',
            px: '53',
            sz: '2',
            side: 'B' as const,
            time: 500,
            startPosition: '0',
            dir: 'Open Long',
            closedPnl: '0',
            fee: '0.2',
        },
    ];

    it('derives win rate, payoff, holding time and realized pnl', () => {
        const s = computeTraderStats(fills);
        expect(s.closedTrades).toBe(2); // one winning close, one losing close
        expect(s.wins).toBe(1);
        expect(s.losses).toBe(1);
        expect(s.winRate).toBeCloseTo(0.5);
        expect(s.avgWin).toBe(10);
        expect(s.avgLoss).toBe(-6);
        expect(s.payoffRatio).toBeCloseTo(10 / 6);
        expect(s.totalRealizedPnl).toBeCloseTo(4);
        expect(s.totalFees).toBeCloseTo(1.4);
        // BTC round-trip 1000->3000, ETH 500->2500: both span 2000ms.
        expect(s.avgHoldingMs).toBe(2000);
        expect(s.lastActivity).toBe(3000); // newest fill
    });

    it('builds a realized-PnL curve and max drawdown', () => {
        const s = computeTraderStats(fills);
        // Two booking fills, chronological: ETH -6 at t=2500, BTC +10 at t=3000.
        expect(s.pnlCurve).toEqual([
            { time: 2500, cumPnl: -6 },
            { time: 3000, cumPnl: 4 },
        ]);
        // Peak starts at 0, trough -6 → drawdown 6.
        expect(s.maxDrawdown).toBe(6);
    });

    it('returns null rates for an empty history', () => {
        const s = computeTraderStats([]);
        expect(s.winRate).toBeNull();
        expect(s.payoffRatio).toBeNull();
        expect(s.avgHoldingMs).toBeNull();
        expect(s.recent).toHaveLength(0);
        expect(s.pnlCurve).toHaveLength(0);
        expect(s.maxDrawdown).toBe(0);
    });
});

describe('classifyFunding', () => {
    it('flags neutral funding with no crowding', () => {
        // ~8.76% APR < 10% → neutral level; sign still points the crowd.
        const s = classifyFunding(0.00001);
        expect(s.level).toBe('neutral');
        expect(s.note).toContain('balanced');
        // Exactly zero is the only truly balanced crowd.
        expect(classifyFunding(0).crowd).toBe('balanced');
    });

    it('flags extreme positive funding as crowded longs / reversal risk', () => {
        // 0.0005/hr ≈ 438% APR.
        const s = classifyFunding(0.0005);
        expect(s.level).toBe('extreme');
        expect(s.crowd).toBe('longs');
        expect(s.note.toLowerCase()).toContain('reversal');
    });

    it('flags high negative funding as crowded shorts', () => {
        // -0.00006/hr ≈ -52% APR → high.
        const s = classifyFunding(-0.00006);
        expect(s.level).toBe('high');
        expect(s.crowd).toBe('shorts');
        expect(s.note.toLowerCase()).toContain('squeeze');
    });

    it('handles missing funding', () => {
        expect(classifyFunding(null).note).toBe('No funding data.');
    });
});

describe('buildLiquidationClusters', () => {
    it('buckets liquidations by distance from mark, splitting by side', () => {
        const clusters = buildLiquidationClusters(
            [
                { px: 95, notional: 100, side: 'long' }, // -5% from mark 100
                { px: 94.5, notional: 50, side: 'long' }, // ~-5% → same bin
                { px: 110, notional: 200, side: 'short' }, // +10%
            ],
            100,
        );
        const below = clusters.find((c) => c.offsetPct < 0);
        const above = clusters.find((c) => c.offsetPct > 0);
        expect(below?.longNotional).toBe(150);
        expect(above?.shortNotional).toBe(200);
    });

    it('keeps far liquidations, clamping to the ±cap', () => {
        // +600% from mark → clamped to the +500% cap, not dropped.
        const clusters = buildLiquidationClusters(
            [{ px: 700, notional: 42, side: 'short' }],
            100,
        );
        expect(clusters).toHaveLength(1);
        expect(clusters[0].offsetPct).toBeCloseTo(5);
        expect(clusters[0].shortNotional).toBe(42);
    });

    it('returns empty without a valid mark', () => {
        expect(
            buildLiquidationClusters([{ px: 1, notional: 1, side: 'long' }], 0),
        ).toEqual([]);
    });
});
