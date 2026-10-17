import { Router } from 'express';
import { FundingController } from '../controllers/funding.controller';

export class FundingRoutes {
    private router: Router;

    constructor(private readonly controller: FundingController) {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        this.router.get('/', this.controller.getFunding);
    }

    public getRouter(): Router {
        return this.router;
    }
}
