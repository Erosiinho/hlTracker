import { describe, it, expect } from 'vitest';
import { selectTopTraders } from '../lib/hyperliquid-api';
import { aggregatePositioning } from '../services/smart-money.service';

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
});
