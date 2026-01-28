import { TransactionReceiptAiResponseSchema } from "../schema/ai-formats";
import { buildExtractionPrompt } from "../lib/prompts";
import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";
import {
	allAITools,
	getBankAccountsTool,
	getCategoryTool,
	getOrCreateContactTool,
	validateTransactionTypeTool,
} from "../tools";
import {
	shouldRequireConfirmation,
	generateConfirmationQuestion,
} from "../config/toolConfirmations";
import { executeAITool } from "./aiToolExecutor.service";
import { OpenAIllmGPT4Turbo as OpenAIllm, OpenAIllmCreative } from "../models/llm.models";
import { generateEmbedding } from "./embedding.service";

export const generateTransaction = async (
	input: string,
	clarificationId: string,
	userId: string
) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, name: true, defaultCurrency: true, customContextPrompt: true },
	});

	if (!user) {
		throw new AppError(404, "User not found", "generateTransaction");
	}

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
	const aiMsg = await transactionllm.invoke([
		{
			role: "system",
			content: systemPrompt,
		},
		{
			role: "user",
			content: input,
		},
	]);
	return aiMsg;
};

export const initiateTransactionFromReceipt = async (
	receiptId: string,
	userId: string,
	userBankAccountId: string
) => {
	if (!receiptId) {
		throw new AppError(
			400,
			"Receipt Id required!",
			"initiateTransactionFromReceipt"
		);
	}

	if (!userBankAccountId) {
		throw new AppError(
			400,
			"Bank Account ID is required to initiate transaction!",
			"initiateTransactionFromReceipt"
		);
	}

	const receipt = await prisma.receipt.findUnique({
		where: {
			id: receiptId,
		},
	});

	if (!receipt) {
		throw new AppError(
			404,
			"Receipt not found!",
			"initiateTransactionFromReceipt"
		);
	}

	if (receipt.userId !== userId) {
		throw new AppError(
			403,
			"You are not authorized to access this receipt!",
			"initiateTransactionFromReceipt"
		);
	}

	if (receipt.processingStatus !== "processed") {
		throw new AppError(
			400,
			"Receipt must be processed before initiating transaction!",
			"initiateTransactionFromReceipt"
		);
	}

	if (!receipt.rawOcrText) {
		throw new AppError(
			400,
			"Receipt has no extracted text!",
			"initiateTransactionFromReceipt"
		);
	}

	if (receipt.expectedTransactions && receipt.expectedTransactions > 1) {
		throw new AppError(
			400,
			"This receipt contains multiple transactions and requires batch processing. Please use the batch transaction endpoint instead.",
			"initiateTransactionFromReceipt"
		);
	}

	const existingSession = await prisma.clarificationSession.findFirst({
		where: {
			receiptId,
			status: "active",
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

	if (existingSession) {
		return {
			needsClarification: true,
			session: existingSession,
		};
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, name: true, defaultCurrency: true, customContextPrompt: true },
	});

	if (!user) {
		throw new AppError(404, "User not found", "initiateTransactionFromReceipt");
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
			"Bank account not found or does not belong to this user!",
			"initiateTransactionFromReceipt"
		);
	}

	const llmWithTools = OpenAIllmCreative.bindTools(allAITools, {});

	const systemPrompt = buildExtractionPrompt({
		userId: user.id,
		userName: user.name,
		defaultCurrency: user.defaultCurrency,
		mode: 'single',
		hasTools: true,
		userBankAccountId: userBankAccountId,
		customContext: user.customContextPrompt || undefined,
	});

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
			content: `Receipt OCR Text:\n${receipt.rawOcrText}\n\nPlease extract all transaction details from this receipt and call the appropriate tools.`,
		},
	];

	const aiResponse = await llmWithTools.invoke(initialPrompt);
	console.log("content:", aiResponse.content);
	console.log("tool_calls:", aiResponse.tool_calls);

	const toolCalls = aiResponse.tool_calls || [];

	if (toolCalls.length === 0) {
		throw new AppError(
			500,
			"AI did not call any tools. This is unexpected.",
			"initiateTransactionFromReceipt"
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
		const result = await executeAITool(toolCall.name as any, toolCall.args);
		autoToolResults[toolCall.name] = result;
	}

	console.log("autoToolResults:", JSON.stringify(autoToolResults, null, 2));
	// return {
	// 	auto: autoExecuteTools,
	// 	confirmation: confirmationTools,
	// 	toolresults: autoToolResults,
	// 	questions: confirmationTools.map((tc) =>
	// 		generateConfirmationQuestion(tc.name, tc.args)
	// 	),
	// };
	if (confirmationTools.length > 0) {
		const clarificationSession = await prisma.clarificationSession.create({
			data: {
				receiptId,
				userId,
				extractedData: receipt.rawOcrText,
				status: "pending_confirmation",
				pendingToolCalls: confirmationTools,
				toolResults: autoToolResults,
			},
		});

		const questions = confirmationTools.map((tc) =>
			generateConfirmationQuestion(tc.name, tc.args)
		);

		await prisma.clarificationMessage.create({
			data: {
				sessionId: clarificationSession.id,
				role: "assistant",
				messageText: JSON.stringify({
					message: aiResponse.content || "Waiting for confirmation",
					questions,
					pendingActions: confirmationTools.length,
					toolCalls: confirmationTools,
				}),
			},
		});

		const session = await prisma.clarificationSession.findUnique({
			where: { id: clarificationSession.id },
			include: {
				receipt: true,
				clarificationMessages: {
					orderBy: { createdAt: "asc" },
				},
			},
		});

		return {
			needsConfirmation: true,
			questions,
			session,
		};
	}

	const llmWithStructuredOutput = OpenAIllm.withStructuredOutput(
		TransactionReceiptAiResponseSchema,
		{ name: "extract_transaction", strict: true }
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
				"Based on the receipt text and tool results above, please provide the final transaction extraction with all required fields populated. Use the enrichment_data field to include IDs from tool results.",
		},
	];

	const parsedResponse = await llmWithStructuredOutput.invoke(finalPrompt);
	console.log("parsedResponse:", JSON.stringify(parsedResponse, null, 2));

	if (parsedResponse.is_complete === "false") {
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
				messageText: JSON.stringify(parsedResponse),
			},
		});

		const session = await prisma.clarificationSession.findUnique({
			where: { id: clarificationSession.id },
			include: {
				receipt: true,
				clarificationMessages: {
					orderBy: { createdAt: "asc" },
				},
			},
		});

		return {
			needsClarification: true,
			session,
		};
	}

	const enrichedTransaction = {
		...parsedResponse.transaction,
		categoryId: autoToolResults.get_or_create_category?.data?.id,
		contactId: autoToolResults.get_or_create_contact?.data?.id,
		userBankAccountId: parsedResponse.enrichment_data?.user_bank_account_id,
		toBankAccountId: parsedResponse.enrichment_data?.to_bank_account_id,
		isSelfTransaction:
			parsedResponse.enrichment_data?.is_self_transaction || false,
	};

	return {
		needsClarification: false,
		needsConfirmation: false,
		transaction: enrichedTransaction,
		extractionResult: parsedResponse,
		toolResults: autoToolResults,
	};
};

export const getUserTransactions = async (
	userId: string,
	filters?: {
		transactionType?: string;
		categoryId?: string;
		contactId?: string;
		startDate?: Date;
		endDate?: Date;
		status?: string;
		limit?: number;
		offset?: number;
	}
) => {
	const {
		transactionType,
		categoryId,
		contactId,
		startDate,
		endDate,
		status,
		limit = 50,
		offset = 0,
	} = filters || {};

	const where: any = { userId };

	if (transactionType) {
		where.transactionType = transactionType;
	}

	if (categoryId) {
		where.categoryId = categoryId;
	}

	if (contactId) {
		where.contactId = contactId;
	}

	if (status) {
		where.status = status;
	}

	if (startDate || endDate) {
		where.transactionDate = {};
		if (startDate) {
			where.transactionDate.gte = startDate;
		}
		if (endDate) {
			where.transactionDate.lte = endDate;
		}
	}

	const [transactions, total] = await Promise.all([
		prisma.transaction.findMany({
			where,
			include: {
				category: true,
				contact: true,
				userBankAccount: true,
				toBankAccount: true,
				receipt: true,
			},
			orderBy: {
				transactionDate: "desc",
			},
			take: limit,
			skip: offset,
		}),
		prisma.transaction.count({ where }),
	]);

	return {
		transactions,
		total,
		limit,
		offset,
	};
};

export const getTransactionById = async (
	transactionId: string,
	userId: string
) => {
	const transaction = await prisma.transaction.findUnique({
		where: {
			id: transactionId,
		},
		include: {
			category: true,
			contact: true,
			userBankAccount: true,
			toBankAccount: true,
			receipt: true,
		},
	});

	if (!transaction) {
		throw new AppError(404, "Transaction not found", "getTransactionById");
	}

	if (transaction.userId !== userId) {
		throw new AppError(
			403,
			"You are not authorized to access this transaction",
			"getTransactionById"
		);
	}

	return transaction;
};

export const createTransaction = async (data: {
	userId: string;
	receiptId: string;
	contactId?: string;
	categoryId?: string;
	userBankAccountId?: string;
	toBankAccountId?: string;
	amount: number;
	currency?: string;
	transactionType: any;
	transactionDate: Date;
	isSelfTransaction?: boolean;
	subcategory?: string;
	description?: string;
	paymentMethod?: string;
	referenceNumber?: string;
	aiConfidence?: number;
	status?: any;
	summary: string;
	clarificationSessionId?: string;
}) => {
	const {
		userId,
		receiptId,
		contactId,
		categoryId,
		userBankAccountId,
		toBankAccountId,
		amount,
		currency = "NGN",
		transactionType,
		transactionDate,
		isSelfTransaction = false,
		subcategory,
		description,
		paymentMethod,
		referenceNumber,
		aiConfidence,
		status = "CONFIRMED",
		summary,
		clarificationSessionId,
	} = data;

	const user = await prisma.user.findUnique({
		where: { id: userId },
	});

	if (!user) {
		throw new AppError(404, "User not found", "createTransaction");
	}
	const receipt = await prisma.receipt.findUnique({
		where: { id: receiptId },
	});

	if (!receipt) {
		throw new AppError(404, "Receipt not found", "createTransaction");
	}

	if (receipt.userId !== userId) {
		throw new AppError(
			403,
			"You are not authorized to use this receipt",
			"createTransaction"
		);
	}

	// Validate category if provided
	if (categoryId) {
		const category = await prisma.category.findUnique({
			where: { id: categoryId },
		});

		if (!category) {
			throw new AppError(404, "Category not found", "createTransaction");
		}

		if (category.userId && category.userId !== userId) {
			throw new AppError(
				403,
				"You are not authorized to use this category",
				"createTransaction"
			);
		}
	}

	// Validate user bank account if provided
	if (userBankAccountId) {
		const bankAccount = await prisma.bankAccount.findUnique({
			where: { id: userBankAccountId },
		});

		if (!bankAccount) {
			throw new AppError(
				404,
				"User bank account not found",
				"createTransaction"
			);
		}

		if (bankAccount.userId !== userId) {
			throw new AppError(
				403,
				"You are not authorized to use this bank account",
				"createTransaction"
			);
		}
	}

	const transaction = await prisma.transaction.create({
		data: {
			userId,
			receiptId,
			contactId,
			categoryId,
			userBankAccountId,
			toBankAccountId,
			amount,
			currency,
			transactionType,
			transactionDate,
			isSelfTransaction,
			subcategory,
			description,
			paymentMethod,
			referenceNumber,
			aiConfidence,
			status,
		},
		include: {
			category: true,
			contact: true,
			userBankAccount: true,
			toBankAccount: true,
			receipt: true,
		},
	});


	const embedding = await generateEmbedding(summary);

	await prisma.$executeRaw`
		UPDATE transactions
		SET summary = ${summary},
		    embedding = ${`[${embedding.join(",")}]`}::vector
		WHERE id = ${transaction.id}
	`;

	// If clarificationSessionId is provided, update the session with the transaction ID and mark as completed
	if (clarificationSessionId) {
		await prisma.clarificationSession.update({
			where: { id: clarificationSessionId },
			data: {
				transactionId: transaction.id,
				status: "completed",
				completedAt: new Date(),
			},
		});
	}

	return transaction;
};

export const updateTransaction = async ({
	transactionId,
	userId,
	updates,
}: {
	transactionId: string;
	userId: string;
	updates: any;
}) => {
	const transaction = await prisma.transaction.findUnique({
		where: { id: transactionId },
	});

	if (!transaction) {
		throw new AppError(404, "Transaction not found", "updateTransaction");
	}

	if (transaction.userId !== userId) {
		throw new AppError(
			403,
			"You are not authorized to update this transaction",
			"updateTransaction"
		);
	}

	// Validate category if being updated
	if (updates.categoryId) {
		const category = await prisma.category.findUnique({
			where: { id: updates.categoryId },
		});

		if (!category) {
			throw new AppError(404, "Category not found", "updateTransaction");
		}

		if (category.userId && category.userId !== userId) {
			throw new AppError(
				403,
				"You are not authorized to use this category",
				"updateTransaction"
			);
		}
	}

	// Validate user bank account if being updated
	if (updates.userBankAccountId) {
		const bankAccount = await prisma.bankAccount.findUnique({
			where: { id: updates.userBankAccountId },
		});

		if (!bankAccount) {
			throw new AppError(
				404,
				"User bank account not found",
				"updateTransaction"
			);
		}

		if (bankAccount.userId !== userId) {
			throw new AppError(
				403,
				"You are not authorized to use this bank account",
				"updateTransaction"
			);
		}
	}

	const updatedTransaction = await prisma.transaction.update({
		where: { id: transactionId },
		data: updates,
		include: {
			category: true,
			contact: true,
			userBankAccount: true,
			toBankAccount: true,
			receipt: true,
		},
	});

	return updatedTransaction;
};

export const deleteTransaction = async (
	transactionId: string,
	userId: string
) => {
	const transaction = await prisma.transaction.findUnique({
		where: { id: transactionId },
	});

	if (!transaction) {
		throw new AppError(404, "Transaction not found", "deleteTransaction");
	}

	if (transaction.userId !== userId) {
		throw new AppError(
			403,
			"You are not authorized to delete this transaction",
			"deleteTransaction"
		);
	}

	await prisma.transaction.delete({
		where: { id: transactionId },
	});

	return {
		message: "Transaction deleted successfully",
		deletedId: transactionId,
	};
};

export const getTransactionStats = async (
	userId: string,
	filters?: {
		startDate?: Date;
		endDate?: Date;
	}
) => {
	const { startDate, endDate } = filters || {};

	const where: any = { userId };

	if (startDate || endDate) {
		where.transactionDate = {};
		if (startDate) {
			where.transactionDate.gte = startDate;
		}
		if (endDate) {
			where.transactionDate.lte = endDate;
		}
	}

	const [totalIncome, totalExpense, totalTransactions, transactionsByType] =
		await Promise.all([
			prisma.transaction.aggregate({
				where: {
					...where,
					transactionType: "INCOME",
				},
				_sum: {
					amount: true,
				},
			}),
			prisma.transaction.aggregate({
				where: {
					...where,
					transactionType: "EXPENSE",
				},
				_sum: {
					amount: true,
				},
			}),
			prisma.transaction.count({ where }),
			prisma.transaction.groupBy({
				by: ["transactionType"],
				where,
				_count: true,
				_sum: {
					amount: true,
				},
			}),
		]);

	const incomeAmount = Number(totalIncome._sum.amount || 0);
	const expenseAmount = Number(totalExpense._sum.amount || 0);

	return {
		totalIncome: incomeAmount,
		totalExpense: expenseAmount,
		netBalance: incomeAmount - expenseAmount,
		totalTransactions,
		transactionsByType,
	};
};
