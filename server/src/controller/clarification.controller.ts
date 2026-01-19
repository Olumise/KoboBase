import { NextFunction, Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import {
	createClarification,
	getClarificationSession,
	completeClarificationSession,
	getUserClarificationSessions,
	sendClarificationMessage,
} from "../services/clarification.service";
import { CreateClarificationSessionType } from "../schema/clarification";

export const createClarificationController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;
	const { receiptId, extractedData } = req.body;

	try {
		if (!receiptId) {
			throw new AppError(400, "Receipt ID is required", "createClarificationController");
		}

		const data: CreateClarificationSessionType = {
			receiptId,
			userId,
			extractedData,
		};

		const session = await createClarification(data);
		res.status(201).send(session);
	} catch (err) {
		next(err);
	}
};

export const getClarificationSessionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;
	const { sessionId } = req.params;

	try {
		if (!sessionId || typeof sessionId !== 'string') {
			throw new AppError(400, "Session ID is required", "getClarificationSessionController");
		}

		const session = await getClarificationSession(sessionId, userId);
		res.send(session);
	} catch (err) {
		next(err);
	}
};

export const completeClarificationSessionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;
	const { sessionId } = req.params;

	try {
		if (!sessionId || typeof sessionId !== 'string') {
			throw new AppError(400, "Session ID is required", "completeClarificationSessionController");
		}

		const session = await completeClarificationSession(sessionId, userId);
		res.send(session);
	} catch (err) {
		next(err);
	}
};

export const getUserClarificationSessionsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;
	const { receiptId } = req.query;

	try {
		const sessions = await getUserClarificationSessions(
			userId,
			receiptId as string | undefined
		);
		res.send(sessions);
	} catch (err) {
		next(err);
	}
};

export const sendClarificationMessageController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;
	const { sessionId } = req.params;
	const { message } = req.body;

	try {
		if (!sessionId || typeof sessionId !== 'string') {
			throw new AppError(400, "Session ID is required", "sendClarificationMessageController");
		}

		if (!message) {
			throw new AppError(400, "Message is required", "sendClarificationMessageController");
		}

		const result = await sendClarificationMessage(sessionId, userId, message);
		res.send(result);
	} catch (err) {
		next(err);
	}
};
