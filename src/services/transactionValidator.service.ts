import { AppError } from "../middlewares/errorHandler";
import { TransactionType } from "../../generated/prisma/client";

interface ValidateTransactionTypeInput {
	proposedType: TransactionType;
	amount: number;
	description?: string;
	contactName?: string;
	transactionDirection?: "inbound" | "outbound";
	isSelfTransaction?: boolean;
}

interface ValidationResult {
	isValid: boolean;
	confidence: number;
	suggestedType: TransactionType;
	reasoning: string;
	warnings?: string[];
}

export const validateTransactionType = async (
	input: ValidateTransactionTypeInput
): Promise<ValidationResult> => {
	const {
		proposedType,
		amount,
		description,
		contactName,
		transactionDirection,
		isSelfTransaction,
	} = input;

	if (!proposedType || amount === undefined) {
		throw new AppError(400, "Proposed type and amount are required", "validateTransactionType");
	}

	try {
		const warnings: string[] = [];
		let isValid = true;
		let suggestedType = proposedType;
		let confidence = 1.0;
		let reasoning = "";

		if (isSelfTransaction) {
			if (proposedType !== TransactionType.TRANSFER) {
				isValid = false;
				suggestedType = TransactionType.TRANSFER;
				confidence = 0.95;
				reasoning =
					"Self-transactions (between your own accounts) should be classified as 'transfer'.";
			} else {
				reasoning = "Correct: Self-transactions are properly classified as transfers.";
			}
		} else if (transactionDirection) {
			if (transactionDirection === "inbound") {
				if (proposedType === TransactionType.EXPENSE) {
					isValid = false;
					suggestedType = TransactionType.INCOME;
					confidence = 0.9;
					reasoning =
						"Inbound transactions (money received) should typically be 'income' or 'refund', not 'expense'.";
				} else if (proposedType === TransactionType.REFUND) {
					reasoning =
						"Valid: Refunds are inbound transactions representing money returned to you.";
				} else if (proposedType === TransactionType.INCOME) {
					reasoning = "Valid: Income represents money received.";
				}
			} else if (transactionDirection === "outbound") {
				if (proposedType === TransactionType.INCOME) {
					isValid = false;
					suggestedType = TransactionType.EXPENSE;
					confidence = 0.9;
					reasoning =
						"Outbound transactions (money sent) should typically be 'expense' or 'transfer', not 'income'.";
				} else if (proposedType === TransactionType.EXPENSE) {
					reasoning = "Valid: Expense represents money spent.";
				} else if (proposedType === TransactionType.TRANSFER) {
					warnings.push(
						"Transfer typically implies moving between own accounts. Verify this is not a payment to another person/merchant."
					);
					reasoning =
						"Possibly valid: Transfers are outbound but usually between your own accounts.";
					confidence = 0.8;
				}
			}
		}

		if (description) {
			const lowerDesc = description.toLowerCase();

			if (
				lowerDesc.includes("refund") ||
				lowerDesc.includes("reversal") ||
				lowerDesc.includes("returned")
			) {
				if (proposedType !== TransactionType.REFUND) {
					warnings.push(
						"Description suggests this might be a refund. Consider using 'refund' type."
					);
					if (confidence > 0.7) confidence = 0.7;
				}
			}

			if (
				lowerDesc.includes("fee") ||
				lowerDesc.includes("charge") ||
				lowerDesc.includes("commission")
			) {
				if (proposedType !== TransactionType.FEE) {
					warnings.push(
						"Description suggests this might be a fee. Consider using 'fee' type."
					);
					if (confidence > 0.7) confidence = 0.7;
				}
			}

			if (
				lowerDesc.includes("adjustment") ||
				lowerDesc.includes("correction")
			) {
				if (proposedType !== TransactionType.ADJUSTMENT) {
					warnings.push(
						"Description suggests this might be an adjustment. Consider using 'adjustment' type."
					);
					if (confidence > 0.7) confidence = 0.7;
				}
			}
		}

		if (amount < 0) {
			warnings.push(
				"Negative amount detected. Ensure the transaction type and direction are correctly set."
			);
			confidence = Math.min(confidence, 0.6);
		}

		if (!reasoning) {
			reasoning = "The proposed transaction type appears reasonable given the context.";
		}

		return {
			isValid,
			confidence,
			suggestedType,
			reasoning,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to validate transaction type: ${error instanceof Error ? error.message : "Unknown error"}`,
			"validateTransactionType"
		);
	}
};

interface ValidateBatchInput {
	transactions: ValidateTransactionTypeInput[];
}

export const validateTransactionTypeBatch = async (input: ValidateBatchInput) => {
	const { transactions } = input;

	if (!transactions || transactions.length === 0) {
		throw new AppError(400, "Transactions array is required", "validateTransactionTypeBatch");
	}

	try {
		const results = await Promise.all(
			transactions.map(transaction => validateTransactionType(transaction))
		);

		return {
			results,
			total: results.length,
			valid: results.filter(r => r.isValid).length,
			invalid: results.filter(r => !r.isValid).length,
			avgConfidence: results.reduce((acc, r) => acc + r.confidence, 0) / results.length,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to validate transaction batch: ${error instanceof Error ? error.message : "Unknown error"}`,
			"validateTransactionTypeBatch"
		);
	}
};

interface GetTransactionDirectionInput {
	senderName?: string;
	receiverName?: string;
	userName: string;
}

export const getTransactionDirection = (
	input: GetTransactionDirectionInput
): "inbound" | "outbound" | "unknown" => {
	const { senderName, receiverName, userName } = input;

	const normalizedUserName = userName.toLowerCase().trim();

	if (receiverName) {
		const normalizedReceiver = receiverName.toLowerCase().trim();
		if (normalizedReceiver.includes(normalizedUserName) || normalizedUserName.includes(normalizedReceiver)) {
			return "inbound";
		}
	}

	if (senderName) {
		const normalizedSender = senderName.toLowerCase().trim();
		if (normalizedSender.includes(normalizedUserName) || normalizedUserName.includes(normalizedSender)) {
			return "outbound";
		}
	}

	return "unknown";
};

interface CheckSelfTransactionInput {
	senderAccountId?: string;
	receiverAccountId?: string;
	userAccountIds: string[];
}

export const checkSelfTransaction = (input: CheckSelfTransactionInput): boolean => {
	const { senderAccountId, receiverAccountId, userAccountIds } = input;

	if (!senderAccountId || !receiverAccountId) {
		return false;
	}

	const senderIsUser = userAccountIds.includes(senderAccountId);
	const receiverIsUser = userAccountIds.includes(receiverAccountId);

	return senderIsUser && receiverIsUser;
};

interface SuggestTransactionTypeInput {
	amount: number;
	description?: string;
	contactName?: string;
	isSelfTransaction?: boolean;
	transactionDirection?: "inbound" | "outbound" | "unknown";
}

export const suggestTransactionType = (
	input: SuggestTransactionTypeInput
): { type: TransactionType; confidence: number; reasoning: string } => {
	const { amount, description, contactName, isSelfTransaction, transactionDirection } = input;

	if (isSelfTransaction) {
		return {
			type: TransactionType.TRANSFER,
			confidence: 0.95,
			reasoning: "Transaction is between your own accounts",
		};
	}

	if (description) {
		const lowerDesc = description.toLowerCase();

		if (lowerDesc.includes("refund") || lowerDesc.includes("reversal") || lowerDesc.includes("returned")) {
			return {
				type: TransactionType.REFUND,
				confidence: 0.9,
				reasoning: "Description contains refund-related keywords",
			};
		}

		if (lowerDesc.includes("fee") || lowerDesc.includes("charge") || lowerDesc.includes("commission")) {
			return {
				type: TransactionType.FEE,
				confidence: 0.85,
				reasoning: "Description contains fee-related keywords",
			};
		}

		if (lowerDesc.includes("adjustment") || lowerDesc.includes("correction")) {
			return {
				type: TransactionType.ADJUSTMENT,
				confidence: 0.85,
				reasoning: "Description contains adjustment-related keywords",
			};
		}
	}

	if (transactionDirection === "inbound") {
		return {
			type: TransactionType.INCOME,
			confidence: 0.8,
			reasoning: "Transaction is inbound (money received)",
		};
	}

	if (transactionDirection === "outbound") {
		return {
			type: TransactionType.EXPENSE,
			confidence: 0.8,
			reasoning: "Transaction is outbound (money sent)",
		};
	}

	if (amount > 0) {
		return {
			type: TransactionType.INCOME,
			confidence: 0.6,
			reasoning: "Positive amount suggests income",
		};
	}

	if (amount < 0) {
		return {
			type: TransactionType.EXPENSE,
			confidence: 0.6,
			reasoning: "Negative amount suggests expense",
		};
	}

	return {
		type: TransactionType.EXPENSE,
		confidence: 0.5,
		reasoning: "Default suggestion based on limited context",
	};
};
