import * as z from "zod";

// Structured Question Schema for clearer user interactions
export const StructuredQuestionSchema = z.object({
	field: z.string().describe("The field name this question is about"),
	question: z.string().describe("The question to ask the user"),
	suggestions: z.array(z.string()).describe("Suggested values or options (empty array if none)"),
	hint: z.string().describe("Helpful hint or context for the user (empty string if none)"),
});

export type StructuredQuestion = z.infer<typeof StructuredQuestionSchema>;

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
	receiver_bank: z.string().describe("Receiving bank name. Use empty string if not available."),
	receiver_account_number: z.string().describe("Receiving account number. Use empty string if not available."),
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
		.array(StructuredQuestionSchema)
		.nullable()
		.describe(
			"Structured questions to clarify missing fields or unclear information. Each question should include the field name, a clear conversational question, suggestions (if applicable), and helpful hints. Null if complete."
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

export const DocumentDetectionSchema = z.object({
	document_type: z.enum([
		"single_receipt",
		"multi_item_receipt",
		"bank_statement",
		"invoice",
		"expense_report",
		"other"
	]).describe("The type of document uploaded"),

	transaction_count: z.number().int().min(0).describe(
		"The number of distinct transactions found in this document. 0 if unclear or not a financial document."
	),

	processing_mode: z.enum([
		"single",
		"sequential"
	]).describe(
		"Recommended processing mode: 'single' for 1 transaction, 'sequential' for 2+ transactions (processed one at a time)"
	),

	confidence: z.number().min(0).max(1).describe(
		"Confidence level in the detection (0-1). Use lower confidence if document is unclear or ambiguous."
	),

	document_characteristics: z.object({
		has_multiple_dates: z.boolean().describe("Does the document contain multiple transaction dates?"),
		has_summary_totals: z.boolean().describe("Does it have summary/total sections?"),
		is_tabular_format: z.boolean().describe("Is data presented in table/list format?"),
		date_range: z.object({
			start: z.string().nullable().describe("Earliest transaction date found (ISO format or null)"),
			end: z.string().nullable().describe("Latest transaction date found (ISO format or null)")
		}).nullable()
	}),

	transaction_preview: z.array(
		z.object({
			amount: z.number().nullable(),
			date: z.string().nullable(),
			description: z.string().nullable()
		})
	).describe("Show basic information for all the transactions you spotted"),

	notes: z.string().describe(
		"Any important observations about the document structure, quality, or processing recommendations"
	)
});

export type DocumentDetection = z.infer<typeof DocumentDetectionSchema>;

export const BatchTransactionItemSchema = z.object({
	transaction: TransactionReceiptSchema,
	enrichment_data: EnrichmentDataSchema.nullable(),
	confidence_score: z.number().min(0).max(1),
	needs_review: z.boolean().describe("Whether this transaction needs user review before approval"),
	review_notes: z.string().nullable().describe("Any issues or concerns that need user attention")
});

export const BatchTransactionExtractionSchema = z.object({
	total_transactions: z.number().int().min(0).describe("Total number of transactions extracted"),
	successful_extractions: z.number().int().min(0).describe("Number of successfully extracted transactions"),
	transactions: z.array(BatchTransactionItemSchema).describe("Array of extracted transactions"),
	overall_confidence: z.number().min(0).max(1).describe("Overall confidence in the batch extraction"),
	extraction_notes: z.string().describe("Any general notes about the extraction process or issues encountered")
});

export type BatchTransactionExtraction = z.infer<typeof BatchTransactionExtractionSchema>;

// Batch Transaction Initiation Schemas (mirrors single transaction initiation but for multiple transactions)
export const BatchTransactionInitiationItemSchema = z.object({
	transaction_index: z.number().int().min(0).describe("Index of this transaction in the batch"),
	is_complete: z.string().describe("'true' or 'false' for completion status"),
	confidence_score: z.number().min(0).max(1),
	transaction: TransactionReceiptSchema.nullable().describe("The transaction data if complete, or null if missing fields"),
	raw_text: z.string().describe("The raw OCR text segment from the receipt that corresponds to this specific transaction, so users can see what was extracted"),
	missing_fields: z.array(z.string()).nullable().describe("List of fields that are missing or need clarification, null if complete"),
	questions: z.array(StructuredQuestionSchema).nullable().describe("Structured questions to clarify missing fields. Include field name, conversational question, suggestions, and helpful hints. Null if complete"),
	enrichment_data: EnrichmentDataSchema.nullable(),
	notes: z.string().describe("Any additional context, observations, assumptions, or important details"),
	needs_clarification: z.boolean().describe("Whether this specific transaction needs user clarification"),
	needs_confirmation: z.boolean().describe("Whether this transaction needs tool confirmation"),
	clarification_session_id: z.string().nullable().describe("ID of clarification session if one was created"),
});

export const BatchTransactionInitiationResponseSchema = z.object({
	total_transactions: z.number().int().min(0).describe("Total number of transactions found"),
	successfully_initiated: z.number().int().min(0).describe("Number of transactions successfully initiated"),
	transactions: z.array(BatchTransactionInitiationItemSchema).describe("Array of transaction initiation results"),
	overall_confidence: z.number().min(0).max(1).describe("Overall confidence across all transactions"),
	batch_session_id: z.string().describe("ID of the batch session tracking this operation"),
	processing_notes: z.string().describe("General notes about the batch processing"),
});

export type BatchTransactionInitiationItem = z.infer<typeof BatchTransactionInitiationItemSchema>;
export type BatchTransactionInitiationResponse = z.infer<typeof BatchTransactionInitiationResponseSchema>;
