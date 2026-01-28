import { NextFunction, Request, Response } from "express";
import { signInUser, signUpUser } from "../services/auth.service";

export const signUpController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const { headers, response } = await signUpUser(req.body);
		const cookies = headers.get("set-cookie");
		if (cookies) {
			res.setHeader("set-cookie", cookies);
		}

		res.status(201).json({
			message: "New User created successfully!",
			data: response,
		});
	} catch (err) {
		next(err);
	}
};

export const signInController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const { headers, response } = await signInUser(req.body);
		const cookies = headers.get("set-cookie");
		if (cookies) {
			res.setHeader("set-cookie", cookies);
		}

		res.status(201).json({
			message: "Signed In sucessfully!!",
			data: response,
		});
	} catch (err) {
		next(err);
	}
};
