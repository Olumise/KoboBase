import z from "zod";

export const DecimalSchema = z.union([z.string(), z.number()]);

export const ReceiptSchema = z.object({
	userId: z.string(),
	fileUrl: z.string().max(500),
	fileType: z.string().max(10),
	fileSize: z.number().int().nullable(),
	rawOcrText: z.string().nullable(),
	ocrConfidence: DecimalSchema.nullable(),
	processingStatus: z.string().default("pending"),
	summary: z.string().nullable(),
});

export const AddReceiptSchema = z.object({
	userId: z.string(),
	fileUrl: z.string().max(500),
	fileType: z.string().max(10),
	fileSize: z.number().int().nullable(),
});

export const updateReceiptSchema = ReceiptSchema.partial();

export const UpdateReceiptFileSchema = z.object({
	fileUrl: z.string().max(500),
	fileType: z.string().max(10),
	fileSize: z.number().int().nullable(),
});

export type AddReceiptType = z.infer<typeof AddReceiptSchema>;
export type UpdateReceiptType = z.infer<typeof updateReceiptSchema>;
export type UpdateReceiptFileType = z.infer<typeof UpdateReceiptFileSchema>;
