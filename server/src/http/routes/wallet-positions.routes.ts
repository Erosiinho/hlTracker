import { Router } from 'express';
import { WalletPositionsController } from '../controllers/wallet-positions.controller';

export class WalletPositionsRoutes {
    private router: Router;

    constructor(private readonly controller: WalletPositionsController) {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        this.router.get('/:address/positions', this.controller.getPositions);
        this.router.get('/:address/stats', this.controller.getStats);
        this.router.get('/:address/orders', this.controller.getOrders);
    }

    public getRouter(): Router {
        return this.router;
    }
}
