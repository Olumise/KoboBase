import express from "express";
import { authVerify } from "../middlewares/authVerify";
import {
	getUserProfileController,
	updateUserProfileController,
	changePasswordController,
	uploadProfileImageController,
} from "../controller/user.controller";
import { imageUpload } from "../middlewares/multer";

const userRouter = express();


userRouter.get("/profile", authVerify, getUserProfileController);
userRouter.patch("/profile", authVerify, updateUserProfileController);
userRouter.post("/change-password", authVerify, changePasswordController);
userRouter.post("/upload-image", authVerify, imageUpload.single("image"), uploadProfileImageController);

export default userRouter;
