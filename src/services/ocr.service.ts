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

const SCANNED_PDF_THRESHOLD = 50;
const MAX_PDF_PAGES = 10;
const PDF_PARSE_TIMEOUT = 30000;

type PDFExtractionResult = {
	extracted: boolean;
	extracted_text: string | null;
	failure_reason: string | null;
	metadata?: {
		isScanned: boolean;
		pageCount: number;
		extractionMethod: 'native' | 'ocr' | 'hybrid';
	};
};

export const extractPDFText = async (
	pdfInput: Buffer | string,
	sessionId?: string
): Promise<PDFExtractionResult> => {
	const pdfBuffer = await resolveFileBuffer(pdfInput);

	const info = await getPDFInfo(pdfBuffer);
	const pageCount = info.total;

	if (pageCount > MAX_PDF_PAGES) {
		throw new AppError(
			400,
			`PDF has ${pageCount} pages. Maximum allowed is ${MAX_PDF_PAGES}. Please split the document.`,
			"extractPDFText"
		);
	}

	const parsePromise = parsePDFText(pdfBuffer);
	const timeoutPromise = new Promise<string>((_, reject) => {
		setTimeout(() => reject(new Error('PDF parsing timeout')), PDF_PARSE_TIMEOUT);
	});

	let nativeText: string;
	try {
		const result = await Promise.race([parsePromise, timeoutPromise]);
		nativeText = typeof result === 'string' ? result : result.text;
	} catch (error) {
		const ocrResult = await googleOCR(pdfBuffer, 'application/pdf', sessionId);
		return {
			extracted: ocrResult.extracted,
			extracted_text: ocrResult.extracted_text,
			failure_reason: ocrResult.failure_reason,
			metadata: {
				isScanned: true,
				pageCount,
				extractionMethod: 'ocr'
			}
		};
	}

	const textLength = nativeText.trim().length;
	const charsPerPage = textLength / pageCount;

	const isScanned = charsPerPage < SCANNED_PDF_THRESHOLD;

	if (isScanned || textLength < 20) {
		const ocrResult = await googleOCR(pdfBuffer, 'application/pdf', sessionId);
		return {
			extracted: ocrResult.extracted,
			extracted_text: ocrResult.extracted_text,
			failure_reason: ocrResult.failure_reason,
			metadata: {
				isScanned: true,
				pageCount,
				extractionMethod: isScanned ? 'ocr' : 'hybrid'
			}
		};
	}

	return {
		extracted: true,
		extracted_text: nativeText,
		failure_reason: null,
		metadata: {
			isScanned: false,
			pageCount,
			extractionMethod: 'native'
		}
	};
};