import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import {
	getUserUsageStats,
	getUserRecentSessions,
} from "../services/costTracking.service";
import { prisma } from "../lib/prisma";

export const getMyUsage = async (req: Request, res: Response) => {
	try {
		const userId = (req as any).user?.id;

		if (!userId) {
			throw new AppError(401, "Unauthorized", "getMyUsage");
		}

		const period = (req.query.period as "all-time" | "current-month") || "all-time";
		const stats = await getUserUsageStats(userId, period);

		res.status(200).json({
			success: true,
			data: stats,
		});
	} catch (error) {
		console.error("Error getting user usage:", error);
		throw error;
	}
};

export const getMyUsageSessions = async (req: Request, res: Response) => {
	try {
		const userId = (req as any).user?.id;

		if (!userId) {
			throw new AppError(401, "Unauthorized", "getMyUsageSessions");
		}

		const limit = parseInt((req.query.limit as string) || "10", 10);
		const sessions = await getUserRecentSessions(userId, limit);

		res.status(200).json({
			success: true,
			data: sessions,
		});
	} catch (error) {
		console.error("Error getting user usage sessions:", error);
		throw error;
	}
};

export const getMyUsageBreakdown = async (req: Request, res: Response) => {
	try {
		const userId = (req as any).user?.id;

		if (!userId) {
			throw new AppError(401, "Unauthorized", "getMyUsageBreakdown");
		}

		const stats = await getUserUsageStats(userId, "all-time");
		const sessions = await getUserRecentSessions(userId, 100);

		const breakdown = sessions.reduce(
			(acc, session) => {
				const callBreakdown = session.callBreakdown as any;

				if (callBreakdown) {
					Object.keys(callBreakdown).forEach((callType) => {
						const data = callBreakdown[callType];
						if (!acc[callType]) {
							acc[callType] = {
								calls: 0,
								inputTokens: 0,
								outputTokens: 0,
								totalTokens: 0,
								cost: 0,
							};
						}

						acc[callType].calls += data.calls || 0;
						acc[callType].inputTokens += data.inputTokens || 0;
						acc[callType].outputTokens += data.outputTokens || 0;
						acc[callType].totalTokens +=
							(data.inputTokens || 0) + (data.outputTokens || 0);
						acc[callType].cost += data.cost || 0;
					});
				}

				return acc;
			},
			{} as Record<
				string,
				{
					calls: number;
					inputTokens: number;
					outputTokens: number;
					totalTokens: number;
					cost: number;
				}
			>
		);

		res.status(200).json({
			success: true,
			data: {
				summary: stats,
				breakdown,
			},
		});
	} catch (error) {
		console.error("Error getting user usage breakdown:", error);
		throw error;
	}
};

export const getAllUsersUsage = async (req: Request, res: Response) => {
	try {
		const userId = (req as any).user?.id;

		if (!userId) {
			throw new AppError(401, "Unauthorized", "getAllUsersUsage");
		}

		const page = parseInt((req.query.page as string) || "1", 10);
		const limit = parseInt((req.query.limit as string) || "20", 10);
		const skip = (page - 1) * limit;

		const [users, totalCount] = await Promise.all([
			prisma.userCostMetrics.findMany({
				skip,
				take: limit,
				include: {
					user: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
				},
				orderBy: {
					totalCostUsd: "desc",
				},
			}),
			prisma.userCostMetrics.count(),
		]);

		const formattedUsers = users.map((userMetric) => ({
			userId: userMetric.userId,
			userName: userMetric.user.name,
			userEmail: userMetric.user.email,
			totalTokensUsed: userMetric.totalTokensUsed,
			totalCostUsd: Number(userMetric.totalCostUsd),
			currentMonthTokens: userMetric.currentMonthTokens,
			currentMonthCost: Number(userMetric.currentMonthCost),
			sessionCounts: {
				clarification: userMetric.clarificationSessions,
				batch: userMetric.batchSessions,
				sequential: userMetric.sequentialSessions,
			},
			callCounts: {
				ocr: userMetric.ocrCalls,
				detection: userMetric.detectionCalls,
				extraction: userMetric.extractionCalls,
				clarification: userMetric.clarificationCalls,
				embedding: userMetric.embeddingCalls,
			},
		}));

		res.status(200).json({
			success: true,
			data: {
				users: formattedUsers,
				pagination: {
					page,
					limit,
					totalCount,
					totalPages: Math.ceil(totalCount / limit),
				},
			},
		});
	} catch (error) {
		console.error("Error getting all users usage:", error);
		throw error;
	}
};

export const getSystemUsageStats = async (req: Request, res: Response) => {
	try {
		const userId = (req as any).user?.id;

		if (!userId) {
			throw new AppError(401, "Unauthorized", "getSystemUsageStats");
		}

		const [systemTotals, recentSessions] = await Promise.all([
			prisma.userCostMetrics.aggregate({
				_sum: {
					totalTokensUsed: true,
					totalCostUsd: true,
					currentMonthTokens: true,
					currentMonthCost: true,
					ocrCalls: true,
					detectionCalls: true,
					extractionCalls: true,
					clarificationCalls: true,
					embeddingCalls: true,
					clarificationSessions: true,
					batchSessions: true,
					sequentialSessions: true,
				},
			}),
			prisma.lLMUsageSession.findMany({
				take: 10,
				orderBy: {
					createdAt: "desc",
				},
				select: {
					id: true,
					totalTokens: true,
					totalCostUsd: true,
					processingMode: true,
					transactionCount: true,
					createdAt: true,
					completedAt: true,
					user: {
						select: {
							name: true,
							email: true,
						},
					},
				},
			}),
		]);

		res.status(200).json({
			success: true,
			data: {
				totals: {
					totalTokensUsed: systemTotals._sum.totalTokensUsed || 0,
					totalCostUsd: Number(systemTotals._sum.totalCostUsd || 0),
					currentMonthTokens: systemTotals._sum.currentMonthTokens || 0,
					currentMonthCost: Number(systemTotals._sum.currentMonthCost || 0),
				},
				callCounts: {
					ocr: systemTotals._sum.ocrCalls || 0,
					detection: systemTotals._sum.detectionCalls || 0,
					extraction: systemTotals._sum.extractionCalls || 0,
					clarification: systemTotals._sum.clarificationCalls || 0,
					embedding: systemTotals._sum.embeddingCalls || 0,
				},
				sessionCounts: {
					clarification: systemTotals._sum.clarificationSessions || 0,
					batch: systemTotals._sum.batchSessions || 0,
					sequential: systemTotals._sum.sequentialSessions || 0,
				},
				recentSessions: recentSessions.map((session) => ({
					...session,
					totalCostUsd: Number(session.totalCostUsd),
				})),
			},
		});
	} catch (error) {
		console.error("Error getting system usage stats:", error);
		throw error;
	}
};
