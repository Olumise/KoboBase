import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/errorHandler';

export interface SimilarTransaction {
	id: string;
	userId: string;
	amount: string;
	currency: string;
	transactionType: string;
	transactionDate: Date;
	description: string | null;
	summary: string | null;
	paymentMethod: string | null;
	contactName: string | null;
	categoryName: string | null;
	similarity: number;
}

export interface VectorSearchParams {
	userId: string;
	queryEmbedding: number[];
	limit?: number;
	threshold?: number;
	dateFrom?: Date;
	dateTo?: Date;
	minAmount?: number;
	maxAmount?: number;
	transactionTypes?: string[];
}

/**
 * Search for transactions similar to the query embedding using pgvector cosine similarity
 */
export const searchSimilarTransactions = async ({
	userId,
	queryEmbedding,
	limit = 5,
	threshold = 0.7,
	dateFrom,
	dateTo,
	minAmount,
	maxAmount,
	transactionTypes,
}: VectorSearchParams): Promise<SimilarTransaction[]> => {
	let query = '';
	let params: any[] = [];

	try {
		// Validate embedding dimension
		if (queryEmbedding.length !== 1536) {
			throw new AppError(
				400,
				`Invalid embedding dimension: expected 1536, got ${queryEmbedding.length}`,
				'searchSimilarTransactions'
			);
		}

		// Convert embedding to PostgreSQL vector format
		const embeddingString = `[${queryEmbedding.join(',')}]`;

		// Build dynamic WHERE clause for filters
		const filters: string[] = ['t.user_id = $1'];
		params = [userId];
		params.push(embeddingString); // Add embedding as $2
		let paramIndex = 3; // Start from $3 for additional filters

		// Optional filters
		if (dateFrom) {
			filters.push(`t.transaction_date >= $${paramIndex}`);
			params.push(dateFrom);
			paramIndex++;
		}

		if (dateTo) {
			filters.push(`t.transaction_date <= $${paramIndex}`);
			params.push(dateTo);
			paramIndex++;
		}

		if (minAmount !== undefined) {
			filters.push(`t.amount >= $${paramIndex}`);
			params.push(minAmount);
			paramIndex++;
		}

		if (maxAmount !== undefined) {
			filters.push(`t.amount <= $${paramIndex}`);
			params.push(maxAmount);
			paramIndex++;
		}

		if (transactionTypes && transactionTypes.length > 0) {
			filters.push(`t.transaction_type = ANY($${paramIndex}::text[])`);
			params.push(transactionTypes);
			paramIndex++;
		}

		// Add limit
		params.push(limit);

		const whereClause = filters.join(' AND ');

		// Execute similarity search
		query = `
			SELECT
				t.id,
				t.user_id,
				t.amount,
				t.currency,
				t.transaction_type,
				t.transaction_date,
				t.description,
				t.summary,
				t.payment_method,
				c.name as contact_name,
				cat.name as category_name,
				1 - (t.embedding <=> $2::vector) AS similarity
			FROM transactions t
			LEFT JOIN contacts c ON t.sender_id = c.id
			LEFT JOIN categories cat ON t.category_id = cat.id
			WHERE ${whereClause}
			ORDER BY t.embedding <=> $2::vector
			LIMIT $${paramIndex}
		`;

		const results = await prisma.$queryRawUnsafe<any[]>(query, ...params);

		// Transform results and filter by threshold
		return results
			.filter((row) => parseFloat(row.similarity) >= threshold)
			.map((row) => ({
				id: row.id,
				userId: row.user_id,
				amount: row.amount.toString(),
				currency: row.currency,
				transactionType: row.transaction_type,
				transactionDate: row.transaction_date,
				description: row.description,
				summary: row.summary,
				paymentMethod: row.payment_method,
				contactName: row.contact_name,
				categoryName: row.category_name,
				similarity: parseFloat(row.similarity.toFixed(4)),
			}));
	} catch (error) {
		console.error('Error in vector search:', error);
		console.error('Query:', query);
		console.error('Params:', params);
		if (error instanceof AppError) throw error;
		throw new AppError(
			500,
			`Failed to search similar transactions: ${error instanceof Error ? error.message : String(error)}`,
			'searchSimilarTransactions'
		);
	}
};

/**
 * Format transactions for LLM context
 */
export const formatTransactionsForPrompt = (
	transactions: SimilarTransaction[]
): string => {
	if (transactions.length === 0) {
		return 'No relevant transactions found.';
	}

	return transactions
		.map((t, index) => {
			const date = new Date(t.transactionDate).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			});

			const parts: string[] = [
				`Transaction ${index + 1} (Similarity: ${(t.similarity * 100).toFixed(1)}%)`,
				`- Date: ${date}`,
				`- Amount: ${t.currency} ${parseFloat(t.amount).toLocaleString()}`,
				`- Type: ${t.transactionType}`,
			];

			if (t.description) {
				parts.push(`- Description: ${t.description}`);
			}

			if (t.contactName) {
				parts.push(`- Sender/Merchant: ${t.contactName}`);
			}

			if (t.categoryName) {
				parts.push(`- Category: ${t.categoryName}`);
			}

			if (t.paymentMethod) {
				parts.push(`- Payment Method: ${t.paymentMethod}`);
			}

			if (t.summary) {
				parts.push(`- Summary: ${t.summary}`);
			}

			return parts.join('\n');
		})
		.join('\n\n---\n\n');
};
