/**
 * User Data Type Definitions
 *
 * Types for comprehensive user bio and genetic data stored in the User Data CRM
 */

/**
 * BioData - Biological/demographic information about the user
 */
export interface BioData {
  /** User's age in years */
  age?: number;

  /** User's biological sex */
  gender?: 'male' | 'female' | 'other';

  /** Height in centimeters */
  height?: number;

  /** Weight in kilograms */
  weight?: number;

  /** Medical history summary */
  medicalHistory?: string[];

  /** Current medications */
  currentMedications?: string[];

  /** Known allergies */
  allergies?: string[];
}

/**
 * GeneticData - Genetic and hereditary information
 */
export interface GeneticData {
  /** Blood type (A+, A-, B+, B-, AB+, AB-, O+, O-) */
  bloodType?: string;

  /** Genetic conditions or predispositions */
  geneticConditions?: string[];

  /** Family history of diseases */
  familyHistory?: string[];

  /** Genetic markers (simplified for demo) */
  markers?: Record<string, string>;
}

/**
 * UserData - Complete user profile with bio and genetic data
 */
export interface UserData {
  /** Unique user identifier (can match leadId) */
  userId: string;

  /** Phone number in E.164 format */
  phoneNumber: string;

  /** User's full name */
  name: string;

  /** Biological data */
  bioData: BioData;

  /** Genetic data */
  geneticData: GeneticData;

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

  /** Partial bio data to update */
  bioData?: Partial<BioData>;

  /** Partial genetic data to update */
  geneticData?: Partial<GeneticData>;
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
