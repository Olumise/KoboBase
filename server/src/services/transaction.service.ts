import { TransactionReceiptAiResponseSchema } from "../schema/ai-formats";
import {
	RECEIPT_TRANSACTION_SYSTEM_PROMPT,
	RECEIPT_TRANSACTION_SYSTEM_PROMPT_WITH_TOOLS,
} from "../lib/prompts";
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

export const generateTransaction = async (
	input: string,
	clarificationId: string
) => {
	const transactionllm = OpenAIllm.withStructuredOutput(
		TransactionReceiptAiResponseSchema,
		{ name: "extract_transaction", strict: true }
	);
	const aiMsg = await transactionllm.invoke([
		{
			role: "system",
			content: RECEIPT_TRANSACTION_SYSTEM_PROMPT,
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
		select: { id: true, name: true, defaultCurrency: true },
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

	const systemPrompt = RECEIPT_TRANSACTION_SYSTEM_PROMPT_WITH_TOOLS.replace(
		"{userId}",
		user.id
	)
		.replace("{userName}", user.name)
		.replace("{defaultCurrency}", user.defaultCurrency)
		.replace("{userBankAccountId}", userBankAccountId);

	const initialPrompt = [
		{
			role: "system",
			content: `${systemPrompt}\n\nReceipt OCR Text:\n${receipt.rawOcrText}`,
		},
		{
			role: "user",
			content:
				"Please extract all transaction details from this receipt and call the appropriate tools.",
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
