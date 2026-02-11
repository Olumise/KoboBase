import "dotenv/config";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import multer from "multer";
const {
	S3_REGION,
	SUPABASE_S3_STORAGE_URL,
	AWS_ACCESS_KEY_ID,
	AWS_SECRET_ACCESS_KEY,
	SUPABASE_URL,
} = process.env;

if (
	!S3_REGION ||
	!SUPABASE_S3_STORAGE_URL ||
	!AWS_ACCESS_KEY_ID ||
	!AWS_SECRET_ACCESS_KEY ||
	!SUPABASE_URL
) {
	throw new Error("Missing required s3 Configuration Var");
}

export type uploadedFile = Express.Multer.File;

const client = new S3Client({
	forcePathStyle: true,
	region: S3_REGION,
	endpoint: SUPABASE_S3_STORAGE_URL,
	credentials: {
		accessKeyId: AWS_ACCESS_KEY_ID,
		secretAccessKey: AWS_SECRET_ACCESS_KEY,
	},
});

export const uploadFile = async (
	file: uploadedFile,
	mimetype: string,
	prefix?: string,
	userId?: string
) => {
	if (!file) {
		throw new Error("No file provided!");
	}
	let fileName;
	if (!prefix) {
		fileName = `${Date.now()}-${file.originalname}`;
	}
	fileName = `${Date.now()}`;

	// Organize files into user-specific folders if userId is provided
	let key: string;
	if (userId) {
		key = `kobobase/${userId}/${fileName}`;
	} else {
		key = `kobobase/${fileName}`;
	}

	const uploadImage = new PutObjectCommand({
		Bucket: "my_dev_projects",
		Key: key,
		Body: file.buffer,
		ContentType: mimetype,
	});
	try {
		await client.send(uploadImage);
		return {
			path: key,
			file: file.originalname,
			url: `${SUPABASE_URL}/storage/v1/object/public/my_dev_projects/${key}`,
		};
	} catch (err: any) {
		throw new Error(err);
	}
};

export const uploadMultipleFiles = async (
	files: uploadedFile[],
	mimeType: string,
	prefix?: string
) => {
	if (!files || files.length === 0) {
		throw new Error("No files uploaded!");
	}
	try {
		const uploadedFiles = await Promise.all(
			files.map((file) => uploadFile(file, mimeType, prefix))
		);
		return uploadedFiles;
	} catch (err: any) {
		throw new Error(err);
	}
};

export const deleteFile = async (fileUrl: string) => {
	if (!fileUrl) {
		throw new Error("No file URL provided!");
	}

	// Extract the key from the full URL
	// URL format: ${SUPABASE_URL}/storage/v1/object/public/my_dev_projects/${key}
	const urlPattern = /\/my_dev_projects\/(.+)$/;
	const match = fileUrl.match(urlPattern);

	if (!match || !match[1]) {
		throw new Error("Invalid file URL format!");
	}

	const key = match[1];

	const deleteCommand = new DeleteObjectCommand({
		Bucket: "my_dev_projects",
		Key: key,
	});

	try {
		await client.send(deleteCommand);
		return {
			success: true,
			message: "File deleted successfully",
			deletedKey: key,
		};
	} catch (err: any) {
		throw new Error(`Failed to delete file: ${err.message}`);
	}
};
