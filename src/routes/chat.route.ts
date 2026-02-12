import express from 'express';
import { authVerify } from '../middlewares/authVerify';
import {
	createChatSessionController,
	getChatSessionController,
	getUserChatSessionsController,
	sendChatMessageController,
	completeChatSessionController,
	deleteChatSessionController,
} from '../controller/chat.controller';

const chatRouter = express.Router();

// Create a new chat session
chatRouter.post('/session', authVerify, createChatSessionController);

// Get all chat sessions for the user
chatRouter.get('/sessions', authVerify, getUserChatSessionsController);

// Get a specific chat session
chatRouter.get('/session/:sessionId', authVerify, getChatSessionController);

// Send a message in a chat session
chatRouter.post('/session/:sessionId/message', authVerify, sendChatMessageController);

// Complete a chat session
chatRouter.post('/session/:sessionId/complete', authVerify, completeChatSessionController);

// Delete a chat session
chatRouter.delete('/session/:sessionId', authVerify, deleteChatSessionController);

export default chatRouter;
