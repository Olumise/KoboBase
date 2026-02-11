import { NextFunction, Request, Response } from "express";
import {
	updateUserSettings,
	getUserSettings,
	getUserProfile,
	updateUserProfile,
	changeUserPassword
} from "../services/user.service";
import { uploadFile } from "../services/upload";
import { AppError } from "../middlewares/errorHandler";

export const updateUserSettingsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const userId = req.user.id;
		const { customContextPrompt, defaultCurrency } = req.body;

		const user = await updateUserSettings(userId, {
			customContextPrompt,
			defaultCurrency,
		});

		res.status(200).json({
			message: "User settings updated successfully",
			data: user,
		});
	} catch (err) {
		next(err);
	}
};

export const getUserSettingsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const userId = req.user.id;

		const user = await getUserSettings(userId);

		res.status(200).json({
			message: "User settings retrieved successfully",
			data: user,
		});
	} catch (err) {
		next(err);
	}
};

export const getUserProfileController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const userId = req.user.id;

		const profile = await getUserProfile(userId);

		res.status(200).json({
			message: "User profile retrieved successfully",
			data: profile,
		});
	} catch (err) {
		next(err);
	}
};

export const updateUserProfileController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const userId = req.user.id;
		const { name, email, image, defaultCurrency, customContextPrompt } = req.body;

		const updatedProfile = await updateUserProfile(userId, {
			name,
			email,
			image,
			defaultCurrency,
			customContextPrompt,
		});

		res.status(200).json({
			message: "User profile updated successfully",
			data: updatedProfile,
		});
	} catch (err) {
		next(err);
	}
};

export const changePasswordController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const userId = req.user.id;
		const { currentPassword, newPassword } = req.body;

		await changeUserPassword(userId, currentPassword, newPassword, req.headers);

		res.status(200).json({
			message: "Password changed successfully",
		});
	} catch (err) {
		next(err);
	}
};

export const uploadProfileImageController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		if (!req.file) {
			throw new AppError(400, "No image file provided", "uploadProfileImage");
		}

		const uploadedFile = await uploadFile(
			req.file,
			req.file.mimetype,
			"profile"
		);

		res.status(200).json({
			message: "Image uploaded successfully",
			data: {
				url: uploadedFile.url,
				path: uploadedFile.path,
				filename: uploadedFile.file,
			},
		});
	} catch (err) {
		next(err);
	}
};
