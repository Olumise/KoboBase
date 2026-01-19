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

const GetOrCreateCategorySchema = z.object({
	categoryName: z
		.string()
		.describe("The name of the category to find or create"),
	userId: z.string().describe("The ID of the user"),
});

export const getOrCreateCategoryTool = tool(
	async ({ categoryName, userId }) => {
		try {
			let category = await prisma.category.findFirst({
				where: {
					name: {
						equals: categoryName,
						mode: "insensitive",
					},
					isSystemCategory: true,
					isActive: true,
				},
			});

			if (!category) {
				category = await prisma.category.findFirst({
					where: {
						name: {
							equals: categoryName,
							mode: "insensitive",
						},
						userId: userId,
						isActive: true,
					},
				});
			}

			if (category) {
				return JSON.stringify({
					id: category.id,
					name: category.name,
					icon: category.icon,
					color: category.color,
					isSystemCategory: category.isSystemCategory,
					isActive: category.isActive,
					created: false,
					matchConfidence: 1.0,
				});
			}

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

			const normalizedInput = categoryName.toLowerCase().trim();
			let bestMatch = null;
			let bestScore = 0;

			for (const cat of allCategories) {
				const normalizedCat = cat.name.toLowerCase().trim();

				if (normalizedCat.includes(normalizedInput) || normalizedInput.includes(normalizedCat)) {
					const score = Math.max(
						normalizedInput.length / normalizedCat.length,
						normalizedCat.length / normalizedInput.length
					);

					if (score > bestScore && score > 0.7) {
						bestScore = score;
						bestMatch = cat;
					}
				}
			}

			if (bestMatch) {
				return JSON.stringify({
					id: bestMatch.id,
					name: bestMatch.name,
					icon: bestMatch.icon,
					color: bestMatch.color,
					isSystemCategory: bestMatch.isSystemCategory,
					isActive: bestMatch.isActive,
					created: false,
					matchConfidence: bestScore,
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
				id: newCategory.id,
				name: newCategory.name,
				icon: newCategory.icon,
				color: newCategory.color,
				isSystemCategory: newCategory.isSystemCategory,
				isActive: newCategory.isActive,
				created: true,
				matchConfidence: 0,
			});
		} catch (error) {
			return JSON.stringify({
				error: "Failed to get or create category",
				message: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
	{
		name: "get_or_create_category",
		description:
			"Find an existing category by name using fuzzy matching, or create a new one if no match is found. Returns the category with a confidence score indicating match quality.",
		schema: GetOrCreateCategorySchema,
	}
);
