import express from "express";
import { authVerify } from "../middlewares/authVerify";
import {
	getBankAccountsController,
	createBankAccountController,
	matchBankAccountController,
	getPrimaryBankAccountController,
	getBankAccountByIdController,
	updateBankAccountController,
	deleteBankAccountController,
	setPrimaryAccountController,
} from "../controller/bankAccount.controller";

const bankAccountRouter = express();

bankAccountRouter.get("/", authVerify, getBankAccountsController);
bankAccountRouter.post("/", authVerify, createBankAccountController);
bankAccountRouter.post("/match", authVerify, matchBankAccountController);
bankAccountRouter.get("/primary/:userId", authVerify, getPrimaryBankAccountController);
bankAccountRouter.get("/:accountId", authVerify, getBankAccountByIdController);
bankAccountRouter.put("/:accountId", authVerify, updateBankAccountController);
bankAccountRouter.delete("/:accountId", authVerify, deleteBankAccountController);
bankAccountRouter.patch("/:accountId/set-primary", authVerify, setPrimaryAccountController);

export default bankAccountRouter;
