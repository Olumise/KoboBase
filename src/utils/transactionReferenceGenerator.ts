import { randomBytes } from 'crypto';

/**
 * Generates a unique transaction reference if one is not provided
 * Format: TXN-{timestamp}-{random}
 * Example: TXN-20260207-A1B2C3D4
 */
export function generateTransactionReference(): string {
	const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
	const randomStr = randomBytes(4).toString('hex').toUpperCase();
	return `TXN-${timestamp}-${randomStr}`;
}

/**
 * Validates if a transaction reference exists and generates one if missing
 * @param reference - The transaction reference to validate
 * @returns A valid transaction reference
 */
export function ensureTransactionReference(reference: string | null | undefined): string {
	if (!reference || reference.trim() === '' || reference.toLowerCase() === 'missing') {
		return generateTransactionReference();
	}
	return reference.trim();
}
