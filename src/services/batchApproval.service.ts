import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";
import { generateEmbedding } from "./embedding.service";
import { BatchTransactionExtraction } from "../schema/ai-formats";
import { ensureTransactionReference } from "../utils/transactionReferenceGenerator";

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

interface TransactionApproval {
	index: number;
	approved: boolean;
	edits?: TransactionEdit;
}

interface BatchApprovalRequest {
	batchSessionId: string;
	approvals: TransactionApproval[];
}

export const approveBatchTransactions = async (
	data: BatchApprovalRequest,
	userId: string
) => {
	const { batchSessionId, approvals } = data;

	const batchSession = await prisma.batchSession.findUnique({
		where: { id: batchSessionId },
		include: {
			receipt: true
		}
	});

	if (!batchSession) {
		throw new AppError(404, "Batch session not found", "approveBatchTransactions");
	}

	if (batchSession.userId !== userId) {
		throw new AppError(403, "Unauthorized access to batch session", "approveBatchTransactions");
	}

	if (batchSession.status === "completed") {
		throw new AppError(400, "Batch session already completed", "approveBatchTransactions");
	}

	const extractedData = batchSession.extractedData as any;
	const batchExtraction = extractedData?.batchExtraction as BatchTransactionExtraction;

	if (!batchExtraction || !batchExtraction.transactions) {
		throw new AppError(400, "No extracted transactions found in batch session", "approveBatchTransactions");
	}

	const createdTransactions = [];
	const errors = [];

	for (const approval of approvals) {
		if (!approval.approved) {
			continue;
		}

		const { index, edits } = approval;

		if (index < 0 || index >= batchExtraction.transactions.length) {
			errors.push({ index, error: "Invalid transaction index" });
			continue;
		}

		const transactionItem = batchExtraction.transactions[index];
		const txData = transactionItem.transaction;
		const enrichment = transactionItem.enrichment_data;

		try {
			const transactionDate = edits?.transactionDate || txData.time_sent;
			const parsedDate = new Date(transactionDate);

			if (isNaN(parsedDate.getTime())) {
				errors.push({ index, error: "Invalid transaction date" });
				continue;
			}

			const transactionType = txData.transaction_type.toUpperCase();
			const validTypes = ["INCOME", "EXPENSE", "TRANSFER", "REFUND", "FEE", "ADJUSTMENT"];

			if (!validTypes.includes(transactionType)) {
				errors.push({ index, error: `Invalid transaction type: ${transactionType}` });
				continue;
			}

			// Ensure transaction reference exists or generate one
			const finalReferenceNumber = ensureTransactionReference(txData.transaction_reference);

			const transaction = await prisma.transaction.create({
				data: {
					userId: userId,
					receiptId: batchSession.receiptId,
					contactId: edits?.contactId || enrichment?.contact_id || undefined,
					categoryId: edits?.categoryId || enrichment?.category_id || undefined,
					userBankAccountId: edits?.userBankAccountId || enrichment?.user_bank_account_id || undefined,
					toBankAccountId: edits?.toBankAccountId || enrichment?.to_bank_account_id || undefined,
					amount: edits?.amount || txData.amount,
					currency: txData.currency || "NGN",
					transactionType: transactionType as any,
					transactionDate: parsedDate,
					isSelfTransaction: enrichment?.is_self_transaction || false,
					description: edits?.description || txData.description || undefined,
					paymentMethod: edits?.paymentMethod || txData.payment_method || undefined,
					referenceNumber: finalReferenceNumber,
					aiConfidence: transactionItem.confidence_score,
					status: "confirmed",
				},
				include: {
					category: true,
					contact: true,
					userBankAccount: true,
					toBankAccount: true,
					receipt: true,
				},
			});

			const summary = txData.summary || txData.description || `${txData.transaction_type} - ${txData.amount}`;
			const embedding = await generateEmbedding(summary);

			await prisma.$executeRaw`
				UPDATE transactions
				SET summary = ${summary},
					embedding = ${`[${embedding.join(",")}]`}::vector
				WHERE id = ${transaction.id}
			`;

			createdTransactions.push({
				index,
				transactionId: transaction.id,
				transaction: transaction
			});
		} catch (error) {
			console.error(`Error creating transaction at index ${index}:`, error);
			errors.push({
				index,
				error: error instanceof Error ? error.message : "Unknown error"
			});
		}
	}

	await prisma.batchSession.update({
		where: { id: batchSessionId },
		data: {
			totalProcessed: createdTransactions.length,
			status: createdTransactions.length === approvals.filter(a => a.approved).length ? "completed" : "partial",
			completedAt: new Date()
		}
	});

	await prisma.receipt.update({
		where: { id: batchSession.receiptId },
		data: {
			processedTransactions: {
				increment: createdTransactions.length
			}
		}
	});

	return {
		success: true,
		totalApproved: approvals.filter(a => a.approved).length,
		totalCreated: createdTransactions.length,
		totalErrors: errors.length,
		createdTransactions,
		errors: errors.length > 0 ? errors : undefined
	};
};

export const rejectBatchSession = async (batchSessionId: string, userId: string) => {
	const batchSession = await prisma.batchSession.findUnique({
		where: { id: batchSessionId }
	});

	if (!batchSession) {
		throw new AppError(404, "Batch session not found", "rejectBatchSession");
	}

	if (batchSession.userId !== userId) {
		throw new AppError(403, "Unauthorized access to batch session", "rejectBatchSession");
	}

	await prisma.batchSession.update({
		where: { id: batchSessionId },
		data: {
			status: "rejected",
			completedAt: new Date()
		}
	});

	return {
		success: true,
		message: "Batch session rejected"
	};
};
