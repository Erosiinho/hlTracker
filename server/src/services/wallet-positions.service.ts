import { z } from 'zod';
import {
    fetchClearinghouseState,
    normalizeClearinghouseState,
} from '../lib/hyperliquid-api';
import IPosition from '../types/IPosition';

const INFO_API_URL =
    process.env.HYPERLIQUID_INFO_API_URL || 'https://api.hyperliquid.xyz/info';

// clearinghouseState is queried per-dex; mirror poll-positions' coverage.
const EXTRA_DEXS = ['xyz'];

export const WalletAddressSchema = z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid wallet address.')
    .transform((a) => a.toLowerCase());

export interface WalletPositionsResult {
    address: string;
    count: number;
    positions: IPosition[];
}

export class WalletPositionsService {
    async getOpenPositions(address: string): Promise<WalletPositionsResult> {
        const dexes: (string | undefined)[] = [undefined, ...EXTRA_DEXS];
        const positions = (
            await Promise.all(
                dexes.map(async (dex) => {
                    const raw = await fetchClearinghouseState(
                        INFO_API_URL,
                        address,
                        dex,
                    );
                    return normalizeClearinghouseState(raw);
                }),
            )
        ).flat();

        // Largest notional first so the most significant positions lead.
        positions.sort(
            (a, b) => (b.positionValue ?? 0) - (a.positionValue ?? 0),
        );

        return {
            address,
            count: positions.length,
            positions,
        };
    }
}
