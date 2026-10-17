import { Request, Response } from 'express';
import { asyncController } from './controller';
import {
    WalletPositionsService,
    WalletAddressSchema,
} from '../../services/wallet-positions.service';

export class WalletPositionsController {
    constructor(private readonly service: WalletPositionsService) {}

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
}
