import { NextFunction, Request, Response } from "express";
import { updateUserSettings, getUserSettings } from "../services/user.service";

export const updateUserSettingsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const userId = req.body.userId as string;
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
		const userId = req.params.userId as string;

		const user = await getUserSettings(userId);

		res.status(200).json({
			message: "User settings retrieved successfully",
			data: user,
		});
	} catch (err) {
		next(err);
	}
};
