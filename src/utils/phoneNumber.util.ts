/**
 * Phone Number Utility Functions
 *
 * Provides reusable functions for phone number normalization and validation.
 * VAPI provides phone numbers in E.164 format (e.g., +1234567890)
 */

import logger from '../config/logger';

/**
 * Normalize a phone number to E.164 format
 *
 * E.164 is the international standard format: +[country code][number]
 * Example: +12025551234 (US number)
 *
 * @param phoneNumber - Phone number in any format
 * @returns Normalized phone number with + prefix, or original if already formatted
 */
export const normalizePhoneNumber = (phoneNumber: string): string => {
  logger.debug({ phoneNumber, action: 'normalizePhoneNumber' }, 'Normalizing phone number');

  // Remove all non-digit characters except leading +
  let normalized = phoneNumber.trim();

  // If already in E.164 format (starts with +), return as-is
  if (normalized.startsWith('+')) {
    logger.debug({ normalized }, 'Phone number already in E.164 format');
    return normalized;
  }

  // If doesn't start with +, add it (assuming number is already in correct format)
  // In production, you might want more sophisticated country code detection
  normalized = `+${normalized.replace(/\D/g, '')}`;

  logger.debug({ original: phoneNumber, normalized }, 'Phone number normalized');
  return normalized;
};

/**
 * Validate phone number format
 *
 * Checks if phone number is in valid E.164 format:
 * - Starts with +
 * - Contains only digits after +
 * - Length between 8 and 15 digits (international standard)
 *
 * @param phoneNumber - Phone number to validate
 * @returns true if valid, false otherwise
 */
export const isValidPhoneNumber = (phoneNumber: string): boolean => {
  logger.debug({ phoneNumber, action: 'isValidPhoneNumber' }, 'Validating phone number');

  // E.164 format: + followed by 8-15 digits
  const e164Regex = /^\+\d{8,15}$/;
  const isValid = e164Regex.test(phoneNumber);

  logger.debug({ phoneNumber, isValid }, 'Phone number validation result');
  return isValid;
};

/**
 * Compare two phone numbers for equality
 *
 * Normalizes both numbers before comparison to handle different formats
 *
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns true if phone numbers match, false otherwise
 */
export const arePhoneNumbersEqual = (phone1: string, phone2: string): boolean => {
  const normalized1 = normalizePhoneNumber(phone1);
  const normalized2 = normalizePhoneNumber(phone2);

  const areEqual = normalized1 === normalized2;

  logger.debug(
    { phone1, phone2, normalized1, normalized2, areEqual },
    'Phone number comparison result'
  );

  return areEqual;
};

/**
 * Mask phone number for logging (security)
 *
 * Masks all but last 4 digits for privacy in logs
 * Example: +12025551234 -> +1202555****
 *
 * @param phoneNumber - Phone number to mask
 * @returns Masked phone number
 */
export const maskPhoneNumber = (phoneNumber: string): string => {
  if (!phoneNumber || phoneNumber.length < 4) {
    return '****';
  }

  const visiblePart = phoneNumber.slice(0, -4);
  const maskedPart = '****';

  return visiblePart + maskedPart;
};
