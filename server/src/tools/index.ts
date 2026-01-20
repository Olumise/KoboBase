import { getCategoryTool, createCategoryTool } from "./category";
import { getOrCreateContactTool } from "./contact";
import { getBankAccountsTool, createBankAccountTool } from "./bank";
import { validateTransactionTypeTool } from "./transaction";

export const allAITools = [
	getCategoryTool,
	createCategoryTool,
	getOrCreateContactTool,
	getBankAccountsTool,
	createBankAccountTool,
	validateTransactionTypeTool,
];

export const toolsByName = {
	get_category: getCategoryTool,
	create_category: createCategoryTool,
	get_or_create_contact: getOrCreateContactTool,
	get_bank_accounts: getBankAccountsTool,
	create_bank_account: createBankAccountTool,
	validate_transaction_type: validateTransactionTypeTool,
} as const;

export type ToolName = keyof typeof toolsByName;

export {
	getCategoryTool,
	createCategoryTool,
	getOrCreateContactTool,
	getBankAccountsTool,
	createBankAccountTool,
	validateTransactionTypeTool,
};
