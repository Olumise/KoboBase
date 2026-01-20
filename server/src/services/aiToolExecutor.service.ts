import { AppError } from "../middlewares/errorHandler";
import { toolsByName, ToolName } from "../tools";
import { TransactionType } from "../../generated/prisma/client";
import { ContactType } from "../constants/types";
import { CONTACT_TYPE_KEYWORDS } from "../lib/contactTypeKeywords";
import * as bankAccountService from "./bankAccount.service";
import * as transactionValidatorService from "./transactionValidator.service";

interface ToolCallResult {
	success: boolean;
	data?: any;
	error?: string;
}

export const executeAITool = async (
	functionName: ToolName,
	args: Record<string, any>
): Promise<ToolCallResult> => {
	try {
		const tool = toolsByName[functionName];

		if (!tool) {
			throw new AppError(404, `Tool '${functionName}' not found`, "executeAITool");
		}

		const result = await (tool as any).invoke(args);

		const parsedResult = typeof result === "string" ? JSON.parse(result) : result;

		if (parsedResult.error) {
			return {
				success: false,
				error: parsedResult.error,
				data: parsedResult,
			};
		}

		return {
			success: true,
			data: parsedResult,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
};

interface ToolCall {
	functionName: ToolName;
	args: Record<string, any>;
}

export const executeAIToolsBatch = async (
	toolCalls: ToolCall[]
): Promise<Record<string, ToolCallResult>> => {
	if (!toolCalls || toolCalls.length === 0) {
		throw new AppError(400, "Tool calls array is required", "executeAIToolsBatch");
	}

	try {
		const results = await Promise.all(
			toolCalls.map(async (toolCall) => {
				const result = await executeAITool(toolCall.functionName, toolCall.args);
				return {
					functionName: toolCall.functionName,
					result,
				};
			})
		);

		const resultsMap: Record<string, ToolCallResult> = {};
		results.forEach((item) => {
			resultsMap[item.functionName] = item.result;
		});

		return resultsMap;
	} catch (error) {
		throw new AppError(
			500,
			`Failed to execute tool batch: ${error instanceof Error ? error.message : "Unknown error"}`,
			"executeAIToolsBatch"
		);
	}
};

interface EnrichTransactionInput {
	transactionData: {
		amount: number;
		description?: string;
		transactionType?: TransactionType;
		categoryName?: string;
		senderName?: string;
		receiverName?: string;
		senderBankName?: string;
		receiverBankName?: string;
		senderAccountNumber?: string;
		receiverAccountNumber?: string;
	};
	userId: string;
	userName: string;
}

interface EnrichedTransactionResult {
	enrichedData: {
		categoryId?: string;
		contactId?: string;
		userBankAccountId?: string;
		toBankAccountId?: string;
		isSelfTransaction: boolean;
		validatedType?: TransactionType;
		transactionDirection?: "inbound" | "outbound" | "unknown";
	};
	toolResults: {
		category?: ToolCallResult;
		contact?: ToolCallResult;
		bankAccounts?: ToolCallResult;
		validation?: ToolCallResult;
	};
	confidence: {
		category?: number;
		contact?: number;
		typeValidation?: number;
		overall: number;
	};
}

export const enrichTransactionWithTools = async (
	input: EnrichTransactionInput
): Promise<EnrichedTransactionResult> => {
	const { transactionData, userId, userName } = input;

	if (!userId || !userName) {
		throw new AppError(400, "User ID and user name are required", "enrichTransactionWithTools");
	}

	try {
		const enrichedData: EnrichedTransactionResult["enrichedData"] = {
			isSelfTransaction: false,
		};

		const toolResults: EnrichedTransactionResult["toolResults"] = {};
		const confidence: EnrichedTransactionResult["confidence"] = {
			overall: 0,
		};

		if (transactionData.categoryName || transactionData.description) {
			const categoryResult = await executeAITool("get_category", {
				transactionDescription: transactionData.description || transactionData.categoryName || "",
				userId,
			});

			toolResults.category = categoryResult;

			if (categoryResult.success && categoryResult.data?.category) {
				enrichedData.categoryId = categoryResult.data.category.id;
				confidence.category = categoryResult.data.category.matchConfidence || 0;
			}
		}

		if (transactionData.senderName) {
			const contactResult = await executeAITool("get_or_create_contact", {
				contactName: transactionData.senderName,
				categoryId: enrichedData.categoryId,
			});

			toolResults.contact = contactResult;

			if (contactResult.success && contactResult.data) {
				enrichedData.contactId = contactResult.data.id;
				confidence.contact = contactResult.data.matchConfidence || 0;
			}
		} else if (transactionData.receiverName) {
			const contactResult = await executeAITool("get_or_create_contact", {
				contactName: transactionData.receiverName,
				categoryId: enrichedData.categoryId,
			});

			toolResults.contact = contactResult;

			if (contactResult.success && contactResult.data) {
				enrichedData.contactId = contactResult.data.id;
				confidence.contact = contactResult.data.matchConfidence || 0;
			}
		}

		const bankAccountsResult = await executeAITool("get_bank_accounts", {
			userId,
			isActive: true,
		});

		toolResults.bankAccounts = bankAccountsResult;

		if (bankAccountsResult.success && bankAccountsResult.data) {
			const userAccounts = bankAccountsResult.data.accounts || [];
			const userAccountIds = userAccounts.map((acc: any) => acc.id);

			if (transactionData.senderBankName) {
				const senderAccount = await bankAccountService.matchBankAccount({
					userId,
					bankName: transactionData.senderBankName,
					accountNumber: transactionData.senderAccountNumber,
				});

				if (senderAccount) {
					enrichedData.userBankAccountId = senderAccount.id;
				}
			}

			if (transactionData.receiverBankName) {
				const receiverAccount = await bankAccountService.matchBankAccount({
					userId,
					bankName: transactionData.receiverBankName,
					accountNumber: transactionData.receiverAccountNumber,
				});

				if (receiverAccount) {
					enrichedData.toBankAccountId = receiverAccount.id;
				}
			}

			if (enrichedData.userBankAccountId && enrichedData.toBankAccountId) {
				enrichedData.isSelfTransaction = transactionValidatorService.checkSelfTransaction({
					senderAccountId: enrichedData.userBankAccountId,
					receiverAccountId: enrichedData.toBankAccountId,
					userAccountIds,
				});
			}
		}

		enrichedData.transactionDirection = transactionValidatorService.getTransactionDirection({
			senderName: transactionData.senderName,
			receiverName: transactionData.receiverName,
			userName,
		});

		if (transactionData.transactionType) {
			const validationResult = await executeAITool("validate_transaction_type", {
				proposedType: transactionData.transactionType,
				amount: transactionData.amount,
				description: transactionData.description,
				contactName: transactionData.senderName || transactionData.receiverName,
				transactionDirection: enrichedData.transactionDirection,
				isSelfTransaction: enrichedData.isSelfTransaction,
			});

			toolResults.validation = validationResult;

			if (validationResult.success && validationResult.data) {
				if (!validationResult.data.isValid) {
					enrichedData.validatedType = validationResult.data.suggestedType;
				} else {
					enrichedData.validatedType = transactionData.transactionType;
				}
				confidence.typeValidation = validationResult.data.confidence || 0;
			}
		} else {
			const suggestion = transactionValidatorService.suggestTransactionType({
				amount: transactionData.amount,
				description: transactionData.description,
				contactName: transactionData.senderName || transactionData.receiverName,
				isSelfTransaction: enrichedData.isSelfTransaction,
				transactionDirection: enrichedData.transactionDirection,
			});

			enrichedData.validatedType = suggestion.type;
			confidence.typeValidation = suggestion.confidence;
		}

		const confidenceValues = Object.values(confidence).filter(
			(v): v is number => typeof v === "number"
		);
		confidence.overall =
			confidenceValues.length > 0
				? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
				: 0;

		return {
			enrichedData,
			toolResults,
			confidence,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to enrich transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
			"enrichTransactionWithTools"
		);
	}
};

interface BatchEnrichInput {
	transactions: EnrichTransactionInput["transactionData"][];
	userId: string;
	userName: string;
}

export const enrichTransactionsBatch = async (
	input: BatchEnrichInput
): Promise<EnrichedTransactionResult[]> => {
	const { transactions, userId, userName } = input;

	if (!transactions || transactions.length === 0) {
		throw new AppError(400, "Transactions array is required", "enrichTransactionsBatch");
	}

	try {
		const results = await Promise.all(
			transactions.map((transactionData) =>
				enrichTransactionWithTools({ transactionData, userId, userName })
			)
		);

		return results;
	} catch (error) {
		throw new AppError(
			500,
			`Failed to enrich transactions batch: ${error instanceof Error ? error.message : "Unknown error"}`,
			"enrichTransactionsBatch"
		);
	}
};

export const determineContactType = (
	bankName?: string,
	description?: string
): ContactType => {
	const searchText = `${bankName || ""} ${description || ""}`.toLowerCase();

	for (const entry of CONTACT_TYPE_KEYWORDS) {
		if (entry.keywords.some((keyword) => searchText.includes(keyword))) {
			return entry.type;
		}
	}

	return ContactType.PERSON;
};
