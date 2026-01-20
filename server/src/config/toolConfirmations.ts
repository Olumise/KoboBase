import { ToolName } from "../tools";

export const TOOL_CONFIRMATION_RULES = {
	get_category: { requiresConfirmation: false, canAutoCreate: false },
	create_category: {
		requiresConfirmation: "conditional",
		canAutoCreate: false,
	},
	get_bank_accounts: { requiresConfirmation: false, canAutoCreate: false },
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
	const rule = TOOL_CONFIRMATION_RULES[toolName as ToolName];

	if (!rule) return false;

	if (rule.requiresConfirmation === true) return true;
	if (rule.requiresConfirmation === false) return false;

	if (rule.requiresConfirmation === "conditional") {
		return toolResult?.created === true;
	}

	return false;
}

export function generateConfirmationQuestion(
	toolName: string,
	args: Record<string, any>,
	result?: any
): string {
	switch (toolName) {
		case "create_bank_account":
			return `I found a new bank account "${args.bankName} - ${args.accountNumber}". Should I add this to your accounts?`;

		case "create_category":
			if (result?.created) {
				return `I want to create a new category "${args.categoryName}". Should I create this category?`;
			}
			break;

		case "get_or_create_contact":
			if (result?.created) {
				return `I found a new contact "${args.contactName}". Should I save this contact?`;
			}
			break;
	}

	return `Confirm action: ${toolName}`;
}
