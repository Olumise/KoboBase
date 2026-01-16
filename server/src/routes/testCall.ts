import express, { Request, Response } from "express";
import * as z from "zod";
import { initChatModel } from "langchain";

const testRouter = express.Router();

export const TransactionSchema = z.object({
	transaction_type: z
		.string()
		.describe(
			"Type of transaction such as outward transfer or inward transfer"
		),
	amount: z.number().describe("Transaction amount"),
	currency: z.string().describe("Currency used for the transaction, e.g. NGN"),
	transaction_direction: z
		.string()
		.describe("Indicates whether money was sent or received"),
	fees: z.number().describe("Transaction fee charged"),
	description: z.string().describe("Narration or purpose of the transaction"),
	category: z.string().describe("give this transaction a category"),
	sender_name: z.string().describe("Name of the sender"),
	receiver_name: z.string().describe("Name of the receiver"),
	receiver_bank: z
		.string()
		.describe("Bank or financial institution of the receiver"),
	receiver_account_number: z.string().describe("Receiver account number"),
	time_sent: z.string().describe("Date and time the transaction was sent"),
	status: z.string().describe("Current transaction status"),
	transaction_reference: z
		.string()
		.describe("Unique transaction reference identifier"),
	raw_input: z.string().describe("Original unprocessed transaction text"),
	summary: z.string().describe("A summary of the whole transaction"),
});

const ValidationResponseSchema = z.object({
	is_complete: z.boolean().describe("Whether all required information is present"),
	missing_fields: z.array(z.string()).describe("List of missing or unclear fields"),
	questions: z.array(z.string()).describe("Follow-up questions to ask the user"),
});

const validationPrompt = `You are a transaction data validator.

The input may be messy - it could contain markdown, image alt text, UI elements, or OCR output from bank app screenshots. Ignore the noise and extract the actual transaction data.

Required fields:
- amount: The transaction amount (NOT the fees)
- fees: Transaction fee (if ₦0.00 or free, it's present - will default to 30)
- transaction_type
- currency
- transaction_direction
- description
- sender_name
- receiver_name
- receiver_bank (use "N/A" if not applicable to this transaction type)
- receiver_account_number (phone numbers count for mobile services)
- time_sent
- status
- transaction_reference

Rules:
1. Parse the input thoroughly - data may be scattered or formatted unusually
2. Only mark a field as missing if it truly cannot be found anywhere in the text
3. The AMOUNT field is critical - if missing, ask for it
4. For fees: ₦0.00 or "free" means it's present, not missing

Return:
- is_complete: true only if amount and other essential fields are present
- missing_fields: only fields genuinely not found in the input
- questions: clear questions for each missing field`;

const extractionPrompt = `You are a professional accounting transaction analysis assistant.

Extract structured data from the transaction text. Follow these rules:

1. Extract all fields accurately from the provided text
2. For fees: if stated as ₦0.00 or free, use 30 as the value
3. Use ISO-8601 format for dates
4. Derive a meaningful category (e.g. Food, Transfer, Utilities, Data, Airtime, Shopping)
5. Preserve the original text in raw_input
6. Write a concise summary of the transaction
7. For data/airtime purchases: the user is the sender, the service (e.g. MTN NG DATA) is the receiver
8. If receiver_bank is not applicable (like for data purchases), use "N/A"
9. If receiver_account_number is a phone number, use that`;

testRouter.post("/message", async (req: Request, res: Response) => {
	const { input } = req.body;

	try {
		const model = await initChatModel("claude-3-5-sonnet-20241022", { temperature: 0 });


	
		const validationModel = model.withStructuredOutput(ValidationResponseSchema);
		const validationResponse = await validationModel.invoke([
			{ role: "system", content: validationPrompt },
			{ role: "user", content: input },
		]);

		if (!validationResponse.is_complete) {
			return res.json({
				complete: false,
				missing_fields: validationResponse.missing_fields,
				questions: validationResponse.questions,
			});
		}

		
		const extractionModel = model.withStructuredOutput(TransactionSchema);
		const transactionData = await extractionModel.invoke([
			{ role: "system", content: extractionPrompt },
			{ role: "user", content: input },
		]);

		res.json({
			complete: true,
			data: transactionData,
		});
	} catch (err: any) {
		res.status(400).send(err.message);
	}
});

export default testRouter;
