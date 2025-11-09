import { FormToken } from '../services/token.service';

/**
 * In-memory database for form tokens
 * Stores temporary tokens for secure form access
 *
 * Structure: { [token: string]: FormToken }
 */

export const formTokensDatabase: { [token: string]: FormToken } = {};

/**
 * Add a new form token to the database
 * @param formToken - FormToken object to add
 */
export function addFormToken(formToken: FormToken): void {
  formTokensDatabase[formToken.token] = formToken;
}

/**
 * Get a form token by token string
 * @param token - Token string to look up
 * @returns FormToken if found, undefined otherwise
 */
export function getFormToken(token: string): FormToken | undefined {
  return formTokensDatabase[token];
}

/**
 * Mark a token as used
 * @param token - Token string to mark as used
 */
export function markTokenAsUsed(token: string): void {
  const formToken = formTokensDatabase[token];
  if (formToken) {
    formToken.used = true;
  }
}

/**
 * Get all tokens for a specific phone number
 * @param phoneNumber - Phone number to search for
 * @returns Array of FormToken objects
 */
export function getTokensByPhoneNumber(phoneNumber: string): FormToken[] {
  return Object.values(formTokensDatabase).filter(
    (token) => token.phoneNumber === phoneNumber
  );
}

/**
 * Delete a token from the database
 * @param token - Token string to delete
 * @returns boolean - True if deleted, false if not found
 */
export function deleteFormToken(token: string): boolean {
  if (formTokensDatabase[token]) {
    delete formTokensDatabase[token];
    return true;
  }
  return false;
}

/**
 * Get all tokens (for debugging/monitoring)
 * @returns Array of all FormToken objects
 */
export function getAllFormTokens(): FormToken[] {
  return Object.values(formTokensDatabase);
}
