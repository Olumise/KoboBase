/**
 * Question Formatter Utility
 *
 * This utility provides structured question formatting for user interactions
 * during receipt processing. It ensures questions are clear, conversational,
 * and include helpful hints and suggestions.
 */

export interface StructuredQuestion {
  field: string;
  question: string;
  suggestions?: any[];
  hint?: string;
}

/**
 * Creates a structured question object
 */
export function formatQuestion(
  field: string,
  baseQuestion: string,
  suggestions?: any[],
  hint?: string
): StructuredQuestion {
  return {
    field,
    question: baseQuestion,
    suggestions,
    hint,
  };
}

/**
 * Predefined questions for common transaction fields
 * These questions are conversational and include helpful hints
 */
export const FIELD_QUESTIONS: Record<string, StructuredQuestion> = {
  transaction_type: formatQuestion(
    "transaction_type",
    "What type of transaction is this?",
    ["income", "expense", "transfer", "refund", "fee", "adjustment"],
    "Choose the option that best describes this transaction"
  ),

  payment_method: formatQuestion(
    "payment_method",
    "How was this payment made?",
    ["cash", "transfer", "card"],
    "This helps us categorize and track your spending patterns"
  ),

  transaction_reference: formatQuestion(
    "transaction_reference",
    "What's the transaction reference number?",
    [],
    "Don't worry - we can create one for you if it's not on the receipt"
  ),

  description: formatQuestion(
    "description",
    "Could you describe what this transaction was for?",
    [],
    'A brief note like "Groceries at Safeway" or "Uber ride home" works great'
  ),

  amount: formatQuestion(
    "amount",
    "What was the transaction amount?",
    [],
    "Please enter the number without currency symbols"
  ),

  date: formatQuestion(
    "date",
    "When did this transaction occur?",
    [],
    'You can use formats like "Jan 15 2026", "2026-01-15", or "yesterday"'
  ),

  transaction_date: formatQuestion(
    "transaction_date",
    "When did this transaction occur?",
    [],
    'You can use formats like "Jan 15 2026", "2026-01-15", or "yesterday"'
  ),

  merchant_name: formatQuestion(
    "merchant_name",
    "What's the name of the business or person you transacted with?",
    [],
    "We can save this for future transactions"
  ),

  category: formatQuestion(
    "category",
    "Which category does this transaction belong to?",
    [],
    "We can create a new category if you don't have one that fits"
  ),

  category_id: formatQuestion(
    "category_id",
    "Which category does this transaction belong to?",
    [],
    "We can create a new category if you don't have one that fits"
  ),

  bank_account: formatQuestion(
    "bank_account",
    "Which account was this transaction made from?",
    [],
    "We can add a new account if it's not in your list"
  ),

  bank_account_id: formatQuestion(
    "bank_account_id",
    "Which account was this transaction made from?",
    [],
    "We can add a new account if it's not in your list"
  ),

  contact_name: formatQuestion(
    "contact_name",
    "Who did you transact with?",
    [],
    "We can save this contact for future reference"
  ),

  currency: formatQuestion(
    "currency",
    "What currency was used for this transaction?",
    ["USD", "EUR", "GBP", "NGN"],
    'Enter the 3-letter currency code (e.g., "USD", "NGN")'
  ),

  tags: formatQuestion(
    "tags",
    "Would you like to add any tags to help organize this transaction?",
    [],
    "Tags help you find and group similar transactions later"
  ),

  notes: formatQuestion(
    "notes",
    "Any additional notes about this transaction?",
    [],
    "Feel free to add any context that might be helpful later"
  ),
};

/**
 * Generates a structured question for a given field
 * Uses predefined questions if available, otherwise creates a generic one
 */
export function generateQuestionForField(field: string): StructuredQuestion {
  // Check if we have a predefined question for this field
  if (FIELD_QUESTIONS[field]) {
    return FIELD_QUESTIONS[field];
  }

  // Generate a generic question for unknown fields
  const formattedFieldName = field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return formatQuestion(
    field,
    `Could you provide the ${formattedFieldName.toLowerCase()}?`,
    [],
    "This information will help us process your transaction accurately"
  );
}

/**
 * Converts an array of field names to structured questions
 */
export function convertFieldsToQuestions(
  fields: string[]
): StructuredQuestion[] {
  return fields.map((field) => generateQuestionForField(field));
}

/**
 * Converts legacy string questions to structured format
 * This helps with backward compatibility
 */
export function convertLegacyQuestion(
  question: string,
  field?: string
): StructuredQuestion {
  return {
    field: field || "unknown",
    question,
    suggestions: [],
    hint: undefined,
  };
}
