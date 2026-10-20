import { Request, Response } from 'express';
import { asyncController } from './controller';
import {
    SmartMoneyService,
    SmartMoneyQuerySchema,
} from '../../services/smart-money.service';

export class SmartMoneyController {
    constructor(private readonly smartMoneyService: SmartMoneyService) {}

    /**
     * Aggregates per-coin long/short positioning across the current top
     * traders — a "smart money" sentiment view.
     * GET /api/smart-money?window=week&metric=pnl&traders=30
     */
    public getSmartMoney = asyncController(
        async (req: Request, res: Response) => {
            const parseResult = SmartMoneyQuerySchema.safeParse(req.query);
            if (!parseResult.success) {
                return res.status(400).json({
                    error:
                        parseResult.error.issues[0]?.message ?? 'Invalid query.',
                });
            }

            const result = await this.smartMoneyService.getSmartMoney(
                parseResult.data,
            );
            res.status(200).json(result);
        },
    );
}
