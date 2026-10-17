import { Router } from 'express';
import { LeaderboardController } from '../controllers/leaderboard.controller';

export class LeaderboardRoutes {
    private router: Router;

    constructor(private readonly controller: LeaderboardController) {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        this.router.get('/', this.controller.topTraders);
    }

    public getRouter(): Router {
        return this.router;
    }
}
