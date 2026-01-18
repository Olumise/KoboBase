import express from "express";
import multer from "multer";
import {
	extractImageController,
	getPdfInfoController,
	parsePdfController,
} from "../controller/ai.controller";
import { imageUpload, pdfUpload } from "../middlewares/multer";
const aiRouter = express();

aiRouter.post(
	"/image-ocr",
	imageUpload.single("image"),
	extractImageController
);
aiRouter.post("/pdf-info", pdfUpload.single("pdf"), getPdfInfoController);
aiRouter.post("/parse-pdf", pdfUpload.single("pdf"), parsePdfController);

export default aiRouter;
