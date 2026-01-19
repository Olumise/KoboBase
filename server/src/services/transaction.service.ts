import { ChatOpenAI } from "@langchain/openai";
import { TransactionReceiptAiResponseSchema } from "../schema/ai-formats";
import { RECEIPT_TRANSACTION_SYSTEM_PROMPT } from "../lib/prompts";
import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";

const OpenAIllm = new ChatOpenAI({
	model: "gpt-4o",
	temperature: 0,
});

export const generateTransaction = async (input: string, clarificationId: string) => {
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
	userId: string
) => {
	if (!receiptId) {
		throw new AppError(
			400,
			"Receipt Id required!",
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

	const transactionllm = OpenAIllm.withStructuredOutput(
		TransactionReceiptAiResponseSchema,
		{ name: "extract_transaction", strict: true }
	);

	const initialPrompt = [
		{
			role: "system",
			content: `${RECEIPT_TRANSACTION_SYSTEM_PROMPT}\n\nReceipt OCR Text:\n${receipt.rawOcrText}`,
		},
		{
			role: "user",
			content: "Please extract all transaction details from this receipt.",
		},
	];

	const aiResponse = await transactionllm.invoke(initialPrompt);

	if (aiResponse.is_complete === "false") {
		const clarificationSession = await prisma.clarificationSession.create({
			data: {
				receiptId,
				userId,
				extractedData: receipt.rawOcrText,
				status: "active",
			},
		});

		await prisma.clarificationMessage.create({
			data: {
				sessionId: clarificationSession.id,
				role: "assistant",
				messageText: JSON.stringify(aiResponse),
			},
		});

		const session = await prisma.clarificationSession.findUnique({
			where: {
				id: clarificationSession.id,
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

		return {
			needsClarification: true,
			session: session,
		};
	}

	return {
		needsClarification: false,
		transaction: aiResponse.transaction,
		extractionResult: aiResponse,
	};
};
