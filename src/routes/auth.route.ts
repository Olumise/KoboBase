import express from "express";
import { signInController, signUpController, getSessionController, logoutController } from "../controller/auth.controller";

const authRouter = express();

authRouter.post("/sign-up/email", signUpController);
authRouter.post("/sign-in/email", signInController);
authRouter.get("/get-session", getSessionController);
authRouter.post("/logout", logoutController);


export default authRouter;