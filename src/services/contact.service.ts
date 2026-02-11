import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/errorHandler";
import { ContactType, ContactTypeValue } from "../constants/types";
import { CONTACT_TYPE_KEYWORDS } from "../lib/contactTypeKeywords";

function generateNameVariations(name: string): string[] {
	const variations = new Set<string>();
	const normalized = name.toLowerCase().trim();

	variations.add(normalized);

	const words = normalized.split(/\s+/);

	if (words.length > 1) {
		variations.add(words.join(''));

		const initials = words.map(w => w[0]).join('');
		variations.add(initials);

		const firstNameInitial = words[0][0] + ' ' + words.slice(1).join(' ');
		variations.add(firstNameInitial);

		for (let i = 0; i < words.length; i++) {
			variations.add(words[i]);
		}
	}

	const prefixes = ['dr', 'mr', 'mrs', 'ms', 'prof', 'dr.', 'mr.', 'mrs.', 'ms.', 'prof.'];
	for (const prefix of prefixes) {
		if (normalized.startsWith(prefix + ' ') || normalized.startsWith(prefix + '.')) {
			const withoutPrefix = normalized.replace(new RegExp(`^${prefix}\\.?\\s+`), '');
			variations.add(withoutPrefix);
		}
	}

	const suffixes = ['ltd', 'limited', 'inc', 'corp', 'llc', 'plc'];
	for (const suffix of suffixes) {
		if (normalized.endsWith(' ' + suffix) || normalized.endsWith(' ' + suffix + '.')) {
			const withoutSuffix = normalized.replace(new RegExp(`\\s+${suffix}\\.?$`), '');
			variations.add(withoutSuffix);
		}
	}

	return Array.from(variations).filter(v => v.length > 0);
}

function determineContactType(bankName?: string, description?: string): ContactTypeValue {
	const searchText = `${bankName || ''} ${description || ''}`.toLowerCase();

	for (const entry of CONTACT_TYPE_KEYWORDS) {
		if (entry.keywords.some(keyword => searchText.includes(keyword))) {
			return entry.type;
		}
	}

	return ContactType.PERSON;
}

interface FindContactInput {
	contactName: string;
}

interface ContactMatchResult {
	id: string;
	name: string;
	normalizedName: string | null;
	contactType: ContactTypeValue | null;
	categoryId: string | null;
	nameVariations: string[];
	transactionCount: number;
	lastTransactionDate: Date | null;
	matchConfidence: number;
	matchedVariation: string | null;
}

export const findContact = async (
	input: FindContactInput
): Promise<ContactMatchResult | null> => {
	const { contactName } = input;

	if (!contactName) {
		throw new AppError(400, "Contact name is required", "findContact");
	}

	try {
		let contact = await prisma.contact.findFirst({
			where: {
				name: {
					equals: contactName,
					mode: "insensitive",
				},
			},
		});

		if (contact) {
			const transactionCount = await prisma.transaction.count({
				where: { contactId: contact.id },
			});

			const lastTransaction = await prisma.transaction.findFirst({
				where: { contactId: contact.id },
				orderBy: { transactionDate: 'desc' },
				select: { transactionDate: true },
			});

			return {
				id: contact.id,
				name: contact.name,
				normalizedName: contact.normalizedName,
				contactType: contact.ContactType as ContactTypeValue | null,
				categoryId: contact.categoryId,
				nameVariations: contact.nameVariations,
				transactionCount,
				lastTransactionDate: lastTransaction?.transactionDate || null,
				matchConfidence: 1.0,
				matchedVariation: null,
			};
		}

		const allContacts = await prisma.contact.findMany();
		const normalizedInput = contactName.toLowerCase().trim();

		for (const cont of allContacts) {
			if (cont.normalizedName?.toLowerCase() === normalizedInput) {
				const transactionCount = await prisma.transaction.count({
					where: { contactId: cont.id },
				});

				const lastTransaction = await prisma.transaction.findFirst({
					where: { contactId: cont.id },
					orderBy: { transactionDate: 'desc' },
					select: { transactionDate: true },
				});

				return {
					id: cont.id,
					name: cont.name,
					normalizedName: cont.normalizedName,
					contactType: cont.ContactType as ContactTypeValue | null,
					categoryId: cont.categoryId,
					nameVariations: cont.nameVariations,
					transactionCount,
					lastTransactionDate: lastTransaction?.transactionDate || null,
					matchConfidence: 0.95,
					matchedVariation: cont.normalizedName,
				};
			}

			for (const variation of cont.nameVariations) {
				if (variation.toLowerCase() === normalizedInput) {
					const transactionCount = await prisma.transaction.count({
						where: { contactId: cont.id },
					});

					const lastTransaction = await prisma.transaction.findFirst({
						where: { contactId: cont.id },
						orderBy: { transactionDate: 'desc' },
						select: { transactionDate: true },
					});

					return {
						id: cont.id,
						name: cont.name,
						normalizedName: cont.normalizedName,
						contactType: cont.ContactType as ContactTypeValue | null,
						categoryId: cont.categoryId,
						nameVariations: cont.nameVariations,
						transactionCount,
						lastTransactionDate: lastTransaction?.transactionDate || null,
						matchConfidence: 0.9,
						matchedVariation: variation,
					};
				}
			}
		}

		let bestMatch = null;
		let bestScore = 0;

		for (const cont of allContacts) {
			const normalizedCont = cont.name.toLowerCase().trim();

			if (normalizedCont.includes(normalizedInput) || normalizedInput.includes(normalizedCont)) {
				const score = Math.min(
					normalizedInput.length / normalizedCont.length,
					normalizedCont.length / normalizedInput.length
				);

				if (score > bestScore && score > 0.6) {
					bestScore = score;
					bestMatch = cont;
				}
			}

			if (cont.nameVariations && cont.nameVariations.length > 0) {
				for (const variation of cont.nameVariations) {
					const normalizedVariation = variation.toLowerCase().trim();
					if (normalizedVariation.includes(normalizedInput) || normalizedInput.includes(normalizedVariation)) {
						const score = Math.min(
							normalizedInput.length / normalizedVariation.length,
							normalizedVariation.length / normalizedInput.length
						);

						if (score > bestScore && score > 0.6) {
							bestScore = score;
							bestMatch = cont;
						}
					}
				}
			}
		}

		if (bestMatch) {
			const transactionCount = await prisma.transaction.count({
				where: { contactId: bestMatch.id },
			});

			const lastTransaction = await prisma.transaction.findFirst({
				where: { contactId: bestMatch.id },
				orderBy: { transactionDate: 'desc' },
				select: { transactionDate: true },
			});

			return {
				id: bestMatch.id,
				name: bestMatch.name,
				normalizedName: bestMatch.normalizedName,
				contactType: bestMatch.ContactType as ContactTypeValue | null,
				categoryId: bestMatch.categoryId,
				nameVariations: bestMatch.nameVariations,
				transactionCount,
				lastTransactionDate: lastTransaction?.transactionDate || null,
				matchConfidence: bestScore,
				matchedVariation: null,
			};
		}

		return null;
	} catch (error) {
		throw new AppError(
			500,
			`Failed to find contact: ${error instanceof Error ? error.message : "Unknown error"}`,
			"findContact"
		);
	}
};

interface CreateContactInput {
	name: string;
	contactType?: ContactTypeValue;
	categoryId?: string;
	bankName?: string;
	description?: string;
	notes?: string;
}

export const createContact = async (input: CreateContactInput) => {
	const { name, contactType, categoryId, bankName, description, notes } = input;

	if (!name) {
		throw new AppError(400, "Contact name is required", "createContact");
	}

	try {
		const existingContact = await prisma.contact.findFirst({
			where: {
				name: {
					equals: name,
					mode: "insensitive",
				},
			},
		});

		if (existingContact) {
			throw new AppError(409, "Contact with this name already exists", "createContact");
		}

		const nameVariations = generateNameVariations(name);
		const determinedType = contactType || determineContactType(bankName, description);

		const newContact = await prisma.contact.create({
			data: {
				name,
				normalizedName: name.toLowerCase().trim(),
				ContactType: determinedType,
				categoryId: categoryId || null,
				nameVariations,
				notes: notes || null,
			},
		});

		return newContact;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			500,
			`Failed to create contact: ${error instanceof Error ? error.message : "Unknown error"}`,
			"createContact"
		);
	}
};

interface SearchContactsInput {
	searchTerm: string;
	limit?: number;
}

export const searchContacts = async (input: SearchContactsInput) => {
	const { searchTerm, limit = 10 } = input;

	if (!searchTerm) {
		throw new AppError(400, "Search term is required", "searchContacts");
	}

	try {
		const normalizedSearch = searchTerm.toLowerCase().trim();

		const contacts = await prisma.contact.findMany({
			where: {
				OR: [
					{
						name: {
							contains: searchTerm,
							mode: "insensitive",
						},
					},
					{
						normalizedName: {
							contains: normalizedSearch,
						},
					},
				],
			},
		});

		const fuzzyMatches = await prisma.contact.findMany({
			where: {
				NOT: {
					id: {
						in: contacts.map(c => c.id),
					},
				},
			},
		});

		const additionalMatches = fuzzyMatches.filter(contact => {
			return contact.nameVariations.some(variation =>
				variation.toLowerCase().includes(normalizedSearch)
			);
		}).slice(0, Math.max(0, limit - contacts.length));

		const allMatches = [...contacts, ...additionalMatches];

		// Get transaction counts for all contacts
		const contactsWithCounts = await Promise.all(
			allMatches.map(async (contact) => {
				const transactionCount = await prisma.transaction.count({
					where: { contactId: contact.id },
				});

				const lastTransaction = await prisma.transaction.findFirst({
					where: { contactId: contact.id },
					orderBy: { transactionDate: 'desc' },
					select: { transactionDate: true },
				});

				return {
					...contact,
					transactionCount,
					lastTransactionDate: lastTransaction?.transactionDate || null,
				};
			})
		);

		// Sort by transaction count and last transaction date
		const sortedContacts = contactsWithCounts.sort((a, b) => {
			if (b.transactionCount !== a.transactionCount) {
				return b.transactionCount - a.transactionCount;
			}
			if (a.lastTransactionDate && b.lastTransactionDate) {
				return b.lastTransactionDate.getTime() - a.lastTransactionDate.getTime();
			}
			if (a.lastTransactionDate) return -1;
			if (b.lastTransactionDate) return 1;
			return 0;
		});

		return sortedContacts.slice(0, limit);
	} catch (error) {
		throw new AppError(
			500,
			`Failed to search contacts: ${error instanceof Error ? error.message : "Unknown error"}`,
			"searchContacts"
		);
	}
};

export const getContactById = async (contactId: string) => {
	if (!contactId) {
		throw new AppError(400, "Contact ID is required", "getContactById");
	}

	try {
		const contact = await prisma.contact.findUnique({
			where: { id: contactId },
			include: {
				defaultCategory: true,
			},
		});

		if (!contact) {
			throw new AppError(404, "Contact not found", "getContactById");
		}

		const transactionCount = await prisma.transaction.count({
			where: { contactId: contact.id },
		});

		const lastTransaction = await prisma.transaction.findFirst({
			where: { contactId: contact.id },
			orderBy: { transactionDate: 'desc' },
			select: { transactionDate: true },
		});

		return {
			...contact,
			transactionCount,
			lastTransactionDate: lastTransaction?.transactionDate || null,
		};
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			500,
			`Failed to get contact: ${error instanceof Error ? error.message : "Unknown error"}`,
			"getContactById"
		);
	}
};

interface UpdateContactInput {
	contactId: string;
	updates: {
		name?: string;
		contactType?: ContactTypeValue;
		categoryId?: string;
		typicalAmountRangeMin?: number;
		typicalAmountRangeMax?: number;
		notes?: string;
	};
}

export const updateContact = async (input: UpdateContactInput) => {
	const { contactId, updates } = input;

	if (!contactId) {
		throw new AppError(400, "Contact ID is required", "updateContact");
	}

	try {
		const contact = await prisma.contact.findUnique({
			where: { id: contactId },
		});

		if (!contact) {
			throw new AppError(404, "Contact not found", "updateContact");
		}

		if (updates.name) {
			const existingContact = await prisma.contact.findFirst({
				where: {
					name: {
						equals: updates.name,
						mode: "insensitive",
					},
					id: {
						not: contactId,
					},
				},
			});

			if (existingContact) {
				throw new AppError(409, "Contact with this name already exists", "updateContact");
			}

			const nameVariations = generateNameVariations(updates.name);

			const updatedContact = await prisma.contact.update({
				where: { id: contactId },
				data: {
					...updates,
					normalizedName: updates.name.toLowerCase().trim(),
					nameVariations,
				},
			});

			return updatedContact;
		}

		const updatedContact = await prisma.contact.update({
			where: { id: contactId },
			data: updates,
		});

		return updatedContact;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		throw new AppError(
			500,
			`Failed to update contact: ${error instanceof Error ? error.message : "Unknown error"}`,
			"updateContact"
		);
	}
};


export const getAllContacts = async (limit?: number) => {
	try {
		const contacts = await prisma.contact.findMany({
			include: {
				defaultCategory: true,
			},
		});

		// Get transaction counts for all contacts
		const contactsWithCounts = await Promise.all(
			contacts.map(async (contact) => {
				const transactionCount = await prisma.transaction.count({
					where: { contactId: contact.id },
				});

				const lastTransaction = await prisma.transaction.findFirst({
					where: { contactId: contact.id },
					orderBy: { transactionDate: 'desc' },
					select: { transactionDate: true },
				});

				return {
					...contact,
					transactionCount,
					lastTransactionDate: lastTransaction?.transactionDate || null,
				};
			})
		);

		// Sort by transaction count and last transaction date
		const sortedContacts = contactsWithCounts.sort((a, b) => {
			if (b.transactionCount !== a.transactionCount) {
				return b.transactionCount - a.transactionCount;
			}
			if (a.lastTransactionDate && b.lastTransactionDate) {
				return b.lastTransactionDate.getTime() - a.lastTransactionDate.getTime();
			}
			if (a.lastTransactionDate) return -1;
			if (b.lastTransactionDate) return 1;
			return 0;
		});

		return limit ? sortedContacts.slice(0, limit) : sortedContacts;
	} catch (error) {
		throw new AppError(
			500,
			`Failed to get all contacts: ${error instanceof Error ? error.message : "Unknown error"}`,
			"getAllContacts"
		);
	}
};
