import { DocumentDetectionSchema, DocumentDetection } from "../schema/ai-formats";
import { OpenAIllmGPT4Turbo as OpenAIllm } from "../models/llm.models";
import { AppError } from "../middlewares/errorHandler";

const DOCUMENT_DETECTION_PROMPT = `You are a financial document analyzer. Your task is to analyze OCR-extracted text from financial documents and determine:

1. **Document Type**: What kind of financial document is this?
   - single_receipt: A receipt for one transaction
   - multi_item_receipt: A receipt with multiple line items but one overall payment
   - bank_statement: A bank statement showing multiple transactions over time
   - invoice: An invoice document
   - expense_report: An expense report with multiple expenses
   - other: Other financial document

2. **Transaction Count**: How many DISTINCT financial transactions are in this document?
   - For a receipt with multiple items but one payment: count as 1 transaction
   - For a bank statement: count each transaction line
   - For transfers/payments: count as 1 transaction even if it shows debit and credit

3. **Processing Mode Recommendation**:
   - single: For 1 transaction
   - sequential: For 2+ transactions (processed one at a time)
   - batch: For 2+ transactions (can be processed and reviewed together)

4. **Document Characteristics**: Analyze the structure and format

5. **Transaction Preview**: Extract basic info (amount, date, description) from the first few transactions

Important Guidelines:
- Be conservative with transaction counts - only count clear, distinct transactions
- If the document is unclear or low quality, reflect this in your confidence score
- For multi-item receipts (e.g., grocery receipts), count as 1 transaction unless each item was paid separately
- Look for indicators like multiple dates, multiple payment methods, or explicit transaction listings

Analyze the document carefully and provide accurate detection results.`;

export const detectDocumentType = async (
	ocrText: string
): Promise<DocumentDetection> => {
	if (!ocrText || ocrText.trim().length === 0) {
		throw new AppError(
			400,
			"OCR text is required for document detection",
			"detectDocumentType"
		);
	}

	try {
		const llmWithStructuredOutput = OpenAIllm.withStructuredOutput(
			DocumentDetectionSchema,
			{ name: "detect_document", strict: true }
		);

		const result = await llmWithStructuredOutput.invoke([
			{
				role: "system",
				content: DOCUMENT_DETECTION_PROMPT,
				additional_kwargs: {
					cache_control: { type: "ephemeral" }
				}
			},
			{
				role: "user",
				content: `Please analyze this financial document and detect its type and transaction count:\n\n${ocrText}`,
			},
		]);

		return result as DocumentDetection;
	} catch (error) {
		console.error("Error in document detection:", error);
		throw new AppError(
			500,
			"Failed to detect document type",
			"detectDocumentType"
		);
	}
};

export const determineProcessingMode = (
	detection: DocumentDetection
): "single" | "batch" | "sequential" => {
	const { transaction_count, confidence } = detection;

	if (confidence < 0.6 || transaction_count === 0) {
		return "single";
	}

	if (transaction_count === 1) {
		return "single";
	} else {
		return "sequential";
	}
};
