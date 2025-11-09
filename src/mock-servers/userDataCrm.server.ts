/**
 * User Data CRM Server (Port 3002)
 *
 * Mock CRM server for user bio and genetic data management.
 * Handles retrieving and updating user information.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from '../config/logger';
import { PORTS, HTTP_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } from '../config/constants';
import {
  userDataDatabase,
  findUserDataByPhoneNumber,
  updateUserData,
  isUserDataComplete,
} from '../data/userData.data';
import { normalizePhoneNumber, isValidPhoneNumber, maskPhoneNumber } from '../utils/phoneNumber.util';
import { UserDataResponse, UserDataUpdateRequest } from '../types/userData.types';

// Initialize Express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for all origins
app.use(express.json()); // Parse JSON request bodies

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
 * Get user bio and genetic data by phone number
 *
 * @param phoneNumber - Phone number to search for (in URL path)
 * @returns UserDataResponse with user data if found
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
  const userData = findUserDataByPhoneNumber(normalizedPhone);

  if (!userData) {
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

  // Check if data is complete
  const complete = isUserDataComplete(userData);
  const missing = userData.missingFields;

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
      hasBioData: !!updateRequest.bioData,
      hasGeneticData: !!updateRequest.geneticData,
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
  if (!updateRequest.bioData && !updateRequest.geneticData) {
    requestLogger.warn('Update request missing both bioData and geneticData');

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

  const beforeMissingFields = [...existingUser.missingFields];

  // Update user data
  const updatedUser = updateUserData(normalizedPhone, {
    bioData: updateRequest.bioData,
    geneticData: updateRequest.geneticData,
  });

  if (!updatedUser) {
    requestLogger.error({ phoneNumber: maskPhoneNumber(normalizedPhone) }, 'Failed to update user data');

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to update user data',
    });
  }

  const afterMissingFields = updatedUser.missingFields;
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
    missingFields: updatedUser.missingFields,
    message: SUCCESS_MESSAGES.USER_DATA_UPDATED,
  };

  return res.status(HTTP_STATUS.OK).json(response);
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

  const count = userDataDatabase.length;
  const completeCount = userDataDatabase.filter(isUserDataComplete).length;
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
    users: userDataDatabase,
  });
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
 * Start the server
 */
const startServer = () => {
  app.listen(PORTS.USERDATA_CRM, () => {
    const completeCount = userDataDatabase.filter(isUserDataComplete).length;

    logger.info(
      {
        port: PORTS.USERDATA_CRM,
        service: 'userdata-crm',
        usersCount: userDataDatabase.length,
        completeCount,
        incompleteCount: userDataDatabase.length - completeCount,
      },
      `User Data CRM Server started on port ${PORTS.USERDATA_CRM}`
    );
  });
};

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

export default app;
