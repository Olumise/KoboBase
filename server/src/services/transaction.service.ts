import { ChatOpenAI } from "@langchain/openai";
import { TransactionReceiptAiResponseSchema } from "../schema/ai-formats";
import { RECEIPT_TRANSACTION_SYSTEM_PROMPT } from "../lib/prompts";

const OpenAIllm = new ChatOpenAI({
	model: "gpt-4o",
	temperature: 0,
});

export const generateTransaction = async (input: string, clarificationId:string) => {
	const transactionllm = OpenAIllm.withStructuredOutput(
		TransactionReceiptAiResponseSchema,
		{ name: "extract_transaction", strict: true }
	);
	const aiMsg = await transactionllm.invoke([
		{
			role: "system",
			content: RECEIPT_TRANSACTION_SYSTEM_PROMPT,
		},
		{
			role: "user",
			content: input,
		},
	]);
	return aiMsg;
};
