/**
 * Lead Type Definitions
 *
 * Types for lead data stored in the Lead CRM system
 */

/**
 * Lead - Basic lead information
 *
 * Represents a potential customer in the CRM system.
 * Used for initial phone number lookup when a call comes in.
 */
export interface Lead {
  /** Unique identifier for the lead */
  leadId: string;

  /** Primary phone number in E.164 format (e.g., +12025551234) */
  phoneNumber: string;

  /** Additional phone numbers associated with this lead (for multi-device recognition) */
  alternatePhones?: string[];

  /** Lead's full name */
  name: string;

  /** Lead's email address */
  email: string;

  /** City of residence (for initial screening verification) */
  city?: string;

  /** Whether name has been verified during call */
  verifiedName?: boolean;

  /** Whether city has been verified during call */
  verifiedCity?: boolean;

  /** When this lead was created/added to the system */
  createdAt: string; // ISO 8601 date string

  /** Lead source (optional) - where did this lead come from? */
  source?: string;

  /** Additional notes about the lead (optional) */
  notes?: string;
}

/**
 * LeadLookupResponse - API response when looking up a lead
 */
export interface LeadLookupResponse {
  /** Whether the lead was found */
  found: boolean;

  /** Lead data if found, null otherwise */
  lead: Lead | null;

  /** Optional message */
  message?: string;
}
