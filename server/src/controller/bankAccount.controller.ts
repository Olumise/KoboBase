import { NextFunction, Request, Response } from "express";
import {
	getBankAccounts,
	createBankAccount,
	matchBankAccount,
	getPrimaryBankAccount,
	getBankAccountById,
	updateBankAccount,
	deleteBankAccount,
	setPrimaryAccount,
} from "../services/bankAccount.service";

export const getBankAccountsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const { userId, bankName, isActive, currency } = req.query;

		const result = await getBankAccounts({
			userId: userId as string,
			bankName: bankName as string | undefined,
			isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
			currency: currency as string | undefined,
		});

		res.status(200).json({
			message: "Bank accounts retrieved successfully",
			data: result,
		});
	} catch (err) {
		next(err);
	}
};

export const createBankAccountController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const result = await createBankAccount(req.body);

		res.status(result.created ? 201 : 200).json({
			message: result.message,
			data: result.account,
		});
	} catch (err) {
		next(err);
	}
};

export const matchBankAccountController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const { userId, bankName, accountNumber } = req.body;

		const account = await matchBankAccount({
			userId,
			bankName,
			accountNumber,
		});

		if (!account) {
			res.status(404).json({
				message: "No matching bank account found",
				data: null,
			});
			return;
		}

		res.status(200).json({
			message: "Bank account matched successfully",
			data: account,
		});
	} catch (err) {
		next(err);
	}
};

export const getPrimaryBankAccountController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const userId = req.params.userId as string;

		const account = await getPrimaryBankAccount(userId);

		if (!account) {
			res.status(404).json({
				message: "No primary bank account found",
				data: null,
			});
			return;
		}

		res.status(200).json({
			message: "Primary bank account retrieved successfully",
			data: account,
		});
	} catch (err) {
		next(err);
	}
};

export const getBankAccountByIdController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const accountId = req.params.accountId as string;
		const userId = req.query.userId as string;

		const account = await getBankAccountById(accountId, userId);

		res.status(200).json({
			message: "Bank account retrieved successfully",
			data: account,
		});
	} catch (err) {
		next(err);
	}
};

export const updateBankAccountController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const accountId = req.params.accountId as string;
		const { userId, ...updates } = req.body;

		const account = await updateBankAccount({
			accountId,
			userId,
			updates,
		});

		res.status(200).json({
			message: "Bank account updated successfully",
			data: account,
		});
	} catch (err) {
		next(err);
	}
};

export const deleteBankAccountController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const accountId = req.params.accountId as string;
		const userId = req.query.userId as string;

		const result = await deleteBankAccount(accountId, userId);

		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
};

export const setPrimaryAccountController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const accountId = req.params.accountId as string;
		const { userId } = req.body;

		const account = await setPrimaryAccount(accountId, userId);

		res.status(200).json({
			message: "Primary account set successfully",
			data: account,
		});
	} catch (err) {
		next(err);
	}
};
