import { Request, Response } from 'express';
import { asyncController } from './controller';
import { FundingService } from '../../services/funding.service';

export class FundingController {
    constructor(private readonly service: FundingService) {}

    /**
     * Returns per-coin funding with a crowding/reversal read.
     * GET /api/funding
     */
    public getFunding = asyncController(async (_req: Request, res: Response) => {
        const result = await this.service.getFunding();
        res.status(200).json(result);
    });
}
