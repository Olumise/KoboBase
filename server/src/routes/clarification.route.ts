import express from "express";
import { authVerify } from "../middlewares/authVerify";
import {
	createClarificationController,
	getClarificationSessionController,
	completeClarificationSessionController,
	getUserClarificationSessionsController,
	sendClarificationMessageController,
} from "../controller/clarification.controller";

const clarificationRouter = express();

clarificationRouter.post("/create", authVerify, createClarificationController);
clarificationRouter.get("/session/:sessionId", authVerify, getClarificationSessionController);
clarificationRouter.patch("/session/:sessionId/complete", authVerify, completeClarificationSessionController);
clarificationRouter.get("/sessions", authVerify, getUserClarificationSessionsController);
clarificationRouter.post("/session/:sessionId/message", authVerify, sendClarificationMessageController);

export default clarificationRouter;
