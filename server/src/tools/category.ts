import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { prisma } from "../lib/prisma";

const CATEGORY_COLORS = [
	"#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
	"#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#52B788"
];

const CATEGORY_EMOJIS = [
	"🛒", "🍽️", "🚗", "🏠", "💼",
	"❤️", "🎁", "✈️", "☕", "📚"
];

function generateDefaultStyle(categoryName: string): { icon: string; color: string } {
	const hash = categoryName.split('').reduce((acc, char) => {
		return char.charCodeAt(0) + ((acc << 5) - acc);
	}, 0);

	const colorIndex = Math.abs(hash) % CATEGORY_COLORS.length;
	const emojiIndex = Math.abs(hash >> 8) % CATEGORY_EMOJIS.length;

	return {
		color: CATEGORY_COLORS[colorIndex],
		icon: CATEGORY_EMOJIS[emojiIndex]
	};
}

const GetCategorySchema = z.object({
	transactionDescription: z
		.string()
		.describe("The description and summary of the transaction to match against existing categories"),
	userId: z.string().describe("The ID of the user"),
});

const CreateCategorySchema = z.object({
	categoryName: z
		.string()
		.describe("The name of the category to create"),
	existingCategoryId: z
		.string()
		.optional()
		.describe("If user wants to use an existing category, provide its ID"),
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
				categories: allCategories.map(cat => ({
					id: cat.id,
					name: cat.name,
					icon: cat.icon,
					color: cat.color,
					isSystemCategory: cat.isSystemCategory,
				})),
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

export const createCategoryTool = tool(
	async ({ categoryName, existingCategoryId, userId }) => {
		try {
			if (existingCategoryId) {
				const existingCategory = await prisma.category.findFirst({
					where: {
						id: existingCategoryId,
						OR: [
							{ isSystemCategory: true, isActive: true },
							{ userId: userId, isActive: true },
						],
					},
				});

				if (existingCategory) {
					return JSON.stringify({
						success: true,
						created: false,
						category: {
							id: existingCategory.id,
							name: existingCategory.name,
							icon: existingCategory.icon,
							color: existingCategory.color,
							isSystemCategory: existingCategory.isSystemCategory,
							isActive: existingCategory.isActive,
						},
						message: "Using existing category",
					});
				} else {
					return JSON.stringify({
						success: false,
						error: "Specified category not found or not accessible",
					});
				}
			}

			const existingByName = await prisma.category.findFirst({
				where: {
					name: {
						equals: categoryName,
						mode: "insensitive",
					},
					OR: [
						{ isSystemCategory: true, isActive: true },
						{ userId: userId, isActive: true },
					],
				},
			});

			if (existingByName) {
				return JSON.stringify({
					success: true,
					created: false,
					category: {
						id: existingByName.id,
						name: existingByName.name,
						icon: existingByName.icon,
						color: existingByName.color,
						isSystemCategory: existingByName.isSystemCategory,
						isActive: existingByName.isActive,
					},
					message: "Category with this name already exists",
				});
			}

			const defaultStyle = generateDefaultStyle(categoryName);
			const newCategory = await prisma.category.create({
				data: {
					name: categoryName,
					userId: userId,
					icon: defaultStyle.icon,
					color: defaultStyle.color,
					isSystemCategory: false,
					isActive: true,
				},
			});

			return JSON.stringify({
				success: true,
				created: true,
				category: {
					id: newCategory.id,
					name: newCategory.name,
					icon: newCategory.icon,
					color: newCategory.color,
					isSystemCategory: newCategory.isSystemCategory,
					isActive: newCategory.isActive,
				},
				message: "New category created successfully",
			});
		} catch (error) {
			return JSON.stringify({
				success: false,
				error: "Failed to create category",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
	{
		name: "create_category",
		description:
			"Creates a new category with the given name, or uses an existing category if the user specifies one by ID. If a category with the same name already exists, returns that category instead of creating a duplicate.",
		schema: CreateCategorySchema,
	}
);
