import { Request, Response, NextFunction } from "express";

import { fromNodeHeaders } from "better-auth/node";

import { AppError } from "./errorHandler.js";
import { getUser } from "../services/auth.service.js";

export const authVerify = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const headers = fromNodeHeaders(req.headers);
		const user = await getUser(headers);
		if (!user?.user.id) {
			throw new AppError(401, "Unauthorized!, please sign in", "authVerify");
		}
		req.user = user.user;
		next();
	} catch (err) {
		next(err);
	}
};
