import { NextFunction, Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import {
	generateTransaction,
	initiateTransactionFromReceipt,
	getUserTransactions,
	getTransactionById,
	createTransaction,
	updateTransaction,
	deleteTransaction,
	getTransactionStats,
} from "../services/transaction.service";
import { initiateBatchTransactionsFromReceipt, getBatchExtractionStatus } from "../services/batchExtraction.service";
import { approveBatchTransactions, rejectBatchSession } from "../services/batchApproval.service";
import {
	initiateSequentialProcessing,
	getCurrentSequentialTransaction,
	approveSequentialTransaction,
	skipSequentialTransaction,
	completeSequentialSession,
} from "../services/sequentialExtraction.service";

export const generateTransactionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const { input, clarificationId } = req.body;
	const userId = req.user?.id;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "generateTransactionController");
	}

	if (!input) {
		throw new AppError(
			400,
			"Receipt input required!",
			"generateTransactionController"
		);
	}
	try {
		const transaction = await generateTransaction(input, clarificationId, userId);
		res.send(transaction);
	} catch (err) {
		next(err);
	}
};

export const initiateTransactionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const { receiptId, userBankAccountId } = req.body;
	const userId = req.user?.id;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "initiateTransactionController");
	}

	if (!userBankAccountId) {
		throw new AppError(
			400,
			"Bank Account ID is required to initiate transaction!",
			"initiateTransactionController"
		);
	}

	try {
		const result = await initiateTransactionFromReceipt(
			receiptId,
			userId,
			userBankAccountId
		);
		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
};

export const getUserTransactionsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "getUserTransactionsController");
	}

	try {
		const {
			transactionType,
			categoryId,
			contactId,
			startDate,
			endDate,
			status,
			limit,
			offset,
		} = req.query;

		const filters = {
			transactionType: transactionType as string | undefined,
			categoryId: categoryId as string | undefined,
			contactId: contactId as string | undefined,
			startDate: startDate ? new Date(startDate as string) : undefined,
			endDate: endDate ? new Date(endDate as string) : undefined,
			status: status as string | undefined,
			limit: limit ? parseInt(limit as string) : undefined,
			offset: offset ? parseInt(offset as string) : undefined,
		};

		const result = await getUserTransactions(userId, filters);

		res.status(200).json({
			message: "Transactions retrieved successfully",
			data: result,
		});
	} catch (err) {
		next(err);
	}
};

export const getTransactionByIdController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const transactionId = req.params.transactionId as string;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "getTransactionByIdController");
	}

	try {
		const transaction = await getTransactionById(transactionId, userId);

		res.status(200).json({
			message: "Transaction retrieved successfully",
			data: transaction,
		});
	} catch (err) {
		next(err);
	}
};

export const createTransactionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "createTransactionController");
	}

	if (!req.body.summary) {
		throw new AppError(
			400,
			"Summary is required!",
			"createTransactionController"
		);
	}

	if (!req.body.transactionDate) {
		throw new AppError(
			400,
			"Transaction date is required!",
			"createTransactionController"
		);
	}

	try {
		const transactionData = {
			...req.body,
			userId,
			transactionDate: new Date(req.body.transactionDate),
		};

		const transaction = await createTransaction(transactionData);

		res.status(201).json({
			message: "Transaction created successfully",
			data: transaction,
		});
	} catch (err) {
		next(err);
	}
};

export const updateTransactionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const transactionId = req.params.transactionId as string;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "updateTransactionController");
	}

	try {
		const updates = { ...req.body };

		if (updates.transactionDate) {
			updates.transactionDate = new Date(updates.transactionDate);
		}

		const transaction = await updateTransaction({
			transactionId,
			userId,
			updates,
		});

		res.status(200).json({
			message: "Transaction updated successfully",
			data: transaction,
		});
	} catch (err) {
		next(err);
	}
};

export const deleteTransactionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const transactionId = req.params.transactionId as string;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "deleteTransactionController");
	}

	try {
		const result = await deleteTransaction(transactionId, userId);

		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
};

export const getTransactionStatsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "getTransactionStatsController");
	}

	try {
		const { startDate, endDate } = req.query;

		const filters = {
			startDate: startDate ? new Date(startDate as string) : undefined,
			endDate: endDate ? new Date(endDate as string) : undefined,
		};

		const stats = await getTransactionStats(userId, filters);

		res.status(200).json({
			message: "Transaction statistics retrieved successfully",
			data: stats,
		});
	} catch (err) {
		next(err);
	}
};

export const extractBatchTransactionsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const receiptId = req.params.receiptId as string;
	const { userBankAccountId } = req.body;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "extractBatchTransactionsController");
	}

	if (!receiptId || typeof receiptId !== 'string') {
		throw new AppError(400, "Receipt ID is required", "extractBatchTransactionsController");
	}

	if (!userBankAccountId) {
		throw new AppError(400, "Bank Account ID is required", "extractBatchTransactionsController");
	}

	try {
		// Call the new batch transaction initiation function
		// Validation is now handled inside the service function
		const batchInitiation = await initiateBatchTransactionsFromReceipt(
			receiptId,
			userId,
			userBankAccountId
		);

		res.status(200).json({
			message: "Batch transactions initiated successfully",
			data: batchInitiation
		});
	} catch (err) {
		next(err);
	}
};

export const getBatchExtractionStatusController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const receiptId = req.params.receiptId as string;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "getBatchExtractionStatusController");
	}

	if (!receiptId || typeof receiptId !== 'string') {
		throw new AppError(400, "Receipt ID is required", "getBatchExtractionStatusController");
	}

	try {
		const status = await getBatchExtractionStatus(receiptId, userId);
		res.status(200).json(status);
	} catch (err) {
		next(err);
	}
};

export const approveBatchTransactionsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const { batchSessionId, approvals } = req.body;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "approveBatchTransactionsController");
	}

	if (!batchSessionId) {
		throw new AppError(400, "Batch session ID is required", "approveBatchTransactionsController");
	}

	if (!approvals || !Array.isArray(approvals)) {
		throw new AppError(400, "Approvals array is required", "approveBatchTransactionsController");
	}

	try {
		const result = await approveBatchTransactions({ batchSessionId, approvals }, userId);

		res.status(200).json({
			message: "Batch transactions processed successfully",
			data: result
		});
	} catch (err) {
		next(err);
	}
};

export const rejectBatchSessionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const batchSessionId = req.params.batchSessionId as string;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "rejectBatchSessionController");
	}

	if (!batchSessionId || typeof batchSessionId !== 'string') {
		throw new AppError(400, "Batch session ID is required", "rejectBatchSessionController");
	}

	try {
		const result = await rejectBatchSession(batchSessionId, userId);

		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
};

export const initiateSequentialProcessingController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const receiptId = req.params.receiptId as string;
	const { userBankAccountId } = req.body;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "initiateSequentialProcessingController");
	}

	if (!receiptId || typeof receiptId !== 'string') {
		throw new AppError(400, "Receipt ID is required", "initiateSequentialProcessingController");
	}

	if (!userBankAccountId) {
		throw new AppError(400, "Bank Account ID is required", "initiateSequentialProcessingController");
	}

	try {
		const sequentialInitiation = await initiateSequentialProcessing(
			receiptId,
			userId,
			userBankAccountId
		);

		res.status(200).json({
			message: "Sequential processing initiated successfully",
			data: sequentialInitiation
		});
	} catch (err) {
		next(err);
	}
};

export const getCurrentSequentialTransactionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const batchSessionId = req.params.batchSessionId as string;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "getCurrentSequentialTransactionController");
	}

	if (!batchSessionId || typeof batchSessionId !== 'string') {
		throw new AppError(400, "Batch session ID is required", "getCurrentSequentialTransactionController");
	}

	try {
		const result = await getCurrentSequentialTransaction(batchSessionId, userId);

		res.status(200).json({
			message: "Current transaction retrieved successfully",
			data: result
		});
	} catch (err) {
		next(err);
	}
};

export const approveSequentialTransactionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const { batchSessionId, edits } = req.body;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "approveSequentialTransactionController");
	}

	if (!batchSessionId) {
		throw new AppError(400, "Batch session ID is required", "approveSequentialTransactionController");
	}

	try {
		const result = await approveSequentialTransaction(batchSessionId, userId, edits);

		res.status(200).json({
			message: result.isComplete
				? "Transaction approved and session completed"
				: "Transaction approved successfully",
			data: result
		});
	} catch (err) {
		next(err);
	}
};

export const skipSequentialTransactionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const batchSessionId = req.params.batchSessionId as string;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "skipSequentialTransactionController");
	}

	if (!batchSessionId || typeof batchSessionId !== 'string') {
		throw new AppError(400, "Batch session ID is required", "skipSequentialTransactionController");
	}

	try {
		const result = await skipSequentialTransaction(batchSessionId, userId);

		res.status(200).json({
			message: result.isComplete
				? "Transaction skipped and session completed"
				: "Transaction skipped successfully",
			data: result
		});
	} catch (err) {
		next(err);
	}
};

export const completeSequentialSessionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const batchSessionId = req.params.batchSessionId as string;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "completeSequentialSessionController");
	}

	if (!batchSessionId || typeof batchSessionId !== 'string') {
		throw new AppError(400, "Batch session ID is required", "completeSequentialSessionController");
	}

	try {
		const result = await completeSequentialSession(batchSessionId, userId);

		res.status(200).json({
			message: "Sequential session completed successfully",
			data: result
		});
	} catch (err) {
		next(err);
	}
};
