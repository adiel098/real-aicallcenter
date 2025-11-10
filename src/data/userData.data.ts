/**
 * Mock User Data
 *
 * Sample Medicare member data for testing.
 * Some users have complete data, others have missing fields to simulate real scenarios.
 */

import { UserData } from '../types/userData.types';

/**
 * In-memory storage for user data
 * Exported as mutable array so it can be updated during runtime
 */
export const userDataDatabase: UserData[] = [
  {
    userId: 'lead-001', // John Smith - Complete data, QUALIFIED
    phoneNumber: '+972501234001',
    alternatePhones: ['+972527373474'], // Can also be reached at this number
    name: 'John Smith',
    medicareData: {
      age: 68,
      dateOfBirth: '1956-03-15',
      address: '123 Main Street',
      city: 'Washington',
      state: 'DC',
      zipCode: '20001',
      email: 'john.smith@email.com',
      medicareNumber: '1AB2-CD3-EF45',
      planLevel: 'Advantage',
      hasColorblindness: true,
      colorblindType: 'red-green (deuteranopia)',
      currentEyewear: 'Standard prescription glasses',
      medicalHistory: ['hypertension', 'type 2 diabetes'],
      currentMedications: ['metformin', 'lisinopril'],
    },
    eligibilityData: {
      isEligibleForPremiumEyewear: true,
      planEligibilityStatus: 'QUALIFIED',
      subscriptionLevel: 'PREMIUM',
      mbiValidated: true,
      planCoverageDetails: 'Medicare Advantage includes vision coverage',
    },
    missingFields: [], // Complete data
    lastUpdated: '2024-01-15T10:30:00Z',
  },
  {
    userId: 'lead-002', // Sarah Johnson - Complete data, QUALIFIED
    phoneNumber: '+972501234002',
    name: 'Sarah Johnson',
    medicareData: {
      age: 72,
      dateOfBirth: '1952-07-22',
      address: '456 Oak Avenue',
      city: 'Baltimore',
      state: 'MD',
      zipCode: '21201',
      email: 'sarah.johnson@email.com',
      medicareNumber: '2BC3-DE4-FG56',
      planLevel: 'B',
      hasColorblindness: true,
      colorblindType: 'blue-yellow (tritanopia)',
      currentEyewear: 'No current eyewear',
      medicalHistory: ['glaucoma'],
      currentMedications: ['latanoprost eye drops'],
    },
    eligibilityData: {
      isEligibleForPremiumEyewear: true,
      planEligibilityStatus: 'QUALIFIED',
      subscriptionLevel: 'PREMIUM',
      mbiValidated: true,
      planCoverageDetails: 'Plan B qualifies with supplemental coverage',
    },
    missingFields: [], // Complete data
    lastUpdated: '2024-01-16T14:20:00Z',
  },
  {
    userId: 'lead-003', // Michael Chen - INCOMPLETE DATA
    phoneNumber: '+972501234003',
    name: 'Michael Chen',
    medicareData: {
      age: 66,
      dateOfBirth: '1958-11-10',
      city: 'Arlington',
      // Missing: address, state, zipCode, email, medicareNumber, planLevel, hasColorblindness, colorblindType
      currentEyewear: 'Reading glasses',
    },
    eligibilityData: {
      planEligibilityStatus: 'PENDING',
    },
    missingFields: [
      'medicareData.address',
      'medicareData.state',
      'medicareData.zipCode',
      'medicareData.email',
      'medicareData.medicareNumber',
      'medicareData.planLevel',
      'medicareData.hasColorblindness',
      'medicareData.colorblindType',
    ],
    lastUpdated: '2024-01-17T09:15:00Z',
  },
  {
    userId: 'lead-004', // Emily Davis - INCOMPLETE (missing MBI and contact info)
    phoneNumber: '+972501234004',
    name: 'Emily Davis',
    medicareData: {
      age: 70,
      dateOfBirth: '1954-05-18',
      city: 'Alexandria',
      // Missing: address, state, zipCode, email, medicareNumber
      planLevel: 'Advantage',
      hasColorblindness: true,
      colorblindType: 'red-green (protanopia)',
      currentEyewear: 'Bifocals',
      medicalHistory: ['macular degeneration'],
      currentMedications: ['AREDS2 vitamins'],
    },
    eligibilityData: {
      planEligibilityStatus: 'PENDING',
      mbiValidated: false,
    },
    missingFields: [
      'medicareData.address',
      'medicareData.state',
      'medicareData.zipCode',
      'medicareData.email',
      'medicareData.medicareNumber',
    ],
    lastUpdated: '2024-01-18T16:45:00Z',
  },
  {
    userId: 'lead-005', // David Wilson - Complete data, NOT QUALIFIED (no colorblindness)
    phoneNumber: '+12025551005',
    name: 'David Wilson',
    medicareData: {
      age: 69,
      dateOfBirth: '1955-09-08',
      address: '789 Elm Street',
      city: 'Silver Spring',
      state: 'MD',
      zipCode: '20901',
      email: 'david.wilson@email.com',
      medicareNumber: '3CD4-EF5-GH67',
      planLevel: 'D',
      hasColorblindness: false,
      currentEyewear: 'Progressive lenses',
      medicalHistory: ['cataracts (post-surgery)'],
      currentMedications: [],
    },
    eligibilityData: {
      isEligibleForPremiumEyewear: false,
      planEligibilityStatus: 'NOT_QUALIFIED',
      subscriptionLevel: 'NONE',
      mbiValidated: true,
      planCoverageDetails: 'Does not meet colorblindness requirement',
    },
    missingFields: [], // Complete data
    lastUpdated: '2024-01-19T11:00:00Z',
  },
  {
    userId: 'lead-006', // Lisa Anderson - VERY INCOMPLETE
    phoneNumber: '+12025551006',
    name: 'Lisa Anderson',
    medicareData: {
      age: 67,
      dateOfBirth: '1957-02-14',
      city: 'Bethesda',
      // Most fields missing: address, state, zipCode, email, medicareNumber, planLevel, hasColorblindness, currentEyewear
    },
    eligibilityData: {
      planEligibilityStatus: 'PENDING',
    },
    missingFields: [
      'medicareData.address',
      'medicareData.state',
      'medicareData.zipCode',
      'medicareData.email',
      'medicareData.medicareNumber',
      'medicareData.planLevel',
      'medicareData.hasColorblindness',
      'medicareData.colorblindType',
      'medicareData.currentEyewear',
    ],
    lastUpdated: '2024-01-20T13:30:00Z',
  },
  {
    userId: 'lead-007', // James Martinez - Complete data, QUALIFIED
    phoneNumber: '+12025551007',
    name: 'James Martinez',
    medicareData: {
      age: 71,
      dateOfBirth: '1953-12-05',
      address: '321 Pine Avenue',
      city: 'Rockville',
      state: 'MD',
      zipCode: '20850',
      email: 'james.martinez@email.com',
      medicareNumber: '4DE5-FG6-HI78',
      planLevel: 'Advantage',
      hasColorblindness: true,
      colorblindType: 'red-green (deuteranopia)',
      currentEyewear: 'Single vision distance glasses',
      medicalHistory: ['diabetic retinopathy'],
      currentMedications: ['insulin', 'anti-VEGF injections'],
    },
    eligibilityData: {
      isEligibleForPremiumEyewear: true,
      planEligibilityStatus: 'QUALIFIED',
      subscriptionLevel: 'PREMIUM',
      mbiValidated: true,
      planCoverageDetails: 'Medicare Advantage with comprehensive vision',
    },
    missingFields: [], // Complete data
    lastUpdated: '2024-01-21T10:00:00Z',
  },
  {
    userId: 'lead-008', // Jennifer Taylor - Complete data, QUALIFIED
    phoneNumber: '+12025551008',
    name: 'Jennifer Taylor',
    medicareData: {
      age: 74,
      dateOfBirth: '1950-08-29',
      address: '555 Maple Drive',
      city: 'Frederick',
      state: 'MD',
      zipCode: '21701',
      email: 'jennifer.taylor@email.com',
      medicareNumber: '5EF6-GH7-IJ89',
      planLevel: 'C',
      hasColorblindness: true,
      colorblindType: 'blue-yellow (tritanopia)',
      currentEyewear: 'Trifocals',
      medicalHistory: ['age-related macular degeneration'],
      currentMedications: ['lutein supplements'],
    },
    eligibilityData: {
      isEligibleForPremiumEyewear: true,
      planEligibilityStatus: 'QUALIFIED',
      subscriptionLevel: 'PREMIUM',
      mbiValidated: true,
      planCoverageDetails: 'Plan C with colorblind coverage',
    },
    missingFields: [], // Complete data
    lastUpdated: '2024-01-22T15:20:00Z',
  },
];

/**
 * Helper function to find user data by phone number
 * Searches both primary phone and alternate phones
 *
 * @param phoneNumber - Phone number in E.164 format
 * @returns UserData if found, undefined otherwise
 */
export const findUserDataByPhoneNumber = (phoneNumber: string): UserData | undefined => {
  return userDataDatabase.find((user) => {
    // Check primary phone number
    if (user.phoneNumber === phoneNumber) {
      return true;
    }
    // Check alternate phones if they exist
    if (user.alternatePhones && user.alternatePhones.includes(phoneNumber)) {
      return true;
    }
    return false;
  });
};

/**
 * Helper function to find user data by Medicare number (MBI)
 *
 * @param medicareNumber - Medicare Beneficiary Identifier (e.g., "1AB2-CD3-EF45")
 * @returns UserData if found, undefined otherwise
 */
export const findUserDataByMedicareNumber = (medicareNumber: string): UserData | undefined => {
  return userDataDatabase.find((user) => {
    return user.medicareData.medicareNumber === medicareNumber;
  });
};

/**
 * Helper function to find user data by name and date of birth
 * Name matching is case-insensitive
 *
 * @param name - User's full name
 * @param dateOfBirth - Date of birth in ISO format (YYYY-MM-DD)
 * @returns UserData if found, undefined otherwise
 */
export const findUserDataByNameAndDOB = (name: string, _dateOfBirth: string): UserData | undefined => {
  const normalizedSearchName = name.toLowerCase().trim();

  return userDataDatabase.find((user) => {
    const normalizedUserName = user.name.toLowerCase().trim();
    // Simple name match for now - in production you might want fuzzy matching
    return normalizedUserName === normalizedSearchName;
  });
};

/**
 * Helper function to update user data
 * Merges new data with existing data
 * Note: missingFields are calculated dynamically when needed, not stored
 *
 * @param phoneNumber - Phone number to identify user
 * @param updates - Partial updates to apply
 * @returns Updated UserData if found, undefined otherwise
 */
export const updateUserData = (
  phoneNumber: string,
  updates: { medicareData?: Record<string, unknown>; eligibilityData?: Record<string, unknown> }
): UserData | undefined => {
  const userIndex = userDataDatabase.findIndex((user) => user.phoneNumber === phoneNumber);

  if (userIndex === -1) {
    return undefined;
  }

  const user = userDataDatabase[userIndex];

  // Merge updates
  if (updates.medicareData) {
    user.medicareData = { ...user.medicareData, ...updates.medicareData };
  }
  if (updates.eligibilityData) {
    user.eligibilityData = { ...user.eligibilityData, ...updates.eligibilityData };
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

  // Check Medicare data required fields (per Task.txt requirements)

  // CRITICAL: dateOfBirth is required for Medicare verification (Task.txt line 75)
  if (!user.medicareData.dateOfBirth) missing.push('medicareData.dateOfBirth');

  // Age can be calculated from DOB, but if provided independently, that's fine
  if (!user.medicareData.age && !user.medicareData.dateOfBirth) missing.push('medicareData.age');

  // Address fields (Task.txt line 74: "Address / City / State / ZIP")
  if (!user.medicareData.address) missing.push('medicareData.address');
  if (!user.medicareData.city) missing.push('medicareData.city');
  if (!user.medicareData.state) missing.push('medicareData.state');
  if (!user.medicareData.zipCode) missing.push('medicareData.zipCode');

  // Contact details (Task.txt line 76)
  if (!user.medicareData.email) missing.push('medicareData.email');

  // Medicare validation fields (Task.txt lines 79-86)
  if (!user.medicareData.medicareNumber) missing.push('medicareData.medicareNumber');
  if (!user.medicareData.planLevel) missing.push('medicareData.planLevel');

  // Colorblindness is REQUIRED for premium eyewear subscription (Task.txt business case)
  if (user.medicareData.hasColorblindness === undefined) {
    missing.push('medicareData.hasColorblindness');
  }
  // colorblindType is only required if hasColorblindness is true
  if (user.medicareData.hasColorblindness && !user.medicareData.colorblindType) {
    missing.push('medicareData.colorblindType');
  }

  if (!user.medicareData.currentEyewear) missing.push('medicareData.currentEyewear');

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

/**
 * Create new user data entry
 * Initializes with provided Medicare data and calculates missing fields
 *
 * @param userData - Partial user data to create
 * @returns Newly created UserData object
 */
export const createUserData = (userData: {
  phoneNumber: string;
  name: string;
  medicareData?: Partial<UserData['medicareData']>;
}): UserData => {
  // Generate userId (same as lead ID pattern for consistency)
  const userId = `user-${String(userDataDatabase.length + 1).padStart(3, '0')}`;

  // Create initial user object
  const newUser: UserData = {
    userId,
    phoneNumber: userData.phoneNumber,
    name: userData.name,
    medicareData: {
      age: userData.medicareData?.age,
      city: userData.medicareData?.city,
      medicareNumber: userData.medicareData?.medicareNumber,
      planLevel: userData.medicareData?.planLevel,
      hasColorblindness: userData.medicareData?.hasColorblindness,
      colorblindType: userData.medicareData?.colorblindType,
      currentEyewear: userData.medicareData?.currentEyewear,
      medicalHistory: userData.medicareData?.medicalHistory,
      currentMedications: userData.medicareData?.currentMedications,
    },
    eligibilityData: {
      planEligibilityStatus: 'PENDING',
      mbiValidated: false,
    },
    missingFields: [],
    lastUpdated: new Date().toISOString(),
  };

  // Calculate missing fields
  newUser.missingFields = calculateMissingFields(newUser);

  // Add to database
  userDataDatabase.push(newUser);

  return newUser;
};

/**
 * Check if user exists by phone number
 *
 * @param phoneNumber - Phone number to check
 * @returns true if user exists, false otherwise
 */
export const userExists = (phoneNumber: string): boolean => {
  return findUserDataByPhoneNumber(phoneNumber) !== undefined;
};
