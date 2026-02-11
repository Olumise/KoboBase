import { NextFunction, Request, Response } from "express";
import { signInUser, signUpUser, getUser } from "../services/auth.service";

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

export const getSessionController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const headers = req.headers;
		const session = await getUser(headers);

		res.status(200).json({
			message: "Session retrieved successfully",
			data: session,
		});
	} catch (err) {
		next(err);
	}
};

export const logoutController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		res.clearCookie("better-auth.session_token");

		res.status(200).json({
			message: "Logged out successfully",
		});
	} catch (err) {
		next(err);
	}
};
