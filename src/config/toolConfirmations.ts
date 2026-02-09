export const TOOL_CONFIRMATION_RULES = {
	get_category: { requiresConfirmation: false, canAutoCreate: false },
	create_category: {
		requiresConfirmation: "conditional",
		canAutoCreate: false,
	},
	get_bank_accounts: { requiresConfirmation: false, canAutoCreate: false },
	get_bank_account_by_id: { requiresConfirmation: false, canAutoCreate: false },
	validate_transaction_type: {
		requiresConfirmation: false,
		canAutoCreate: false,
	},

	create_bank_account: { requiresConfirmation: true, canAutoCreate: false },
	get_or_create_contact: {
		requiresConfirmation: "conditional",
		canAutoCreate: false,
	},
} as const;

export function shouldRequireConfirmation(
	toolName: string,
	toolResult?: any
): boolean {
	const rule = TOOL_CONFIRMATION_RULES[toolName as keyof typeof TOOL_CONFIRMATION_RULES];

	if (!rule) return false;

	if (rule.requiresConfirmation === "conditional") {
		return toolResult?.created === true;
	}

	return rule.requiresConfirmation === true;
}

/**
 * Generates a conversational confirmation question for tool calls
 * These messages are user-facing and should be clear and friendly
 */
export function generateConfirmationQuestion(
	toolName: string,
	args: Record<string, any>,
	result?: any
): string {
	switch (toolName) {
		case "create_bank_account":
			return `I noticed a new bank account: "${args.bankName}" (${args.accountNumber}). Would you like me to add this to your accounts for future tracking?`;

		case "create_category":
			if (result?.created) {
				return `I'd like to create a new category called "${args.categoryName}" for this transaction. Does that sound good?`;
			}
			break;

		case "get_or_create_contact":
			if (result?.created) {
				return `I found a new contact: "${args.contactName}". Should I save them to your contacts so we can track future transactions together?`;
			}
			break;
	}

	// Generic fallback (should rarely be used)
	return `I'd like to perform this action: ${toolName}. Is that okay?`;
}
