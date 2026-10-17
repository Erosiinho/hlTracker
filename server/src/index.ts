import { Server } from './server';

function start() {
    const app = new Server();
    const PORT = Number(process.env.PORT) || 3000;
    try {
        app.init();
        app.listen(PORT);
    } catch (error) {
        console.error('[application]: failed to start application:', error);
        process.exit(1);
    }
}

start();
