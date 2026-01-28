import {
	BatchTransactionInitiationResponse,
	BatchTransactionInitiationItem,
	BatchTransactionInitiationItemSchema,
} from "../schema/ai-formats";
import { OpenAIllmGPT4Turbo as OpenAIllm, OpenAIllmCreative } from "../models/llm.models";
import { AppError } from "../middlewares/errorHandler";
import { prisma } from "../lib/prisma";
import { allAITools } from "../tools";
import { executeAITool } from "./aiToolExecutor.service";
import {
	shouldRequireConfirmation,
	generateConfirmationQuestion,
} from "../config/toolConfirmations";
import { buildExtractionPrompt } from "../lib/prompts";
import { initiateSequentialProcessing } from "./sequentialExtraction.service";
import * as z from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { countTokensForMessages, extractTokenUsageFromResponse, estimateOutputTokens, estimateTokensForTools } from "../utils/tokenCounter";
import { trackLLMCall, initializeSession } from "./costTracking.service";

export const initiateBatchTransactionsFromReceipt = async (
	receiptId: string,
	userId: string,
	userBankAccountId: string
): Promise<BatchTransactionInitiationResponse> => {
	if (!receiptId) {
		throw new AppError(400, "Receipt ID required!", "initiateBatchTransactionsFromReceipt");
	}

	if (!userBankAccountId) {
		throw new AppError(400, "Bank Account ID is required!", "initiateBatchTransactionsFromReceipt");
	}

	const receipt = await prisma.receipt.findUnique({
		where: { id: receiptId },
	});

	if (!receipt) {
		throw new AppError(404, "Receipt not found!", "initiateBatchTransactionsFromReceipt");
	}

	if (receipt.userId !== userId) {
		throw new AppError(403, "You are not authorized to access this receipt!", "initiateBatchTransactionsFromReceipt");
	}

	if (receipt.processingStatus !== "processed") {
		throw new AppError(400, "Receipt must be processed before initiating transactions!", "initiateBatchTransactionsFromReceipt");
	}

	if (!receipt.rawOcrText) {
		throw new AppError(400, "Receipt has no extracted text!", "initiateBatchTransactionsFromReceipt");
	}

	const existingSession = await prisma.batchSession.findFirst({
		where: {
			receiptId,
			userId,
			status: "in_progress",
		},
	});

	if (existingSession && existingSession.processingMode === "sequential") {
		return initiateSequentialProcessing(receiptId, userId, userBankAccountId);
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, name: true, defaultCurrency: true, customContextPrompt: true },
	});

	if (!user) {
		throw new AppError(404, "User not found", "initiateBatchTransactionsFromReceipt");
	}

	const bankAccount = await prisma.bankAccount.findFirst({
		where: {
			id: userBankAccountId,
			userId: userId,
			isActive: true,
		},
	});

	if (!bankAccount) {
		throw new AppError(404, "Bank account not found or inactive!", "initiateBatchTransactionsFromReceipt");
	}

	let existingBatchSession = await prisma.batchSession.findFirst({
		where: {
			receiptId,
			userId,
			status: "in_progress",
		},
	});

	if (existingBatchSession && existingBatchSession.processingMode === "batch") {
		const extractedData = existingBatchSession.extractedData as any;
		const hasTransactionResults = extractedData?.transaction_results && extractedData.transaction_results.length > 0;

		if (hasTransactionResults) {
			return {
				batch_session_id: existingBatchSession.id,
				total_transactions: existingBatchSession.totalExpected || 0,
				successfully_initiated: existingBatchSession.totalProcessed || 0,
				transactions: extractedData.transaction_results,
				overall_confidence: 0,
				processing_notes: "Batch session already in progress.",
			};
		}
	}

	const llmWithTools = OpenAIllmCreative.bindTools(allAITools, {});

	const systemPrompt = buildExtractionPrompt({
		userId: user.id,
		userName: user.name,
		defaultCurrency: user.defaultCurrency,
		mode: 'batch',
		hasTools: true,
		userBankAccountId: userBankAccountId,
		customContext: user.customContextPrompt || undefined,
	});

	const initialPrompt = [
		new SystemMessage({
			content: systemPrompt,
			additional_kwargs: {
				cache_control: { type: "ephemeral" }
			}
		}),
		new HumanMessage({
			content: `Receipt OCR Text:\n${receipt.rawOcrText}\n\nPlease extract ALL distinct transactions from this document and call the appropriate tools for EACH transaction.`,
		}),
	];

	// Count input tokens (including tool definitions)
	const baseInputTokens = await countTokensForMessages(initialPrompt);
	const toolTokens = estimateTokensForTools(allAITools);
	const totalInputTokens = baseInputTokens + toolTokens;

	console.log("Invoking LLM with batch tools...");
	const aiResponse = await llmWithTools.invoke(initialPrompt);
	console.log("Batch AI response content:", aiResponse.content);
	console.log("Batch tool calls:", JSON.stringify(aiResponse.tool_calls, null, 2));

	// Extract output tokens
	const tokenUsage = extractTokenUsageFromResponse(aiResponse);
	const outputTokens = tokenUsage?.outputTokens || estimateOutputTokens(aiResponse);

	const toolCalls = aiResponse.tool_calls || [];

	if (toolCalls.length === 0) {
		throw new AppError(500, "AI did not call any tools for batch processing.", "initiateBatchTransactionsFromReceipt");
	}

	const autoExecuteTools = [];
	const confirmationTools = [];

	for (const toolCall of toolCalls) {
		if (shouldRequireConfirmation(toolCall.name)) {
			confirmationTools.push(toolCall);
		} else {
			autoExecuteTools.push(toolCall);
		}
	}

	const autoToolResults: Record<string, any> = {};

	for (const toolCall of autoExecuteTools) {
		try {
			const result = await executeAITool(toolCall.name as any, toolCall.args);
			const resultKey = `${toolCall.name}_${toolCall.id || Math.random()}`;
			autoToolResults[resultKey] = result;
		} catch (error) {
			console.error(`Error executing tool ${toolCall.name}:`, error);
			autoToolResults[`${toolCall.name}_error`] = { error: String(error) };
		}
	}

	console.log("Auto tool results:", JSON.stringify(autoToolResults, null, 2));

	let batchSession;
	let llmUsageSessionId: string | undefined;

	if (existingBatchSession && existingBatchSession.processingMode === "batch") {
		batchSession = await prisma.batchSession.update({
			where: { id: existingBatchSession.id },
			data: {
				extractedData: {
					...(existingBatchSession.extractedData as any),
					aiResponse: typeof aiResponse.content === 'string' ? aiResponse.content : JSON.stringify(aiResponse.content),
					toolCalls: toolCalls.map(tc => ({ name: tc.name, args: tc.args, id: tc.id })),
					autoToolResults: autoToolResults,
					confirmationTools: confirmationTools.map(tc => ({ name: tc.name, args: tc.args, id: tc.id })),
				},
			},
		});
	} else {
		batchSession = await prisma.batchSession.create({
			data: {
				receiptId,
				userId,
				totalExpected: 0,
				totalProcessed: 0,
				currentIndex: 0,
				status: "in_progress",
				processingMode: "batch",
				extractedData: {
					aiResponse: typeof aiResponse.content === 'string' ? aiResponse.content : JSON.stringify(aiResponse.content),
					toolCalls: toolCalls.map(tc => ({ name: tc.name, args: tc.args, id: tc.id })),
					autoToolResults: autoToolResults,
					confirmationTools: confirmationTools.map(tc => ({ name: tc.name, args: tc.args, id: tc.id })),
				},
			},
		});
	}

	// Initialize LLM usage session and track the call
	try {
		llmUsageSessionId = await initializeSession(userId, "batch", batchSession.id, {
			receiptId,
			transactionCount: toolCalls.length,
			processingMode: "batch",
		});

		await trackLLMCall(
			llmUsageSessionId,
			"extraction",
			"openai",
			"gpt-4o",
			totalInputTokens,
			outputTokens
		);
	} catch (trackingError) {
		console.error("Failed to track batch extraction LLM call:", trackingError);
	}

	if (confirmationTools.length > 0) {
		const clarificationSessions = [];

		for (let i = 0; i < confirmationTools.length; i++) {
			const toolCall = confirmationTools[i];

			const clarificationSession = await prisma.clarificationSession.create({
				data: {
					receiptId,
					userId,
					extractedData: receipt.rawOcrText,
					status: "pending_confirmation",
					pendingToolCalls: [toolCall],
					toolResults: autoToolResults,
				},
			});

			const question = generateConfirmationQuestion(toolCall.name, toolCall.args);

			await prisma.clarificationMessage.create({
				data: {
					sessionId: clarificationSession.id,
					role: "assistant",
					messageText: JSON.stringify({
						message: `Transaction confirmation required`,
						questions: [question],
						pendingActions: 1,
						toolCalls: [toolCall],
					}),
				},
			});

			clarificationSessions.push({
				transaction_index: i,
				clarification_session_id: clarificationSession.id,
				questions: [question],
			});
		}

		await prisma.batchSession.update({
			where: { id: batchSession.id },
			data: {
				totalExpected: confirmationTools.length,
				extractedData: {
					...(batchSession.extractedData as any),
					pending_confirmations: clarificationSessions,
				},
			},
		});

		return {
			batch_session_id: batchSession.id,
			total_transactions: confirmationTools.length,
			successfully_initiated: 0,
			transactions: clarificationSessions.map(cs => ({
				transaction_index: cs.transaction_index,
				needs_confirmation: true,
				needs_clarification: false,
				clarification_session_id: cs.clarification_session_id,
				is_complete: "false",
				confidence_score: 0,
				transaction: null,
				missing_fields: null,
				questions: cs.questions,
				enrichment_data: null,
				notes: "Waiting for user confirmation of tool actions",
			})),
			overall_confidence: 0,
			processing_notes: "Some transactions require confirmation before proceeding",
		};
	}

	const BatchExtractionSchema = z.object({
		transactions: z.array(BatchTransactionInitiationItemSchema),
	});

	const llmWithStructuredOutput = OpenAIllm.withStructuredOutput(
		BatchExtractionSchema,
		{ name: "extract_batch_transactions", strict: true }
	);

	const finalPrompt = [
		{
			role: "system",
			content: `${systemPrompt}\n\nReceipt OCR Text:\n${receipt.rawOcrText}\n\nTool Results:\n${JSON.stringify(autoToolResults, null, 2)}`,
		},
		{
			role: "user",
			content: "Based on the receipt text and tool results, extract ALL transactions as an array. For each transaction, provide complete structured data with enrichment_data populated from tool results. Number each transaction with transaction_index starting from 0.",
		},
	];

	console.log("Invoking final structured extraction...");
	const batchExtractionResponse = await llmWithStructuredOutput.invoke(finalPrompt);
	console.log("Batch extraction response:", JSON.stringify(batchExtractionResponse, null, 2));

	const transactionResults: BatchTransactionInitiationItem[] = [];

	for (const txResponse of batchExtractionResponse.transactions) {
		const txIndex = txResponse.transaction_index;

		if (txResponse.is_complete === "false") {
			const clarificationSession = await prisma.clarificationSession.create({
				data: {
					receiptId,
					userId,
					extractedData: receipt.rawOcrText,
					status: "active",
					toolResults: autoToolResults,
				},
			});

			await prisma.clarificationMessage.create({
				data: {
					sessionId: clarificationSession.id,
					role: "assistant",
					messageText: JSON.stringify(txResponse),
				},
			});

			transactionResults.push({
				transaction_index: txIndex,
				needs_clarification: true,
				needs_confirmation: false,
				clarification_session_id: clarificationSession.id,
				is_complete: txResponse.is_complete,
				confidence_score: txResponse.confidence_score,
				transaction: txResponse.transaction,
				missing_fields: txResponse.missing_fields,
				questions: txResponse.questions,
				enrichment_data: txResponse.enrichment_data,
				notes: txResponse.notes,
			});
		} else {
			transactionResults.push({
				transaction_index: txIndex,
				needs_clarification: false,
				needs_confirmation: false,
				clarification_session_id: null,
				is_complete: txResponse.is_complete,
				confidence_score: txResponse.confidence_score,
				transaction: txResponse.transaction,
				missing_fields: txResponse.missing_fields,
				questions: txResponse.questions,
				enrichment_data: txResponse.enrichment_data,
				notes: txResponse.notes,
			});
		}
	}

	const totalTransactions = transactionResults.length;

	if (totalTransactions === 0) {
		await prisma.batchSession.update({
			where: { id: batchSession.id },
			data: {
				status: "failed",
				extractedData: {
					...(batchSession.extractedData as any),
					error: "No transactions found in document",
				},
			},
		});
		throw new AppError(400, "No transactions found in document", "initiateBatchTransactionsFromReceipt");
	}

	const completeTransactions = transactionResults.filter(t => t.is_complete === "true").length;
	const overallConfidence = transactionResults.reduce((sum, t) => sum + t.confidence_score, 0) / totalTransactions;

	await prisma.batchSession.update({
		where: { id: batchSession.id },
		data: {
			totalExpected: totalTransactions,
			totalProcessed: 0,
			extractedData: {
				...(batchSession.extractedData as any),
				extraction_response: batchExtractionResponse,
				transaction_results: transactionResults,
			},
		},
	});

	return {
		batch_session_id: batchSession.id,
		total_transactions: totalTransactions,
		successfully_initiated: completeTransactions,
		transactions: transactionResults,
		overall_confidence: overallConfidence,
		processing_notes: `Extracted ${totalTransactions} transactions. ${completeTransactions} complete, ${totalTransactions - completeTransactions} need clarification.`,
	};
};

export const getBatchExtractionStatus = async (receiptId: string, userId: string) => {
	const batchSession = await prisma.batchSession.findFirst({
		where: {
			receiptId: receiptId,
			userId: userId,
		},
		orderBy: {
			createdAt: 'desc'
		}
	});

	if (!batchSession) {
		return {
			hasSession: false,
			status: null,
			data: null
		};
	}

	const extractedData = batchSession.extractedData as any;
	const transactionResults = extractedData?.transaction_results || null;

	return {
		hasSession: true,
		status: batchSession.status,
		processingMode: batchSession.processingMode,
		totalExpected: batchSession.totalExpected,
		totalProcessed: batchSession.totalProcessed,
		currentIndex: batchSession.currentIndex,
		transactionResults: transactionResults,
		extractedAt: extractedData?.extractedAt || null
	};
};
