/**
 * Application Constants
 *
 * Centralized configuration for ports, API endpoints, and other constants
 * used throughout the application.
 */

// Server Ports
export const PORTS = {
  VAPI_HANDLER: 3000, // Main VAPI webhook handler
  LEAD_CRM: 3001, // Lead lookup CRM
  USERDATA_CRM: 3002, // User bio/genetic data CRM
  CLASSIFICATION_CRM: 3003, // User classification CRM
} as const;

// API Base URLs (for internal service-to-service communication)
export const API_URLS = {
  LEAD_CRM: `http://localhost:${PORTS.LEAD_CRM}/api`,
  USERDATA_CRM: `http://localhost:${PORTS.USERDATA_CRM}/api`,
  CLASSIFICATION_CRM: `http://localhost:${PORTS.CLASSIFICATION_CRM}/api`,
} as const;

// Classification Results
export const CLASSIFICATION = {
  ACCEPTABLE: 'ACCEPTABLE',
  NOT_ACCEPTABLE: 'NOT_ACCEPTABLE',
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  LEAD_NOT_FOUND: 'Lead not found with the provided phone number',
  USER_NOT_FOUND: 'User data not found',
  INVALID_PHONE: 'Invalid phone number format',
  MISSING_REQUIRED_FIELDS: 'Missing required fields',
  CLASSIFICATION_FAILED: 'Failed to classify user',
  INCOMPLETE_USER_DATA: 'User data is incomplete, cannot classify',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  LEAD_FOUND: 'Lead found successfully',
  USER_DATA_RETRIEVED: 'User data retrieved successfully',
  USER_DATA_UPDATED: 'User data updated successfully',
  CLASSIFICATION_COMPLETE: 'User classification completed',
  RESULT_SAVED: 'Classification result saved successfully',
} as const;

// HTTP Status Codes (for clarity in code)
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;
