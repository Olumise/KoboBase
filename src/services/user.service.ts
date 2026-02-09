import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";
import { auth } from "../lib/auth";

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

export const getUserProfile = async (userId: string) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			email: true,
			emailVerified: true,
			image: true,
			defaultCurrency: true,
			customContextPrompt: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	if (!user) {
		throw new AppError(404, "User not found", "getUserProfile");
	}

	return user;
};

export const updateUserProfile = async (
	userId: string,
	data: {
		name?: string;
		email?: string;
		image?: string;
		defaultCurrency?: string;
		customContextPrompt?: string;
	}
) => {
	// Check if email is being updated and if it already exists
	if (data.email) {
		const existingUser = await prisma.user.findFirst({
			where: {
				email: data.email,
				NOT: { id: userId },
			},
		});

		if (existingUser) {
			throw new AppError(
				400,
				"Email already in use by another account",
				"updateUserProfile"
			);
		}
	}

	// Validate name length
	if (data.name !== undefined && data.name !== null) {
		if (data.name.trim().length < 2) {
			throw new AppError(
				400,
				"Name must be at least 2 characters long",
				"updateUserProfile"
			);
		}
	}

	// Validate customContextPrompt length
	if (data.customContextPrompt !== undefined && data.customContextPrompt !== null) {
		if (data.customContextPrompt.length > 1000) {
			throw new AppError(
				400,
				"Custom context prompt cannot exceed 1000 characters",
				"updateUserProfile"
			);
		}
	}

	// Validate defaultCurrency (should be 3 characters)
	if (data.defaultCurrency !== undefined && data.defaultCurrency !== null) {
		if (data.defaultCurrency.length !== 3) {
			throw new AppError(
				400,
				"Currency code must be exactly 3 characters (e.g., NGN, USD, EUR)",
				"updateUserProfile"
			);
		}
	}

	const updatedUser = await prisma.user.update({
		where: { id: userId },
		data: {
			name: data.name,
			email: data.email,
			image: data.image,
			defaultCurrency: data.defaultCurrency,
			customContextPrompt: data.customContextPrompt,
			// If email is updated, reset email verification
			...(data.email && { emailVerified: false }),
		},
		select: {
			id: true,
			name: true,
			email: true,
			emailVerified: true,
			image: true,
			defaultCurrency: true,
			customContextPrompt: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	return updatedUser;
};

export const changeUserPassword = async (
	userId: string,
	currentPassword: string,
	newPassword: string,
	headers: any
) => {
	// Check if user has password authentication enabled
	const account = await prisma.account.findFirst({
		where: {
			userId,
			providerId: "credential",
		},
	});

	if (!account || !account.password) {
		throw new AppError(
			400,
			"Password authentication not enabled for this account",
			"changeUserPassword"
		);
	}

	// Validate new password
	if (newPassword.length < 8) {
		throw new AppError(
			400,
			"New password must be at least 8 characters long",
			"changeUserPassword"
		);
	}

	// Use Better Auth's built-in changePassword API
	try {
		await auth.api.changePassword({
			body: {
				newPassword,
				currentPassword,
				revokeOtherSessions: false, // Keep other sessions active
			},
			headers,
		});
	} catch (error: any) {
		// Better Auth throws an error if current password is incorrect
		throw new AppError(
			401,
			error.message || "Current password is incorrect",
			"changeUserPassword"
		);
	}
};
