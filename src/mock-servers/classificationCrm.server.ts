/**
 * Classification CRM Server (Port 3003)
 *
 * Mock CRM server for Medicare eligibility classification.
 * Determines if a Medicare member is QUALIFIED or NOT_QUALIFIED for premium eyewear subscription.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from '../config/logger';
import { PORTS, HTTP_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES, CLASSIFICATION } from '../config/constants';
import {
  classificationsDatabase,
  saveClassification,
  findClassificationByUserId,
  getAllClassifications,
} from '../data/classifications.data';
import { maskPhoneNumber } from '../utils/phoneNumber.util';
import {
  Classification,
  ClassificationRequest,
  ClassificationResponse,
  UpdateClassificationResultRequest,
  ClassificationResult,
} from '../types/classification.types';
import { UserData } from '../types/userData.types';

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
  const requestLogger = logger.child({ requestId, server: 'classification-crm' });

  requestLogger.info(
    {
      method: req.method,
      path: req.path,
      hasBody: !!req.body && Object.keys(req.body).length > 0,
    },
    'Incoming request'
  );

  // Store logger on response object for use in route handlers
  (res as any).requestLogger = requestLogger;

  next();
});

/**
 * Medicare Eligibility Classification Logic
 *
 * Determines if a Medicare member qualifies for premium eyewear subscription.
 * Based on Medicare plan coverage and colorblindness diagnosis.
 *
 * Eligibility Criteria:
 * - Must have valid Medicare plan (A, B, C, D, or Advantage)
 * - Must have diagnosed colorblindness
 * - Medicare plan must cover vision benefits (Advantage, B, C have better coverage)
 * - Age must be 65+ (Medicare eligible age)
 *
 * @param userData - Complete Medicare member data to classify
 * @returns Classification object
 */
const classifyUser = (userData: UserData): Classification => {
  const requestLogger = logger.child({ userId: userData.userId });

  requestLogger.debug({ userId: userData.userId }, 'Starting Medicare eligibility classification');

  let score = 0; // Start at 0, must meet all criteria
  const factors: Classification['factors'] = [];

  // Factor 1: Medicare Plan Level (REQUIRED)
  const planLevel = userData.medicareData.planLevel;
  if (!planLevel) {
    score = 0;
    factors.push({
      name: 'medicare_plan',
      impact: 'negative',
      description: 'No Medicare plan on file',
    });
    requestLogger.debug('Medicare plan: missing (disqualified)');
  } else if (planLevel === 'Advantage' || planLevel === 'C') {
    score += 40;
    factors.push({
      name: 'medicare_plan',
      impact: 'positive',
      description: `Medicare ${planLevel} includes comprehensive vision coverage`,
    });
    requestLogger.debug({ planLevel, scoreChange: +40 }, 'Medicare plan: excellent coverage');
  } else if (planLevel === 'B') {
    score += 30;
    factors.push({
      name: 'medicare_plan',
      impact: 'positive',
      description: `Medicare Plan ${planLevel} includes supplemental vision coverage`,
    });
    requestLogger.debug({ planLevel, scoreChange: +30 }, 'Medicare plan: good coverage');
  } else if (planLevel === 'A' || planLevel === 'D') {
    score += 20;
    factors.push({
      name: 'medicare_plan',
      impact: 'neutral',
      description: `Medicare Plan ${planLevel} has limited vision coverage`,
    });
    requestLogger.debug({ planLevel, scoreChange: +20 }, 'Medicare plan: limited coverage');
  }

  // Factor 2: Colorblindness Diagnosis (REQUIRED)
  const hasColorblindness = userData.medicareData.hasColorblindness;
  const colorblindType = userData.medicareData.colorblindType;
  if (hasColorblindness === true) {
    score += 40;
    factors.push({
      name: 'colorblindness',
      impact: 'positive',
      description: colorblindType
        ? `Diagnosed with ${colorblindType} colorblindness - qualifies for premium eyewear`
        : 'Diagnosed with colorblindness - qualifies for premium eyewear',
    });
    requestLogger.debug({ colorblindType, scoreChange: +40 }, 'Colorblindness: confirmed diagnosis');
  } else if (hasColorblindness === false) {
    score = 0; // Automatic disqualification
    factors.push({
      name: 'colorblindness',
      impact: 'negative',
      description: 'No colorblindness diagnosis - does not meet eligibility requirement',
    });
    requestLogger.debug('Colorblindness: no diagnosis (disqualified)');
  } else {
    score = 0; // Missing required information
    factors.push({
      name: 'colorblindness',
      impact: 'negative',
      description: 'Colorblindness status not confirmed',
    });
    requestLogger.debug('Colorblindness: status unknown (disqualified)');
  }

  // Factor 3: Age (Medicare eligibility age is 65+)
  const age = userData.medicareData.age;
  if (age !== undefined && age >= 65) {
    score += 20;
    factors.push({
      name: 'age',
      impact: 'positive',
      description: `Age ${age} meets Medicare eligibility (65+)`,
    });
    requestLogger.debug({ age, scoreChange: +20 }, 'Age: Medicare eligible');
  } else if (age !== undefined && age < 65) {
    // Under 65 can still have Medicare (disability, etc.)
    score += 10;
    factors.push({
      name: 'age',
      impact: 'neutral',
      description: `Age ${age} - Medicare eligible through disability or other qualification`,
    });
    requestLogger.debug({ age, scoreChange: +10 }, 'Age: early Medicare eligibility');
  }

  // Ensure score stays within 0-100 range
  score = Math.max(0, Math.min(100, score));

  // Determine result based on score threshold
  // Threshold: 80+ = QUALIFIED (must have plan + colorblindness)
  const result: ClassificationResult = score >= 80 ? CLASSIFICATION.QUALIFIED : CLASSIFICATION.NOT_QUALIFIED;

  // Generate detailed reason
  const reason =
    result === CLASSIFICATION.QUALIFIED
      ? `Member qualifies for premium eyewear subscription with a score of ${score}/100. Has valid Medicare coverage and confirmed colorblindness diagnosis.`
      : `Member does not qualify for premium eyewear subscription (score: ${score}/100). ${
          hasColorblindness === false
            ? 'No colorblindness diagnosis on file.'
            : !planLevel
            ? 'No Medicare plan information available.'
            : 'Does not meet all eligibility requirements.'
        }`;

  requestLogger.info(
    {
      userId: userData.userId,
      finalScore: score,
      result,
      positiveFactors: factors.filter((f) => f.impact === 'positive').length,
      negativeFactors: factors.filter((f) => f.impact === 'negative').length,
    },
    'Classification completed'
  );

  // Create classification object
  const classification: Classification = {
    classificationId: `class-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: userData.userId,
    phoneNumber: userData.phoneNumber,
    result,
    score,
    reason,
    factors,
    createdAt: new Date().toISOString(),
  };

  return classification;
};

/**
 * POST /api/classify
 *
 * Classify a Medicare member based on their complete Medicare data and eligibility criteria
 *
 * @body ClassificationRequest - User data to classify
 * @returns ClassificationResponse with classification result
 */
app.post('/api/classify', (req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;
  const classificationRequest: ClassificationRequest = req.body;

  requestLogger.debug('Received classification request');

  // Validate request body
  if (!classificationRequest.userData) {
    requestLogger.warn('Classification request missing userData');

    const response: ClassificationResponse = {
      success: false,
      classification: null,
      message: ERROR_MESSAGES.MISSING_REQUIRED_FIELDS,
    };

    return res.status(HTTP_STATUS.BAD_REQUEST).json(response);
  }

  const userData = classificationRequest.userData;

  // Check if user data is complete
  if (userData.missingFields && userData.missingFields.length > 0) {
    requestLogger.warn(
      {
        userId: userData.userId,
        missingFields: userData.missingFields,
      },
      'Cannot classify user: data incomplete'
    );

    const response: ClassificationResponse = {
      success: false,
      classification: null,
      message: `${ERROR_MESSAGES.INCOMPLETE_USER_DATA}. Missing: ${userData.missingFields.join(', ')}`,
    };

    return res.status(HTTP_STATUS.BAD_REQUEST).json(response);
  }

  requestLogger.info(
    {
      userId: userData.userId,
      userName: userData.name,
      phoneNumber: maskPhoneNumber(userData.phoneNumber),
    },
    'Classifying user'
  );

  // Perform classification
  const classification = classifyUser(userData);

  // Save classification to database
  saveClassification(classification);

  requestLogger.info(
    {
      classificationId: classification.classificationId,
      userId: userData.userId,
      result: classification.result,
      score: classification.score,
    },
    'Classification saved successfully'
  );

  const response: ClassificationResponse = {
    success: true,
    classification,
    message: SUCCESS_MESSAGES.CLASSIFICATION_COMPLETE,
  };

  return res.status(HTTP_STATUS.OK).json(response);
});

/**
 * PUT /api/classify/:userId/result
 *
 * Update/save the classification result for a user
 * (Alternative endpoint if you want to save result separately)
 *
 * @param userId - User ID (in URL path)
 * @body UpdateClassificationResultRequest - Result to save
 * @returns Saved classification
 */
app.put('/api/classify/:userId/result', (req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;
  const { userId } = req.params;
  const updateRequest: UpdateClassificationResultRequest = req.body;

  requestLogger.debug({ userId }, 'Updating classification result');

  // Validate request
  if (!updateRequest.result || !updateRequest.phoneNumber) {
    requestLogger.warn({ userId }, 'Missing required fields in update request');

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: ERROR_MESSAGES.MISSING_REQUIRED_FIELDS,
    });
  }

  // Create or update classification
  const classification: Classification = {
    classificationId: `class-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    phoneNumber: updateRequest.phoneNumber,
    result: updateRequest.result,
    score: updateRequest.score,
    reason: updateRequest.reason,
    factors: [], // Empty factors since this is a manual update
    createdAt: new Date().toISOString(),
  };

  saveClassification(classification);

  requestLogger.info(
    {
      userId,
      result: classification.result,
      score: classification.score,
    },
    'Classification result updated'
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    classification,
    message: SUCCESS_MESSAGES.RESULT_SAVED,
  });
});

/**
 * GET /api/classifications
 *
 * Get all classifications (for debugging/testing purposes)
 *
 * @returns Array of all classifications
 */
app.get('/api/classifications', (_req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;

  requestLogger.debug('Fetching all classifications');

  const classifications = getAllClassifications();
  const qualifiedCount = classifications.filter((c) => c.result === CLASSIFICATION.QUALIFIED).length;
  const notQualifiedCount = classifications.length - qualifiedCount;

  requestLogger.info(
    {
      totalCount: classifications.length,
      qualifiedCount,
      notQualifiedCount,
    },
    'Retrieved all classifications'
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    count: classifications.length,
    qualifiedCount,
    notQualifiedCount,
    classifications,
  });
});

/**
 * GET /api/classifications/:userId
 *
 * Get classification for a specific user
 *
 * @param userId - User ID to look up
 * @returns Classification if found
 */
app.get('/api/classifications/:userId', (req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;
  const { userId } = req.params;

  requestLogger.debug({ userId }, 'Looking up classification by user ID');

  const classification = findClassificationByUserId(userId);

  if (!classification) {
    requestLogger.info({ userId }, 'Classification not found');

    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Classification not found for this user',
    });
  }

  requestLogger.info({ userId, result: classification.result }, 'Classification found');

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    classification,
  });
});

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json({ status: 'healthy', service: 'classification-crm' });
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
    'Unhandled error in Classification CRM server'
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
  app.listen(PORTS.CLASSIFICATION_CRM, () => {
    logger.info(
      {
        port: PORTS.CLASSIFICATION_CRM,
        service: 'classification-crm',
        classificationsCount: classificationsDatabase.length,
      },
      `Classification CRM Server started on port ${PORTS.CLASSIFICATION_CRM}`
    );
  });
};

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

export default app;
