import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";

export const updateUserSettings = async (
	userId: string,
	data: {
		customContextPrompt?: string;
		defaultCurrency?: string;
	}
) => {
	// Validate customContextPrompt length
	if (data.customContextPrompt !== undefined && data.customContextPrompt !== null) {
		if (data.customContextPrompt.length > 1000) {
			throw new AppError(
				400,
				"Custom context prompt cannot exceed 1000 characters",
				"updateUserSettings"
			);
		}
	}

	const user = await prisma.user.update({
		where: { id: userId },
		data: {
			customContextPrompt: data.customContextPrompt,
			defaultCurrency: data.defaultCurrency,
		},
		select: {
			id: true,
			name: true,
			email: true,
			defaultCurrency: true,
			customContextPrompt: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	return user;
};

export const getUserSettings = async (userId: string) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			email: true,
			defaultCurrency: true,
			customContextPrompt: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	if (!user) {
		throw new AppError(404, "User not found", "getUserSettings");
	}

	return user;
};
