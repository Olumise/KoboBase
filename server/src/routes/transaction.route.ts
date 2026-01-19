import express from "express";
import { generateTransactionController, initiateTransactionController } from "../controller/transaction.controller";
import { authVerify } from "../middlewares/authVerify";

const transactionRouter = express()

transactionRouter.post("/generate", generateTransactionController)
transactionRouter.post("/initiate", authVerify, initiateTransactionController)

export default transactionRouter