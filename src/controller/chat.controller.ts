import { NextFunction, Request, Response } from 'express';
import { AppError } from '../middlewares/errorHandler';
import {
	createChatSession,
	getChatSession,
	getUserChatSessions,
	sendChatMessage,
	completeChatSession,
	deleteChatSession,
} from '../services/chat.service';
import { sendChatMessageSchema } from '../schema/chat';


export const createChatSessionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;

	try {
		const session = await createChatSession(userId);
		res.status(201).json(session);
	} catch (err) {
		next(err);
	}
};


export const getChatSessionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;
	const { sessionId } = req.params;

	try {
		if (!sessionId || typeof sessionId !== 'string') {
			throw new AppError(
				400,
				'Session ID is required',
				'getChatSessionController'
			);
		}

		const session = await getChatSession(sessionId, userId);
		res.json(session);
	} catch (err) {
		next(err);
	}
};


export const getUserChatSessionsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;

	try {
		const sessions = await getUserChatSessions(userId);
		res.json(sessions);
	} catch (err) {
		next(err);
	}
};


export const sendChatMessageController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;
	const { sessionId } = req.params;

	try {
		if (!sessionId || typeof sessionId !== 'string') {
			throw new AppError(
				400,
				'Session ID is required',
				'sendChatMessageController'
			);
		}


		const { query } = sendChatMessageSchema.parse(req.body);

		const result = await sendChatMessage(sessionId, userId, query);
		res.json(result);
	} catch (err) {
		next(err);
	}
};


export const completeChatSessionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;
	const { sessionId } = req.params;

	try {
		if (!sessionId || typeof sessionId !== 'string') {
			throw new AppError(
				400,
				'Session ID is required',
				'completeChatSessionController'
			);
		}

		const session = await completeChatSession(sessionId, userId);
		res.json(session);
	} catch (err) {
		next(err);
	}
};


export const deleteChatSessionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const userId = req.user.id;
	const { sessionId } = req.params;

	try {
		if (!sessionId || typeof sessionId !== 'string') {
			throw new AppError(
				400,
				'Session ID is required',
				'deleteChatSessionController'
			);
		}

		const result = await deleteChatSession(sessionId, userId);
		res.json(result);
	} catch (err) {
		next(err);
	}
};
