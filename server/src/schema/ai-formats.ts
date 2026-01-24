import * as z from "zod";

export const TransactionReceiptSchema = z.object({
	transaction_type: z.string(),
	amount: z.number(),
	currency: z.string(),
	transaction_direction: z.string(),
	payment_method:z.string(),
	fees: z.number(),
	description: z.string(),
	category: z.string(),
	sender_name: z.string(),
	sender_bank: z.string(),
	receiver_name: z.string(),
	receiver_bank: z.string(),
	receiver_account_number: z.string(),
	time_sent: z.string(),
	status: z.string(),
	transaction_reference: z.string(),
	raw_input: z.string(),
	summary: z.string(),
});

export const EnrichmentDataSchema = z.object({
	category_id: z.string().nullable(),
	contact_id: z.string().nullable(),
	user_bank_account_id: z.string().nullable(),
	to_bank_account_id: z.string().nullable(),
	is_self_transaction: z.boolean(),
});

export const TransactionReceiptAiResponseSchema = z.object({
	is_complete: z
		.string()
		.describe(
			"A true or false value for if the transaction has all the required fields"
		),
	transaction: TransactionReceiptSchema.nullable().describe(
		"The transaction data if complete, or null if missing fields"
	),
	questions: z
		.array(z.string())
		.nullable()
		.describe(
			"Questions to clarify missing fields or fields that is unclear, null if complete"
		),
	missing_fields: z
		.array(z.string())
		.nullable()
		.describe(
			"List of fields that are missing or need more clarification, null if complete"
		),
	confidence_score: z
		.number()
		.describe(
			"How confident are you about this result on a scale 0 to 1. Must be 1 if all fields present, less than 1 if any missing"
		),
	enrichment_data: EnrichmentDataSchema.nullable(),
	notes: z
		.string()
		.describe(
			"Any additional context, observations, or information that doesn't fit into other fields. Use this to communicate important details, assumptions made, or anything else relevant."
		),
});

export const OcrExtractionResultSchema = z.object({
	extracted: z.boolean(),
	failure_reason: z.string().nullable(),
	extracted_text: z.string().nullable(),
});
export type ExtractionResultSchema = z.infer<typeof OcrExtractionResultSchema>;
