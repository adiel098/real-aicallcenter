/**
 * User Data Type Definitions
 *
 * Types for Medicare member data and eligibility information
 */

/**
 * MedicareData - Medicare member demographics and health information
 */
export interface MedicareData {
  /** User's age in years */
  age?: number;

  /** Date of birth in YYYY-MM-DD format (REQUIRED for Medicare verification per Task.txt) */
  dateOfBirth?: string;

  /** City of residence (for initial screening verification) */
  city?: string;

  /** Street address (REQUIRED per Task.txt) */
  address?: string;

  /** State code (e.g., "MD", "VA") (REQUIRED per Task.txt) */
  state?: string;

  /** ZIP code (5 or 9 digit) (REQUIRED per Task.txt) */
  zipCode?: string;

  /** Email address for contact (REQUIRED per Task.txt) */
  email?: string;

  /** Last 4 digits of SSN for verification (optional) */
  ssnLast4?: string;

  /** Medicare Beneficiary Identifier (MBI) - format: 1AB2-CD3-EF45 */
  medicareNumber?: string;

  /** Medicare plan level */
  planLevel?: 'A' | 'B' | 'C' | 'D' | 'Advantage';

  /** Whether user has been diagnosed with colorblindness */
  hasColorblindness?: boolean;

  /** Type of colorblindness (e.g., red-green, blue-yellow, total) */
  colorblindType?: string;

  /** Current eyewear status */
  currentEyewear?: string;

  /** Relevant medical history */
  medicalHistory?: string[];

  /** Current medications */
  currentMedications?: string[];
}

/**
 * EligibilityData - Medicare eligibility and subscription information
 */
export interface EligibilityData {
  /** Whether user is eligible for premium eyewear subscription */
  isEligibleForPremiumEyewear?: boolean;

  /** Timestamp when eligibility was last checked */
  eligibilityCheckedAt?: string;

  /** Current plan eligibility status */
  planEligibilityStatus?: 'QUALIFIED' | 'NOT_QUALIFIED' | 'PENDING';

  /** Subscription level the user qualifies for */
  subscriptionLevel?: 'BASIC' | 'PREMIUM' | 'NONE';

  /** MBI validation status */
  mbiValidated?: boolean;

  /** Plan coverage details */
  planCoverageDetails?: string;
}

/**
 * UserData - Complete user profile with Medicare and eligibility data
 */
export interface UserData {
  /** Unique user identifier (can match leadId) */
  userId: string;

  /** Primary phone number in E.164 format (used for initial registration) */
  phoneNumber: string;

  /** Additional phone numbers associated with this user (for multi-device recognition) */
  alternatePhones?: string[];

  /** User's full name */
  name: string;

  /** Medicare member data */
  medicareData: MedicareData;

  /** Eligibility information */
  eligibilityData: EligibilityData;

  /** List of fields that are missing/incomplete */
  missingFields: string[];

  /** When this record was last updated */
  lastUpdated: string; // ISO 8601 date string
}

/**
 * UserDataUpdateRequest - Request body for updating user data
 */
export interface UserDataUpdateRequest {
  /** Phone number to identify the user */
  phoneNumber: string;

  /** Partial Medicare data to update */
  medicareData?: Partial<MedicareData>;

  /** Partial eligibility data to update */
  eligibilityData?: Partial<EligibilityData>;
}

/**
 * UserDataResponse - API response when retrieving user data
 */
export interface UserDataResponse {
  /** Whether user data was found */
  found: boolean;

  /** User data if found */
  userData: UserData | null;

  /** Whether all required fields are complete */
  isComplete: boolean;

  /** List of missing required fields */
  missingFields: string[];

  /** Optional message */
  message?: string;
}
