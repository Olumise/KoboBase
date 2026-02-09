import express from "express";
import { authVerify } from "../middlewares/authVerify";
import {
	findContactController,
	createContactController,
	searchContactsController,
	getContactByIdController,
	updateContactController,
	getAllContactsController,
} from "../controller/contact.controller";

const contactRouter = express();

contactRouter.post("/find", authVerify, findContactController);
contactRouter.post("/", authVerify, createContactController);
contactRouter.get("/search", authVerify, searchContactsController);
contactRouter.get("/all", authVerify, getAllContactsController);
contactRouter.get("/:contactId", authVerify, getContactByIdController);
contactRouter.put("/:contactId", authVerify, updateContactController);

export default contactRouter;
