import { NextFunction, Request, Response } from "express";
import {
	findCategory,
	createCategory,
	getUserCategories,
	getCategoryById,
	updateCategory,
	deleteCategory,
	getAllCategories,
	getSystemCategories,
	getUserCreatedCategories,
} from "../services/category.service";

export const findCategoryController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const { categoryName } = req.body;
		const userId = req.user.id;

		const category = await findCategory({
			categoryName,
			userId,
		});

		if (!category) {
			res.status(404).json({
				message: "No matching category found",
				data: null,
			});
			return;
		}

		res.status(200).json({
			message: "Category found successfully",
			data: category,
		});
	} catch (err) {
		next(err);
	}
};

export const createCategoryController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const userId = req.user.id;
		const category = await createCategory({ ...req.body, userId });

		res.status(201).json({
			message: "Category created successfully",
			data: category,
		});
	} catch (err) {
		next(err);
	}
};

export const getUserCategoriesController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const userId = req.user.id;

		const result = await getUserCategories(userId);

		res.status(200).json({
			message: "User categories retrieved successfully",
			data: result,
		});
	} catch (err) {
		next(err);
	}
};

export const getAllCategoriesController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const result = await getAllCategories();

		res.status(200).json({
			message: "All categories retrieved successfully",
			data: result,
		});
	} catch (err) {
		next(err);
	}
};

export const getSystemCategoriesController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const result = await getSystemCategories();

		res.status(200).json({
			message: "System categories retrieved successfully",
			data: result,
		});
	} catch (err) {
		next(err);
	}
};

export const getUserCreatedCategoriesController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const userId = req.user.id;

		const result = await getUserCreatedCategories(userId);

		res.status(200).json({
			message: "User created categories retrieved successfully",
			data: result,
		});
	} catch (err) {
		next(err);
	}
};

export const getCategoryByIdController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const categoryId = req.params.categoryId as string;
		const userId = req.user.id;

		const category = await getCategoryById(categoryId, userId);

		res.status(200).json({
			message: "Category retrieved successfully",
			data: category,
		});
	} catch (err) {
		next(err);
	}
};

export const updateCategoryController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const categoryId = req.params.categoryId as string;
		const userId = req.user.id;
		const updates = req.body;

		const category = await updateCategory({
			categoryId,
			userId,
			updates,
		});

		res.status(200).json({
			message: "Category updated successfully",
			data: category,
		});
	} catch (err) {
		next(err);
	}
};

export const deleteCategoryController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const categoryId = req.params.categoryId as string;
		const userId = req.user.id;

		const result = await deleteCategory(categoryId, userId);

		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
};
