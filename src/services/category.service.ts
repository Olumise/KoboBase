import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";

function normalizeCategoryName(name: string): string {
	return name.toLowerCase().trim()
		.replace(/[&\s]+/g, " ")
		.replace(/[^\w\s]/g, "");
}

interface FindCategoryInput {
	categoryName: string;
	userId: string;
}

interface CategoryMatchResult {
	id: string;
	name: string;
	icon: string | null;
	color: string | null;
	isSystemCategory: boolean;
	isActive: boolean;
	matchConfidence: number;
}

export const findCategory = async (
	input: FindCategoryInput
): Promise<CategoryMatchResult | null> => {
	const { categoryName, userId } = input;

	if (!categoryName || !userId) {
		throw new AppError(400, "Category name and user ID are required", "findCategory");
	}

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

		if (category) {
			return {
				id: category.id,
				name: category.name,
				icon: category.icon,
				color: category.color,
				isSystemCategory: category.isSystemCategory,
				isActive: category.isActive,
				matchConfidence: 1.0,
			};
		}

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

		if (category) {
			return {
				id: category.id,
				name: category.name,
				icon: category.icon,
				color: category.color,
				isSystemCategory: category.isSystemCategory,
				isActive: category.isActive,
				matchConfidence: 1.0,
			};
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

		const normalizedInput = normalizeCategoryName(categoryName);
		let bestMatch = null;
		let bestScore = 0;

		for (const cat of allCategories) {
			const normalizedCat = normalizeCategoryName(cat.name);

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
			return {
				id: bestMatch.id,
				name: bestMatch.name,
				icon: bestMatch.icon,
				color: bestMatch.color,
				isSystemCategory: bestMatch.isSystemCategory,
				isActive: bestMatch.isActive,
				matchConfidence: bestScore,
			};
		}

		return null;
	} catch (error) {
		throw new AppError(
			500,
			`Failed to find category: ${error instanceof Error ? error.message : "Unknown error"}`,
			"findCategory"
		);
	}
};

interface CreateCategoryInput {
	name: string;
	userId: string;
	icon?: string;
	color?: string;
	isSystemCategory?: boolean;
}

export const createCategory = async (input: CreateCategoryInput) => {
	const { name, userId, icon, color, isSystemCategory = false } = input;

	if (!name || !userId) {
		throw new AppError(400, "Category name and user ID are required", "createCategory");
	}

	try {
		const existingCategory = await prisma.category.findFirst({
			where: {
				name: {
					equals: name,
					mode: "insensitive",
				},
				userId: userId,
			},
		});

		if (existingCategory) {
			throw new AppError(409, "Category with this name already exists", "createCategory");
		}

		const newCategory = await prisma.category.create({
			data: {
				name,
				userId,
				icon: icon || null,
				color: color || null,
				isSystemCategory,
				isActive: true,
			},
		});

		return newCategory;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			500,
			`Failed to create category: ${error instanceof Error ? error.message : "Unknown error"}`,
			"createCategory"
		);
	}
};

export const getUserCategories = async (userId: string) => {
	if (!userId) {
		throw new AppError(400, "User ID is required", "getUserCategories");
	}

	try {
		const categories = await prisma.category.findMany({
			where: {
				OR: [
					{ isSystemCategory: true, isActive: true },
					{ userId: userId, isActive: true },
				],
			},
			orderBy: [
				{ isSystemCategory: "desc" },
				{ name: "asc" },
			],
		});

		return {
			categories,
			total: categories.length,
			systemCategories: categories.filter(c => c.isSystemCategory).length,
			userCategories: categories.filter(c => !c.isSystemCategory).length,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to get user categories: ${error instanceof Error ? error.message : "Unknown error"}`,
			"getUserCategories"
		);
	}
};

export const getCategoryById = async (categoryId: string, userId: string) => {
	if (!categoryId || !userId) {
		throw new AppError(400, "Category ID and user ID are required", "getCategoryById");
	}

	try {
		const category = await prisma.category.findFirst({
			where: {
				id: categoryId,
				OR: [
					{ isSystemCategory: true },
					{ userId: userId },
				],
				isActive: true,
			},
		});

		if (!category) {
			throw new AppError(404, "Category not found", "getCategoryById");
		}

		return category;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			500,
			`Failed to get category: ${error instanceof Error ? error.message : "Unknown error"}`,
			"getCategoryById"
		);
	}
};

interface UpdateCategoryInput {
	categoryId: string;
	userId: string;
	updates: {
		name?: string;
		icon?: string;
		color?: string;
		isActive?: boolean;
	};
}

export const updateCategory = async (input: UpdateCategoryInput) => {
	const { categoryId, userId, updates } = input;

	if (!categoryId || !userId) {
		throw new AppError(400, "Category ID and user ID are required", "updateCategory");
	}

	try {
		const category = await prisma.category.findUnique({
			where: { id: categoryId },
		});

		if (!category) {
			throw new AppError(404, "Category not found", "updateCategory");
		}

		if (category.isSystemCategory) {
			throw new AppError(403, "Cannot update system categories", "updateCategory");
		}

		if (category.userId !== userId) {
			throw new AppError(403, "You are not authorized to update this category", "updateCategory");
		}

		if (updates.name) {
			const existingCategory = await prisma.category.findFirst({
				where: {
					name: {
						equals: updates.name,
						mode: "insensitive",
					},
					userId: userId,
					id: {
						not: categoryId,
					},
				},
			});

			if (existingCategory) {
				throw new AppError(409, "Category with this name already exists", "updateCategory");
			}
		}

		const updatedCategory = await prisma.category.update({
			where: { id: categoryId },
			data: updates,
		});

		return updatedCategory;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			500,
			`Failed to update category: ${error instanceof Error ? error.message : "Unknown error"}`,
			"updateCategory"
		);
	}
};

export const deleteCategory = async (categoryId: string, userId: string) => {
	if (!categoryId || !userId) {
		throw new AppError(400, "Category ID and user ID are required", "deleteCategory");
	}

	try {
		const category = await prisma.category.findUnique({
			where: { id: categoryId },
		});

		if (!category) {
			throw new AppError(404, "Category not found", "deleteCategory");
		}

		if (category.isSystemCategory) {
			throw new AppError(403, "Cannot delete system categories", "deleteCategory");
		}

		if (category.userId !== userId) {
			throw new AppError(403, "You are not authorized to delete this category", "deleteCategory");
		}

		await prisma.category.update({
			where: { id: categoryId },
			data: { isActive: false },
		});

		return { message: "Category deleted successfully" };
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			500,
			`Failed to delete category: ${error instanceof Error ? error.message : "Unknown error"}`,
			"deleteCategory"
		);
	}
};

export const getAllCategories = async () => {
	try {
		const categories = await prisma.category.findMany({
			where: {
				isActive: true,
			},
			orderBy: [
				{ isSystemCategory: "desc" },
				{ name: "asc" },
			],
		});

		return {
			categories,
			total: categories.length,
			systemCategories: categories.filter(c => c.isSystemCategory).length,
			userCategories: categories.filter(c => !c.isSystemCategory).length,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to get all categories: ${error instanceof Error ? error.message : "Unknown error"}`,
			"getAllCategories"
		);
	}
};

export const getSystemCategories = async () => {
	try {
		const categories = await prisma.category.findMany({
			where: {
				isSystemCategory: true,
				isActive: true,
			},
			orderBy: {
				name: "asc",
			},
		});

		return {
			categories,
			total: categories.length,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to get system categories: ${error instanceof Error ? error.message : "Unknown error"}`,
			"getSystemCategories"
		);
	}
};

export const getUserCreatedCategories = async (userId: string) => {
	if (!userId) {
		throw new AppError(400, "User ID is required", "getUserCreatedCategories");
	}

	try {
		const categories = await prisma.category.findMany({
			where: {
				userId: userId,
				isSystemCategory: false,
				isActive: true,
			},
			orderBy: {
				name: "asc",
			},
		});

		return {
			categories,
			total: categories.length,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to get user created categories: ${error instanceof Error ? error.message : "Unknown error"}`,
			"getUserCreatedCategories"
		);
	}
};
