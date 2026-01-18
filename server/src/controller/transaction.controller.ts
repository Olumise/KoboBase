import { NextFunction, Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import { generateTransaction } from "../services/transaction.service";

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
