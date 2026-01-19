import { ContactType } from "../../generated/prisma/client";
import {
	CONTACT_TYPE_KEYWORDS,
	addCustomKeywords,
	getKeywordsForType,
	getAllContactTypes
} from "../lib/contactTypeKeywords";
import { AppError } from "../middlewares/errorHandler";

export const getContactTypeKeywords = (type?: ContactType) => {
	try {
		if (type) {
			const keywords = getKeywordsForType(type);
			return {
				type,
				keywords,
				total: keywords.length,
			};
		}

		return {
			types: CONTACT_TYPE_KEYWORDS.map(entry => ({
				type: entry.type,
				keywords: entry.keywords,
				total: entry.keywords.length,
				priority: entry.priority,
			})),
			totalTypes: CONTACT_TYPE_KEYWORDS.length,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to get contact type keywords: ${error instanceof Error ? error.message : "Unknown error"}`,
			"getContactTypeKeywords"
		);
	}
};

interface AddKeywordsInput {
	type: ContactType;
	keywords: string[];
}

export const addKeywordsToContactType = (input: AddKeywordsInput) => {
	const { type, keywords } = input;

	if (!type || !keywords || keywords.length === 0) {
		throw new AppError(400, "Contact type and keywords are required", "addKeywordsToContactType");
	}

	try {
		addCustomKeywords(type, keywords);

		return {
			type,
			addedKeywords: keywords,
			totalKeywords: getKeywordsForType(type).length,
			message: `Successfully added ${keywords.length} keyword(s) to ${type}`,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to add keywords: ${error instanceof Error ? error.message : "Unknown error"}`,
			"addKeywordsToContactType"
		);
	}
};

export const listAllContactTypes = () => {
	try {
		const types = getAllContactTypes();

		return {
			types,
			total: types.length,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to list contact types: ${error instanceof Error ? error.message : "Unknown error"}`,
			"listAllContactTypes"
		);
	}
};

interface SearchKeywordInput {
	keyword: string;
}

export const searchKeyword = (input: SearchKeywordInput) => {
	const { keyword } = input;

	if (!keyword) {
		throw new AppError(400, "Keyword is required", "searchKeyword");
	}

	try {
		const normalizedKeyword = keyword.toLowerCase().trim();
		const matches = [];

		for (const entry of CONTACT_TYPE_KEYWORDS) {
			const matchingKeywords = entry.keywords.filter(k =>
				k.includes(normalizedKeyword) || normalizedKeyword.includes(k)
			);

			if (matchingKeywords.length > 0) {
				matches.push({
					type: entry.type,
					matchingKeywords,
					priority: entry.priority,
				});
			}
		}

		return {
			searchTerm: keyword,
			matches,
			total: matches.length,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to search keyword: ${error instanceof Error ? error.message : "Unknown error"}`,
			"searchKeyword"
		);
	}
};

interface TestContactTypeInput {
	bankName?: string;
	description?: string;
}

export const testContactTypeDetection = (input: TestContactTypeInput) => {
	const { bankName, description } = input;

	try {
		const searchText = `${bankName || ""} ${description || ""}`.toLowerCase();
		const matches = [];

		for (const entry of CONTACT_TYPE_KEYWORDS) {
			const matchingKeywords = entry.keywords.filter(keyword =>
				searchText.includes(keyword)
			);

			if (matchingKeywords.length > 0) {
				matches.push({
					type: entry.type,
					matchingKeywords,
					priority: entry.priority,
					confidence: matchingKeywords.length / entry.keywords.length,
				});
			}
		}

		const detectedType = matches.length > 0 ? matches[0].type : ContactType.PERSON;

		return {
			input: {
				bankName,
				description,
			},
			detectedType,
			matches,
			totalMatches: matches.length,
		};
	} catch (error) {
		throw new AppError(
			500,
			`Failed to test contact type detection: ${error instanceof Error ? error.message : "Unknown error"}`,
			"testContactTypeDetection"
		);
	}
};
