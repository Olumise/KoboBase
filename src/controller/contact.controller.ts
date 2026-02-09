import { NextFunction, Request, Response } from "express";
import {
	findContact,
	createContact,
	searchContacts,
	getContactById,
	updateContact,
	getAllContacts,
} from "../services/contact.service";

export const findContactController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const { contactName } = req.body;

		const contact = await findContact({ contactName });

		if (!contact) {
			res.status(404).json({
				message: "No matching contact found",
				data: null,
			});
			return;
		}

		res.status(200).json({
			message: "Contact found successfully",
			data: contact,
		});
	} catch (err) {
		next(err);
	}
};

export const createContactController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const contact = await createContact(req.body);

		res.status(201).json({
			message: "Contact created successfully",
			data: contact,
		});
	} catch (err) {
		next(err);
	}
};

export const searchContactsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const { searchTerm, limit } = req.query;

		const contacts = await searchContacts({
			searchTerm: searchTerm as string,
			limit: limit ? parseInt(limit as string) : undefined,
		});

		res.status(200).json({
			message: "Contacts searched successfully",
			data: contacts,
		});
	} catch (err) {
		next(err);
	}
};

export const getContactByIdController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const contactId = req.params.contactId as string;

		const contact = await getContactById(contactId);

		res.status(200).json({
			message: "Contact retrieved successfully",
			data: contact,
		});
	} catch (err) {
		next(err);
	}
};

export const updateContactController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const contactId = req.params.contactId as string;
		const updates = req.body;

		const contact = await updateContact({
			contactId,
			updates,
		});

		res.status(200).json({
			message: "Contact updated successfully",
			data: contact,
		});
	} catch (err) {
		next(err);
	}
};


export const getAllContactsController = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		const { limit } = req.query;

		const contacts = await getAllContacts(
			limit ? parseInt(limit as string) : undefined
		);

		res.status(200).json({
			message: "All contacts retrieved successfully",
			data: contacts,
		});
	} catch (err) {
		next(err);
	}
};
