import {
	BatchTransactionInitiationResponse,
	BatchTransactionInitiationItem,
	BatchTransactionInitiationItemSchema,
} from "../schema/ai-formats";
import {
	OpenAIllmGPT4Turbo as OpenAIllm,
	OpenAIllmCreative,
} from "../models/llm.models";
import { AppError } from "../middlewares/errorHandler";
import { prisma } from "../lib/prisma";
import { allAITools } from "../tools";
import { executeAITool } from "./aiToolExecutor.service";
import {
	shouldRequireConfirmation,
	generateConfirmationQuestion,
} from "../config/toolConfirmations";
import { BATCH_TRANSACTION_SYSTEM_PROMPT_WITH_TOOLS } from "../lib/prompts";
import { generateEmbedding } from "./embedding.service";
import * as z from "zod";

export const initiateSequentialProcessing = async (
	receiptId: string,
	userId: string,
	userBankAccountId: string
): Promise<BatchTransactionInitiationResponse> => {
	if (!receiptId) {
		throw new AppError(
			400,
			"Receipt ID required!",
			"initiateSequentialProcessing"
		);
	}

	if (!userBankAccountId) {
		throw new AppError(
			400,
			"Bank Account ID is required!",
			"initiateSequentialProcessing"
		);
	}

	const receipt = await prisma.receipt.findUnique({
		where: { id: receiptId },
	});

	if (!receipt) {
		throw new AppError(
			404,
			"Receipt not found!",
			"initiateSequentialProcessing"
		);
	}

	if (receipt.userId !== userId) {
		throw new AppError(
			403,
			"You are not authorized to access this receipt!",
			"initiateSequentialProcessing"
		);
	}

	if (receipt.processingStatus !== "processed") {
		throw new AppError(
			400,
			"Receipt must be processed before initiating transactions!",
			"initiateSequentialProcessing"
		);
	}

	if (!receipt.rawOcrText) {
		throw new AppError(
			400,
			"Receipt has no extracted text!",
			"initiateSequentialProcessing"
		);
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, name: true, defaultCurrency: true },
	});

	if (!user) {
		throw new AppError(404, "User not found", "initiateSequentialProcessing");
	}

	const bankAccount = await prisma.bankAccount.findFirst({
		where: {
			id: userBankAccountId,
			userId: userId,
			isActive: true,
		},
	});

	if (!bankAccount) {
		throw new AppError(
			404,
			"Bank account not found or inactive!",
			"initiateSequentialProcessing"
		);
	}

	const existingBatchSession = await prisma.batchSession.findFirst({
		where: {
			receiptId,
			userId,
			status: "in_progress",
			processingMode: "sequential",
		},
	});

	if (existingBatchSession) {
		const extractedData = existingBatchSession.extractedData as any;
		const transactionResults = extractedData?.transaction_results || [];
		const currentIndex = existingBatchSession.currentIndex || 0;

		if (
			transactionResults.length > 0 &&
			currentIndex < transactionResults.length
		) {
			const currentTransaction = transactionResults[currentIndex];

			return {
				batch_session_id: existingBatchSession.id,
				total_transactions: transactionResults.length,
				successfully_initiated: currentIndex,
				transactions: [currentTransaction],
				overall_confidence: currentTransaction.confidence_score,
				processing_notes: `Sequential session in progress. Showing transaction ${
					currentIndex + 1
				} of ${transactionResults.length}.`,
			};
		}
	}

	const llmWithTools = OpenAIllmCreative.bindTools(allAITools, {});

	const systemPrompt = BATCH_TRANSACTION_SYSTEM_PROMPT_WITH_TOOLS.replace(
		/{userId}/g,
		user.id
	)
		.replace(/{userName}/g, user.name)
		.replace(/{defaultCurrency}/g, user.defaultCurrency)
		.replace(/{userBankAccountId}/g, userBankAccountId);

	const initialPrompt = [
		{
			role: "system",
			content: systemPrompt,
			additional_kwargs: {
				cache_control: { type: "ephemeral" }
			}
		},
		{
			role: "user",
			content: `Receipt OCR Text:\n${receipt.rawOcrText}\n\nPlease extract ALL distinct transactions from this document and call the appropriate tools for EACH transaction.`,
		},
	];

	console.log("Invoking LLM with sequential tools...");
	const aiResponse = await llmWithTools.invoke(initialPrompt);
	console.log("Sequential AI response content:", aiResponse.content);
	console.log(
		"Sequential tool calls:",
		JSON.stringify(aiResponse.tool_calls, null, 2)
	);

	const toolCalls = aiResponse.tool_calls || [];

	if (toolCalls.length === 0) {
		throw new AppError(
			500,
			"AI did not call any tools for sequential processing.",
			"initiateSequentialProcessing"
		);
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

	const batchSession = await prisma.batchSession.create({
		data: {
			receiptId,
			userId,
			totalExpected: 0,
			totalProcessed: 0,
			currentIndex: 0,
			status: "in_progress",
			processingMode: "sequential",
			extractedData: {
				aiResponse:
					typeof aiResponse.content === "string"
						? aiResponse.content
						: JSON.stringify(aiResponse.content),
				toolCalls: toolCalls.map((tc) => ({
					name: tc.name,
					args: tc.args,
					id: tc.id,
				})),
				autoToolResults: autoToolResults,
				confirmationTools: confirmationTools.map((tc) => ({
					name: tc.name,
					args: tc.args,
					id: tc.id,
				})),
			},
		},
	});

	if (confirmationTools.length > 0) {
		const firstToolCall = confirmationTools[0];

		const clarificationSession = await prisma.clarificationSession.create({
			data: {
				receiptId,
				userId,
				extractedData: receipt.rawOcrText,
				status: "pending_confirmation",
				pendingToolCalls: [firstToolCall],
				toolResults: autoToolResults,
			},
		});

		const question = generateConfirmationQuestion(
			firstToolCall.name,
			firstToolCall.args
		);

		await prisma.clarificationMessage.create({
			data: {
				sessionId: clarificationSession.id,
				role: "assistant",
				messageText: JSON.stringify({
					message: `Transaction confirmation required for transaction 1`,
					questions: [question],
					pendingActions: 1,
					toolCalls: [firstToolCall],
				}),
			},
		});

		await prisma.batchSession.update({
			where: { id: batchSession.id },
			data: {
				totalExpected: confirmationTools.length,
				extractedData: {
					...(batchSession.extractedData as any),
					pending_first_confirmation: {
						transaction_index: 0,
						clarification_session_id: clarificationSession.id,
						questions: [question],
					},
				},
			},
		});

		return {
			batch_session_id: batchSession.id,
			total_transactions: confirmationTools.length,
			successfully_initiated: 0,
			transactions: [
				{
					transaction_index: 0,
					needs_confirmation: true,
					needs_clarification: false,
					clarification_session_id: clarificationSession.id,
					is_complete: "false",
					confidence_score: 0,
					transaction: null,
					missing_fields: null,
					questions: [question],
					enrichment_data: null,
					notes: "Waiting for user confirmation of tool actions",
				},
			],
			overall_confidence: 0,
			processing_notes:
				"First transaction requires confirmation before proceeding",
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
			content: `${systemPrompt}\n\nReceipt OCR Text:\n${
				receipt.rawOcrText
			}\n\nTool Results:\n${JSON.stringify(autoToolResults, null, 2)}`,
		},
		{
			role: "user",
			content:
				"Based on the receipt text and tool results, extract ALL transactions as an array. For each transaction, provide complete structured data with enrichment_data populated from tool results. Number each transaction with transaction_index starting from 0.",
		},
	];

	console.log("Invoking final structured extraction...");
	const batchExtractionResponse = await llmWithStructuredOutput.invoke(
		finalPrompt
	);
	console.log(
		"Sequential extraction response:",
		JSON.stringify(batchExtractionResponse, null, 2)
	);

	const transactionResults: BatchTransactionInitiationItem[] = [];

	for (const txResponse of batchExtractionResponse.transactions) {
		transactionResults.push({
			transaction_index: txResponse.transaction_index,
			needs_clarification: txResponse.is_complete === "false",
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
		throw new AppError(
			400,
			"No transactions found in document",
			"initiateSequentialProcessing"
		);
	}

	const firstTransaction = transactionResults[0];

	if (firstTransaction.is_complete === "false") {
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
				messageText: JSON.stringify(firstTransaction),
			},
		});

		firstTransaction.clarification_session_id = clarificationSession.id;
		firstTransaction.needs_clarification = true;
	}

	await prisma.batchSession.update({
		where: { id: batchSession.id },
		data: {
			totalExpected: totalTransactions,
			totalProcessed: 0,
			currentIndex: 0,
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
		successfully_initiated: firstTransaction.is_complete === "true" ? 1 : 0,
		transactions: [firstTransaction],
		overall_confidence: firstTransaction.confidence_score,
		processing_notes: `Sequential processing started. Showing transaction 1 of ${totalTransactions}.${
			firstTransaction.needs_clarification
				? " This transaction needs clarification."
				: ""
		}`,
	};
};

export const getCurrentSequentialTransaction = async (
	batchSessionId: string,
	userId: string
): Promise<{
	currentTransaction: BatchTransactionInitiationItem | null;
	currentIndex: number;
	totalTransactions: number;
	batchSessionId: string;
}> => {
	const batchSession = await prisma.batchSession.findUnique({
		where: { id: batchSessionId },
	});

	if (!batchSession) {
		throw new AppError(
			404,
			"Batch session not found",
			"getCurrentSequentialTransaction"
		);
	}

	if (batchSession.userId !== userId) {
		throw new AppError(
			403,
			"Unauthorized access to batch session",
			"getCurrentSequentialTransaction"
		);
	}

	if (batchSession.processingMode !== "sequential") {
		throw new AppError(
			400,
			"This is not a sequential processing session",
			"getCurrentSequentialTransaction"
		);
	}

	const extractedData = batchSession.extractedData as any;
	const transactionResults = extractedData?.transaction_results || [];
	const currentIndex = batchSession.currentIndex || 0;

	if (currentIndex >= transactionResults.length) {
		return {
			currentTransaction: null,
			currentIndex,
			totalTransactions: transactionResults.length,
			batchSessionId: batchSession.id,
		};
	}

	return {
		currentTransaction: transactionResults[currentIndex],
		currentIndex,
		totalTransactions: transactionResults.length,
		batchSessionId: batchSession.id,
	};
};

interface TransactionEdit {
	categoryId?: string;
	contactId?: string;
	userBankAccountId?: string;
	toBankAccountId?: string;
	amount?: number;
	description?: string;
	transactionDate?: string;
	paymentMethod?: string;
}

export const approveSequentialTransaction = async (
	batchSessionId: string,
	userId: string,
	edits?: TransactionEdit
): Promise<{
	createdTransaction: any;
	nextTransaction: BatchTransactionInitiationItem | null;
	currentIndex: number;
	totalTransactions: number;
	isComplete: boolean;
}> => {
	const batchSession = await prisma.batchSession.findUnique({
		where: { id: batchSessionId },
		include: { receipt: true },
	});

	if (!batchSession) {
		throw new AppError(
			404,
			"Batch session not found",
			"approveSequentialTransaction"
		);
	}

	if (batchSession.userId !== userId) {
		throw new AppError(
			403,
			"Unauthorized access to batch session",
			"approveSequentialTransaction"
		);
	}

	if (batchSession.processingMode !== "sequential") {
		throw new AppError(
			400,
			"This is not a sequential processing session",
			"approveSequentialTransaction"
		);
	}

	const extractedData = batchSession.extractedData as any;
	const transactionResults = extractedData?.transaction_results || [];
	const currentIndex = batchSession.currentIndex || 0;

	if (currentIndex >= transactionResults.length) {
		throw new AppError(
			400,
			"No more transactions to process",
			"approveSequentialTransaction"
		);
	}

	const transactionItem = transactionResults[currentIndex];
	const txData = transactionItem.transaction;
	const enrichment = transactionItem.enrichment_data;

	if (!txData) {
		throw new AppError(
			400,
			"Transaction data is incomplete. Please complete clarification first.",
			"approveSequentialTransaction"
		);
	}

	const transactionDate = edits?.transactionDate || txData.time_sent;
	const parsedDate = new Date(transactionDate);

	if (isNaN(parsedDate.getTime())) {
		throw new AppError(
			400,
			"Invalid transaction date",
			"approveSequentialTransaction"
		);
	}

	const transactionType = txData.transaction_type.toUpperCase();
	const validTypes = [
		"INCOME",
		"EXPENSE",
		"TRANSFER",
		"REFUND",
		"FEE",
		"ADJUSTMENT",
	];

	if (!validTypes.includes(transactionType)) {
		throw new AppError(
			400,
			`Invalid transaction type: ${transactionType}`,
			"approveSequentialTransaction"
		);
	}

	const transaction = await prisma.transaction.create({
		data: {
			userId: userId,
			receiptId: batchSession.receiptId,
			contactId: edits?.contactId || enrichment?.contact_id || undefined,
			categoryId: edits?.categoryId || enrichment?.category_id || undefined,
			userBankAccountId:
				edits?.userBankAccountId ||
				enrichment?.user_bank_account_id ||
				undefined,
			toBankAccountId:
				edits?.toBankAccountId || enrichment?.to_bank_account_id || undefined,
			amount: edits?.amount || txData.amount,
			currency: txData.currency || "NGN",
			transactionType: transactionType as any,
			transactionDate: parsedDate,
			isSelfTransaction: enrichment?.is_self_transaction || false,
			description: edits?.description || txData.description || undefined,
			paymentMethod: edits?.paymentMethod || txData.payment_method || undefined,
			referenceNumber: txData.transaction_reference || undefined,
			aiConfidence: transactionItem.confidence_score,
			status: "CONFIRMED" as any,
		},
		include: {
			category: true,
			contact: true,
			userBankAccount: true,
			toBankAccount: true,
			receipt: true,
		},
	});

	const summary =
		txData.summary ||
		txData.description ||
		`${txData.transaction_type} - ${txData.amount}`;
	const embedding = await generateEmbedding(summary);

	await prisma.$executeRaw`
		UPDATE transactions
		SET summary = ${summary},
			embedding = ${`[${embedding.join(",")}]`}::vector
		WHERE id = ${transaction.id}
	`;

	const nextIndex = currentIndex + 1;
	const isComplete = nextIndex >= transactionResults.length;

	let nextTransaction: BatchTransactionInitiationItem | null = null;
	if (!isComplete) {
		const next = transactionResults[nextIndex];

		if (next.is_complete === "false" && !next.clarification_session_id) {
			const clarificationSession = await prisma.clarificationSession.create({
				data: {
					receiptId: batchSession.receiptId,
					userId,
					extractedData: batchSession.receipt?.rawOcrText || "",
					status: "active",
					toolResults: extractedData?.autoToolResults || {},
				},
			});

			await prisma.clarificationMessage.create({
				data: {
					sessionId: clarificationSession.id,
					role: "assistant",
					messageText: JSON.stringify(next),
				},
			});

			next.clarification_session_id = clarificationSession.id;
			next.needs_clarification = true;

			transactionResults[nextIndex] = next;
		}

		nextTransaction = transactionResults[nextIndex];
	}

	await prisma.batchSession.update({
		where: { id: batchSessionId },
		data: {
			currentIndex: nextIndex,
			totalProcessed: { increment: 1 },
			status: isComplete ? "completed" : "in_progress",
			completedAt: isComplete ? new Date() : undefined,
			extractedData: isComplete
				? extractedData
				: {
						...extractedData,
						transaction_results: transactionResults,
				  },
		},
	});

	await prisma.receipt.update({
		where: { id: batchSession.receiptId },
		data: {
			processedTransactions: { increment: 1 },
		},
	});

	return {
		createdTransaction: transaction,
		nextTransaction,
		currentIndex: nextIndex,
		totalTransactions: transactionResults.length,
		isComplete,
	};
};

export const skipSequentialTransaction = async (
	batchSessionId: string,
	userId: string
): Promise<{
	skippedIndex: number;
	nextTransaction: BatchTransactionInitiationItem | null;
	currentIndex: number;
	totalTransactions: number;
	isComplete: boolean;
}> => {
	const batchSession = await prisma.batchSession.findUnique({
		where: { id: batchSessionId },
		include: { receipt: true },
	});

	if (!batchSession) {
		throw new AppError(
			404,
			"Batch session not found",
			"skipSequentialTransaction"
		);
	}

	if (batchSession.userId !== userId) {
		throw new AppError(
			403,
			"Unauthorized access to batch session",
			"skipSequentialTransaction"
		);
	}

	if (batchSession.processingMode !== "sequential") {
		throw new AppError(
			400,
			"This is not a sequential processing session",
			"skipSequentialTransaction"
		);
	}

	const extractedData = batchSession.extractedData as any;
	const transactionResults = extractedData?.transaction_results || [];
	const currentIndex = batchSession.currentIndex || 0;

	if (currentIndex >= transactionResults.length) {
		throw new AppError(
			400,
			"No more transactions to skip",
			"skipSequentialTransaction"
		);
	}

	const nextIndex = currentIndex + 1;
	const isComplete = nextIndex >= transactionResults.length;

	let nextTransaction: BatchTransactionInitiationItem | null = null;
	if (!isComplete) {
		const next = transactionResults[nextIndex];

		if (next.is_complete === "false" && !next.clarification_session_id) {
			const clarificationSession = await prisma.clarificationSession.create({
				data: {
					receiptId: batchSession.receiptId,
					userId,
					extractedData: batchSession.receipt?.rawOcrText || "",
					status: "active",
					toolResults: extractedData?.autoToolResults || {},
				},
			});

			await prisma.clarificationMessage.create({
				data: {
					sessionId: clarificationSession.id,
					role: "assistant",
					messageText: JSON.stringify(next),
				},
			});

			next.clarification_session_id = clarificationSession.id;
			next.needs_clarification = true;

			transactionResults[nextIndex] = next;
		}

		nextTransaction = transactionResults[nextIndex];
	}

	await prisma.batchSession.update({
		where: { id: batchSessionId },
		data: {
			currentIndex: nextIndex,
			status: isComplete ? "completed" : "in_progress",
			completedAt: isComplete ? new Date() : undefined,
			extractedData: {
				...extractedData,
				transaction_results: transactionResults,
			},
		},
	});

	return {
		skippedIndex: currentIndex,
		nextTransaction,
		currentIndex: nextIndex,
		totalTransactions: transactionResults.length,
		isComplete,
	};
};

export const completeSequentialSession = async (
	batchSessionId: string,
	userId: string
): Promise<{
	totalTransactions: number;
	totalProcessed: number;
	totalSkipped: number;
	completedAt: Date;
}> => {
	const batchSession = await prisma.batchSession.findUnique({
		where: { id: batchSessionId },
	});

	if (!batchSession) {
		throw new AppError(
			404,
			"Batch session not found",
			"completeSequentialSession"
		);
	}

	if (batchSession.userId !== userId) {
		throw new AppError(
			403,
			"Unauthorized access to batch session",
			"completeSequentialSession"
		);
	}

	if (batchSession.processingMode !== "sequential") {
		throw new AppError(
			400,
			"This is not a sequential processing session",
			"completeSequentialSession"
		);
	}

	const completedAt = new Date();

	await prisma.batchSession.update({
		where: { id: batchSessionId },
		data: {
			status: "completed",
			completedAt,
		},
	});

	const totalTransactions = batchSession.totalExpected || 0;
	const totalProcessed = batchSession.totalProcessed || 0;
	const totalSkipped = totalTransactions - totalProcessed;

	return {
		totalTransactions,
		totalProcessed,
		totalSkipped,
		completedAt,
	};
};
