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
import { googleOCR, extractPDFText } from "./ocr.service";
import { detectDocumentType, determineProcessingMode } from "./documentDetection.service";
import { validateTransactionCount } from "./transactionLimits.service";
import { deleteFile } from "./upload";

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

	let text: ExtractionResultSchema;
	let extractionMetadata: any = {};

	if (receipt.fileType === 'application/pdf') {
		const pdfResult = await extractPDFText(receipt.fileUrl);
		if (!pdfResult.extracted) {
			throw new AppError(500, pdfResult.failure_reason || "PDF extraction failed", "extractReceiptRawText");
		}
		text = {
			extracted: pdfResult.extracted,
			extracted_text: pdfResult.extracted_text,
			failure_reason: pdfResult.failure_reason
		};
		if (pdfResult.metadata) {
			extractionMetadata = {
				isPDF: true,
				...pdfResult.metadata
			};
		}
	} else {
		text = await googleOCR(receipt.fileUrl, receipt.fileType);
		if (!text.extracted) {
			const failureReason = text.failure_reason
				? text.failure_reason
				: `Error in AI extracting texts from transaction ${text}`;
			throw new AppError(500, failureReason, "extractReceiptRawText");
		}
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

	if (detection) {
		// Check if transaction count is 0 (no valid transactions found)
		if (detection.transaction_count === 0) {
			const errorMessage = detection.notes || "No valid transactions found in this document. Please upload a document with clear transaction information.";
			await prisma.receipt.update({
				where: { id: receiptId },
				data: {
					processingStatus: "failed",
					extractionMetadata: {
						...extractionMetadata,
						error: errorMessage,
						documentType: detection.document_type,
						detectedCount: 0
					}
				}
			});

			throw new AppError(400, errorMessage, "extractReceiptRawText");
		}

		// Validate transaction count against limits
		if (detection.transaction_count) {
			const validation = validateTransactionCount(detection.transaction_count);

			if (!validation.valid) {
				const errorMessage = validation.error || "Transaction limit exceeded";
				await prisma.receipt.update({
					where: { id: receiptId },
					data: {
						processingStatus: "failed",
						extractionMetadata: {
							...extractionMetadata,
							error: errorMessage,
							detectedCount: detection.transaction_count,
							systemLimit: validation.limit
						}
					}
				});

				throw new AppError(400, errorMessage, "extractReceiptRawText");
			}
		}
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
			extractionMetadata: Object.keys(extractionMetadata).length > 0 ? extractionMetadata : undefined,
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

	// Delete the old file from S3 storage before updating
	try {
		await deleteFile(receipt.fileUrl);
	} catch (err) {
		console.error("Failed to delete old file from storage:", err);
		// Continue with update even if old file deletion fails
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

export const getUserReceipts = async (userId: string) => {
	if (!userId) {
		throw new AppError(400, "User ID is required!", "getUserReceipts");
	}

	const receipts = await prisma.receipt.findMany({
		where: {
			userId: userId,
		},
		include: {
			transactions: {
				include: {
					category: true,
					contact: true,
					userBankAccount: true,
					toBankAccount: true,
				},
				orderBy: {
					transactionDate: 'desc',
				},
			},
			batchSessions: {
				orderBy: {
					createdAt: 'desc',
				},
			},
		},
		orderBy: {
			uploadedAt: 'desc',
		},
	});

	return receipts;
};

export const getReceiptById = async (receiptId: string, userId: string) => {
	if (!receiptId) {
		throw new AppError(400, "Receipt ID is required!", "getReceiptById");
	}

	if (!userId) {
		throw new AppError(400, "User ID is required!", "getReceiptById");
	}

	const receipt = await prisma.receipt.findUnique({
		where: {
			id: receiptId,
		},
		include: {
			transactions: {
				include: {
					category: true,
					contact: true,
					userBankAccount: true,
					toBankAccount: true,
				},
				orderBy: {
					transactionDate: 'desc',
				},
			},
			batchSessions: {
				orderBy: {
					createdAt: 'desc',
				},
			},
		},
	});

	if (!receipt) {
		throw new AppError(404, "Receipt not found!", "getReceiptById");
	}

	if (receipt.userId !== userId) {
		throw new AppError(403, "Unauthorized access to this receipt!", "getReceiptById");
	}

	// Check if receipt has failed processing due to zero transactions
	if (receipt.processingStatus === "failed" && receipt.extractionMetadata) {
		const metadata = receipt.extractionMetadata as any;
		if (metadata.error && metadata.detectedCount === 0) {
			throw new AppError(400, metadata.error, "getReceiptById");
		}
	}

	return receipt;
};

export const deleteReceipt = async (receiptId: string, userId: string) => {
	if (!receiptId) {
		throw new AppError(400, "Receipt ID is required!", "deleteReceipt");
	}

	if (!userId) {
		throw new AppError(400, "User ID is required!", "deleteReceipt");
	}

	const receipt = await prisma.receipt.findUnique({
		where: {
			id: receiptId,
		},
		include: {
			transactions: true,
			batchSessions: true,
		},
	});

	if (!receipt) {
		throw new AppError(404, "Receipt not found!", "deleteReceipt");
	}

	if (receipt.userId !== userId) {
		throw new AppError(403, "Unauthorized access to this receipt!", "deleteReceipt");
	}

	// Delete the file from S3 storage first
	try {
		await deleteFile(receipt.fileUrl);
	} catch (err) {
		console.error("Failed to delete file from storage:", err);
		// Continue with database deletion even if file deletion fails
	}

	// Delete related records (cascade delete)
	// Delete transactions associated with this receipt
	if (receipt.transactions.length > 0) {
		await prisma.transaction.deleteMany({
			where: {
				receiptId: receiptId,
			},
		});
	}

	// Delete batch sessions associated with this receipt
	if (receipt.batchSessions.length > 0) {
		await prisma.batchSession.deleteMany({
			where: {
				receiptId: receiptId,
			},
		});
	}

	// Delete the receipt
	await prisma.receipt.delete({
		where: {
			id: receiptId,
		},
	});

	return {
		success: true,
		message: "Receipt deleted successfully",
		deletedReceiptId: receiptId,
	};
};
