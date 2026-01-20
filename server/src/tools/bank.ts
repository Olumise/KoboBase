import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { prisma } from "../lib/prisma";

const GetBankAccountsSchema = z.object({
	userId: z.string().describe("The ID of the user"),
	isActive: z
		.boolean()
		.optional()
		.describe("Filter by active status (omit to get all accounts)"),
	currency: z
		.string()
		.optional()
		.describe("Filter by currency code (e.g., NGN, USD)"),
});

const GetBankAccountByIdSchema = z.object({
	accountId: z.string().describe("The ID of the bank account to retrieve"),
	userId: z.string().describe("The ID of the user who owns the account"),
});

export const getBankAccountsTool = tool(
	async ({ userId, isActive, currency }) => {
		try {
			const accounts = await prisma.bankAccount.findMany({
				where: {
					userId: userId,
					...(isActive !== undefined && { isActive }),
					...(currency && { currency }),
				},
				orderBy: [
					{ isPrimary: "desc" },
					{ createdAt: "desc" },
				],
			});

			if (accounts.length === 0) {
				return JSON.stringify({
					success: false,
					requiresBankAccount: true,
					message: "No bank accounts found. Please ask the user to provide or attach the bank account ID to accurately record this transaction.",
					accounts: [],
					total: 0,
					primaryAccount: null,
				});
			}

			const primaryAccount = accounts.find((acc) => acc.isPrimary) || null;

			return JSON.stringify({
				success: true,
				accounts: accounts.map((acc) => ({
					id: acc.id,
					userId: acc.userId,
					accountName: acc.accountName,
					accountNumber: acc.accountNumber,
					bankName: acc.bankName,
					accountType: acc.accountType,
					currency: acc.currency,
					nickname: acc.nickname,
					isActive: acc.isActive,
					isPrimary: acc.isPrimary,
					createdAt: acc.createdAt.toISOString(),
					updatedAt: acc.updatedAt.toISOString(),
				})),
				total: accounts.length,
				primaryAccount: primaryAccount
					? {
							id: primaryAccount.id,
							userId: primaryAccount.userId,
							accountName: primaryAccount.accountName,
							accountNumber: primaryAccount.accountNumber,
							bankName: primaryAccount.bankName,
							accountType: primaryAccount.accountType,
							currency: primaryAccount.currency,
							nickname: primaryAccount.nickname,
							isActive: primaryAccount.isActive,
							isPrimary: primaryAccount.isPrimary,
							createdAt: primaryAccount.createdAt.toISOString(),
							updatedAt: primaryAccount.updatedAt.toISOString(),
					  }
					: null,
			});
		} catch (error) {
			return JSON.stringify({
				error: "Failed to get bank accounts",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
	{
		name: "get_bank_accounts",
		description:
			"Retrieve a list of the user's bank accounts. Can filter by active status or currency. Returns all accounts with optional primary account highlighted. If no bank accounts are found (requiresBankAccount: true), you MUST inform the user that they need to provide or attach a bank account ID to accurately record the transaction. Do not proceed without a valid bank account.",
		schema: GetBankAccountsSchema,
	}
);

export const getBankAccountByIdTool = tool(
	async ({ accountId, userId }) => {
		try {
			const account = await prisma.bankAccount.findFirst({
				where: {
					id: accountId,
					userId: userId,
				},
			});

			if (!account) {
				return JSON.stringify({
					success: false,
					error: "Bank account not found",
					message: "The specified bank account was not found or does not belong to this user.",
				});
			}

			return JSON.stringify({
				success: true,
				account: {
					id: account.id,
					userId: account.userId,
					accountName: account.accountName,
					accountNumber: account.accountNumber,
					bankName: account.bankName,
					accountType: account.accountType,
					currency: account.currency,
					nickname: account.nickname,
					isActive: account.isActive,
					isPrimary: account.isPrimary,
					createdAt: account.createdAt.toISOString(),
					updatedAt: account.updatedAt.toISOString(),
				},
			});
		} catch (error) {
			return JSON.stringify({
				success: false,
				error: "Failed to get bank account",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
	{
		name: "get_bank_account_by_id",
		description:
			"Retrieve a specific bank account by its ID. Use this tool when the user provides a bank account ID to fetch the complete account details including bank name, account name, and account number. This is essential for accurately recording transaction details.",
		schema: GetBankAccountByIdSchema,
	}
);
