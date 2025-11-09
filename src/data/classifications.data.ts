/**
 * Mock Classification Data
 *
 * Storage for classification results.
 * Starts empty and gets populated as users are classified.
 */

import { Classification } from '../types/classification.types';

/**
 * In-memory storage for classification results
 * Exported as mutable array so results can be added during runtime
 */
export const classificationsDatabase: Classification[] = [];

/**
 * Helper function to find classification by user ID
 *
 * @param userId - User ID to search for
 * @returns Classification if found, undefined otherwise
 */
export const findClassificationByUserId = (userId: string): Classification | undefined => {
  return classificationsDatabase.find((c) => c.userId === userId);
};

/**
 * Helper function to save or update a classification result
 *
 * @param classification - Classification to save
 * @returns Saved classification
 */
export const saveClassification = (classification: Classification): Classification => {
  // Check if classification already exists for this user
  const existingIndex = classificationsDatabase.findIndex((c) => c.userId === classification.userId);

  if (existingIndex !== -1) {
    // Update existing classification
    classificationsDatabase[existingIndex] = classification;
    return classification;
  }

  // Add new classification
  classificationsDatabase.push(classification);
  return classification;
};

/**
 * Helper function to get all classifications
 *
 * @returns All classifications
 */
export const getAllClassifications = (): Classification[] => {
  return classificationsDatabase;
};
