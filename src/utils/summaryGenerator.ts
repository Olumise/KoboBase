import { prisma } from "../lib/prisma";
import { OpenAIllmGPT4Turbo as OpenAIllm } from "../models/llm.models";
import { z } from "zod";

const SummaryResponseSchema = z.object({
	summary: z.string().min(20).describe("Comprehensive transaction summary answering WHO, WHAT, HOW MUCH, WHEN, HOW"),
});

/**
 * Uses AI to generate a comprehensive, natural summary from transaction data
 * This creates a semantic, contextual summary rather than just concatenating fields
 */
export async function generateAISummary(params: {
	transactionType: string;
	amount: number;
	currency?: string;
	description?: string;
	contactName?: string;
	categoryName?: string;
	transactionDate: Date;
	paymentMethod?: string;
	subcategory?: string;
	referenceNumber?: string;
	isSelfTransaction?: boolean;
	userBankAccountName?: string;
	toBankAccountName?: string;
}): Promise<string> {
	const {
		transactionType,
		amount,
		currency = "NGN",
		description,
		contactName,
		categoryName,
		transactionDate,
		paymentMethod,
		subcategory,
		referenceNumber,
		isSelfTransaction,
		userBankAccountName,
		toBankAccountName,
	} = params;

	// Format date
	const formattedDate = transactionDate.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

	const prompt = `Generate a natural, comprehensive summary for this transaction. The summary should be a single, flowing sentence that captures the key details in a human-readable way.

Transaction Details:
- Type: ${transactionType}
- Amount: ${currency} ${amount.toLocaleString()}
- Date: ${formattedDate}
${description ? `- Description: ${description}` : ""}
${contactName ? `- Contact/Party: ${contactName}` : ""}
${categoryName ? `- Category: ${categoryName}${subcategory ? ` (${subcategory})` : ""}` : ""}
${paymentMethod ? `- Payment Method: ${paymentMethod}` : ""}
${referenceNumber && referenceNumber !== "MISSING" ? `- Reference: ${referenceNumber}` : ""}
${isSelfTransaction ? "- Self-transaction between own accounts" : ""}
${userBankAccountName ? `- From Account: ${userBankAccountName}` : ""}
${toBankAccountName ? `- To Account: ${toBankAccountName}` : ""}

Guidelines:
- Create a natural, readable sentence (not a list)
- Include WHO (contact/party), WHAT (purpose/description), HOW MUCH (amount), WHEN (date), and HOW (payment method)
- Be concise but informative (aim for 15-30 words)
- Use active voice and clear language
- If it's a self-transaction, mention it's between own accounts
- Focus on the most important context

Examples:
- "Paid ₦5,200 to Uber for ride to office on Jan 15, 2024 via card"
- "Received ₦45,000 salary payment from Acme Corp on Feb 1, 2024 via bank transfer"
- "Transferred ₦20,000 between own accounts (GTBank to Access Bank) on Mar 3, 2024"
- "Purchased groceries for ₦12,500 at Shoprite on Jan 20, 2024 with cash"`;

	const llmWithStructuredOutput = OpenAIllm.withStructuredOutput(
		SummaryResponseSchema,
		{ name: "generate_summary", strict: true }
	);

	const response = await llmWithStructuredOutput.invoke([
		{
			role: "user",
			content: prompt,
		},
	]);

	return response.summary;
}

/**
 * Regenerates summary and embedding for an existing transaction using AI
 * Should be called when key transaction fields are updated
 */
export async function regenerateTransactionSummary(
	transactionId: string,
	generateEmbedding: (text: string) => Promise<number[]>
): Promise<{ summary: string; embedding: number[] }> {
	// Fetch the transaction with all related data
	const transaction = await prisma.transaction.findUnique({
		where: { id: transactionId },
		include: {
			contact: true,
			category: true,
			userBankAccount: true,
			toBankAccount: true,
		},
	});

	if (!transaction) {
		throw new Error(`Transaction ${transactionId} not found`);
	}

	// Generate new AI-powered summary
	const summary = await generateAISummary({
		transactionType: transaction.transactionType,
		amount: Number(transaction.amount),
		currency: transaction.currency,
		description: transaction.description || undefined,
		contactName: transaction.contact?.name,
		categoryName: transaction.category?.name,
		transactionDate: transaction.transactionDate,
		paymentMethod: transaction.paymentMethod || undefined,
		subcategory: transaction.subcategory || undefined,
		referenceNumber: transaction.referenceNumber || undefined,
		isSelfTransaction: transaction.isSelfTransaction,
		userBankAccountName: transaction.userBankAccount?.accountName,
		toBankAccountName: transaction.toBankAccount?.accountName,
	});

	// Generate embedding
	const embedding = await generateEmbedding(summary);

	// Update the transaction with new summary and embedding
	await prisma.$executeRaw`
		UPDATE transactions
		SET summary = ${summary},
		    embedding = ${`[${embedding.join(",")}]`}::vector,
		    updated_at = NOW()
		WHERE id = ${transactionId}
	`;

	return { summary, embedding };
}

/**
 * Checks if a field update requires summary regeneration
 */
export function shouldRegenerateSummary(updates: Record<string, any>): boolean {
	const summaryFields = [
		"description",
		"amount",
		"currency",
		"transactionType",
		"transactionDate",
		"paymentMethod",
		"contactId",
		"categoryId",
		"subcategory",
		"isSelfTransaction",
		"userBankAccountId",
		"toBankAccountId",
	];

	return summaryFields.some((field) => field in updates);
}
