import express from "express";
import {
	generateTransactionController,
	initiateTransactionController,
	getUserTransactionsController,
	getTransactionByIdController,
	createTransactionController,
	updateTransactionController,
	deleteTransactionController,
	getTransactionStatsController,
	extractBatchTransactionsController,
	getBatchExtractionStatusController,
	approveBatchTransactionsController,
	rejectBatchSessionController,
	initiateSequentialProcessingController,
	getCurrentSequentialTransactionController,
	approveSequentialTransactionController,
	skipSequentialTransactionController,
	completeSequentialSessionController,
} from "../controller/transaction.controller";
import { authVerify } from "../middlewares/authVerify";
import { rateLimitMiddleware } from "../middlewares/rateLimit";

const transactionRouter = express();

transactionRouter.post("/generate", generateTransactionController);
transactionRouter.post("/initiate", authVerify, initiateTransactionController);
transactionRouter.post("/batch/initiate/:receiptId", authVerify, rateLimitMiddleware('transaction.batch.initiate'), extractBatchTransactionsController);
transactionRouter.post("/batch/extract/:receiptId", authVerify, extractBatchTransactionsController);
transactionRouter.get("/batch/status/:receiptId", authVerify, getBatchExtractionStatusController);
transactionRouter.post("/batch/approve", authVerify, approveBatchTransactionsController);
transactionRouter.post("/batch/reject/:batchSessionId", authVerify, rejectBatchSessionController);
transactionRouter.post("/sequential/initiate/:receiptId", authVerify, rateLimitMiddleware('transaction.sequential.initiate'), initiateSequentialProcessingController);
transactionRouter.get("/sequential/current/:batchSessionId", authVerify, getCurrentSequentialTransactionController);
transactionRouter.post("/sequential/approve-and-next", authVerify, approveSequentialTransactionController);
transactionRouter.post("/sequential/skip/:batchSessionId", authVerify, skipSequentialTransactionController);
transactionRouter.post("/sequential/complete/:batchSessionId", authVerify, completeSequentialSessionController);
transactionRouter.get("/", authVerify, getUserTransactionsController);
transactionRouter.get("/stats", authVerify, getTransactionStatsController);
transactionRouter.get("/:transactionId", authVerify, getTransactionByIdController);
transactionRouter.post("/", authVerify, createTransactionController);
transactionRouter.put("/:transactionId", authVerify, updateTransactionController);
transactionRouter.delete("/:transactionId", authVerify, deleteTransactionController);

export default transactionRouter;