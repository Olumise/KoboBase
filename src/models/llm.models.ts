import { ChatOpenAI } from "@langchain/openai";

export const OpenAIllm = new ChatOpenAI({
	model: "gpt-4o",
	temperature: 0,
});

export const OpenAIllmGPT4Turbo = new ChatOpenAI({
	model: "gpt-4.1",
	temperature: 0,
});

export const OpenAIllmCreative = new ChatOpenAI({
	model: "gpt-4o",
	temperature: 0.5,
});

export const OpenAIllmMini = new ChatOpenAI({
	model: "gpt-4o-mini",
	temperature: 0,
});

// Helper to add cache control to system messages for prompt caching
export const addCacheControl = (message: any) => {
	if (message.role === "system") {
		return {
			...message,
			additional_kwargs: {
				cache_control: { type: "ephemeral" }
			}
		};
	}
	return message;
};
