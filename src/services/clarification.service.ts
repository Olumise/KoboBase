import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";
import {
	ClarificationMessageType,
	createClarificationSessionSchema,
	CreateClarificationSessionType,
} from "../schema/clarification";
import {
	TransactionReceiptAiResponseSchema,
	BatchTransactionInitiationResponse,
	BatchTransactionInitiationItem,
} from "../schema/ai-formats";
import { buildExtractionPrompt } from "../lib/prompts";
import { executeAITool } from "./aiToolExecutor.service";
import { allAITools } from "../tools";
import { shouldRequireConfirmation, generateConfirmationQuestion } from "../config/toolConfirmations";
import { OpenAIllm } from "../models/llm.models";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { countTokensForMessages, extractTokenUsageFromResponse, estimateOutputTokens, estimateTokensForTools } from "../utils/tokenCounter";
import { trackLLMCall, initializeSession, finalizeSession } from "./costTracking.service";

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

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, name: true, defaultCurrency: true, customContextPrompt: true },
	});

	if (!user) {
		throw new AppError(404, "User not found", "createClarification");
	}

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

	const systemPrompt = buildExtractionPrompt({
		userId: user.id,
		userName: user.name,
		defaultCurrency: user.defaultCurrency,
		mode: 'single',
		hasTools: false,
		customContext: user.customContextPrompt || undefined,
	});

	const transactionllm = OpenAIllm.withStructuredOutput(
		TransactionReceiptAiResponseSchema,
		{ name: "extract_transaction", strict: true }
	);

	const initialPrompt = [
		new SystemMessage({
			content: systemPrompt,
			additional_kwargs: {
				cache_control: { type: "standard" }
			}
		}),
		new HumanMessage({
			content: `Receipt OCR Text:\n${dataToStore}\n\nPlease extract all transaction details from this receipt.`,
		}),
	];

	const inputTokens = await countTokensForMessages(initialPrompt);

	const aiResponse = await transactionllm.invoke(initialPrompt);

	const tokenUsage = extractTokenUsageFromResponse(aiResponse);
	const outputTokens = tokenUsage?.outputTokens || estimateOutputTokens(aiResponse);

	let llmUsageSessionId: string | undefined;
	try {
		llmUsageSessionId = await initializeSession(userId, "clarification", clarificationSession.id, {
			receiptId,
			processingMode: "clarification",
		});

		await trackLLMCall(
			llmUsageSessionId,
			"clarification",
			"openai",
			"gpt-4o",
			inputTokens,
			outputTokens
		);
	} catch (trackingError) {
		console.error("Failed to track clarification LLM call:", trackingError);
	}

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

	// Finalize LLM usage session
	try {
		await finalizeSession(sessionId);
	} catch (trackingError) {
		console.error("Failed to finalize clarification session:", trackingError);
	}

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
): Promise<BatchTransactionInitiationResponse | {
	userMessage: string;
	aiResponse: any;
	aiMessage: any;
	sessionId: string;
	isComplete: boolean;
	transaction: any;
} | {
	userMessage: string;
	needsConfirmation: boolean;
	questions: any[];
	pendingToolCalls: any[];
	sessionId: string;
	status: string;
}> => {
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
			user: {
				select: { id: true, name: true, defaultCurrency: true, customContextPrompt: true },
			},
			clarificationMessages: {
				orderBy: {
					createdAt: "asc",
				},
			},
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

	const systemPrompt = buildExtractionPrompt({
		userId: session.user.id,
		userName: session.user.name,
		defaultCurrency: session.user.defaultCurrency,
		mode: 'single',
		hasTools: true,
		customContext: session.user.customContextPrompt || undefined,
	});

	await prisma.clarificationMessage.create({
		data: {
			sessionId: session.id,
			role: "user",
			messageText: message,
		},
	});

	// Use messages from session include instead of separate query
	const allMessages = [...session.clarificationMessages, {
		sessionId: session.id,
		role: "user" as const,
		messageText: message,
		createdAt: new Date(),
		id: "temp", // Temporary ID for the just-created message
	}];

	const existingToolResults = (session.toolResults as any) || {};

	const conversationHistory = [
		new SystemMessage({
			content: `${systemPrompt}\n\nReceipt OCR Text:\n${session.extractedData}`,
			additional_kwargs: {
				cache_control: { type: "standard" }
			}
		}),
		...allMessages.map((msg) =>
			msg.role === "user"
				? new HumanMessage({ content: msg.messageText })
				: new AIMessage({ content: msg.messageText })
		),
	];

	// Count input tokens (including tool definitions)
	const baseInputTokens = await countTokensForMessages(conversationHistory);
	const toolTokens = estimateTokensForTools(allAITools);
	const totalInputTokens = baseInputTokens + toolTokens;

	const llmWithTools = OpenAIllm.bindTools(allAITools, {
		tool_choice: "auto",
	});

	const aiResponseWithTools = await llmWithTools.invoke(conversationHistory);

	// Extract output tokens
	const tokenUsage = extractTokenUsageFromResponse(aiResponseWithTools);
	const outputTokens = tokenUsage?.outputTokens || estimateOutputTokens(aiResponseWithTools);

	// Track LLM call
	try {
		await trackLLMCall(
			session.id,
			"clarification",
			"openai",
			"gpt-4o",
			totalInputTokens,
			outputTokens
		);
	} catch (trackingError) {
		console.error("Failed to track clarification message LLM call:", trackingError);
	}

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


	const toolExecutionPromises = autoExecuteTools.map(async (toolCall) => {
		const result = await executeAITool(toolCall.name as any, toolCall.args);
		return { name: toolCall.name, result };
	});

	const results = await Promise.all(toolExecutionPromises);
	const newToolResults: Record<string, any> = {};
	results.forEach(({ name, result }) => {
		newToolResults[name] = result;
	});

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

		// Create a conversational default message based on the number of confirmations needed
		const defaultMessage = confirmationTools.length === 1
			? "I found something new in this receipt - just need your quick approval!"
			: `I found ${confirmationTools.length} new items in this receipt. Mind confirming these for me?`;

		await prisma.clarificationMessage.create({
			data: {
				sessionId: session.id,
				role: "assistant",
				messageText: JSON.stringify({
					message: aiResponseWithTools.content || defaultMessage,
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

	// Smart caching: Check if we should skip redundant AI call
	const hasNewToolResults = Object.keys(newToolResults).length > 0;
	const lastAssistantMessage = allMessages.filter(m => m.role === 'assistant').pop();
	const isSimpleResponse = message.trim().length < 100 &&
	                         !hasNewToolResults &&
	                         lastAssistantMessage;

	let aiResponse;

	// Try to reuse cached response for simple clarifications
	if (isSimpleResponse) {
		try {
			const parsedResponse = JSON.parse(lastAssistantMessage.messageText);
			// Only reuse if it's a valid structured response
			if (parsedResponse && typeof parsedResponse === 'object' && parsedResponse.is_complete !== undefined) {
				aiResponse = parsedResponse;
				console.log('✓ Reusing cached AI response - no re-extraction needed');
			}
		} catch (e) {
			// If parsing fails, we'll generate a new response below
			aiResponse = null;
		}
	}

	// Generate new response only if we don't have a cached one
	if (!aiResponse) {
		const finalPrompt = [
			{
				role: "system",
				content: `${systemPrompt}\n\nReceipt OCR Text:\n${session.extractedData}\n\nTool Results:\n${JSON.stringify(allToolResults, null, 2)}`,
			},
			...conversationHistory.slice(1),
			{
				role: "user",
				content: `Evaluate the transaction based on the conversation history and tool results.

CRITICAL - Extract IDs from tool results (nested structure {"success": true, "data": {...}}):

1. category_id:
   - First, determine the best category NAME for this transaction (e.g., "Groceries", "Food", "Transport")
   - Access toolResults.get_category.data.categories array
   - Find the category object whose "name" field matches your chosen category (case-insensitive)
   - Extract that category's "id" field
   - MUST be a valid UUID string OR null (if no match or empty array)

2. contact_id:
   - Access toolResults.get_or_create_contact.data.id
   - This is the UUID of the external party (recipient or sender)
   - MUST be a valid UUID string OR null

3. user_bank_account_id:
   - Access toolResults.get_bank_account_by_id.data.account.id
   - This is the UUID of the user's bank account
   - MUST be a valid UUID string OR null

Populate ALL enrichment_data fields. NEVER leave any field undefined. Follow all validation rules including description validation.`,
			},
		];

		const transactionllm = OpenAIllm.withStructuredOutput(
			TransactionReceiptAiResponseSchema,
			{ name: "extract_transaction", strict: true }
		);

		aiResponse = await transactionllm.invoke(finalPrompt);
	}

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

	const batchSession = await prisma.batchSession.findFirst({
		where: {
			receiptId: session.receiptId,
			userId,
			status: "in_progress",
			processingMode: "sequential",
		},
	});

	if (batchSession) {
		console.log('Its a Batch session')
		const extractedData = batchSession.extractedData as any;
		const transactionResults = extractedData?.transaction_results || [];
		const currentIndex = batchSession.currentIndex || 0;
console.log('the batch session', batchSession)
		if (currentIndex < transactionResults.length) {
			const currentTransaction = {
				transaction_index: currentIndex,
				needs_clarification: aiResponse.is_complete === "false",
				needs_confirmation: false,
				clarification_session_id: session.id,
				is_complete: aiResponse.is_complete,
				confidence_score: aiResponse.confidence_score,
				transaction: aiResponse.transaction,
				missing_fields: aiResponse.missing_fields,
				questions: aiResponse.questions,
				enrichment_data: aiResponse.enrichment_data,
				notes: aiResponse.notes,
			};
			console.log('currentTransaction', currentTransaction)

			transactionResults[currentIndex] = currentTransaction;

			await prisma.batchSession.update({
				where: { id: batchSession.id },
				data: {
					extractedData: {
						...extractedData,
						transaction_results: transactionResults,
					},
				},
			});

			return {
				batch_session_id: batchSession.id,
				total_transactions: transactionResults.length,
				successfully_initiated: aiResponse.is_complete === "true" ? 1 : 0,
				transactions: [currentTransaction],
				overall_confidence: aiResponse.confidence_score,
				processing_notes: aiResponse.is_complete === "true"
					? `Transaction ${currentIndex + 1} of ${transactionResults.length} is now complete and ready for approval.`
					: `Transaction ${currentIndex + 1} of ${transactionResults.length} still needs clarification.`,
			};
		}
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
): Promise<BatchTransactionInitiationResponse | {
	success: boolean;
	toolResults: any;
	aiResponse: any;
	isComplete: boolean;
	transaction: any;
}> => {
	const session = await prisma.clarificationSession.findUnique({
		where: { id: sessionId },
		include: {
			receipt: true,
			user: {
				select: { id: true, name: true, defaultCurrency: true, customContextPrompt: true },
			},
			clarificationMessages: {
				orderBy: { createdAt: "asc" },
			},
		},
	});

	if (!session || session.userId !== userId) {
		throw new AppError(404, "Clarification session not found", "handleConfirmationResponse");
	}

	if (session.status !== "pending_confirmation") {
		throw new AppError(400, "Session is not awaiting confirmation", "handleConfirmationResponse");
	}

	const systemPrompt = buildExtractionPrompt({
		userId: session.user.id,
		userName: session.user.name,
		defaultCurrency: session.user.defaultCurrency,
		mode: 'single',
		hasTools: true,
		customContext: session.user.customContextPrompt || undefined,
	});

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

	// Use messages from session include instead of separate query
	const allMessages = session.clarificationMessages;

	const finalPrompt = [
		{
			role: "system",
			content: `${systemPrompt}\n\nReceipt OCR Text:\n${session.extractedData}\n\nTool Results:\n${JSON.stringify(newToolResults, null, 2)}`,
		},
		...allMessages.map((msg) => ({
			role: msg.role as "user" | "assistant",
			content: msg.messageText,
		})),
		{
			role: "user",
			content: `Evaluate the transaction based on the conversation history and tool results (including the tools I just confirmed).

CRITICAL - Extract IDs from tool results (nested structure {"success": true, "data": {...}}):

1. category_id:
   - First, determine the best category NAME for this transaction (e.g., "Groceries", "Food", "Transport")
   - Access toolResults.get_category.data.categories array
   - Find the category object whose "name" field matches your chosen category (case-insensitive)
   - Extract that category's "id" field
   - MUST be a valid UUID string OR null (if no match or empty array)

2. contact_id:
   - Access toolResults.get_or_create_contact.data.id
   - This is the UUID of the external party (recipient or sender)
   - MUST be a valid UUID string OR null

3. user_bank_account_id:
   - Access toolResults.get_bank_account_by_id.data.account.id
   - This is the UUID of the user's bank account
   - MUST be a valid UUID string OR null

Populate ALL enrichment_data fields. NEVER leave any field undefined. Follow all validation rules including description validation.`,
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

	const batchSession = await prisma.batchSession.findFirst({
		where: {
			receiptId: session.receiptId,
			userId,
			status: "in_progress",
			processingMode: "sequential",
		},
	});

	if (batchSession) {
		const extractedData = batchSession.extractedData as any;
		const transactionResults = extractedData?.transaction_results || [];
		const currentIndex = batchSession.currentIndex || 0;

		if (currentIndex < transactionResults.length) {
			const currentTransaction = {
				transaction_index: currentIndex,
				needs_clarification: aiResponse.is_complete === "false",
				needs_confirmation: false,
				clarification_session_id: session.id,
				is_complete: aiResponse.is_complete,
				confidence_score: aiResponse.confidence_score,
				transaction: aiResponse.transaction,
				missing_fields: aiResponse.missing_fields,
				questions: aiResponse.questions,
				enrichment_data: aiResponse.enrichment_data,
				notes: aiResponse.notes,
			};

			transactionResults[currentIndex] = currentTransaction;

			await prisma.batchSession.update({
				where: { id: batchSession.id },
				data: {
					extractedData: {
						...extractedData,
						transaction_results: transactionResults,
					},
				},
			});

			return {
				batch_session_id: batchSession.id,
				total_transactions: transactionResults.length,
				successfully_initiated: aiResponse.is_complete === "true" ? 1 : 0,
				transactions: [currentTransaction],
				overall_confidence: aiResponse.confidence_score,
				processing_notes: aiResponse.is_complete === "true"
					? `Transaction ${currentIndex + 1} of ${transactionResults.length} is now complete and ready for approval.`
					: `Transaction ${currentIndex + 1} of ${transactionResults.length} still needs clarification.`,
			};
		}
	}

	return {
		success: true,
		toolResults: newToolResults,
		aiResponse: aiResponse,
		isComplete: aiResponse.is_complete === "true",
		transaction: enrichedTransaction,
	};
};
