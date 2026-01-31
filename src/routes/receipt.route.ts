import express from "express";
import { authVerify } from "../middlewares/authVerify";
import { addReceiptController, extractReceiptController, updateReceiptFileController, getBatchSessionController } from "../controller/receipt.controller";
import { receiptUpload } from "../middlewares/multer";
import { rateLimitMiddleware } from "../middlewares/rateLimit";
const receiptRouter = express()

receiptRouter.post('/add',authVerify,rateLimitMiddleware('receipt.upload'),receiptUpload.single('receipt'),addReceiptController)
receiptRouter.post('/extract/:receiptId',authVerify,rateLimitMiddleware('receipt.extract'),extractReceiptController)
receiptRouter.patch('/update-file/:receiptId',authVerify,receiptUpload.single('receipt'),updateReceiptFileController)
receiptRouter.get('/batch-session/:receiptId',authVerify,getBatchSessionController)

export default receiptRouter