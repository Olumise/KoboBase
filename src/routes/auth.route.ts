import express from "express";
import { signInController, signUpController } from "../controller/auth.controller";

const authRouter = express();

authRouter.post("/signup", signUpController);
authRouter.post("/signin", signInController);


export default authRouter;