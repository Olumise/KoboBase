import { getOrCreateCategoryTool } from "./category";
import { getOrCreateContactTool } from "./contact";
import { getBankAccountsTool, createBankAccountTool } from "./bank";
import { validateTransactionTypeTool } from "./transaction";

export const allAITools = [
	getOrCreateCategoryTool,
	getOrCreateContactTool,
	getBankAccountsTool,
	createBankAccountTool,
	validateTransactionTypeTool,
];

export const toolsByName = {
	get_or_create_category: getOrCreateCategoryTool,
	get_or_create_contact: getOrCreateContactTool,
	get_bank_accounts: getBankAccountsTool,
	create_bank_account: createBankAccountTool,
	validate_transaction_type: validateTransactionTypeTool,
} as const;

export type ToolName = keyof typeof toolsByName;

export {
	getOrCreateCategoryTool,
	getOrCreateContactTool,
	getBankAccountsTool,
	createBankAccountTool,
	validateTransactionTypeTool,
};
