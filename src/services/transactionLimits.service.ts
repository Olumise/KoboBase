import { AppError } from "../middlewares/errorHandler";

export const MAX_TRANSACTIONS_PER_RECEIPT = 50;

export const getTransactionLimit = (): number => {
	const envLimit = process.env.MAX_TRANSACTIONS_PER_RECEIPT;
	if (envLimit && !isNaN(parseInt(envLimit))) {
		return parseInt(envLimit);
	}
	return MAX_TRANSACTIONS_PER_RECEIPT;
};

export const validateTransactionCount = (
	transactionCount: number
): { valid: boolean; limit: number; error?: string } => {
	const limit = getTransactionLimit();

	if (transactionCount > limit) {
		return {
			valid: false,
			limit,
			error: `Document contains ${transactionCount} transactions, which exceeds the limit of ${limit}. Please split the document into smaller parts.`
		};
	}

	return { valid: true, limit };
};
