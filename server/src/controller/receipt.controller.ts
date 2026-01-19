import { NextFunction, Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import { addReceipt, extractReceiptRawText, updateReceiptFile } from "../services/receipt.service";
import { AddReceiptType, UpdateReceiptFileType } from "../schema/receipt";
import { uploadFile } from "../services/upload";

export const addReceiptController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const file = req.file;
	const userId = req.user.id;

	try {
		if (!file) {
			throw new AppError(400, "No file uploaded", "addReceiptController");
		}
		const image = await uploadFile(file, file.mimetype, "kobo-base");
		const data:AddReceiptType = {
			userId,
			fileSize: file?.size,
			fileType: file.mimetype,
			fileUrl: image.url,
		};
        const receipt = await addReceipt(data)
        res.send(receipt)
	} catch (err) {
		next(err);
	}
};

export const extractReceiptController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const { receiptId } = req.params;

	try {
		if (!receiptId || typeof receiptId !== 'string') {
			throw new AppError(400, "Receipt ID is required", "extractReceiptController");
		}
		const receipt = await extractReceiptRawText(receiptId);
		res.send(receipt);
	} catch (err) {
		next(err);
	}
};

export const updateReceiptFileController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const { receiptId } = req.params;
	const userId = req.user.id;
	const file = req.file;

	try {
		if (!receiptId || typeof receiptId !== 'string') {
			throw new AppError(400, "Receipt ID is required", "updateReceiptFileController");
		}

		if (!file) {
			throw new AppError(400, "No file uploaded", "updateReceiptFileController");
		}

		const image = await uploadFile(file, file.mimetype, "kobo-base");

		const data: UpdateReceiptFileType = {
			fileUrl: image.url,
			fileType: file.mimetype,
			fileSize: file.size,
		};

		const updatedReceipt = await updateReceiptFile(receiptId, userId, data);
		res.send(updatedReceipt);
	} catch (err) {
		next(err);
	}
};
