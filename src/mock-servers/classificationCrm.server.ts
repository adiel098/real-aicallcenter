/**
 * Classification CRM Server (Port 3003)
 *
 * Mock CRM server for user classification based on bio and genetic data.
 * Determines if a user is ACCEPTABLE or NOT_ACCEPTABLE based on health criteria.
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
 * Classification Logic
 *
 * Determines if a user is acceptable based on their bio and genetic data.
 * This is a simplified algorithm for demonstration purposes.
 *
 * Criteria:
 * - Age: 18-65 preferred (outside range = negative factor)
 * - Medical History: Fewer conditions = better
 * - Genetic Conditions: Fewer conditions = better
 * - Family History: Consideration for hereditary risks
 *
 * @param userData - Complete user data to classify
 * @returns Classification object
 */
const classifyUser = (userData: UserData): Classification => {
  const requestLogger = logger.child({ userId: userData.userId });

  requestLogger.debug({ userId: userData.userId }, 'Starting classification algorithm');

  let score = 50; // Start at neutral score
  const factors: Classification['factors'] = [];

  // Factor 1: Age
  const age = userData.bioData.age;
  if (age !== undefined) {
    if (age >= 18 && age <= 65) {
      score += 15;
      factors.push({
        name: 'age',
        impact: 'positive',
        description: `Age ${age} is within preferred range (18-65)`,
      });
      requestLogger.debug({ age, scoreChange: +15 }, 'Age factor: positive');
    } else if (age < 18) {
      score -= 30;
      factors.push({
        name: 'age',
        impact: 'negative',
        description: `Age ${age} is below minimum requirement (18)`,
      });
      requestLogger.debug({ age, scoreChange: -30 }, 'Age factor: negative (too young)');
    } else if (age > 65) {
      score -= 10;
      factors.push({
        name: 'age',
        impact: 'negative',
        description: `Age ${age} is above preferred range (65+)`,
      });
      requestLogger.debug({ age, scoreChange: -10 }, 'Age factor: negative (above preferred)');
    }
  }

  // Factor 2: Medical History
  const medicalConditions = userData.bioData.medicalHistory?.length || 0;
  if (medicalConditions === 0) {
    score += 20;
    factors.push({
      name: 'medical_history',
      impact: 'positive',
      description: 'No pre-existing medical conditions',
    });
    requestLogger.debug({ scoreChange: +20 }, 'Medical history: positive (no conditions)');
  } else if (medicalConditions <= 2) {
    score += 5;
    factors.push({
      name: 'medical_history',
      impact: 'neutral',
      description: `${medicalConditions} manageable medical condition(s)`,
    });
    requestLogger.debug({ medicalConditions, scoreChange: +5 }, 'Medical history: neutral');
  } else {
    score -= 15;
    factors.push({
      name: 'medical_history',
      impact: 'negative',
      description: `Multiple medical conditions (${medicalConditions})`,
    });
    requestLogger.debug({ medicalConditions, scoreChange: -15 }, 'Medical history: negative');
  }

  // Factor 3: Genetic Conditions
  const geneticConditions = userData.geneticData.geneticConditions?.length || 0;
  if (geneticConditions === 0) {
    score += 15;
    factors.push({
      name: 'genetic_conditions',
      impact: 'positive',
      description: 'No known genetic conditions',
    });
    requestLogger.debug({ scoreChange: +15 }, 'Genetic conditions: positive');
  } else {
    score -= 20;
    factors.push({
      name: 'genetic_conditions',
      impact: 'negative',
      description: `${geneticConditions} genetic condition(s) identified`,
    });
    requestLogger.debug({ geneticConditions, scoreChange: -20 }, 'Genetic conditions: negative');
  }

  // Factor 4: Family History (hereditary risk)
  const familyHistory = userData.geneticData.familyHistory?.length || 0;
  if (familyHistory === 0) {
    score += 10;
    factors.push({
      name: 'family_history',
      impact: 'positive',
      description: 'No significant family medical history',
    });
    requestLogger.debug({ scoreChange: +10 }, 'Family history: positive');
  } else if (familyHistory <= 2) {
    factors.push({
      name: 'family_history',
      impact: 'neutral',
      description: `Limited family history (${familyHistory} condition(s))`,
    });
    requestLogger.debug({ familyHistory }, 'Family history: neutral');
  } else {
    score -= 10;
    factors.push({
      name: 'family_history',
      impact: 'negative',
      description: `Significant family history (${familyHistory} condition(s))`,
    });
    requestLogger.debug({ familyHistory, scoreChange: -10 }, 'Family history: negative');
  }

  // Ensure score stays within 0-100 range
  score = Math.max(0, Math.min(100, score));

  // Determine result based on score threshold
  // Threshold: 60+ = ACCEPTABLE, below 60 = NOT_ACCEPTABLE
  const result: ClassificationResult = score >= 60 ? CLASSIFICATION.ACCEPTABLE : CLASSIFICATION.NOT_ACCEPTABLE;

  // Generate detailed reason
  const reason =
    result === CLASSIFICATION.ACCEPTABLE
      ? `User meets acceptability criteria with a score of ${score}/100. Positive factors include ${factors.filter((f) => f.impact === 'positive').length} favorable indicators.`
      : `User does not meet acceptability criteria with a score of ${score}/100. Key concerns: ${factors
          .filter((f) => f.impact === 'negative')
          .map((f) => f.name)
          .join(', ')}.`;

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
 * Classify a user based on their complete bio and genetic data
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
  const acceptableCount = classifications.filter((c) => c.result === CLASSIFICATION.ACCEPTABLE).length;
  const notAcceptableCount = classifications.length - acceptableCount;

  requestLogger.info(
    {
      totalCount: classifications.length,
      acceptableCount,
      notAcceptableCount,
    },
    'Retrieved all classifications'
  );

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    count: classifications.length,
    acceptableCount,
    notAcceptableCount,
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
