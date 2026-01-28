import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";
import {
	ExtractionResultSchema,
	OcrExtractionResultSchema,
} from "../schema/ai-formats";
import {
	AddReceiptSchema,
	AddReceiptType,
	ReceiptSchema,
	UpdateReceiptFileSchema,
	UpdateReceiptFileType,
	UpdateReceiptType,
} from "../schema/receipt";
import { googleOCR } from "./ocr.service";
import { detectDocumentType, determineProcessingMode } from "./documentDetection.service";

export const addReceipt = async (data: AddReceiptType) => {
	AddReceiptSchema.parse(data);
	const { userId, fileUrl, fileSize, fileType } = data;
	const newReceipt = await prisma.receipt.create({
		data: {
			userId,
			fileUrl,
			fileSize,
			fileType,
		},
	});

	return newReceipt;
};

export const extractReceiptRawText = async (receiptId: string) => {
	const presentDateTime = new Date().toISOString();
	if (!receiptId) {
		throw new AppError(400, "Receipt Id required!", "extractReceiptRawText");
	}
	const receipt = await prisma.receipt.findUnique({
		where: {
			id: receiptId,
		},
	});
	if (!receipt) {
		throw new AppError(400, "Receipt not found!", "extractReceiptRawText");
	}
	const text: ExtractionResultSchema = await googleOCR(
		receipt.fileUrl,
		receipt.fileType
	);

	if (!text.extracted) {
		const failureReason = text.failure_reason
			? text.failure_reason
			: `Error in AI extracting texts from transaction ${text}`;
		throw new AppError(500, failureReason, "extractReceiptRawText");
	}

	let detection = null;
	let processingMode = "single";

	try {
		const result = await detectDocumentType(
			text.extracted_text || "",
			receipt.userId,
			receiptId
		);
		detection = result.detection;
		processingMode = determineProcessingMode(detection);
	} catch (error) {
		console.error("Document detection failed, falling back to single mode:", error);
	}

	const receiptUpdate = await prisma.receipt.update({
		where: {
			id: receiptId,
		},
		data: {
			rawOcrText: text.extracted_text,
			processedAt: presentDateTime,
			processingStatus: "processed",
			documentType: detection?.document_type || "single_receipt",
			expectedTransactions: detection?.transaction_count || 1,
			detectionCompleted: detection !== null,
		},
	});

	if (detection && detection.transaction_count > 1) {
		await prisma.batchSession.create({
			data: {
				receiptId: receipt.id,
				userId: receipt.userId,
				totalExpected: detection.transaction_count,
				processingMode: processingMode,
				extractedData: {
					detection: detection,
					transactionPreview: detection.transaction_preview,
				},
				status: "in_progress",
			},
		});
	}

	return {
		receipt: receiptUpdate,
		detection: detection,
		processingMode: processingMode,
		isMultiTransaction: detection ? detection.transaction_count > 1 : false,
	};
};

export const updateReceiptFile = async (
	receiptId: string,
	userId: string,
	data: UpdateReceiptFileType
) => {
	UpdateReceiptFileSchema.parse(data);

	if (!receiptId) {
		throw new AppError(400, "Receipt Id required!", "updateReceiptFile");
	}

	const receipt = await prisma.receipt.findUnique({
		where: {
			id: receiptId,
		},
	});

	if (!receipt) {
		throw new AppError(404, "Receipt not found!", "updateReceiptFile");
	}

	if (receipt.userId !== userId) {
		throw new AppError(
			403,
			"You are not authorized to update this receipt!",
			"updateReceiptFile"
		);
	}

	if (receipt.processingStatus === "processed") {
		throw new AppError(
			400,
			"Cannot update file URL for a processed receipt!",
			"updateReceiptFile"
		);
	}

	const updatedReceipt = await prisma.receipt.update({
		where: {
			id: receiptId,
		},
		data: {
			fileUrl: data.fileUrl,
			fileType: data.fileType,
			fileSize: data.fileSize,
		},
	});

	return updatedReceipt;
};
