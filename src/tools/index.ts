import { getCategoryTool } from "./category";
import { getOrCreateContactTool } from "./contact";
import { getBankAccountsTool, getBankAccountByIdTool } from "./bank";
import { validateTransactionTypeTool } from "./transaction";

export const allAITools = [
	getCategoryTool,
	getOrCreateContactTool,
	getBankAccountsTool,
	getBankAccountByIdTool,
	validateTransactionTypeTool,
];

export const toolsByName = {
	get_category: getCategoryTool,
	get_or_create_contact: getOrCreateContactTool,
	get_bank_accounts: getBankAccountsTool,
	get_bank_account_by_id: getBankAccountByIdTool,
	validate_transaction_type: validateTransactionTypeTool,
} as const;

export type ToolName = keyof typeof toolsByName;

export {
	getCategoryTool,
	getOrCreateContactTool,
	getBankAccountsTool,
	getBankAccountByIdTool,
	validateTransactionTypeTool,
};
