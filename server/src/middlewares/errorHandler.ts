import { APIError } from "better-auth";
import { Request, Response, NextFunction } from "express";
import { MulterError } from "multer";
import z from "zod";

export class AppError extends Error {
	statusNumber: number;
	functionName: string;
	constructor(statusNumber: number, message: string, functionName: string) {
		super(message);
		this.statusNumber = statusNumber;
		this.functionName = functionName;
	}
}

export const errorHandler = async (
	err: Error,
	req: Request,
	res: Response,
	next: NextFunction
) => {
	if (err instanceof AppError) {
		return res.status(err.statusNumber).json({
			message: err.message,
			url: req.url,
			...(process.env.MODE === "development" && {
				functionName: err.functionName,
				cause: err.cause,
				stack: err.stack,
			}),
		});
	}
	if (err instanceof APIError) {
		return res.status(err.statusCode).json({
			message: err.message,
			url: req.url,
			type: "Better Auth Error",
			...(process.env.MODE === "development" && { stack: err.stack }),
		});
	}
	if (err instanceof z.ZodError) {
		console.log(err.issues);
		return res.status(500).json({
			title: err.name,
			message: err.issues[0]?.message,
			...(process.env.MODE === "development" && { issues: err.issues }),
		});
	}
	if (err instanceof MulterError) {
		return res.status(400).json({
			message: err.message,
			field: err.field,
			name: err.name,
			url: req.url,
			...(process.env.MODE === "development" && {
				cause: err.cause,
				stack: err.stack,
			}),
		});
	}
	console.log("Error:", err.message);
	return res.status(500).json({
		message: err.message,
		url: req.url,
		cause: err.cause,
		...(process.env.MODE === "development" && { stack: err.stack }),
	});
};
