import { NextFunction, Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import { generateTransaction, initiateTransactionFromReceipt } from "../services/transaction.service";

export const generateTransactionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const { input, clarificationId } = req.body;
	if (!input) {
		throw new AppError(
			400,
			"Receipt input required!",
			"generateTransactionController"
		);
	}
	try {
		const transaction = await generateTransaction(input, clarificationId);
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
	const { receiptId } = req.body;
	const userId = req.user?.id;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "initiateTransactionController");
	}

	try {
		const result = await initiateTransactionFromReceipt(receiptId, userId);
		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
};
