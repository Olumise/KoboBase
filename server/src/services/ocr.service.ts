import { GoogleGenAI } from "@google/genai";
import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

export const googleImageOCR = async (fileBuffer: Buffer, mimeType: string) => {
	const base64ImageFile = fileBuffer.toString("base64");
	const contents = [
		{
			inlineData: {
				mimeType: mimeType,
				data: base64ImageFile,
			},
		},
		{
			text: "Extract all the texts from this image and return in json format, if the image does not have text, return a text informing the user that there is no extractable text in the image",
		},
	];
	const response = await ai.models.generateContent({
		model: "gemini-3-flash-preview",
		contents: contents,
	});
	return response.text;
};

export const googlePdfOCR = async (fileBuffer: Buffer, mimeType: string) => {
	const base64ImageFile = fileBuffer.toString("base64");
	const contents = [
		{
			inlineData: {
				mimeType: mimeType,
				data: base64ImageFile,
			},
		},
		{
			text: "Extract all the texts from this pdf and return in a markdown format, ignore any image in the pdf, just focus on the file",
		},
	];
	const response = await ai.models.generateContent({
		model: "gemini-3-flash-preview",
		contents: contents,
	});
	return response.text;
};

export const getPDFInfo = async (pdfBuffer: Buffer) => {
	const parser = new PDFParse({ data: pdfBuffer });
	const result = await parser.getInfo({ parsePageInfo: true });
	await parser.destroy();
	return result
};

export const parsePDFText = async(pdfBuffer: Buffer) => {
	const parser = new PDFParse({ data: pdfBuffer });
	const result = await parser.getText();
	await parser.destroy();
	return result
}