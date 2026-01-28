import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { prisma } from "../lib/prisma";

const GetCategorySchema = z.object({
	transactionDescription: z
		.string()
		.describe("The description and summary of the transaction to match against existing categories"),
	userId: z.string().describe("The ID of the user"),
});

export const getCategoryTool = tool(
	async ({ transactionDescription, userId }) => {
		try {
			const allCategories = await prisma.category.findMany({
				where: {
					OR: [
						{ isSystemCategory: true, isActive: true },
						{ userId: userId, isActive: true },
					],
				},
				select: {
					id: true,
					name: true,
					icon: true,
					color: true,
					isSystemCategory: true,
				},
				orderBy: {
					isSystemCategory: "desc",
				},
			});

			if (allCategories.length === 0) {
				return JSON.stringify({
					success: true,
					message: "No categories found in database",
					transactionDescription: transactionDescription,
					categories: [],
				});
			}

			return JSON.stringify({
				success: true,
				message: "Retrieved all categories. Analyze the transaction description and determine which category best matches, or return null if none match.",
				transactionDescription: transactionDescription,
				categories: allCategories,
			});
		} catch (error) {
			return JSON.stringify({
				success: false,
				error: "Failed to get categories",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
	{
		name: "get_category",
		description:
			"Retrieves all available categories from the database for the user. The LLM should analyze the transaction description against all returned categories and determine which category (if any) best matches the transaction. Returns the transaction description and full list of categories for analysis.",
		schema: GetCategorySchema,
	}
);

