import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/errorHandler';
import { generateEmbedding } from './embedding.service';
import {
	searchSimilarTransactions,
	formatTransactionsForPrompt,
} from './vectorSearch.service';
import { OpenAIllm, OpenAIllmMini } from '../models/llm.models';
import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import {
	countTokensForMessages,
	extractTokenUsageFromResponse,
	estimateOutputTokens,
} from '../utils/tokenCounter';
import {
	initializeSession,
	trackLLMCall,
	finalizeSession,
} from './costTracking.service';

/**
 * Create a new chat session
 */
export const createChatSession = async (userId: string) => {
	try {
		// Verify user exists
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, name: true },
		});

		if (!user) {
			throw new AppError(404, 'User not found', 'createChatSession');
		}

		const session = await prisma.chatSession.create({
			data: {
				userId,
				status: 'active',
			},
			include: {
				messages: {
					orderBy: { createdAt: 'asc' },
				},
			},
		});

		return session;
	} catch (error) {
		console.error('Error creating chat session:', error);
		if (error instanceof AppError) throw error;
		throw new AppError(500, 'Failed to create chat session', 'createChatSession');
	}
};

/**
 * Get a chat session with messages
 */
export const getChatSession = async (sessionId: string, userId: string) => {
	try {
		const session = await prisma.chatSession.findUnique({
			where: { id: sessionId },
			include: {
				messages: {
					orderBy: { createdAt: 'asc' },
				},
			},
		});

		if (!session) {
			throw new AppError(404, 'Chat session not found', 'getChatSession');
		}

		if (session.userId !== userId) {
			throw new AppError(
				403,
				'You are not authorized to view this chat session',
				'getChatSession'
			);
		}

		return session;
	} catch (error) {
		console.error('Error getting chat session:', error);
		if (error instanceof AppError) throw error;
		throw new AppError(500, 'Failed to get chat session', 'getChatSession');
	}
};

/**
 * Get all chat sessions for a user
 */
export const getUserChatSessions = async (userId: string) => {
	try {
		const sessions = await prisma.chatSession.findMany({
			where: { userId },
			include: {
				messages: {
					orderBy: { createdAt: 'asc' },
					take: 1, // Only include first message for preview
				},
			},
			orderBy: { createdAt: 'desc' },
		});

		return sessions;
	} catch (error) {
		console.error('Error getting user chat sessions:', error);
		throw new AppError(
			500,
			'Failed to get chat sessions',
			'getUserChatSessions'
		);
	}
};

/**
 * Query types for transaction chat
 */
type QueryType = 'greeting' | 'followup' | 'aggregation' | 'specific';

interface QueryClassification {
	type: QueryType;
	confidence: number;
	reasoning?: string;
}

/**
 * Use LLM to classify the user's query intent
 */
const classifyQuery = async (
	query: string,
	hasConversationHistory: boolean
): Promise<QueryClassification> => {
	try {
		const classificationPrompt = `You are a query classifier for a financial transaction chat assistant. Classify the user's query into ONE of these categories:

1. "greeting" - Greetings, small talk, thanks, goodbyes (e.g., "hi", "thanks", "how are you")
2. "followup" - References previous conversation context (e.g., "show me that transaction", "give me the details", "tell me more")
3. "aggregation" - Wants totals/summaries across ALL transactions (e.g., "total spent", "how much in total", "all my expenses")
4. "specific" - Looking for specific transactions by category, merchant, or topic (e.g., "groceries", "water expenses", "uber rides")

IMPORTANT DISTINCTIONS:
- "what about water, how much" → "specific" (asking about water specifically, NOT all transactions)
- "how much have i spent in total" → "aggregation" (wants everything)
- "total spent on groceries" → "specific" (total for a specific category)
- "give me the transaction" → "followup" (referencing previous message)

User Query: "${query}"
Has Previous Messages: ${hasConversationHistory}

Respond with ONLY a JSON object in this exact format (no markdown, no code blocks):
{"type": "greeting|followup|aggregation|specific", "confidence": 0.0-1.0}`;

		const response = await OpenAIllmMini.invoke([
			new SystemMessage({ content: classificationPrompt }),
		]);

		const responseText =
			typeof response.content === 'string'
				? response.content.trim()
				: JSON.stringify(response.content);

		// Parse the JSON response
		const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
		const classification = JSON.parse(cleaned) as QueryClassification;

		return classification;
	} catch (error) {
		console.error('Error classifying query:', error);
		// Fallback to simple keyword-based classification
		const lowerQuery = query.toLowerCase().trim();

		if (lowerQuery.length < 5 || ['hi', 'hello', 'hey', 'thanks', 'bye'].includes(lowerQuery)) {
			return { type: 'greeting', confidence: 0.9 };
		}

		if (lowerQuery.includes('total') && !lowerQuery.match(/water|food|grocery|transport|uber/i)) {
			return { type: 'aggregation', confidence: 0.7 };
		}

		return { type: 'specific', confidence: 0.6 };
	}
};

/**
 * Build system prompt for transaction chat
 */
const buildChatSystemPrompt = (
	userName: string,
	defaultCurrency: string
): string => {
	return `You are a helpful financial assistant analyzing transaction data for ${userName}.

Your role is to:
- Answer questions about transactions clearly and concisely
- Provide insights based on the retrieved transaction data
- Use specific numbers, dates, and merchant names from the data
- Summarize patterns when multiple transactions are relevant
- Be conversational yet professional

User's default currency: ${defaultCurrency}

Instructions:
1. Base your answer ONLY on the retrieved transactions provided below
2. If no relevant transactions are found for the query, respond with ONLY this exact text: "NO_TRANSACTIONS_FOUND: [your explanation message]"
3. If relevant transactions ARE found, provide a normal response with specific details: amounts, dates, merchant names, categories
4. For spending analysis, provide totals and breakdowns
5. For pattern questions, identify trends and provide examples
6. Keep responses concise but insightful (2-4 sentences for simple queries, more for complex analysis)
7. Use natural language - avoid being overly technical
8. If the query is ambiguous, provide the most helpful interpretation

Format guidelines:
- Use bullet points for lists
- Format amounts with currency symbols
- Use relative dates when helpful (e.g., "last week" along with specific date)
- Highlight key insights

IMPORTANT: Start your response with "NO_TRANSACTIONS_FOUND:" if none of the retrieved transactions are actually relevant to the user's query.`;
};


export const sendChatMessage = async (
	sessionId: string,
	userId: string,
	query: string
) => {
	try {

		const session = await getChatSession(sessionId, userId);

		if (session.status !== 'active') {
			throw new AppError(
				400,
				'Cannot send messages to a completed session',
				'sendChatMessage'
			);
		}


		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, name: true, defaultCurrency: true },
		});

		if (!user) {
			throw new AppError(404, 'User not found', 'sendChatMessage');
		}


		let llmUsageSessionId: string | undefined;
		try {
			llmUsageSessionId = await initializeSession(userId, 'chat', sessionId, {
				processingMode: 'chat',
			});
		} catch (trackingError) {
			console.error('Failed to initialize LLM session:', trackingError);
		}

		// Use LLM to classify the query intent
		const classification = await classifyQuery(query, session.messages.length > 0);

		// Log classification for debugging
		console.log(`[Query Classification] Query: "${query}" → Type: ${classification.type}, Confidence: ${classification.confidence}`);

		let similarTransactions: any[] = [];
		let transactionsContext = 'No transaction data needed for this query.';
		let queryEmbedding: number[] | null = null;

		// Handle query based on classification
		if (classification.type === 'greeting') {

			transactionsContext = 'This is a greeting or casual conversation. No transaction data needed.';
		} else if (classification.type === 'followup') {

			const lastMessage = session.messages[session.messages.length - 1];
			if (lastMessage?.retrievedTransactions && Array.isArray(lastMessage.retrievedTransactions)) {
				similarTransactions = lastMessage.retrievedTransactions as any;
				transactionsContext = formatTransactionsForPrompt(similarTransactions);
			} else {
				transactionsContext = 'No transactions were retrieved in the previous message.';
			}
		} else if (classification.type === 'aggregation') {
			// For aggregation queries, fetch ALL transactions (not just similar ones)
			const allTransactions = await prisma.transaction.findMany({
				where: { userId },
				include: {
					contact: { select: { name: true } },
					category: { select: { name: true } },
				},
				orderBy: { transactionDate: 'desc' },
				take: 100, // Limit to recent 100 transactions for performance
			});

			// Transform to match expected format
			similarTransactions = allTransactions.map((t) => ({
				id: t.id,
				userId: t.userId,
				amount: t.amount.toString(),
				currency: t.currency,
				transactionType: t.transactionType,
				transactionDate: t.transactionDate,
				description: t.description,
				summary: t.summary,
				paymentMethod: t.paymentMethod,
				contactName: t.contact?.name || null,
				categoryName: t.category?.name || null,
				similarity: 1.0, // Not using similarity for aggregation
			}));

			transactionsContext = formatTransactionsForPrompt(similarTransactions);
		} else {
			// For specific queries, use vector search
			queryEmbedding = await generateEmbedding(query, llmUsageSessionId);

			similarTransactions = await searchSimilarTransactions({
				userId,
				queryEmbedding,
				limit: 10,
				threshold: 0.3,
			});

			transactionsContext = formatTransactionsForPrompt(similarTransactions);
		}

		const systemPrompt = buildChatSystemPrompt(
			user.name,
			user.defaultCurrency
		);

		// Build conversation history from previous messages
		const messages: BaseMessage[] = [
			new SystemMessage({
				content: systemPrompt,
				additional_kwargs: {
					cache_control: { type: 'ephemeral' },
				},
			}),
		];

		// Add previous conversation history (without transaction details to save tokens)
		for (const msg of session.messages) {
			messages.push(
				new HumanMessage({
					content: msg.query,
				})
			);
			messages.push(
				new AIMessage({
					content: msg.response,
				})
			);
		}

		// Add the current query with transaction context
		messages.push(
			new HumanMessage({
				content: `User Query: ${query}

Retrieved Transactions:
${transactionsContext}

Please provide a helpful answer based on these transactions.`,
			})
		);


		const inputTokens = await countTokensForMessages(messages);


		const aiResponse = await OpenAIllm.invoke(messages);


		const responseText =
			typeof aiResponse.content === 'string'
				? aiResponse.content
				: JSON.stringify(aiResponse.content);

		const tokenUsage = extractTokenUsageFromResponse(aiResponse);
		const outputTokens =
			tokenUsage?.outputTokens || estimateOutputTokens(aiResponse);

		// Track LLM call
		if (llmUsageSessionId) {
			try {
				await trackLLMCall(
					llmUsageSessionId,
					'chat',
					'openai',
					'gpt-4o',
					inputTokens,
					outputTokens
				);
			} catch (trackingError) {
				console.error('Failed to track chat LLM call:', trackingError);
			}
		}

		// Check if LLM found the transactions relevant
		const noTransactionsFound = responseText.startsWith('NO_TRANSACTIONS_FOUND:');
		const finalResponse = noTransactionsFound
			? responseText.replace('NO_TRANSACTIONS_FOUND:', '').trim()
			: responseText;

		// Only include transactions if they were actually used by the LLM
		const relevantTransactions = noTransactionsFound ? [] : similarTransactions;

		const chatMessage = await prisma.chatMessage.create({
			data: {
				sessionId,
				query,
				response: finalResponse,
				transactionsFound: relevantTransactions.length,
				retrievedTransactions: relevantTransactions as any,
			},
		});

		if (queryEmbedding !== null) {
			const embeddingString = `[${queryEmbedding.join(',')}]`;
			await prisma.$executeRaw`
				UPDATE chat_messages
				SET query_embedding = ${embeddingString}::vector
				WHERE id = ${chatMessage.id}
			`;
		}

		// Update session title if first message
		if (session.messages.length === 0) {
			const title = query.substring(0, 97) + (query.length > 97 ? '...' : '');
			await prisma.chatSession.update({
				where: { id: sessionId },
				data: { title },
			});
		}

		return {
			message: chatMessage,
			response: finalResponse,
			transactionsFound: relevantTransactions.length,
			transactions: relevantTransactions,
		};
	} catch (error) {
		console.error('Error sending chat message:', error);
		if (error instanceof AppError) throw error;
		throw new AppError(500, 'Failed to send chat message', 'sendChatMessage');
	}
};

/**
 * Complete a chat session
 */
export const completeChatSession = async (
	sessionId: string,
	userId: string
) => {
	try {
		const session = await getChatSession(sessionId, userId);

		if (session.status === 'completed') {
			throw new AppError(
				400,
				'Chat session is already completed',
				'completeChatSession'
			);
		}

		const updatedSession = await prisma.chatSession.update({
			where: { id: sessionId },
			data: { status: 'completed' },
			include: {
				messages: {
					orderBy: { createdAt: 'asc' },
				},
			},
		});

		// Finalize LLM usage session
		try {
			await finalizeSession(sessionId);
		} catch (trackingError) {
			console.error('Failed to finalize chat session:', trackingError);
		}

		return updatedSession;
	} catch (error) {
		console.error('Error completing chat session:', error);
		if (error instanceof AppError) throw error;
		throw new AppError(
			500,
			'Failed to complete chat session',
			'completeChatSession'
		);
	}
};

/**
 * Delete a chat session
 */
export const deleteChatSession = async (sessionId: string, userId: string) => {
	try {
		const session = await getChatSession(sessionId, userId);

		await prisma.chatSession.delete({
			where: { id: sessionId },
		});

		return { success: true, message: 'Chat session deleted successfully' };
	} catch (error) {
		console.error('Error deleting chat session:', error);
		if (error instanceof AppError) throw error;
		throw new AppError(
			500,
			'Failed to delete chat session',
			'deleteChatSession'
		);
	}
};
