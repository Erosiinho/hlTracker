import { Request, Response } from 'express';
import { asyncController } from './controller';
import {
    LeaderboardService,
    TopTradersQuerySchema,
} from '../../services/leaderboard.service';

export class LeaderboardController {
    constructor(private readonly leaderboardService: LeaderboardService) {}

    /**
     * Returns the current top traders from Hyperliquid's public leaderboard,
     * ranked by the chosen metric over the chosen window.
     * GET /api/top-traders?window=week&metric=pnl&limit=50
     */
    public topTraders = asyncController(async (req: Request, res: Response) => {
        const parseResult = TopTradersQuerySchema.safeParse(req.query);
        if (!parseResult.success) {
            return res.status(400).json({
                error: parseResult.error.issues[0]?.message ?? 'Invalid query.',
            });
        }

        const result = await this.leaderboardService.getTopTraders(parseResult.data);
        res.status(200).json(result);
    });
}
