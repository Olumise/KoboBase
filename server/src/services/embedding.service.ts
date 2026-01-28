import { OpenAIEmbeddings } from "@langchain/openai";
import { countTokensForText } from "../utils/tokenCounter";
import { trackLLMCall } from "./costTracking.service";

const embeddingModel = new OpenAIEmbeddings({
	model: "text-embedding-3-small",
	dimensions: 1536,
});

export const generateEmbedding = async (
	text: string,
	sessionId?: string
): Promise<number[]> => {
	try {
		const inputTokens = await countTokensForText(text);

		const embedding = await embeddingModel.embedQuery(text);

		if (sessionId) {
			await trackLLMCall(
				sessionId,
				"embedding",
				"openai",
				"text-embedding-3-small",
				inputTokens,
				0
			).catch((error) => {
				console.error("Failed to track embedding LLM call:", error);
			});
		}

		return embedding;
	} catch (error) {
		console.error("Error generating embedding:", error);
		throw new Error("Failed to generate embedding");
	}
};

export const generateEmbeddings = async (
	texts: string[],
	sessionId?: string
): Promise<number[][]> => {
	try {
		const tokenCounts = await Promise.all(
			texts.map((text) => countTokensForText(text))
		);
		const totalInputTokens = tokenCounts.reduce((sum, count) => sum + count, 0);

		const embeddings = await embeddingModel.embedDocuments(texts);

		if (sessionId) {
			await trackLLMCall(
				sessionId,
				"embedding",
				"openai",
				"text-embedding-3-small",
				totalInputTokens,
				0
			).catch((error) => {
				console.error("Failed to track embeddings LLM call:", error);
			});
		}

		return embeddings;
	} catch (error) {
		console.error("Error generating embeddings:", error);
		throw new Error("Failed to generate embeddings");
	}
};
