import express from "express";
import { authVerify } from "../middlewares/authVerify";
import {
	updateUserSettingsController,
	getUserSettingsController,
} from "../controller/user.controller";

const userRouter = express();

userRouter.get("/:userId/settings", authVerify, getUserSettingsController);
userRouter.patch("/settings", authVerify, updateUserSettingsController);

export default userRouter;
