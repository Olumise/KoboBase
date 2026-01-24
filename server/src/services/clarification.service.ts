import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";
import {
	ClarificationMessageType,
	createClarificationSessionSchema,
	CreateClarificationSessionType,
} from "../schema/clarification";
import { TransactionReceiptAiResponseSchema } from "../schema/ai-formats";
import { RECEIPT_TRANSACTION_SYSTEM_PROMPT } from "../lib/prompts";
import { executeAITool } from "./aiToolExecutor.service";
import { allAITools } from "../tools";
import { shouldRequireConfirmation, generateConfirmationQuestion } from "../config/toolConfirmations";
import { OpenAIllm } from "../models/llm.models";

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
	userId: string,
	transactionId?: string
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
			...(transactionId && { transactionId }),
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

	const existingToolResults = (session.toolResults as any) || {};

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

	const llmWithTools = OpenAIllm.bindTools(allAITools, {
		tool_choice: "auto",
	});

	const aiResponseWithTools = await llmWithTools.invoke(conversationHistory);

	const newToolCalls = aiResponseWithTools.tool_calls || [];

	const autoExecuteTools = [];
	const confirmationTools = [];

	for (const toolCall of newToolCalls) {
		if (shouldRequireConfirmation(toolCall.name)) {
			confirmationTools.push(toolCall);
		} else {
			autoExecuteTools.push(toolCall);
		}
	}


	const newToolResults: Record<string, any> = {};

	for (const toolCall of autoExecuteTools) {
		const result = await executeAITool(toolCall.name as any, toolCall.args);
		newToolResults[toolCall.name] = result;
	}

	const allToolResults = { ...existingToolResults, ...newToolResults };


	if (confirmationTools.length > 0) {
		await prisma.clarificationSession.update({
			where: { id: session.id },
			data: {
				status: "pending_confirmation",
				pendingToolCalls: confirmationTools,
				toolResults: allToolResults,
			},
		});

		const questions = confirmationTools.map(tc =>
			generateConfirmationQuestion(tc.name, tc.args)
		);

		await prisma.clarificationMessage.create({
			data: {
				sessionId: session.id,
				role: "assistant",
				messageText: JSON.stringify({
					message: aiResponseWithTools.content || "I need your confirmation for some actions.",
					questions,
					pendingActions: confirmationTools.length,
					toolCalls: confirmationTools,
				}),
			},
		});

		return {
			userMessage: message,
			needsConfirmation: true,
			questions,
			pendingToolCalls: confirmationTools,
			sessionId: session.id,
			status: "pending_confirmation",
		};
	}

	// Update tool results if any were executed
	if (Object.keys(newToolResults).length > 0) {
		await prisma.clarificationSession.update({
			where: { id: session.id },
			data: { toolResults: allToolResults },
		});
	}

	const finalPrompt = [
		{
			role: "system",
			content: `${RECEIPT_TRANSACTION_SYSTEM_PROMPT}\n\nReceipt OCR Text:\n${session.extractedData}\n\nTool Results:\n${JSON.stringify(allToolResults, null, 2)}`,
		},
		...conversationHistory.slice(1),
		{
			role: "user",
			content: "Evaluate the transaction based on the conversation history and tool results. Extract IDs from tool results and populate enrichment_data fields. Follow all validation rules including description validation.",
		},
	];

	const transactionllm = OpenAIllm.withStructuredOutput(
		TransactionReceiptAiResponseSchema,
		{ name: "extract_transaction", strict: true }
	);

	const aiResponse = await transactionllm.invoke(finalPrompt);

	const aiMessage = await prisma.clarificationMessage.create({
		data: {
			sessionId: session.id,
			role: "assistant",
			messageText: JSON.stringify(aiResponse),
		},
	});

	let enrichedTransaction = null;
	if (aiResponse.is_complete === "true" && aiResponse.transaction) {
		enrichedTransaction = {
			...aiResponse.transaction,
			categoryId: allToolResults.get_or_create_category?.data?.id,
			contactId: allToolResults.get_or_create_contact?.data?.id,
			userBankAccountId: aiResponse.enrichment_data?.user_bank_account_id,
			toBankAccountId: aiResponse.enrichment_data?.to_bank_account_id,
			isSelfTransaction: aiResponse.enrichment_data?.is_self_transaction || false,
		};
	}

	return {
		userMessage: message,
		aiResponse: aiResponse,
		aiMessage: aiMessage,
		sessionId: session.id,
		isComplete: aiResponse.is_complete === "true",
		transaction: enrichedTransaction,
	};
};

export const handleConfirmationResponse = async (
	sessionId: string,
	userId: string,
	confirmations: Record<string, boolean>
) => {
	const session = await prisma.clarificationSession.findUnique({
		where: { id: sessionId },
		include: { receipt: true },
	});

	if (!session || session.userId !== userId) {
		throw new AppError(404, "Clarification session not found", "handleConfirmationResponse");
	}

	if (session.status !== "pending_confirmation") {
		throw new AppError(400, "Session is not awaiting confirmation", "handleConfirmationResponse");
	}

	const pendingToolCalls = session.pendingToolCalls as any[];
	const existingToolResults = session.toolResults as any || {};

	const newToolResults = { ...existingToolResults };

	for (const toolCall of pendingToolCalls) {
		const isConfirmed = confirmations[toolCall.name];

		if (isConfirmed) {
			const result = await executeAITool(toolCall.name as any, toolCall.args);
			newToolResults[toolCall.name] = result;
		} else {
			newToolResults[toolCall.name] = {
				success: false,
				skipped: true,
				reason: "User declined",
			};
		}
	}

	await prisma.clarificationSession.update({
		where: { id: sessionId },
		data: {
			status: "active",
			toolResults: newToolResults,
			pendingToolCalls: undefined,
		},
	});

	const allMessages = await prisma.clarificationMessage.findMany({
		where: { sessionId: session.id },
		orderBy: { createdAt: "asc" },
	});

	const finalPrompt = [
		{
			role: "system",
			content: `${RECEIPT_TRANSACTION_SYSTEM_PROMPT}\n\nReceipt OCR Text:\n${session.extractedData}\n\nTool Results:\n${JSON.stringify(newToolResults, null, 2)}`,
		},
		...allMessages.map((msg) => ({
			role: msg.role as "user" | "assistant",
			content: msg.messageText,
		})),
		{
			role: "user",
			content: "Evaluate the transaction based on the conversation history and tool results (including the tools I just confirmed). Extract IDs from tool results and populate enrichment_data fields. Follow all validation rules including description validation.",
		},
	];

	const transactionllm = OpenAIllm.withStructuredOutput(
		TransactionReceiptAiResponseSchema,
		{ name: "extract_transaction", strict: true }
	);

	const aiResponse = await transactionllm.invoke(finalPrompt);

	await prisma.clarificationMessage.create({
		data: {
			sessionId: session.id,
			role: "assistant",
			messageText: JSON.stringify(aiResponse),
		},
	});

	let enrichedTransaction = null;
	if (aiResponse.is_complete === "true" && aiResponse.transaction) {
		enrichedTransaction = {
			...aiResponse.transaction,
			categoryId: newToolResults.get_or_create_category?.data?.id,
			contactId: newToolResults.get_or_create_contact?.data?.id,
			userBankAccountId: aiResponse.enrichment_data?.user_bank_account_id,
			toBankAccountId: aiResponse.enrichment_data?.to_bank_account_id,
			isSelfTransaction: aiResponse.enrichment_data?.is_self_transaction || false,
		};
	}

	return {
		success: true,
		toolResults: newToolResults,
		aiResponse: aiResponse,
		isComplete: aiResponse.is_complete === "true",
		transaction: enrichedTransaction,
	};
};
