import { NextFunction, Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import { addReceipt, extractReceiptRawText, updateReceiptFile, getUserReceipts, getReceiptById, deleteReceipt } from "../services/receipt.service";
import { AddReceiptType, UpdateReceiptFileType } from "../schema/receipt";
import { uploadFile } from "../services/upload";
import { prisma } from "../lib/prisma";

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
		const image = await uploadFile(file, file.mimetype, "kobo-base", userId);
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

		const image = await uploadFile(file, file.mimetype, "kobo-base", userId);

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

export const getBatchSessionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const { receiptId } = req.params;
	const userId = req.user.id;

	try {
		if (!receiptId || typeof receiptId !== 'string') {
			throw new AppError(400, "Receipt ID is required", "getBatchSessionController");
		}

		const receipt = await prisma.receipt.findUnique({
			where: { id: receiptId },
			select: { userId: true }
		});

		if (!receipt) {
			throw new AppError(404, "Receipt not found", "getBatchSessionController");
		}

		if (receipt.userId !== userId) {
			throw new AppError(403, "Unauthorized access to receipt", "getBatchSessionController");
		}

		const batchSession = await prisma.batchSession.findFirst({
			where: {
				receiptId: receiptId,
				userId: userId,
			},
			orderBy: {
				createdAt: 'desc'
			}
		});

		if (!batchSession) {
			res.send({
				hasBatchSession: false,
				message: "This receipt does not have a batch processing session"
			});
			return;
		}

		res.send({
			hasBatchSession: true,
			batchSession: batchSession
		});
	} catch (err) {
		next(err);
	}
};

export const getUserReceiptsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;

	try {
		const receipts = await getUserReceipts(userId);
		res.send({
			success: true,
			count: receipts.length,
			receipts: receipts
		});
	} catch (err) {
		next(err);
	}
};

export const getReceiptByIdController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const { receiptId } = req.params;
	const userId = req.user.id;

	try {
		if (!receiptId || typeof receiptId !== 'string') {
			throw new AppError(400, "Receipt ID is required", "getReceiptByIdController");
		}

		const receipt = await getReceiptById(receiptId, userId);
		res.send({
			success: true,
			receipt: receipt
		});
	} catch (err) {
		next(err);
	}
};

export const deleteReceiptController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const { receiptId } = req.params;
	const userId = req.user.id;

	try {
		if (!receiptId || typeof receiptId !== 'string') {
			throw new AppError(400, "Receipt ID is required", "deleteReceiptController");
		}

		const result = await deleteReceipt(receiptId, userId);
		res.send(result);
	} catch (err) {
		next(err);
	}
};
