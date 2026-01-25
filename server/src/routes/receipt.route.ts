import express from "express";
import { authVerify } from "../middlewares/authVerify";
import { addReceiptController, extractReceiptController, updateReceiptFileController, getBatchSessionController } from "../controller/receipt.controller";
import { imageUpload } from "../middlewares/multer";
const receiptRouter = express()

receiptRouter.post('/add',authVerify,imageUpload.single('receipt'),addReceiptController)
receiptRouter.post('/extract/:receiptId',authVerify,extractReceiptController)
receiptRouter.patch('/update-file/:receiptId',authVerify,imageUpload.single('receipt'),updateReceiptFileController)
receiptRouter.get('/batch-session/:receiptId',authVerify,getBatchSessionController)

export default receiptRouter