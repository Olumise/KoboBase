import { GoogleGenAI } from "@google/genai";
import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import { OCR_TRANSACTION_EXTRACTION_PROMPT } from "../lib/prompts";
import { AppError } from "../middlewares/errorHandler";
import { countTokensForText } from "../utils/tokenCounter";
import { trackLLMCall } from "./costTracking.service";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

const downloadFile = async (url: string): Promise<Buffer> => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download file from ${url}: ${response.statusText}`);
	}
	const arrayBuffer = await response.arrayBuffer();
	return Buffer.from(arrayBuffer);
};

const resolveFileBuffer = async (input: Buffer | string): Promise<Buffer> => {
	if (Buffer.isBuffer(input)) {
		return input;
	}
	return downloadFile(input);
};

export const googleOCR = async (
	fileInput: Buffer | string,
	mimeType: string,
	sessionId?: string
) => {
	const fileBuffer = await resolveFileBuffer(fileInput);
	const base64ImageFile = fileBuffer.toString("base64");
	const contents = [
		{
			inlineData: {
				mimeType: mimeType,
				data: base64ImageFile,
			},
		},
		{
			text: OCR_TRANSACTION_EXTRACTION_PROMPT,
		},
	];

	const promptTokens = await countTokensForText(OCR_TRANSACTION_EXTRACTION_PROMPT);
	const imageTokens = 85;
	const inputTokens = promptTokens + imageTokens;

	const response = await ai.models.generateContent({
		model: "gemini-3-flash-preview",
		contents: contents,
		config: {
			responseMimeType: "application/json",
		},
	});
	const responseText = response.text;
	if (!responseText) {
		throw new AppError(500, "No response from AI model", "googleOCR");
	}

	const outputTokens = await countTokensForText(responseText);

	if (sessionId) {
		await trackLLMCall(
			sessionId,
			"ocr",
			"google",
			"gemini-3-flash-preview",
			inputTokens,
			outputTokens
		).catch((error) => {
			console.error("Failed to track OCR LLM call:", error);
		});
	}

	try {
		return JSON.parse(responseText);
	} catch (parseError) {
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[0]);
		}
		throw new AppError(
			500,
			`Failed to parse AI response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
			"googleOCR"
		);
	}
};


export const getPDFInfo = async (pdfInput: Buffer | string) => {
	const pdfBuffer = await resolveFileBuffer(pdfInput);
	const parser = new PDFParse({ data: pdfBuffer });
	const result = await parser.getInfo({ parsePageInfo: true });
	await parser.destroy();
	return result
};

export const parsePDFText = async(pdfInput: Buffer | string) => {
	const pdfBuffer = await resolveFileBuffer(pdfInput);
	const parser = new PDFParse({ data: pdfBuffer });
	const result = await parser.getText();
	await parser.destroy();
	return result
}