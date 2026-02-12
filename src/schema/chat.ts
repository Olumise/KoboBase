import z from 'zod';

export const createChatSessionSchema = z.object({
	// No required fields - userId comes from auth
});

export const sendChatMessageSchema = z.object({
	query: z
		.string()
		.min(1, 'Query cannot be empty')
		.max(1000, 'Query must be less than 1000 characters')
		.trim(),
});

export const getChatSessionSchema = z.object({
	sessionId: z.string().uuid('Invalid session ID'),
});

export const deleteChatSessionSchema = z.object({
	sessionId: z.string().uuid('Invalid session ID'),
});

// Type exports
export type CreateChatSessionType = z.infer<typeof createChatSessionSchema>;
export type SendChatMessageType = z.infer<typeof sendChatMessageSchema>;
export type GetChatSessionType = z.infer<typeof getChatSessionSchema>;
export type DeleteChatSessionType = z.infer<typeof deleteChatSessionSchema>;
