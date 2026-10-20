import { Router } from 'express';
import { SmartMoneyController } from '../controllers/smart-money.controller';

export class SmartMoneyRoutes {
    private router: Router;

    constructor(private readonly controller: SmartMoneyController) {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        this.router.get('/', this.controller.getSmartMoney);
    }

    public getRouter(): Router {
        return this.router;
    }
}
