/**
 * Classification Type Definitions
 *
 * Types for Medicare eligibility qualification results
 */

import { UserData } from './userData.types';

/**
 * ClassificationResult - Result of Medicare eligibility qualification
 */
export type ClassificationResult = 'QUALIFIED' | 'NOT_QUALIFIED';

/**
 * Classification - Full classification record
 */
export interface Classification {
  /** Unique classification ID */
  classificationId: string;

  /** User ID being classified */
  userId: string;

  /** Phone number of the user */
  phoneNumber: string;

  /** Classification result */
  result: ClassificationResult;

  /** Score (0-100) - higher means more acceptable */
  score: number;

  /** Detailed reason for the classification */
  reason: string;

  /** Factors that contributed to the decision */
  factors: {
    /** Factor name (e.g., "age", "medical_history") */
    name: string;
    /** Impact on score (positive or negative) */
    impact: 'positive' | 'negative' | 'neutral';
    /** Description of why this factor matters */
    description: string;
  }[];

  /** When this classification was created */
  createdAt: string; // ISO 8601 date string
}

/**
 * ClassificationRequest - Request to classify a user
 */
export interface ClassificationRequest {
  /** User data to classify */
  userData: UserData;
}

/**
 * ClassificationResponse - Response from classification API
 */
export interface ClassificationResponse {
  /** Whether classification was successful */
  success: boolean;

  /** Classification result */
  classification: Classification | null;

  /** Optional error message */
  message?: string;
}

/**
 * UpdateClassificationResultRequest - Request to save classification result
 */
export interface UpdateClassificationResultRequest {
  /** User ID */
  userId: string;

  /** Phone number */
  phoneNumber: string;

  /** Classification result */
  result: ClassificationResult;

  /** Classification score */
  score: number;

  /** Reason for classification */
  reason: string;
}
