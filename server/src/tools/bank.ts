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

			const primaryAccount = accounts.find((acc) => acc.isPrimary) || null;

			return JSON.stringify({
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
			"Retrieve a list of the user's bank accounts. Can filter by active status or currency. Returns all accounts with optional primary account highlighted.",
		schema: GetBankAccountsSchema,
	}
);

const CreateBankAccountSchema = z.object({
	userId: z.string().describe("The ID of the user"),
	accountName: z.string().describe("The name on the bank account"),
	accountNumber: z
		.string()
		.optional()
		.describe("The account number (optional for wallets/cards)"),
	bankName: z.string().describe("The name of the bank or financial institution"),
	accountType: z
		.enum(["savings", "current", "wallet", "card", "other"])
		.optional()
		.describe("The type of account"),
	currency: z
		.string()
		.default("NGN")
		.describe("Currency code (defaults to NGN)"),
	nickname: z
		.string()
		.optional()
		.describe("Optional nickname for easy identification"),
	isPrimary: z
		.boolean()
		.default(false)
		.describe(
			"Set as primary account (will unset other primary accounts if true)"
		),
});

export const createBankAccountTool = tool(
	async ({
		userId,
		accountName,
		accountNumber,
		bankName,
		accountType,
		currency = "NGN",
		nickname,
		isPrimary = false,
	}) => {
		try {
			if (isPrimary) {
				await prisma.bankAccount.updateMany({
					where: {
						userId: userId,
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

			return JSON.stringify({
				id: newAccount.id,
				userId: newAccount.userId,
				accountName: newAccount.accountName,
				accountNumber: newAccount.accountNumber,
				bankName: newAccount.bankName,
				accountType: newAccount.accountType,
				currency: newAccount.currency,
				nickname: newAccount.nickname,
				isActive: newAccount.isActive,
				isPrimary: newAccount.isPrimary,
				createdAt: newAccount.createdAt.toISOString(),
				updatedAt: newAccount.updatedAt.toISOString(),
				created: true,
				message: `Successfully created bank account${isPrimary ? " and set as primary" : ""}`,
			});
		} catch (error) {
			return JSON.stringify({
				error: "Failed to create bank account",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
	{
		name: "create_bank_account",
		description:
			"Create a new bank account for the user. Supports various account types including savings, current, wallets, and cards. Can optionally set as primary account.",
		schema: CreateBankAccountSchema,
	}
);
