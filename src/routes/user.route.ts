import express from "express";
import { authVerify } from "../middlewares/authVerify";
import {
	getUserProfileController,
	updateUserProfileController,
	changePasswordController,
} from "../controller/user.controller";

const userRouter = express();


userRouter.get("/profile", authVerify, getUserProfileController);
userRouter.patch("/profile", authVerify, updateUserProfileController);
userRouter.post("/change-password", authVerify, changePasswordController);

export default userRouter;
