import { Request, Response, NextFunction } from 'express';

export default function errorHandler(
    err: any,
    req: Request,
    res: Response,
    next: NextFunction,
) {
    console.error(err);
    if (res.headersSent) {
        return next(err);
    }

    // Preserve an error status set explicitly by a route (e.g. 404).
    const status = res.statusCode !== 200 ? res.statusCode : 500;
    res.status(status).json({ error: err.message || 'Internal Server Error' });
}
