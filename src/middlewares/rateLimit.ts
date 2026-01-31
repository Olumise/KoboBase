import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { checkRateLimit, incrementRateLimit } from "../services/rateLimit.service";

export const rateLimitMiddleware = (endpoint: string) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const userId = req.user?.id;

		if (!userId) {
			return next();
		}

		try {
			const result = await checkRateLimit(userId, endpoint);

			if (result.limit) {
				res.setHeader('X-RateLimit-Limit', result.limit.toString());
				res.setHeader('X-RateLimit-Remaining', (result.remaining || 0).toString());
				if (result.resetAt) {
					res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());
				}
			}

			if (!result.allowed) {
				throw new AppError(429, result.error || "Rate limit exceeded", "rateLimitMiddleware");
			}

			res.on('finish', () => {
				if (res.statusCode < 400) {
					incrementRateLimit(userId, endpoint).catch(err => {
						console.error('Failed to increment rate limit:', err);
					});
				}
			});

			next();
		} catch (err) {
			next(err);
		}
	};
};
