import { prisma } from "../lib/prisma";

interface RateLimitConfig {
	hourlyLimit: number;
	dailyLimit: number;
	enabled: boolean;
}

const getConfig = (): RateLimitConfig => ({
	hourlyLimit: parseInt(process.env.RATE_LIMIT_UPLOAD_HOURLY || "10"),
	dailyLimit: parseInt(process.env.RATE_LIMIT_UPLOAD_DAILY || "50"),
	enabled: process.env.RATE_LIMIT_ENABLED !== "false"
});

const getUserLimits = async (userId: string) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { hourlyUploadLimit: true, dailyUploadLimit: true }
	});

	const config = getConfig();

	return {
		hourlyLimit: user?.hourlyUploadLimit || config.hourlyLimit,
		dailyLimit: user?.dailyUploadLimit || config.dailyLimit
	};
};

const getTimeWindow = (type: "hourly" | "daily") => {
	const now = new Date();
	const windowStart = new Date(now);
	const windowEnd = new Date(now);

	if (type === "hourly") {
		windowStart.setMinutes(0, 0, 0);
		windowEnd.setHours(windowStart.getHours() + 1, 0, 0, 0);
	} else {
		windowStart.setHours(0, 0, 0, 0);
		windowEnd.setHours(24, 0, 0, 0);
	}

	return { windowStart, windowEnd };
};

export const checkRateLimit = async (
	userId: string,
	endpoint: string = "receipt.upload"
): Promise<{
	allowed: boolean;
	limit?: number;
	remaining?: number;
	resetAt?: Date;
	error?: string;
}> => {
	const config = getConfig();
	if (!config.enabled) {
		return { allowed: true };
	}

	const limits = await getUserLimits(userId);

	// Check hourly limit
	const hourly = await checkWindowLimit(userId, "hourly", limits.hourlyLimit, endpoint);
	if (!hourly.allowed) {
		return hourly;
	}

	// Check daily limit
	const daily = await checkWindowLimit(userId, "daily", limits.dailyLimit, endpoint);
	if (!daily.allowed) {
		return daily;
	}

	return { allowed: true };
};

const checkWindowLimit = async (
	userId: string,
	limitType: "hourly" | "daily",
	maxRequests: number,
	endpoint: string
) => {
	const { windowStart, windowEnd } = getTimeWindow(limitType);

	let rateLimitRecord = await prisma.userRateLimit.findUnique({
		where: {
			userId_limitType_windowStart: {
				userId,
				limitType,
				windowStart
			}
		}
	});

	if (!rateLimitRecord) {
		rateLimitRecord = await prisma.userRateLimit.create({
			data: {
				userId,
				limitType,
				windowStart,
				windowEnd,
				requestCount: 0,
				maxRequests,
				endpointPath: endpoint
			}
		});
	}

	if (rateLimitRecord.requestCount >= maxRequests) {
		return {
			allowed: false,
			limit: maxRequests,
			remaining: 0,
			resetAt: windowEnd,
			error: `Rate limit exceeded. You can upload ${maxRequests} receipts per ${limitType === "hourly" ? "hour" : "day"}. Limit resets at ${windowEnd.toISOString()}.`
		};
	}

	return {
		allowed: true,
		limit: maxRequests,
		remaining: maxRequests - rateLimitRecord.requestCount,
		resetAt: windowEnd
	};
};

export const incrementRateLimit = async (
	userId: string,
	endpoint: string = "receipt.upload"
): Promise<void> => {
	const config = getConfig();
	if (!config.enabled) return;

	const limits = await getUserLimits(userId);

	for (const limitType of ["hourly", "daily"] as const) {
		const { windowStart, windowEnd } = getTimeWindow(limitType);

		await prisma.userRateLimit.upsert({
			where: {
				userId_limitType_windowStart: {
					userId,
					limitType,
					windowStart
				}
			},
			update: {
				requestCount: { increment: 1 }
			},
			create: {
				userId,
				limitType,
				windowStart,
				windowEnd,
				requestCount: 1,
				maxRequests: limitType === "hourly" ? limits.hourlyLimit : limits.dailyLimit,
				endpointPath: endpoint
			}
		});
	}
};

export const cleanupExpiredRateLimits = async () => {
	const oneDayAgo = new Date();
	oneDayAgo.setDate(oneDayAgo.getDate() - 1);

	await prisma.userRateLimit.deleteMany({
		where: {
			windowEnd: { lt: oneDayAgo }
		}
	});
};
