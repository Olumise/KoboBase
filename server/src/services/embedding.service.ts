import { OpenAIEmbeddings } from "@langchain/openai";

const embeddingModel = new OpenAIEmbeddings({
	model: "text-embedding-3-small",
	dimensions: 1536,
});

export const generateEmbedding = async (text: string): Promise<number[]> => {
	try {
		const embedding = await embeddingModel.embedQuery(text);
		return embedding;
	} catch (error) {
		console.error("Error generating embedding:", error);
		throw new Error("Failed to generate embedding");
	}
};

export const generateEmbeddings = async (
	texts: string[]
): Promise<number[][]> => {
	try {
		const embeddings = await embeddingModel.embedDocuments(texts);
		return embeddings;
	} catch (error) {
		console.error("Error generating embeddings:", error);
		throw new Error("Failed to generate embeddings");
	}
};
