import { Request, Response } from 'express';
import { asyncController } from './controller';
import {
    WalletPositionsService,
    WalletAddressSchema,
} from '../../services/wallet-positions.service';
import { WalletStatsService } from '../../services/wallet-stats.service';
import { WalletOrdersService } from '../../services/wallet-orders.service';

export class WalletPositionsController {
    constructor(
        private readonly service: WalletPositionsService,
        private readonly statsService: WalletStatsService,
        private readonly ordersService: WalletOrdersService,
    ) {}

    /**
     * Returns a wallet's currently-open positions, fetched live from
     * Hyperliquid's clearinghouseState endpoint.
     * GET /api/wallets/:address/positions
     */
    public getPositions = asyncController(async (req: Request, res: Response) => {
        const parseResult = WalletAddressSchema.safeParse(req.params.address);
        if (!parseResult.success) {
            return res.status(400).json({
                error: parseResult.error.issues[0]?.message ?? 'Invalid address.',
            });
        }

        const result = await this.service.getOpenPositions(parseResult.data);
        res.status(200).json(result);
    });

    /**
     * Returns realized trading stats (win rate, payoff, recent activity)
     * derived from a wallet's public fills.
     * GET /api/wallets/:address/stats
     */
    public getStats = asyncController(async (req: Request, res: Response) => {
        const parseResult = WalletAddressSchema.safeParse(req.params.address);
        if (!parseResult.success) {
            return res.status(400).json({
                error: parseResult.error.issues[0]?.message ?? 'Invalid address.',
            });
        }

        const result = await this.statsService.getStats(parseResult.data);
        res.status(200).json(result);
    });

    /**
     * Returns a wallet's resting open orders (limits, TP/SL triggers) from
     * Hyperliquid's public frontendOpenOrders endpoint.
     * GET /api/wallets/:address/orders
     */
    public getOrders = asyncController(async (req: Request, res: Response) => {
        const parseResult = WalletAddressSchema.safeParse(req.params.address);
        if (!parseResult.success) {
            return res.status(400).json({
                error: parseResult.error.issues[0]?.message ?? 'Invalid address.',
            });
        }

        const result = await this.ordersService.getOpenOrders(parseResult.data);
        res.status(200).json(result);
    });
}
