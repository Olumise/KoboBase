import multer, { FileFilterCallback } from "multer";
import { Request } from "express";

const imageFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type, only JPEG, PNG, WEBP are allowed!'));
  }
};

const pdfFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type, only PDF is allowed!'));
  }
};

const storage = multer.memoryStorage();
export const pdfUpload = multer({
	storage: storage,
	fileFilter: pdfFilter,
	limits: {
		fileSize: 1024 * 1024 * 5,
	},
});

export const imageUpload = multer({
	storage: storage,
	fileFilter: imageFilter,
	limits: {
		fileSize: 1024 * 1024 * 5,
	},
});
