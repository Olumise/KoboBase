export const ContactType = {
	PERSON: "person",
	MERCHANT: "merchant",
	BANK: "bank",
	PLATFORM: "platform",
	WALLET: "wallet",
	SYSTEM: "system",
} as const;

export type ContactTypeValue = (typeof ContactType)[keyof typeof ContactType];

export const AccountType = {
	SAVINGS: "savings",
	CURRENT: "current",
	WALLET: "wallet",
	CARD: "card",
	OTHER: "other",
} as const;

export type AccountTypeValue = (typeof AccountType)[keyof typeof AccountType];

export const CONTACT_TYPES = Object.values(ContactType);
export const ACCOUNT_TYPES = Object.values(AccountType);
