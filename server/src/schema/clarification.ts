import z from "zod";

export const ClarificationSessionSchema = z.object({
	receiptId: z.string(),
	transactionId: z.string().nullable(),
	userId: z.string(),
	status: z.string().default("active"),
	extractedData: z.unknown().nullable(),
});

export const createClarificationSessionSchema = z.object({
	receiptId: z.string(),
	userId: z.string(),
	extractedData: z.string().optional(),
});

export const ClarificationMessageSchema = z.object({
	role: z.string().max(10),
	content: z.string(),
});

export type CreateClarificationSessionType = z.infer<
	typeof createClarificationSessionSchema
>;

export type ClarificationMessageType = z.infer<typeof ClarificationMessageSchema>
