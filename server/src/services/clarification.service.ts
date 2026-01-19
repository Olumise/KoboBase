import { ChatOpenAI } from "@langchain/openai";
import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";
import {
	ClarificationMessageType,
	createClarificationSessionSchema,
	CreateClarificationSessionType,
} from "../schema/clarification";
import { TransactionReceiptAiResponseSchema } from "../schema/ai-formats";
import { RECEIPT_TRANSACTION_SYSTEM_PROMPT } from "../lib/prompts";

export const createClarification = async (
	data: CreateClarificationSessionType
) => {
	createClarificationSessionSchema.parse(data);
	const { receiptId, userId, extractedData } = data;

	if (!receiptId) {
		throw new AppError(400, "Receipt Id required!", "createClarification");
	}

	const receipt = await prisma.receipt.findUnique({
		where: {
			id: receiptId,
		},
	});

	if (!receipt) {
		throw new AppError(404, "Receipt not found!", "createClarification");
	}

	if (receipt.userId !== userId) {
		throw new AppError(
			403,
			"You are not authorized to create a clarification session for this receipt!",
			"createClarification"
		);
	}

	if (receipt.processingStatus !== "processed") {
		throw new AppError(
			400,
			"Receipt must be processed before creating a clarification session!",
			"createClarification"
		);
	}

	if (!receipt.rawOcrText) {
		throw new AppError(
			400,
			"Receipt has no extracted text!",
			"createClarification"
		);
	}

	const existingSession = await prisma.clarificationSession.findFirst({
		where: {
			receiptId,
			status: "active",
		},
	});

	if (existingSession) {
		throw new AppError(
			400,
			"An active clarification session already exists for this receipt!",
			"createClarification"
		);
	}

	const dataToStore = extractedData || receipt.rawOcrText;

	const clarificationSession = await prisma.clarificationSession.create({
		data: {
			receiptId,
			userId,
			extractedData: dataToStore,
			status: "active",
		},
		include: {
			receipt: true,
			clarificationMessages: true,
		},
	});

	const OpenAIllm = new ChatOpenAI({
		model: "gpt-4o",
		temperature: 0,
	});

	const transactionllm = OpenAIllm.withStructuredOutput(
		TransactionReceiptAiResponseSchema,
		{ name: "extract_transaction", strict: true }
	);

	const initialPrompt = [
		{
			role: "system",
			content: `${RECEIPT_TRANSACTION_SYSTEM_PROMPT}\n\nReceipt OCR Text:\n${dataToStore}`,
		},
		{
			role: "user",
			content: "Please extract all transaction details from this receipt.",
		},
	];

	const aiResponse = await transactionllm.invoke(initialPrompt);

	await prisma.clarificationMessage.create({
		data: {
			sessionId: clarificationSession.id,
			role: "assistant",
			messageText: JSON.stringify(aiResponse),
		},
	});

	const updatedSession = await prisma.clarificationSession.findUnique({
		where: {
			id: clarificationSession.id,
		},
		include: {
			receipt: true,
			clarificationMessages: true,
		},
	});

	return updatedSession;
};

export const getClarificationSession = async (
	sessionId: string,
	userId: string
) => {
	if (!sessionId) {
		throw new AppError(400, "Session Id required!", "getClarificationSession");
	}

	const session = await prisma.clarificationSession.findUnique({
		where: {
			id: sessionId,
		},
		include: {
			receipt: true,
			clarificationMessages: {
				orderBy: {
					createdAt: "asc",
				},
			},
		},
	});

	if (!session) {
		throw new AppError(
			404,
			"Clarification session not found!",
			"getClarificationSession"
		);
	}

	if (session.userId !== userId) {
		throw new AppError(
			403,
			"You are not authorized to view this clarification session!",
			"getClarificationSession"
		);
	}

	return session;
};

export const completeClarificationSession = async (
	sessionId: string,
	userId: string
) => {
	if (!sessionId) {
		throw new AppError(
			400,
			"Session Id required!",
			"completeClarificationSession"
		);
	}

	const session = await prisma.clarificationSession.findUnique({
		where: {
			id: sessionId,
		},
	});

	if (!session) {
		throw new AppError(
			404,
			"Clarification session not found!",
			"completeClarificationSession"
		);
	}

	if (session.userId !== userId) {
		throw new AppError(
			403,
			"You are not authorized to complete this clarification session!",
			"completeClarificationSession"
		);
	}

	if (session.status === "completed") {
		throw new AppError(
			400,
			"This clarification session is already completed!",
			"completeClarificationSession"
		);
	}

	const updatedSession = await prisma.clarificationSession.update({
		where: {
			id: sessionId,
		},
		data: {
			status: "completed",
			completedAt: new Date(),
		},
		include: {
			receipt: true,
			clarificationMessages: true,
		},
	});

	return updatedSession;
};

export const getUserClarificationSessions = async (
	userId: string,
	receiptId?: string
) => {
	const sessions = await prisma.clarificationSession.findMany({
		where: {
			userId,
			...(receiptId && { receiptId }),
		},
		include: {
			receipt: true,
			clarificationMessages: {
				orderBy: {
					createdAt: "asc",
				},
			},
		},
		orderBy: {
			startedAt: "desc",
		},
	});

	return sessions;
};

export const sendClarificationMessage = async (
	sessionId: string,
	userId: string,
	message: string
) => {
	if (!sessionId) {
		throw new AppError(400, "Session Id required!", "sendClarificationMessage");
	}

	if (!message || message.trim() === "") {
		throw new AppError(400, "Message cannot be empty!", "sendClarificationMessage");
	}

	const session = await prisma.clarificationSession.findUnique({
		where: {
			id: sessionId,
		},
		include: {
			receipt: true,
		},
	});

	if (!session) {
		throw new AppError(404, "Clarification session not found!", "sendClarificationMessage");
	}

	if (session.userId !== userId) {
		throw new AppError(
			403,
			"You are not authorized to chat on this session!",
			"sendClarificationMessage"
		);
	}

	if (session.status !== "active") {
		throw new AppError(
			400,
			"Cannot send messages to a completed session!",
			"sendClarificationMessage"
		);
	}

	await prisma.clarificationMessage.create({
		data: {
			sessionId: session.id,
			role: "user",
			messageText: message,
		},
	});

	const allMessages = await prisma.clarificationMessage.findMany({
		where: {
			sessionId: session.id,
		},
		orderBy: {
			createdAt: "asc",
		},
	});

	const OpenAIllm = new ChatOpenAI({
		model: "gpt-4o",
		temperature: 0,
	});

	const transactionllm = OpenAIllm.withStructuredOutput(
		TransactionReceiptAiResponseSchema,
		{ name: "extract_transaction", strict: true }
	);

	const conversationHistory = [
		{
			role: "system",
			content: `${RECEIPT_TRANSACTION_SYSTEM_PROMPT}\n\nReceipt OCR Text:\n${session.extractedData}`,
		},
		...allMessages.map((msg) => ({
			role: msg.role as "user" | "assistant",
			content: msg.messageText,
		})),
	];

	const aiResponse = await transactionllm.invoke(conversationHistory);

	const aiMessage = await prisma.clarificationMessage.create({
		data: {
			sessionId: session.id,
			role: "assistant",
			messageText: JSON.stringify(aiResponse),
		},
	});

	return {
		userMessage: message,
		aiResponse: aiResponse,
		aiMessage: aiMessage,
		sessionId: session.id,
	};
};
