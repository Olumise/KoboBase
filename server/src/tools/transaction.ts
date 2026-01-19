import { tool } from "@langchain/core/tools";
import * as z from "zod";

const ValidateTransactionTypeSchema = z.object({
	proposedType: z
		.enum(["income", "expense", "transfer", "refund", "fee", "adjustment"])
		.describe("The transaction type being validated"),
	amount: z.number().describe("The transaction amount"),
	description: z
		.string()
		.optional()
		.describe("Transaction description for context"),
	contactName: z
		.string()
		.optional()
		.describe("Name of the contact/merchant for context"),
	transactionDirection: z
		.enum(["inbound", "outbound"])
		.optional()
		.describe("Direction of the transaction (inbound = receiving, outbound = sending)"),
	isSelfTransaction: z
		.boolean()
		.optional()
		.describe("Whether this is a transfer between user's own accounts"),
});

export const validateTransactionTypeTool = tool(
	async ({
		proposedType,
		amount,
		description,
		contactName,
		transactionDirection,
		isSelfTransaction,
	}) => {
		try {
			const warnings: string[] = [];
			let isValid = true;
			let suggestedType = proposedType;
			let confidence = 1.0;
			let reasoning = "";

			if (isSelfTransaction) {
				if (proposedType !== "transfer") {
					isValid = false;
					suggestedType = "transfer";
					confidence = 0.95;
					reasoning =
						"Self-transactions (between your own accounts) should be classified as 'transfer'.";
				} else {
					reasoning = "Correct: Self-transactions are properly classified as transfers.";
				}
			} else if (transactionDirection) {
				if (transactionDirection === "inbound") {
					if (proposedType === "expense") {
						isValid = false;
						suggestedType = "income";
						confidence = 0.9;
						reasoning =
							"Inbound transactions (money received) should typically be 'income' or 'refund', not 'expense'.";
					} else if (proposedType === "refund") {
						reasoning =
							"Valid: Refunds are inbound transactions representing money returned to you.";
					} else if (proposedType === "income") {
						reasoning = "Valid: Income represents money received.";
					}
				} else if (transactionDirection === "outbound") {
					if (proposedType === "income") {
						isValid = false;
						suggestedType = "expense";
						confidence = 0.9;
						reasoning =
							"Outbound transactions (money sent) should typically be 'expense' or 'transfer', not 'income'.";
					} else if (proposedType === "expense") {
						reasoning = "Valid: Expense represents money spent.";
					} else if (proposedType === "transfer") {
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
					if (proposedType !== "refund") {
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
					if (proposedType !== "fee") {
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
					if (proposedType !== "adjustment") {
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

			return JSON.stringify({
				isValid,
				confidence,
				suggestedType,
				reasoning,
				warnings: warnings.length > 0 ? warnings : undefined,
			});
		} catch (error) {
			return JSON.stringify({
				error: "Failed to validate transaction type",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
	{
		name: "validate_transaction_type",
		description:
			"Validate that a transaction type is appropriate given the context (amount, description, direction). Returns validation result with suggestions and reasoning.",
		schema: ValidateTransactionTypeSchema,
	}
);
