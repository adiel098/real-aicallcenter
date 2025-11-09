/**
 * User Data CRM Server (Port 3002)
 *
 * Mock CRM server for Medicare member data management.
 * Handles retrieving and updating Medicare member information.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from '../config/logger';
import { PORTS, HTTP_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } from '../config/constants';
import { userDataDatabase, isUserDataComplete, findUserDataByPhoneNumber } from '../data/userData.data';
import { normalizePhoneNumber, isValidPhoneNumber, maskPhoneNumber } from '../utils/phoneNumber.util';
import { UserDataResponse, UserDataUpdateRequest, UserData } from '../types/userData.types';
import databaseService, { UserDataRecord } from '../services/database.service';

// Initialize Express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for all origins
app.use(express.json()); // Parse JSON request bodies

/**
 * Migrate in-memory user data to database on startup
 */
function migrateUserDataToDatabase() {
  logger.info({ count: userDataDatabase.length }, 'Migrating in-memory user data to database');

  let migrated = 0;
  let skipped = 0;

  for (const userData of userDataDatabase) {
    try {
      if (databaseService.userDataExists(userData.phoneNumber)) {
        skipped++;
        continue;
      }

      const userDataRecord: UserDataRecord = {
        user_id: userData.userId,
        phone_number: userData.phoneNumber,
        name: userData.name,
        medicare_data: JSON.stringify(userData.medicareData),
        eligibility_data: userData.eligibilityData ? JSON.stringify(userData.eligibilityData) : undefined,
        missing_fields: userData.missingFields ? JSON.stringify(userData.missingFields) : undefined,
        last_updated: userData.lastUpdated,
      };

      databaseService.insertUserData(userDataRecord);
      migrated++;
    } catch (error: any) {
      logger.error({ error: error.message, userId: userData.userId }, 'Failed to migrate user data');
    }
  }

  logger.info({ migrated, skipped }, `User data migration complete: ${migrated} migrated, ${skipped} skipped`);
}

/**
 * Convert UserDataRecord from database to UserData type
 */
function convertUserDataRecordToUserData(record: UserDataRecord): UserData {
  return {
    userId: record.user_id,
    phoneNumber: record.phone_number,
    name: record.name || '',
    medicareData: record.medicare_data ? JSON.parse(record.medicare_data) : {},
    eligibilityData: record.eligibility_data ? JSON.parse(record.eligibility_data) : undefined,
    missingFields: record.missing_fields ? JSON.parse(record.missing_fields) : undefined,
    lastUpdated: record.last_updated || new Date().toISOString(),
  };
}

/**
 * Request logging middleware
 * Logs all incoming requests with timestamp and details
 */
app.use((req: Request, res: Response, next) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create child logger with request context
  const requestLogger = logger.child({ requestId, server: 'userdata-crm' });

  requestLogger.info(
    {
      method: req.method,
      path: req.path,
      query: req.query,
      // Don't log full body to avoid logging sensitive data
      hasBody: !!req.body && Object.keys(req.body).length > 0,
    },
    'Incoming request'
  );

  // Store logger on response object for use in route handlers
  (res as any).requestLogger = requestLogger;

  next();
});

/**
 * GET /api/users/:phoneNumber
 *
 * Get Medicare member data by phone number
 *
 * @param phoneNumber - Phone number to search for (in URL path)
 * @returns UserDataResponse with Medicare member data if found
 */
app.get('/api/users/:phoneNumber', (req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;
  const { phoneNumber } = req.params;

  requestLogger.debug({ phoneNumber: maskPhoneNumber(phoneNumber) }, 'Looking up user data by phone number');

  // Validate phone number format
  if (!isValidPhoneNumber(phoneNumber)) {
    requestLogger.warn({ phoneNumber: maskPhoneNumber(phoneNumber) }, 'Invalid phone number format');

    const response: UserDataResponse = {
      found: false,
      userData: null,
      isComplete: false,
      missingFields: [],
      message: ERROR_MESSAGES.INVALID_PHONE,
    };

    return res.status(HTTP_STATUS.BAD_REQUEST).json(response);
  }

  // Normalize phone number for consistent lookup
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  // Search for user data in database
  const userDataRecord = databaseService.getUserDataByPhone(normalizedPhone);

  if (!userDataRecord) {
    requestLogger.info({ phoneNumber: maskPhoneNumber(normalizedPhone) }, 'User data not found');

    const response: UserDataResponse = {
      found: false,
      userData: null,
      isComplete: false,
      missingFields: [],
      message: ERROR_MESSAGES.USER_NOT_FOUND,
    };

    return res.status(HTTP_STATUS.NOT_FOUND).json(response);
  }

  // Convert to UserData type
  const userData = convertUserDataRecordToUserData(userDataRecord);

  // Check if data is complete
  const complete = isUserDataComplete(userData);
  const missing = userData.missingFields || [];

  // User data found
  requestLogger.info(
    {
      phoneNumber: maskPhoneNumber(normalizedPhone),
      userId: userData.userId,
      userName: userData.name,
      isComplete: complete,
      missingFieldsCount: missing.length,
      missingFields: missing,
    },
    'User data found'
  );

  // Warn if data is incomplete
  if (!complete) {
    requestLogger.warn(
      {
        userId: userData.userId,
        missingFields: missing,
      },
      'User data is incomplete'
    );
  }

  const response: UserDataResponse = {
    found: true,
    userData: userData,
    isComplete: complete,
    missingFields: missing,
    message: SUCCESS_MESSAGES.USER_DATA_RETRIEVED,
  };

  return res.status(HTTP_STATUS.OK).json(response);
});

/**
 * PUT /api/users/:phoneNumber
 *
 * Update user bio and genetic data
 *
 * @param phoneNumber - Phone number to identify user (in URL path)
 * @body UserDataUpdateRequest - Data to update
 * @returns Updated user data
 */
app.put('/api/users/:phoneNumber', (req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;
  const { phoneNumber } = req.params;
  const updateRequest: UserDataUpdateRequest = req.body;

  requestLogger.debug(
    {
      phoneNumber: maskPhoneNumber(phoneNumber),
      hasMedicareData: !!updateRequest.medicareData,
      hasEligibilityData: !!updateRequest.eligibilityData,
    },
    'Updating user data'
  );

  // Validate phone number format
  if (!isValidPhoneNumber(phoneNumber)) {
    requestLogger.warn({ phoneNumber: maskPhoneNumber(phoneNumber) }, 'Invalid phone number format');

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: ERROR_MESSAGES.INVALID_PHONE,
    });
  }

  // Validate request body
  if (!updateRequest.medicareData && !updateRequest.eligibilityData) {
    requestLogger.warn('Update request missing both medicareData and eligibilityData');

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: ERROR_MESSAGES.MISSING_REQUIRED_FIELDS,
    });
  }

  // Normalize phone number
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  // Get existing user data before update (for logging)
  const existingUser = findUserDataByPhoneNumber(normalizedPhone);
  if (!existingUser) {
    requestLogger.warn({ phoneNumber: maskPhoneNumber(normalizedPhone) }, 'User not found for update');

    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: ERROR_MESSAGES.USER_NOT_FOUND,
    });
  }

  const beforeMissingFields = [...(existingUser.missingFields || [])];

  // Update user data in database
  try {
    const updates: Partial<UserDataRecord> = {
      medicare_data: updateRequest.medicareData ? JSON.stringify(updateRequest.medicareData) : undefined,
      eligibility_data: updateRequest.eligibilityData ? JSON.stringify(updateRequest.eligibilityData) : undefined,
      last_updated: new Date().toISOString(),
    };

    databaseService.updateUserData(existingUser.userId, updates);

    // Fetch updated record
    const updatedRecord = databaseService.getUserDataById(existingUser.userId);
    if (!updatedRecord) {
      throw new Error('Failed to fetch updated user data');
    }

    const updatedUser = convertUserDataRecordToUserData(updatedRecord);
    const afterMissingFields = updatedUser.missingFields || [];
    const fieldsCompleted = beforeMissingFields.filter((field) => !afterMissingFields.includes(field));

    // Log successful update with before/after comparison
    requestLogger.info(
      {
        phoneNumber: maskPhoneNumber(normalizedPhone),
        userId: updatedUser.userId,
        beforeMissingCount: beforeMissingFields.length,
        afterMissingCount: afterMissingFields.length,
        fieldsCompleted: fieldsCompleted,
        isNowComplete: isUserDataComplete(updatedUser),
      },
      'User data updated successfully'
    );

    const response: UserDataResponse = {
      found: true,
      userData: updatedUser,
      isComplete: isUserDataComplete(updatedUser),
      missingFields: updatedUser.missingFields || [],
      message: SUCCESS_MESSAGES.USER_DATA_UPDATED,
    };

    return res.status(HTTP_STATUS.OK).json(response);
  } catch (error: any) {
    requestLogger.error({ error: error.message, phoneNumber: maskPhoneNumber(normalizedPhone) }, 'Failed to update user data');

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to update user data',
      error: error.message,
    });
  }
});

/**
 * GET /api/users
 *
 * Get all users (for debugging/testing purposes)
 *
 * @returns Array of all users
 */
app.get('/api/users', (_req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;

  requestLogger.debug('Fetching all users');

  // Get query parameters for pagination
  const limit = parseInt(_req.query.limit as string) || 100;
  const offset = parseInt(_req.query.offset as string) || 0;

  const userRecords = databaseService.getAllUserData(limit, offset);
  const users = userRecords.map(convertUserDataRecordToUserData);

  const count = users.length;
  const completeCount = users.filter(isUserDataComplete).length;
  const incompleteCount = count - completeCount;

  requestLogger.info(
    {
      totalCount: count,
      completeCount,
      incompleteCount,
    },
    'Retrieved all users'
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    count,
    completeCount,
    incompleteCount,
    users,
  });
});

/**
 * POST /api/users
 *
 * Create a new user in the system
 * Used when a new user fills out the web form with Medicare data
 *
 * @body phoneNumber - Phone number (E.164 format, required)
 * @body name - Full name (required)
 * @body medicareData - Medicare information object (optional, can be partial)
 * @returns Newly created user object with missing fields calculation
 */
app.post('/api/users', (req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;
  const { phoneNumber, name, medicareData } = req.body;

  requestLogger.debug({ phoneNumber: maskPhoneNumber(phoneNumber) }, 'Creating new user');

  // Validate required fields
  if (!phoneNumber || !name) {
    requestLogger.warn('Missing required fields for user creation');
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Missing required fields: phoneNumber and name are required',
    });
  }

  // Validate phone number format
  if (!isValidPhoneNumber(phoneNumber)) {
    requestLogger.warn({ phoneNumber: maskPhoneNumber(phoneNumber) }, 'Invalid phone number format');
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: ERROR_MESSAGES.INVALID_PHONE,
    });
  }

  // Normalize phone number
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  // Check if user already exists
  if (databaseService.userDataExists(normalizedPhone)) {
    requestLogger.warn(
      { phoneNumber: maskPhoneNumber(normalizedPhone) },
      'User already exists with this phone number'
    );

    const existingRecord = databaseService.getUserDataByPhone(normalizedPhone);
    const existingUser = existingRecord ? convertUserDataRecordToUserData(existingRecord) : null;
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message: 'A user with this phone number already exists',
      existingUser,
    });
  }

  // Create new user
  try {
    // Generate unique userId
    const allUserData = databaseService.getAllUserData(1000, 0);
    const userId = `user-${String(allUserData.length + 1).padStart(3, '0')}`;

    // Calculate missing fields
    const missingFields: string[] = [];
    if (!medicareData?.age) missingFields.push('age');
    if (!medicareData?.city) missingFields.push('city');
    if (!medicareData?.medicareNumber) missingFields.push('medicareNumber');
    if (!medicareData?.planLevel) missingFields.push('planLevel');
    if (medicareData?.hasColorblindness === undefined) missingFields.push('hasColorblindness');

    const userRecord: UserDataRecord = {
      user_id: userId,
      phone_number: normalizedPhone,
      name,
      medicare_data: medicareData ? JSON.stringify(medicareData) : undefined,
      missing_fields: JSON.stringify(missingFields),
      last_updated: new Date().toISOString(),
    };

    databaseService.insertUserData(userRecord);

    const newRecord = databaseService.getUserDataById(userId);
    if (!newRecord) {
      throw new Error('Failed to fetch newly created user data');
    }

    const newUser = convertUserDataRecordToUserData(newRecord);

    requestLogger.info(
      {
        phoneNumber: maskPhoneNumber(normalizedPhone),
        userId: newUser.userId,
        userName: newUser.name,
        missingFieldsCount: newUser.missingFields?.length || 0,
      },
      'User created successfully'
    );

    const response: UserDataResponse = {
      found: true,
      userData: newUser,
      isComplete: isUserDataComplete(newUser),
      missingFields: newUser.missingFields || [],
      message: 'User created successfully',
    };

    return res.status(HTTP_STATUS.CREATED).json(response);
  } catch (error: any) {
    requestLogger.error({ error: error.message }, 'Failed to create user');
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to create user',
      error: error.message,
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json({ status: 'healthy', service: 'userdata-crm' });
});

/**
 * Error handling middleware
 * Catches any unhandled errors and returns a consistent error response
 */
app.use((err: Error, _req: Request, res: Response, _next: any) => {
  const requestLogger = (res as any).requestLogger || logger;

  requestLogger.error(
    {
      error: err.message,
      stack: err.stack,
    },
    'Unhandled error in User Data CRM server'
  );

  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: 'Internal server error',
    error: err.message,
  });
});

/**
 * GET /api/users/search/by-medicare
 *
 * Find a user by Medicare number (MBI)
 * Query parameter: mbi (Medicare Beneficiary Identifier)
 *
 * @example GET /api/users/search/by-medicare?mbi=1AB2-CD3-EF45
 */
app.get('/api/users/search/by-medicare', (req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;
  const { mbi } = req.query;

  if (!mbi || typeof mbi !== 'string') {
    requestLogger.warn('Medicare number (mbi) query parameter missing');
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      found: false,
      userData: null,
      isComplete: false,
      missingFields: [],
      message: 'Medicare number (mbi) query parameter is required',
    });
  }

  requestLogger.debug({ mbi }, 'Looking up user by Medicare number');

  const userRecord = databaseService.getUserDataByMedicareNumber(mbi);

  if (!userRecord) {
    requestLogger.info({ mbi }, 'User not found by Medicare number');
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      found: false,
      userData: null,
      isComplete: false,
      missingFields: [],
      message: 'User not found with this Medicare number',
    });
  }

  const userData = convertUserDataRecordToUserData(userRecord);
  const complete = isUserDataComplete(userData);

  requestLogger.info(
    {
      mbi,
      userId: userData.userId,
      name: userData.name,
      isComplete: complete,
    },
    'User found by Medicare number'
  );

  const response: UserDataResponse = {
    found: true,
    userData,
    isComplete: complete,
    missingFields: userData.missingFields || [],
    message: 'User data retrieved successfully',
  };

  return res.status(HTTP_STATUS.OK).json(response);
});

/**
 * GET /api/users/search/by-name-dob
 *
 * Find a user by name and date of birth
 * Query parameters: name, dob (YYYY-MM-DD format)
 *
 * @example GET /api/users/search/by-name-dob?name=John%20Smith&dob=1955-03-15
 */
app.get('/api/users/search/by-name-dob', (req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;
  const { name, dob } = req.query;

  if (!name || typeof name !== 'string' || !dob || typeof dob !== 'string') {
    requestLogger.warn('Name and DOB query parameters missing');
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      found: false,
      userData: null,
      isComplete: false,
      missingFields: [],
      message: 'Name and dob (date of birth) query parameters are required',
    });
  }

  requestLogger.debug({ name, dob }, 'Looking up user by name and DOB');

  const userRecord = databaseService.getUserDataByNameAndDOB(name, dob);

  if (!userRecord) {
    requestLogger.info({ name, dob }, 'User not found by name and DOB');
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      found: false,
      userData: null,
      isComplete: false,
      missingFields: [],
      message: 'User not found with this name and date of birth',
    });
  }

  const userData = convertUserDataRecordToUserData(userRecord);
  const complete = isUserDataComplete(userData);

  requestLogger.info(
    {
      name,
      dob,
      userId: userData.userId,
      isComplete: complete,
    },
    'User found by name and DOB'
  );

  const response: UserDataResponse = {
    found: true,
    userData,
    isComplete: complete,
    missingFields: userData.missingFields || [],
    message: 'User data retrieved successfully',
  };

  return res.status(HTTP_STATUS.OK).json(response);
});

/**
 * Start the server
 */
const startServer = () => {
  // Migrate in-memory user data to database on startup
  migrateUserDataToDatabase();

  app.listen(PORTS.USERDATA_CRM, () => {
    const allUserRecords = databaseService.getAllUserData(1000, 0);
    const allUsers = allUserRecords.map(convertUserDataRecordToUserData);
    const completeCount = allUsers.filter(isUserDataComplete).length;

    logger.info(
      {
        port: PORTS.USERDATA_CRM,
        service: 'userdata-crm',
        usersCount: allUsers.length,
        completeCount,
        incompleteCount: allUsers.length - completeCount,
      },
      `User Data CRM Server started on port ${PORTS.USERDATA_CRM} with ${allUsers.length} users in database`
    );
  });
};

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

export default app;
