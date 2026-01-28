import express from "express";
import { authVerify } from "../middlewares/authVerify";
import {
	findCategoryController,
	createCategoryController,
	getUserCategoriesController,
	getCategoryByIdController,
	updateCategoryController,
	deleteCategoryController,
	getAllCategoriesController,
	getSystemCategoriesController,
	getUserCreatedCategoriesController,
} from "../controller/category.controller";

const categoryRouter = express();

categoryRouter.post("/find", authVerify, findCategoryController);
categoryRouter.post("/", authVerify, createCategoryController);
categoryRouter.get("/all", authVerify, getAllCategoriesController);
categoryRouter.get("/system", authVerify, getSystemCategoriesController);
categoryRouter.get("/user/:userId", authVerify, getUserCategoriesController);
categoryRouter.get("/user/:userId/created", authVerify, getUserCreatedCategoriesController);
categoryRouter.get("/:categoryId", authVerify, getCategoryByIdController);
categoryRouter.put("/:categoryId", authVerify, updateCategoryController);
categoryRouter.delete("/:categoryId", authVerify, deleteCategoryController);

export default categoryRouter;
