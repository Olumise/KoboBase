import { ContactType, ContactTypeValue } from "../constants/types";

export interface ContactTypeKeywords {
	type: ContactTypeValue;
	keywords: string[];
	priority: number;
}

export const CONTACT_TYPE_KEYWORDS: ContactTypeKeywords[] = [
	{
		type: ContactType.BANK,
		keywords: [
			"bank", "banking", "gtbank", "access bank", "zenith", "first bank",
			"uba", "union bank", "fidelity", "stanbic", "fcmb", "wema",
			"sterling", "ecobank", "polaris", "heritage", "keystone",
			"providus", "jaiz", "suntrust", "citibank", "standard chartered", "opay", "palmpay", "kuda", "moniepoint", 
		],
		priority: 1,
	},
	{
		type: ContactType.WALLET,
		keywords: [
			"paga", "chipper",
			"carbon", "fairmoney", "renmoney", "branch", "vbank",
			"payday", "alat", "rubies", "sparkle"
		],
		priority: 2,
	},
	{
		type: ContactType.PLATFORM,
		keywords: [
			"paystack", "flutterwave", "stripe", "remita", "interswitch",
			"quickteller", "nibss", "gtpay", "voguepay", "rave",
			"monnify", "squad", "checkout", "amplify pay"
		],
		priority: 3,
	},
	{
		type: ContactType.MERCHANT,
		keywords: [
			"purchase", "payment", "store", "shop", "mart", "supermarket",
			"restaurant", "cafe", "hotel", "pharmacy", "boutique",
			"bookstore", "mall", "market", "pos", "retail", "vendor",
			"amazon", "jumia", "konga", "jiji", "aliexpress", "ebay",
			"uber", "bolt", "netflix", "spotify", "dstv", "startimes",
			"airtel", "mtn", "glo", "9mobile"
		],
		priority: 4,
	},
];

export const addCustomKeywords = (
	type: ContactTypeValue,
	keywords: string[]
): void => {
	const existingEntry = CONTACT_TYPE_KEYWORDS.find(entry => entry.type === type);

	if (existingEntry) {
		const lowercaseKeywords = keywords.map(k => k.toLowerCase());
		const uniqueKeywords = lowercaseKeywords.filter(
			k => !existingEntry.keywords.includes(k)
		);
		existingEntry.keywords.push(...uniqueKeywords);
	} else {
		CONTACT_TYPE_KEYWORDS.push({
			type,
			keywords: keywords.map(k => k.toLowerCase()),
			priority: CONTACT_TYPE_KEYWORDS.length + 1,
		});
	}
};

export const getKeywordsForType = (type: ContactTypeValue): string[] => {
	const entry = CONTACT_TYPE_KEYWORDS.find(entry => entry.type === type);
	return entry ? entry.keywords : [];
};

export const getAllContactTypes = (): ContactTypeValue[] => {
	return CONTACT_TYPE_KEYWORDS
		.sort((a, b) => a.priority - b.priority)
		.map(entry => entry.type);
};
