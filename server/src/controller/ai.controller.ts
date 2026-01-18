import { NextFunction, Request, Response } from "express";
import { getPDFInfo, googleImageOCR, parsePDFText } from "../services/ocr.service";
import { AppError } from "../middlewares/errorHandler";

export const extractImageController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const fileBuffer = req.file?.buffer;
	const mimeType = req.file?.mimetype;
	if (!fileBuffer || !mimeType) {
		throw new AppError(400, "No file uploaded!", "extractImageController");
	}
	try {
		const content = await googleImageOCR(fileBuffer, mimeType);
		res.send(content);
	} catch (err) {
		next(err);
	}
};

export const getPdfInfoController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const pdfBuffer = req.file?.buffer;
	if (!pdfBuffer) {
		throw new AppError(400, "No file uploaded!", "getPdfInfoController");
	}
	try {
		const info = await getPDFInfo(pdfBuffer);
        res.send(info)
	} catch (err) {
		next(err);
	}
};

export const parsePdfController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const pdfBuffer = req.file?.buffer;
	if (!pdfBuffer) {
		throw new AppError(400, "No file uploaded!", "parsePdfController");
	}
	try {
        const pdfInfo = await getPDFInfo(pdfBuffer);
        if (pdfInfo.total > 5){
            throw new AppError(400, 'Pdf exceeds 5 page limit!', 'parsePdfController')
        }
		const pdfTexts = await parsePDFText(pdfBuffer);
        res.send(pdfTexts.pages)
	} catch (err) {
		next(err);
	}
};
