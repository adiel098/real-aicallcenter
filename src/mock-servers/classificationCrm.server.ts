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

  requestLogger.debug({ userId: userData.userId }, 'Starting Medicare eligibility classification (matching-based)');

  // Binary matching system: ALL criteria must be met (AND logic, not scoring)
  let isQualified = true;
  const failureReasons: string[] = [];
  const factors: Classification['factors'] = [];

  // CRITERION 1: Has Medicare Plan (REQUIRED)
  const planLevel = userData.medicareData.planLevel;
  if (!planLevel) {
    isQualified = false;
    failureReasons.push('No Medicare plan on file');
    factors.push({
      name: 'medicare_plan',
      impact: 'negative',
      description: 'No Medicare plan on file - required for program eligibility',
    });
    requestLogger.debug('Criterion FAILED: No Medicare plan');
  } else {
    requestLogger.debug({ planLevel }, 'Criterion PASSED: Has Medicare plan');
  }

  // CRITERION 2: Medicare Plan Covers Premium Eyewear (REQUIRED)
  // Plans with vision coverage for premium eyewear: Advantage, B, C
  // Plans with limited/no coverage: A (hospital only), D (prescriptions only)
  const coveringPlans = ['Advantage', 'B', 'C'];
  if (planLevel && !coveringPlans.includes(planLevel)) {
    isQualified = false;
    failureReasons.push(`Medicare Plan ${planLevel} has limited vision coverage for premium eyewear`);
    factors.push({
      name: 'medicare_plan_coverage',
      impact: 'negative',
      description: `Medicare Plan ${planLevel} does not include vision coverage for specialized colorblind eyewear`,
    });
    requestLogger.debug({ planLevel }, 'Criterion FAILED: Plan does not cover premium eyewear');
  } else if (planLevel && coveringPlans.includes(planLevel)) {
    factors.push({
      name: 'medicare_plan_coverage',
      impact: 'positive',
      description: `Medicare ${planLevel} includes vision coverage for premium eyewear`,
    });
    requestLogger.debug({ planLevel }, 'Criterion PASSED: Plan covers premium eyewear');
  }

  // CRITERION 3: Has Colorblindness Diagnosis (REQUIRED - MANDATORY)
  const hasColorblindness = userData.medicareData.hasColorblindness;
  const colorblindType = userData.medicareData.colorblindType;
  if (hasColorblindness === true) {
    factors.push({
      name: 'colorblindness',
      impact: 'positive',
      description: colorblindType
        ? `Confirmed ${colorblindType} colorblindness diagnosis`
        : 'Confirmed colorblindness diagnosis',
    });
    requestLogger.debug({ colorblindType }, 'Criterion PASSED: Colorblindness diagnosis confirmed');
  } else if (hasColorblindness === false) {
    isQualified = false;
    failureReasons.push('No colorblindness diagnosis confirmed');
    factors.push({
      name: 'colorblindness',
      impact: 'negative',
      description: 'No colorblindness diagnosis - required for premium eyewear program',
    });
    requestLogger.debug('Criterion FAILED: No colorblindness diagnosis');
  } else {
    isQualified = false;
    failureReasons.push('Colorblindness status not confirmed');
    factors.push({
      name: 'colorblindness',
      impact: 'negative',
      description: 'Colorblindness status unknown or not confirmed',
    });
    requestLogger.debug('Criterion FAILED: Colorblindness status unknown');
  }

  // CRITERION 4: Has Medicare Beneficiary Identifier (MBI) (REQUIRED)
  const medicareNumber = userData.medicareData.medicareNumber;
  if (!medicareNumber) {
    isQualified = false;
    failureReasons.push('Medicare Beneficiary Identifier (MBI) not provided');
    factors.push({
      name: 'medicare_mbi',
      impact: 'negative',
      description: 'Medicare Beneficiary Identifier (MBI) not on file',
    });
    requestLogger.debug('Criterion FAILED: No MBI provided');
  } else {
    factors.push({
      name: 'medicare_mbi',
      impact: 'positive',
      description: 'Medicare Beneficiary Identifier (MBI) verified',
    });
    requestLogger.debug({ mbi: `***${medicareNumber.slice(-2)}` }, 'Criterion PASSED: MBI provided');
  }

  // INFORMATIONAL: Age (not a qualification criterion - already validated by having Medicare)
  const age = userData.medicareData.age;
  if (age !== undefined) {
    factors.push({
      name: 'age',
      impact: 'neutral',
      description:
        age >= 65
          ? `Age ${age} - Standard Medicare eligibility`
          : `Age ${age} - Medicare eligible (disability or other qualification)`,
    });
    requestLogger.debug({ age }, 'Info: Age documented');
  }

  // Binary result: QUALIFIED (all criteria met) or NOT_QUALIFIED (any criteria failed)
  const result: ClassificationResult = isQualified ? CLASSIFICATION.QUALIFIED : CLASSIFICATION.NOT_QUALIFIED;

  // Binary score for API compatibility: 100 if qualified, 0 if not
  const score = isQualified ? 100 : 0;

  // Generate detailed reason based on matching logic
  let reason: string;
  if (isQualified) {
    reason = `Member meets all eligibility criteria for premium eyewear program: Medicare ${planLevel} plan with vision coverage + confirmed colorblindness diagnosis.`;
  } else {
    // Provide specific failure reasons
    if (failureReasons.length === 1) {
      reason = `Member does not qualify: ${failureReasons[0]}.`;
    } else {
      reason = `Member does not qualify for premium eyewear program. Reasons: ${failureReasons.join('; ')}.`;
    }
  }

  requestLogger.info(
    {
      userId: userData.userId,
      result,
      criteriaChecked: factors.length,
      criteriaPassed: factors.filter((f) => f.impact === 'positive').length,
      criteriaFailed: factors.filter((f) => f.impact === 'negative').length,
      qualificationMethod: 'binary-matching',
    },
    `Classification completed: ${result}`
  );

  // Create classification object
  const classification: Classification = {
    classificationId: `class-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: userData.userId,
    phoneNumber: userData.phoneNumber,
    result,
    score, // Binary: 100 (qualified) or 0 (not qualified)
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
