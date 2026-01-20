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
