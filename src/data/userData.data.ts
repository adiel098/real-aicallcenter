/**
 * Mock User Data
 *
 * Sample user bio and genetic data for testing.
 * Some users have complete data, others have missing fields to simulate real scenarios.
 */

import { UserData } from '../types/userData.types';

/**
 * In-memory storage for user data
 * Exported as mutable array so it can be updated during runtime
 */
export const userDataDatabase: UserData[] = [
  {
    userId: 'lead-001', // Matches John Smith
    phoneNumber: '+12025551001',
    name: 'John Smith',
    bioData: {
      age: 45,
      gender: 'male',
      height: 180,
      weight: 85,
      medicalHistory: ['hypertension', 'diabetes type 2'],
      currentMedications: ['metformin', 'lisinopril'],
      allergies: ['penicillin'],
    },
    geneticData: {
      bloodType: 'A+',
      geneticConditions: ['predisposition to heart disease'],
      familyHistory: ['diabetes', 'heart disease'],
      markers: {
        BRCA1: 'negative',
        APOE: 'e3/e4',
      },
    },
    missingFields: [], // Complete data
    lastUpdated: '2024-01-15T10:30:00Z',
  },
  {
    userId: 'lead-002', // Matches Sarah Johnson
    phoneNumber: '+12025551002',
    name: 'Sarah Johnson',
    bioData: {
      age: 32,
      gender: 'female',
      height: 165,
      weight: 60,
      medicalHistory: [],
      currentMedications: [],
      allergies: ['shellfish'],
    },
    geneticData: {
      bloodType: 'O-',
      geneticConditions: [],
      familyHistory: ['breast cancer'],
      markers: {
        BRCA1: 'positive',
      },
    },
    missingFields: [], // Complete data
    lastUpdated: '2024-01-16T14:20:00Z',
  },
  {
    userId: 'lead-003', // Matches Michael Chen - INCOMPLETE DATA
    phoneNumber: '+12025551003',
    name: 'Michael Chen',
    bioData: {
      age: 28,
      gender: 'male',
      // Missing: height, weight
      medicalHistory: [],
      currentMedications: [],
      // Missing: allergies
    },
    geneticData: {
      // Missing: bloodType
      geneticConditions: [],
      familyHistory: [],
      // Missing: markers
    },
    missingFields: ['bioData.height', 'bioData.weight', 'bioData.allergies', 'geneticData.bloodType'],
    lastUpdated: '2024-01-17T09:15:00Z',
  },
  {
    userId: 'lead-004', // Matches Emily Davis - INCOMPLETE DATA
    phoneNumber: '+12025551004',
    name: 'Emily Davis',
    bioData: {
      age: 55,
      gender: 'female',
      height: 170,
      // Missing: weight
      medicalHistory: ['osteoporosis'],
      currentMedications: ['calcium supplement', 'vitamin D'],
      allergies: [],
    },
    geneticData: {
      bloodType: 'B+',
      // Missing: geneticConditions, familyHistory
    },
    missingFields: ['bioData.weight', 'geneticData.familyHistory'],
    lastUpdated: '2024-01-18T16:45:00Z',
  },
  {
    userId: 'lead-005', // Matches David Wilson
    phoneNumber: '+12025551005',
    name: 'David Wilson',
    bioData: {
      age: 38,
      gender: 'male',
      height: 175,
      weight: 78,
      medicalHistory: ['asthma'],
      currentMedications: ['albuterol inhaler'],
      allergies: ['pollen', 'dust'],
    },
    geneticData: {
      bloodType: 'AB+',
      geneticConditions: [],
      familyHistory: ['asthma', 'allergies'],
      markers: {
        CFTR: 'negative',
      },
    },
    missingFields: [], // Complete data
    lastUpdated: '2024-01-19T11:00:00Z',
  },
  {
    userId: 'lead-006', // Matches Lisa Anderson - VERY INCOMPLETE
    phoneNumber: '+12025551006',
    name: 'Lisa Anderson',
    bioData: {
      age: 29,
      gender: 'female',
      // Most fields missing
    },
    geneticData: {
      // All fields missing
    },
    missingFields: [
      'bioData.height',
      'bioData.weight',
      'bioData.medicalHistory',
      'bioData.allergies',
      'geneticData.bloodType',
      'geneticData.familyHistory',
    ],
    lastUpdated: '2024-01-20T13:30:00Z',
  },
];

/**
 * Helper function to find user data by phone number
 *
 * @param phoneNumber - Phone number in E.164 format
 * @returns UserData if found, undefined otherwise
 */
export const findUserDataByPhoneNumber = (phoneNumber: string): UserData | undefined => {
  return userDataDatabase.find((user) => user.phoneNumber === phoneNumber);
};

/**
 * Helper function to update user data
 * Merges new data with existing data and recalculates missing fields
 *
 * @param phoneNumber - Phone number to identify user
 * @param updates - Partial updates to apply
 * @returns Updated UserData if found, undefined otherwise
 */
export const updateUserData = (
  phoneNumber: string,
  updates: { bioData?: Record<string, unknown>; geneticData?: Record<string, unknown> }
): UserData | undefined => {
  const userIndex = userDataDatabase.findIndex((user) => user.phoneNumber === phoneNumber);

  if (userIndex === -1) {
    return undefined;
  }

  const user = userDataDatabase[userIndex];

  // Merge updates
  if (updates.bioData) {
    user.bioData = { ...user.bioData, ...updates.bioData };
  }
  if (updates.geneticData) {
    user.geneticData = { ...user.geneticData, ...updates.geneticData };
  }

  // Recalculate missing fields
  user.missingFields = calculateMissingFields(user);

  // Update timestamp
  user.lastUpdated = new Date().toISOString();

  return user;
};

/**
 * Calculate which required fields are missing from user data
 * This is a simplified version - in production you'd have more sophisticated validation
 *
 * @param user - User data to check
 * @returns Array of missing field paths
 */
export const calculateMissingFields = (user: UserData): string[] => {
  const missing: string[] = [];

  // Check bio data required fields
  if (!user.bioData.age) missing.push('bioData.age');
  if (!user.bioData.gender) missing.push('bioData.gender');
  if (!user.bioData.height) missing.push('bioData.height');
  if (!user.bioData.weight) missing.push('bioData.weight');
  if (!user.bioData.allergies || user.bioData.allergies.length === 0) {
    missing.push('bioData.allergies');
  }

  // Check genetic data required fields
  if (!user.geneticData.bloodType) missing.push('geneticData.bloodType');
  if (!user.geneticData.familyHistory) missing.push('geneticData.familyHistory');

  return missing;
};

/**
 * Check if user data is complete (no missing required fields)
 *
 * @param user - User data to check
 * @returns true if complete, false otherwise
 */
export const isUserDataComplete = (user: UserData): boolean => {
  return user.missingFields.length === 0;
};
