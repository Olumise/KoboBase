import { NextFunction, Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import { initiateSequentialProcessing } from "../services/sequentialExtraction.service";
import { ProgressUpdate } from "../types/progress.types";

export const initiateSequentialProcessingWithProgressController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user?.id;
	const receiptId = req.params.receiptId as string;
	const { userBankAccountId } = req.body;

	if (!userId) {
		throw new AppError(401, "Unauthorized!", "initiateSequentialProcessingWithProgressController");
	}

	if (!receiptId || typeof receiptId !== 'string') {
		throw new AppError(400, "Receipt ID is required", "initiateSequentialProcessingWithProgressController");
	}

	if (!userBankAccountId) {
		throw new AppError(400, "Bank Account ID is required", "initiateSequentialProcessingWithProgressController");
	}

	try {
		// Set headers for Server-Sent Events
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

		// Send initial connection message
		res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Stream connected' })}\n\n`);

		// Progress callback function
		const progressCallback = (update: ProgressUpdate) => {
			const progressData = {
				type: 'progress',
				step: update.step,
				message: update.message,
				progress: update.progress,
				timestamp: update.timestamp,
				metadata: update.metadata,
			};
			res.write(`data: ${JSON.stringify(progressData)}\n\n`);
		};

		// Execute the sequential processing with progress updates
		const result = await initiateSequentialProcessing(
			receiptId,
			userId,
			userBankAccountId,
			progressCallback
		);

		// Send final result
		res.write(`data: ${JSON.stringify({
			type: 'complete',
			message: 'Sequential processing initiated successfully',
			data: result
		})}\n\n`);

		// Close the connection
		res.end();
	} catch (err) {
		// Send error event
		const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
		res.write(`data: ${JSON.stringify({
			type: 'error',
			message: errorMessage
		})}\n\n`);
		res.end();
	}
};
