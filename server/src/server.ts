import express, { Application } from 'express';
import cors from 'cors';
import errorHandler from './http/middlewares/error';

import { LeaderboardService } from './services/leaderboard.service';
import { WalletPositionsService } from './services/wallet-positions.service';
import { WalletStatsService } from './services/wallet-stats.service';
import { WalletOrdersService } from './services/wallet-orders.service';
import { MarketService } from './services/market.service';
import { SmartMoneyService } from './services/smart-money.service';
import { FundingService } from './services/funding.service';

import { LeaderboardController } from './http/controllers/leaderboard.controller';
import { WalletPositionsController } from './http/controllers/wallet-positions.controller';
import { SmartMoneyController } from './http/controllers/smart-money.controller';
import { FundingController } from './http/controllers/funding.controller';

import { LeaderboardRoutes } from './http/routes/leaderboard.routes';
import { WalletPositionsRoutes } from './http/routes/wallet-positions.routes';
import { SmartMoneyRoutes } from './http/routes/smart-money.routes';
import { FundingRoutes } from './http/routes/funding.routes';

export class Server {
    private app: Application;

    constructor() {
        this.app = express();
    }

    public init(): void {
        this.setupMiddlewares();

        const leaderboardService = new LeaderboardService();
        const walletPositionsService = new WalletPositionsService();
        const walletStatsService = new WalletStatsService();
        const walletOrdersService = new WalletOrdersService();
        const marketService = new MarketService();
        const smartMoneyService = new SmartMoneyService(
            leaderboardService,
            walletPositionsService,
            marketService,
        );
        const fundingService = new FundingService(marketService);

        const leaderboardController = new LeaderboardController(leaderboardService);
        const walletPositionsController = new WalletPositionsController(
            walletPositionsService,
            walletStatsService,
            walletOrdersService,
        );
        const smartMoneyController = new SmartMoneyController(smartMoneyService);
        const fundingController = new FundingController(fundingService);

        this.setupLeaderboardRoutes(leaderboardController);
        this.setupWalletPositionsRoutes(walletPositionsController);
        this.setupSmartMoneyRoutes(smartMoneyController);
        this.setupFundingRoutes(fundingController);

        // Error-handling middleware must be registered after the routes it
        // guards, otherwise Express never routes errors back to it.
        this.app.use(errorHandler);
    }

    private setupMiddlewares(): void {
        this.app.use(express.json());
        this.app.use(cors());
    }

    private setupLeaderboardRoutes(
        leaderboardController: LeaderboardController,
    ): void {
        const leaderboardRoutes = new LeaderboardRoutes(leaderboardController);
        this.app.use('/api/top-traders', leaderboardRoutes.getRouter());
    }

    private setupWalletPositionsRoutes(
        walletPositionsController: WalletPositionsController,
    ): void {
        const walletPositionsRoutes = new WalletPositionsRoutes(
            walletPositionsController,
        );
        this.app.use('/api/wallets', walletPositionsRoutes.getRouter());
    }

    private setupSmartMoneyRoutes(
        smartMoneyController: SmartMoneyController,
    ): void {
        const smartMoneyRoutes = new SmartMoneyRoutes(smartMoneyController);
        this.app.use('/api/smart-money', smartMoneyRoutes.getRouter());
    }

    private setupFundingRoutes(fundingController: FundingController): void {
        const fundingRoutes = new FundingRoutes(fundingController);
        this.app.use('/api/funding', fundingRoutes.getRouter());
    }

    public getApp(): Application {
        return this.app;
    }

    public listen(port: number) {
        this.app.listen(port, () => {
            console.log(`[application]: running on http://localhost:${port}!`);
        });
    }
}
