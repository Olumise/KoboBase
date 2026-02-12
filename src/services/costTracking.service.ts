import { prisma } from '../lib/prisma';
import {
  calculateCost,
  CallType,
  ProcessingMode,
} from '../config/llm-pricing.config';
import { Prisma } from '../../generated/prisma/client';

interface SessionMetadata {
  receiptId?: string;
  documentType?: string;
  transactionCount?: number;
  processingMode?: ProcessingMode;
}

interface CallBreakdownEntry {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

type CallBreakdown = {
  [key in CallType]?: CallBreakdownEntry;
};

export async function initializeSession(
  userId: string,
  sessionType: 'clarification' | 'batch' | 'sequential' | 'detection' | 'chat',
  sessionId: string | null,
  metadata: SessionMetadata
): Promise<string> {
  try {
    const data: Prisma.LLMUsageSessionCreateInput = {
      user: { connect: { id: userId } },
      receiptId: metadata.receiptId,
      documentType: metadata.documentType,
  transactionCount: metadata.transactionCount,
      processingMode: metadata.processingMode || sessionType,
      callBreakdown: {},
    };


    if (sessionId) {
      if (sessionType === 'clarification') {
        data.clarificationSession = { connect: { id: sessionId } };
      } else if (sessionType === 'batch' || sessionType === 'sequential') {
        data.batchSession = { connect: { id: sessionId } };
      } else if (sessionType === 'chat') {
        data.chatSession = { connect: { id: sessionId } };
      }
    }

    const llmUsageSession = await prisma.lLMUsageSession.create({ data });

    return llmUsageSession.id;
  } catch (error) {
    console.error('Error initializing LLM usage session:', error);
    throw error;
  }
}

export async function trackLLMCall(
  sessionId: string,
  callType: CallType,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  try {
    const cost = calculateCost(provider, model, inputTokens, outputTokens);
    const totalTokens = inputTokens + outputTokens;

    const existingSession = await prisma.lLMUsageSession.findFirst({
      where: {
        OR: [
          { clarificationSessionId: sessionId },
          { batchSessionId: sessionId },
          { chatSessionId: sessionId },
          { id: sessionId }, // Also try direct ID match
        ],
      },
    });

    if (!existingSession) {
      console.warn(
        `LLM usage session not found for sessionId: ${sessionId}. Creating a new one.`
      );
      return;
    }

    const currentBreakdown = (existingSession.callBreakdown as CallBreakdown) || {};

    const existingEntry = currentBreakdown[callType];
    const updatedEntry: CallBreakdownEntry = existingEntry
      ? {
          calls: existingEntry.calls + 1,
          inputTokens: existingEntry.inputTokens + inputTokens,
          outputTokens: existingEntry.outputTokens + outputTokens,
          cost: existingEntry.cost + cost,
        }
      : {
          calls: 1,
          inputTokens,
          outputTokens,
          cost,
        };

    currentBreakdown[callType] = updatedEntry;

    const newTotalInputTokens = existingSession.totalInputTokens + inputTokens;
    const newTotalOutputTokens = existingSession.totalOutputTokens + outputTokens;
    const newTotalTokens = existingSession.totalTokens + totalTokens;
    const newTotalCost = Number(existingSession.totalCostUsd) + cost;

    await prisma.lLMUsageSession.update({
      where: { id: existingSession.id },
      data: {
        totalInputTokens: newTotalInputTokens,
        totalOutputTokens: newTotalOutputTokens,
        totalTokens: newTotalTokens,
        totalCostUsd: newTotalCost,
        callBreakdown: currentBreakdown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error('Error tracking LLM call:', error);

  }
}

export async function finalizeSession(sessionId: string): Promise<void> {
  try {
    const session = await prisma.lLMUsageSession.findFirst({
      where: {
        OR: [
          { clarificationSessionId: sessionId },
          { batchSessionId: sessionId },
          { chatSessionId: sessionId },
          { id: sessionId },
        ],
      },
    });

    if (!session) {
      console.warn(`LLM usage session not found for sessionId: ${sessionId}`);
      return;
    }

    await prisma.lLMUsageSession.update({
      where: { id: session.id },
      data: { completedAt: new Date() },
    });

    await updateUserMetrics(
      session.userId,
      session.totalTokens,
      Number(session.totalCostUsd),
      session.callBreakdown as CallBreakdown,
      session.processingMode as ProcessingMode
    );
  } catch (error) {
    console.error('Error finalizing session:', error);

  }
}

async function updateUserMetrics(
  userId: string,
  tokensUsed: number,
  costUsd: number,
  callBreakdown: CallBreakdown,
  processingMode: ProcessingMode | null
): Promise<void> {
  try {
    let userMetrics = await prisma.userCostMetrics.findUnique({
      where: { userId },
    });

    if (!userMetrics) {
      userMetrics = await prisma.userCostMetrics.create({
        data: {
          user: { connect: { id: userId } },
          monthStartDate: new Date(),
        },
      });
    }

    const now = new Date();
    const monthStart = userMetrics.monthStartDate
      ? new Date(userMetrics.monthStartDate)
      : now;
    const monthsSinceStart =
      (now.getFullYear() - monthStart.getFullYear()) * 12 +
      (now.getMonth() - monthStart.getMonth());

    let currentMonthTokens = userMetrics.currentMonthTokens;
    let currentMonthCost = Number(userMetrics.currentMonthCost);

    if (monthsSinceStart >= 1) {
      currentMonthTokens = 0;
      currentMonthCost = 0;
      monthStart.setMonth(now.getMonth());
      monthStart.setFullYear(now.getFullYear());
    }

    const ocrCalls = callBreakdown.ocr?.calls || 0;
    const detectionCalls = callBreakdown.detection?.calls || 0;
    const extractionCalls = callBreakdown.extraction?.calls || 0;
    const clarificationCalls = callBreakdown.clarification?.calls || 0;
    const embeddingCalls = callBreakdown.embedding?.calls || 0;
    const chatCalls = callBreakdown.chat?.calls || 0;

    const sessionIncrements: Partial<Prisma.UserCostMetricsUpdateInput> = {};
    if (processingMode === 'clarification') {
      sessionIncrements.clarificationSessions = {
        increment: 1,
      };
    } else if (processingMode === 'batch') {
      sessionIncrements.batchSessions = { increment: 1 };
    } else if (processingMode === 'sequential') {
      sessionIncrements.sequentialSessions = { increment: 1 };
    } else if (processingMode === 'chat') {
      sessionIncrements.chatSessions = { increment: 1 };
    }

    await prisma.userCostMetrics.update({
      where: { userId },
      data: {
        totalTokensUsed: { increment: tokensUsed },
        totalCostUsd: { increment: costUsd },
        currentMonthTokens: currentMonthTokens + tokensUsed,
        currentMonthCost: currentMonthCost + costUsd,
        monthStartDate: monthStart,
        ocrCalls: { increment: ocrCalls },
        detectionCalls: { increment: detectionCalls },
        extractionCalls: { increment: extractionCalls },
        clarificationCalls: { increment: clarificationCalls },
        embeddingCalls: { increment: embeddingCalls },
        chatCalls: { increment: chatCalls },
        ...sessionIncrements,
      },
    });
  } catch (error) {
    console.error('Error updating user metrics:', error);
  }
}

export async function getUserUsageStats(
  userId: string,
  period: 'all-time' | 'current-month' = 'all-time'
) {
  try {
    const userMetrics = await prisma.userCostMetrics.findUnique({
      where: { userId },
    });

    if (!userMetrics) {
      return {
        tokensUsed: 0,
        costUsd: 0,
        sessionCounts: {
          clarification: 0,
          batch: 0,
          sequential: 0,
        },
        callCounts: {
          ocr: 0,
          detection: 0,
          extraction: 0,
          clarification: 0,
          embedding: 0,
        },
      };
    }

    if (period === 'current-month') {
      return {
        tokensUsed: userMetrics.currentMonthTokens,
        costUsd: Number(userMetrics.currentMonthCost),
        monthStartDate: userMetrics.monthStartDate,
      };
    }

    return {
      tokensUsed: userMetrics.totalTokensUsed,
      costUsd: Number(userMetrics.totalCostUsd),
      sessionCounts: {
        clarification: userMetrics.clarificationSessions,
        batch: userMetrics.batchSessions,
        sequential: userMetrics.sequentialSessions,
      },
      callCounts: {
        ocr: userMetrics.ocrCalls,
        detection: userMetrics.detectionCalls,
        extraction: userMetrics.extractionCalls,
        clarification: userMetrics.clarificationCalls,
        embedding: userMetrics.embeddingCalls,
      },
      currentMonth: {
        tokensUsed: userMetrics.currentMonthTokens,
        costUsd: Number(userMetrics.currentMonthCost),
        monthStartDate: userMetrics.monthStartDate,
      },
    };
  } catch (error) {
    console.error('Error getting user usage stats:', error);
    throw error;
  }
}

export async function getUserRecentSessions(userId: string, limit: number = 10) {
  try {
    const sessions = await prisma.lLMUsageSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        totalInputTokens: true,
        totalOutputTokens: true,
        totalTokens: true,
        totalCostUsd: true,
        callBreakdown: true,
        receiptId: true,
        documentType: true,
        transactionCount: true,
        processingMode: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });

    return sessions.map((session) => ({
      ...session,
      totalCostUsd: Number(session.totalCostUsd),
    }));
  } catch (error) {
    console.error('Error getting user recent sessions:', error);
    throw error;
  }
}

export async function resetMonthlyMetrics(userId: string): Promise<void> {
  try {
    const now = new Date();
    await prisma.userCostMetrics.update({
      where: { userId },
      data: {
        currentMonthTokens: 0,
        currentMonthCost: 0,
        monthStartDate: now,
      },
    });
  } catch (error) {
    console.error('Error resetting monthly metrics:', error);
  }
}
