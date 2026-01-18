import express from "express";
import { generateTransactionController } from "../controller/transaction.controller";

const transactionRouter = express()

transactionRouter.post("/generate",generateTransactionController)


export default transactionRouter