import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';
import { formTokensDatabase, addFormToken, getFormToken, markTokenAsUsed } from '../data/formTokens.data';

/**
 * Token Service for managing secure form access tokens
 * Generates unique tokens for form URLs and validates them on submission
 */

export interface FormToken {
  token: string;
  phoneNumber: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
}

const TOKEN_EXPIRY_HOURS = 24; // Form links expire after 24 hours

/**
 * Generate a new form token for a phone number
 * @param phoneNumber - Phone number in E.164 format
 * @returns FormToken object with unique token
 */
export function generateFormToken(phoneNumber: string): FormToken {
  const token = uuidv4();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  const formToken: FormToken = {
    token,
    phoneNumber,
    createdAt,
    expiresAt,
    used: false,
  };

  addFormToken(formToken);
  logger.info(`Generated form token for ${phoneNumber}: ${token} (expires at ${expiresAt.toISOString()})`);

  return formToken;
}

/**
 * Validate a form token
 * @param token - Token string to validate
 * @returns Object with validation result and associated phone number
 */
export function validateFormToken(token: string): {
  valid: boolean;
  phoneNumber?: string;
  error?: string;
} {
  const formToken = getFormToken(token);

  if (!formToken) {
    logger.warn(`Token validation failed: Token not found - ${token}`);
    return { valid: false, error: 'Invalid token' };
  }

  if (formToken.used) {
    logger.warn(`Token validation failed: Token already used - ${token}`);
    return { valid: false, error: 'Token has already been used' };
  }

  const now = new Date();
  if (now > formToken.expiresAt) {
    logger.warn(`Token validation failed: Token expired - ${token}`);
    return { valid: false, error: 'Token has expired' };
  }

  logger.info(`Token validated successfully for ${formToken.phoneNumber}`);
  return { valid: true, phoneNumber: formToken.phoneNumber };
}

/**
 * Mark a token as used after successful form submission
 * @param token - Token string to mark as used
 * @returns boolean - True if marked successfully
 */
export function useFormToken(token: string): boolean {
  const formToken = getFormToken(token);

  if (!formToken) {
    logger.error(`Cannot mark token as used: Token not found - ${token}`);
    return false;
  }

  markTokenAsUsed(token);
  logger.info(`Token marked as used: ${token}`);
  return true;
}

/**
 * Build full form URL with token
 * @param baseUrl - Base URL of the application (ngrok URL)
 * @param token - Generated token
 * @returns Full form URL
 */
export function buildFormUrl(baseUrl: string, token: string): string {
  // Remove trailing slash from base URL
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');

  // Encode parameters
  const encodedToken = encodeURIComponent(token);

  return `${cleanBaseUrl}/form.html?token=${encodedToken}`;
}

/**
 * Clean up expired tokens (can be run periodically)
 * @returns Number of tokens removed
 */
export function cleanupExpiredTokens(): number {
  const now = new Date();
  let removed = 0;

  for (const [token, formToken] of Object.entries(formTokensDatabase)) {
    if (now > formToken.expiresAt) {
      delete formTokensDatabase[token];
      removed++;
    }
  }

  if (removed > 0) {
    logger.info(`Cleaned up ${removed} expired form tokens`);
  }

  return removed;
}

// Run cleanup every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);
