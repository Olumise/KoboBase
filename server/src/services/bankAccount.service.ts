import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";
import { AccountTypeValue } from "../constants/types";


interface GetBankAccountsInput {
	userId: string;
	bankName?: string;
	isActive?: boolean;
	currency?: string;
}

export const getBankAccounts = async (input: GetBankAccountsInput) => {
	const { userId, bankName, isActive, currency } = input;

	if (!userId) {
		throw new AppError(400, "User ID is required", "getBankAccounts");
	}

	try {
		const whereClause: any = {
			userId,
		};

		if (bankName) {
			whereClause.bankName = {
				contains: bankName,
				mode: "insensitive",
			};
		}

		if (isActive !== undefined) {
			whereClause.isActive = isActive;
		}

		if (currency) {
			whereClause.currency = currency;
		}

		const accounts = await prisma.bankAccount.findMany({
			where: whereClause,
			orderBy: [
				{ isPrimary: "desc" },
				{ createdAt: "desc" },
			],
		});

		return {
			accounts,
			total: accounts.length,
			primaryAccount: accounts.find(acc => acc.isPrimary) || null,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to get bank accounts: ${error instanceof Error ? error.message : "Unknown error"}`,
			"getBankAccounts"
		);
	}
};

interface CreateBankAccountInput {
	userId: string;
	accountName: string;
	accountNumber?: string;
	bankName: string;
	accountType?: AccountTypeValue;
	currency?: string;
	nickname?: string;
	isPrimary?: boolean;
}

export const createBankAccount = async (input: CreateBankAccountInput) => {
	const {
		userId,
		accountName,
		accountNumber,
		bankName,
		accountType,
		currency = "NGN",
		nickname,
		isPrimary = false,
	} = input;

	if (!userId || !accountName || !bankName) {
		throw new AppError(400, "User ID, account name, and bank name are required", "createBankAccount");
	}

	try {
		if (accountNumber) {
			const existingAccount = await prisma.bankAccount.findFirst({
				where: {
					userId,
					accountNumber,
					bankName: {
						equals: bankName,
						mode: "insensitive",
					},
				},
			});

			if (existingAccount) {
				return {
					account: existingAccount,
					created: false,
					message: "Account already exists",
				};
			}
		}

		if (isPrimary) {
			await prisma.bankAccount.updateMany({
				where: {
					userId,
					isPrimary: true,
				},
				data: {
					isPrimary: false,
				},
			});
		}

		const newAccount = await prisma.bankAccount.create({
			data: {
				userId,
				accountName,
				accountNumber: accountNumber || null,
				bankName,
				accountType: accountType || null,
				currency,
				nickname: nickname || null,
				isPrimary,
				isActive: true,
			},
		});

		return {
			account: newAccount,
			created: true,
			message: `Successfully created bank account${isPrimary ? " and set as primary" : ""}`,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to create bank account: ${error instanceof Error ? error.message : "Unknown error"}`,
			"createBankAccount"
		);
	}
};

interface MatchBankAccountInput {
	userId: string;
	bankName: string;
	accountNumber?: string;
}

export const matchBankAccount = async (input: MatchBankAccountInput) => {
	const { userId, bankName, accountNumber } = input;

	if (!userId || !bankName) {
		throw new AppError(400, "User ID and bank name are required", "matchBankAccount");
	}

	try {
		const whereClause: any = {
			userId,
			isActive: true,
		};

		if (accountNumber) {
			whereClause.accountNumber = accountNumber;
			whereClause.bankName = {
				contains: bankName,
				mode: "insensitive",
			};
		} else {
			whereClause.bankName = {
				contains: bankName,
				mode: "insensitive",
			};
		}

		const account = await prisma.bankAccount.findFirst({
			where: whereClause,
			orderBy: [
				{ isPrimary: "desc" },
				{ createdAt: "desc" },
			],
		});

		return account;
	} catch (error) {
		throw new AppError(
			500,
			`Failed to match bank account: ${error instanceof Error ? error.message : "Unknown error"}`,
			"matchBankAccount"
		);
	}
};

export const getPrimaryBankAccount = async (userId: string) => {
	if (!userId) {
		throw new AppError(400, "User ID is required", "getPrimaryBankAccount");
	}

	try {
		const primaryAccount = await prisma.bankAccount.findFirst({
			where: {
				userId,
				isPrimary: true,
				isActive: true,
			},
		});

		return primaryAccount;
	} catch (error) {
		throw new AppError(
			500,
			`Failed to get primary bank account: ${error instanceof Error ? error.message : "Unknown error"}`,
			"getPrimaryBankAccount"
		);
	}
};

export const getBankAccountById = async (accountId: string, userId: string) => {
	if (!accountId || !userId) {
		throw new AppError(400, "Account ID and user ID are required", "getBankAccountById");
	}

	try {
		const account = await prisma.bankAccount.findFirst({
			where: {
				id: accountId,
				userId,
			},
		});

		if (!account) {
			throw new AppError(404, "Bank account not found", "getBankAccountById");
		}

		return account;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			500,
			`Failed to get bank account: ${error instanceof Error ? error.message : "Unknown error"}`,
			"getBankAccountById"
		);
	}
};

interface UpdateBankAccountInput {
	accountId: string;
	userId: string;
	updates: {
		accountName?: string;
		accountNumber?: string;
		bankName?: string;
		accountType?: AccountTypeValue;
		currency?: string;
		nickname?: string;
		isPrimary?: boolean;
		isActive?: boolean;
	};
}

export const updateBankAccount = async (input: UpdateBankAccountInput) => {
	const { accountId, userId, updates } = input;

	if (!accountId || !userId) {
		throw new AppError(400, "Account ID and user ID are required", "updateBankAccount");
	}

	try {
		const account = await prisma.bankAccount.findFirst({
			where: {
				id: accountId,
				userId,
			},
		});

		if (!account) {
			throw new AppError(404, "Bank account not found", "updateBankAccount");
		}

		if (updates.accountNumber && updates.bankName) {
			const existingAccount = await prisma.bankAccount.findFirst({
				where: {
					userId,
					accountNumber: updates.accountNumber,
					bankName: {
						equals: updates.bankName,
						mode: "insensitive",
					},
					id: {
						not: accountId,
					},
				},
			});

			if (existingAccount) {
				throw new AppError(409, "Account with this number and bank already exists", "updateBankAccount");
			}
		}

		if (updates.isPrimary) {
			await prisma.bankAccount.updateMany({
				where: {
					userId,
					isPrimary: true,
					id: {
						not: accountId,
					},
				},
				data: {
					isPrimary: false,
				},
			});
		}

		const updatedAccount = await prisma.bankAccount.update({
			where: { id: accountId },
			data: updates,
		});

		return updatedAccount;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			500,
			`Failed to update bank account: ${error instanceof Error ? error.message : "Unknown error"}`,
			"updateBankAccount"
		);
	}
};

export const deleteBankAccount = async (accountId: string, userId: string) => {
	if (!accountId || !userId) {
		throw new AppError(400, "Account ID and user ID are required", "deleteBankAccount");
	}

	try {
		const account = await prisma.bankAccount.findFirst({
			where: {
				id: accountId,
				userId,
			},
		});

		if (!account) {
			throw new AppError(404, "Bank account not found", "deleteBankAccount");
		}

		await prisma.bankAccount.update({
			where: { id: accountId },
			data: { isActive: false },
		});

		return { message: "Bank account deleted successfully" };
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			500,
			`Failed to delete bank account: ${error instanceof Error ? error.message : "Unknown error"}`,
			"deleteBankAccount"
		);
	}
};

export const setPrimaryAccount = async (accountId: string, userId: string) => {
	if (!accountId || !userId) {
		throw new AppError(400, "Account ID and user ID are required", "setPrimaryAccount");
	}

	try {
		const account = await prisma.bankAccount.findFirst({
			where: {
				id: accountId,
				userId,
			},
		});

		if (!account) {
			throw new AppError(404, "Bank account not found", "setPrimaryAccount");
		}

		await prisma.bankAccount.updateMany({
			where: {
				userId,
				isPrimary: true,
			},
			data: {
				isPrimary: false,
			},
		});

		const updatedAccount = await prisma.bankAccount.update({
			where: { id: accountId },
			data: { isPrimary: true },
		});

		return updatedAccount;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			500,
			`Failed to set primary account: ${error instanceof Error ? error.message : "Unknown error"}`,
			"setPrimaryAccount"
		);
	}
};
