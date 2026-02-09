import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { prisma } from "../lib/prisma";
import { ContactType } from "../constants/types";

const GetOrCreateContactSchema = z.object({
	contactName: z
		.string()
		.describe("The name of the contact to find or create"),
	contactType: z
		.enum(["person", "merchant", "bank", "platform", "wallet", "system"])
		.optional()
		.describe("The type of contact"),
	categoryId: z
		.string()
		.optional()
		.describe("Optional default category ID for this contact"),
});

export const getOrCreateContactTool = tool(
	async ({ contactName, contactType, categoryId }) => {
		try {
			const normalizedInput = contactName.toLowerCase().trim();

			const exactMatch = await prisma.contact.findFirst({
				where: {
					OR: [
						{
							name: {
								equals: contactName,
								mode: "insensitive",
							},
						},
						{
							normalizedName: {
								equals: normalizedInput,
								mode: "insensitive",
							},
						},
						{
							nameVariations: {
								has: contactName,
							},
						},
					],
				},
			});

			if (exactMatch) {
				const transactionCount = await prisma.transaction.count({
					where: { contactId: exactMatch.id },
				});

				const lastTransaction = await prisma.transaction.findFirst({
					where: { contactId: exactMatch.id },
					orderBy: { transactionDate: 'desc' },
					select: { transactionDate: true },
				});

				return JSON.stringify({
					id: exactMatch.id,
					name: exactMatch.name,
					normalizedName: exactMatch.normalizedName,
					contactType: exactMatch.ContactType,
					categoryId: exactMatch.categoryId,
					nameVariations: exactMatch.nameVariations,
					transactionCount,
					lastTransactionDate: lastTransaction?.transactionDate?.toISOString() || null,
					created: false,
					matchConfidence: 1.0,
					matchedVariation: null,
				});
			}

			const allContacts = await prisma.contact.findMany();

			let bestMatch = null;
			let bestScore = 0;

			for (const cont of allContacts) {
				const normalizedCont = cont.name.toLowerCase().trim();

				if (normalizedCont.includes(normalizedInput) || normalizedInput.includes(normalizedCont)) {
					const score = Math.min(
						normalizedInput.length / normalizedCont.length,
						normalizedCont.length / normalizedInput.length
					);

					if (score > bestScore && score > 0.6) {
						bestScore = score;
						bestMatch = cont;
					}
				}

				if (cont.nameVariations && cont.nameVariations.length > 0) {
					for (const variation of cont.nameVariations) {
						const normalizedVariation = variation.toLowerCase().trim();
						if (normalizedVariation.includes(normalizedInput) || normalizedInput.includes(normalizedVariation)) {
							const score = Math.min(
								normalizedInput.length / normalizedVariation.length,
								normalizedVariation.length / normalizedInput.length
							);

							if (score > bestScore && score > 0.6) {
								bestScore = score;
								bestMatch = cont;
							}
						}
					}
				}
			}

			if (bestMatch) {
				const transactionCount = await prisma.transaction.count({
					where: { contactId: bestMatch.id },
				});

				const lastTransaction = await prisma.transaction.findFirst({
					where: { contactId: bestMatch.id },
					orderBy: { transactionDate: 'desc' },
					select: { transactionDate: true },
				});

				return JSON.stringify({
					id: bestMatch.id,
					name: bestMatch.name,
					normalizedName: bestMatch.normalizedName,
					contactType: bestMatch.ContactType,
					categoryId: bestMatch.categoryId,
					nameVariations: bestMatch.nameVariations,
					transactionCount,
					lastTransactionDate: lastTransaction?.transactionDate?.toISOString() || null,
					created: false,
					matchConfidence: bestScore,
					matchedVariation: null,
				});
			}

			const newContact = await prisma.contact.create({
				data: {
					name: contactName,
					normalizedName: contactName.toLowerCase().trim(),
					ContactType: contactType || null,
					categoryId: categoryId || null,
					nameVariations: [],
				},
			});

			return JSON.stringify({
				id: newContact.id,
				name: newContact.name,
				normalizedName: newContact.normalizedName,
				contactType: newContact.ContactType,
				categoryId: newContact.categoryId,
				nameVariations: newContact.nameVariations,
				transactionCount: 0,
				lastTransactionDate: null,
				created: true,
				matchConfidence: 0,
				matchedVariation: null,
			});
		} catch (error) {
			return JSON.stringify({
				error: "Failed to get or create contact",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
	{
		name: "get_or_create_contact",
		description:
			"Find an existing contact by name using fuzzy matching and name variations, or create a new contact if no match is found. Automatically handles different name spellings and formats.",
		schema: GetOrCreateContactSchema,
	}
);
