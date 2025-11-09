/**
 * VAPI Tool Handler Server (Port 3000)
 *
 * Main webhook endpoint for VAPI tool calls.
 * When VAPI calls a tool, it sends a request to this server.
 * This server processes the tool call and returns results to VAPI.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import logger, { createChildLogger } from '../config/logger';
import { PORTS, HTTP_STATUS } from '../config/constants';
import {
  VAPIToolCallRequest,
  VAPIToolCallResponse,
  VAPIToolResult,
  CheckLeadArgs,
  GetUserDataArgs,
  UpdateUserDataArgs,
  ClassifyUserArgs,
  SaveClassificationResultArgs,
} from '../types/vapi.types';
import * as vapiService from '../services/vapi.service';
import { maskPhoneNumber } from '../utils/phoneNumber.util';

// Initialize Express app
const app = express();

// Middleware
// Configure Helmet with relaxed CSP for local development
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],  // Explicitly block inline event handlers for security
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })
);
app.use(cors()); // Enable CORS for all origins
app.use(express.json()); // Parse JSON request bodies

// Serve static files from the public directory
const publicPath = path.join(__dirname, '../../public');
app.use(express.static(publicPath));

/**
 * Request logging middleware
 */
app.use((req: Request, res: Response, next) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const requestLogger = createChildLogger({
    requestId,
    server: 'vapi-handler',
  });

  requestLogger.info(
    {
      method: req.method,
      path: req.path,
    },
    'Incoming request'
  );

  (res as any).requestLogger = requestLogger;
  next();
});

/**
 * Tool handler functions
 * Each function corresponds to a VAPI tool and processes its specific logic
 */

/**
 * Handle check_lead tool call
 * Checks if a phone number exists in the Lead CRM
 */
const handleCheckLead = async (args: CheckLeadArgs, callLogger: any): Promise<string> => {
  callLogger.info({ phoneNumber: maskPhoneNumber(args.phoneNumber) }, 'Tool: check_lead');

  const result = await vapiService.checkLead(args.phoneNumber);

  if (result.found && result.lead) {
    callLogger.info({ leadId: result.lead.leadId }, 'Lead found');

    return JSON.stringify({
      found: true,
      leadId: result.lead.leadId,
      name: result.lead.name,
      email: result.lead.email,
      message: `Lead found: ${result.lead.name}`,
    });
  } else {
    callLogger.info('Lead not found');

    return JSON.stringify({
      found: false,
      message: 'Lead not found with this phone number. Please ask the caller for their name and email to create a new lead.',
    });
  }
};

/**
 * Handle get_user_data tool call
 * Retrieves user bio and genetic data from User Data CRM
 */
const handleGetUserData = async (args: GetUserDataArgs, callLogger: any): Promise<string> => {
  callLogger.info({ phoneNumber: maskPhoneNumber(args.phoneNumber) }, 'Tool: get_user_data');

  const result = await vapiService.getUserData(args.phoneNumber);

  if (result.found && result.userData) {
    const isComplete = result.isComplete;
    const missingFields = result.missingFields;

    callLogger.info(
      {
        userId: result.userData.userId,
        isComplete,
        missingFieldsCount: missingFields.length,
      },
      'User data retrieved'
    );

    if (isComplete) {
      return JSON.stringify({
        found: true,
        isComplete: true,
        userData: result.userData,
        message: 'User data is complete and ready for classification.',
      });
    } else {
      // Build human-readable list of missing fields
      const missingFieldsReadable = missingFields.map((field) => {
        // Convert field path to readable name
        // e.g., "medicareData.medicareNumber" -> "Medicare number"
        const parts = field.split('.');
        const fieldName = parts[parts.length - 1];
        // Make field names more readable
        return fieldName
          .replace(/([A-Z])/g, ' $1')
          .toLowerCase()
          .trim();
      });

      return JSON.stringify({
        found: true,
        isComplete: false,
        userData: result.userData,
        missingFields: missingFieldsReadable,
        message: `User data found but incomplete. Missing information: ${missingFieldsReadable.join(', ')}. Please ask the user for these details.`,
      });
    }
  } else {
    callLogger.warn('User data not found');

    return JSON.stringify({
      found: false,
      message: 'User data not found. This user may need to be registered in the system first.',
    });
  }
};

/**
 * Handle update_user_data tool call
 * Updates Medicare member data and eligibility info in User Data CRM
 */
const handleUpdateUserData = async (args: UpdateUserDataArgs, callLogger: any): Promise<string> => {
  callLogger.info(
    {
      phoneNumber: maskPhoneNumber(args.phoneNumber),
      hasMedicareData: !!args.medicareData,
      hasEligibilityData: !!args.eligibilityData,
    },
    'Tool: update_user_data'
  );

  const result = await vapiService.updateUserData(args.phoneNumber, args.medicareData, args.eligibilityData);

  if (result.found && result.userData) {
    const isComplete = result.isComplete;

    callLogger.info(
      {
        userId: result.userData.userId,
        isComplete,
        remainingMissingFields: result.missingFields.length,
      },
      'User data updated'
    );

    if (isComplete) {
      return JSON.stringify({
        success: true,
        isComplete: true,
        message: 'User data updated successfully. All required information is now complete and ready for classification.',
      });
    } else {
      const missingFieldsReadable = result.missingFields.map((field) => {
        const parts = field.split('.');
        return parts[parts.length - 1];
      });

      return JSON.stringify({
        success: true,
        isComplete: false,
        missingFields: missingFieldsReadable,
        message: `User data updated. Still need: ${missingFieldsReadable.join(', ')}`,
      });
    }
  } else {
    callLogger.error('Failed to update user data');

    return JSON.stringify({
      success: false,
      message: 'Failed to update user data. Please try again.',
    });
  }
};

/**
 * Handle classify_user tool call
 * Sends user data to Classification CRM for analysis
 */
const handleClassifyUser = async (args: ClassifyUserArgs, callLogger: any): Promise<string> => {
  callLogger.info({ phoneNumber: maskPhoneNumber(args.phoneNumber) }, 'Tool: classify_user');

  // First, get the complete user data
  const userData = await vapiService.getUserData(args.phoneNumber);

  if (!userData.found || !userData.userData) {
    callLogger.error('Cannot classify: user data not found');

    return JSON.stringify({
      success: false,
      message: 'Cannot classify user: user data not found',
    });
  }

  if (!userData.isComplete) {
    callLogger.error(
      {
        missingFields: userData.missingFields,
      },
      'Cannot classify: user data incomplete'
    );

    return JSON.stringify({
      success: false,
      message: `Cannot classify user: data is incomplete. Missing: ${userData.missingFields.join(', ')}`,
    });
  }

  // Classify the user
  const classificationResult = await vapiService.classifyUser(userData.userData);

  if (classificationResult.success && classificationResult.classification) {
    const classification = classificationResult.classification;

    callLogger.info(
      {
        userId: classification.userId,
        result: classification.result,
        score: classification.score,
      },
      'User classified successfully'
    );

    return JSON.stringify({
      success: true,
      result: classification.result,
      score: classification.score,
      reason: classification.reason,
      message: `Classification complete: ${classification.result} (Score: ${classification.score}/100). ${classification.reason}`,
    });
  } else {
    callLogger.error('Classification failed');

    return JSON.stringify({
      success: false,
      message: classificationResult.message || 'Classification failed',
    });
  }
};

/**
 * Handle save_classification_result tool call
 * Saves the final classification result to Classification CRM
 */
const handleSaveClassificationResult = async (
  args: SaveClassificationResultArgs,
  callLogger: any
): Promise<string> => {
  callLogger.info(
    {
      userId: args.userId,
      result: args.result,
      score: args.score,
    },
    'Tool: save_classification_result'
  );

  const result = await vapiService.saveClassificationResult(
    args.userId,
    args.phoneNumber,
    args.result,
    args.score,
    args.reason
  );

  if (result.success) {
    callLogger.info({ userId: args.userId }, 'Classification result saved');

    return JSON.stringify({
      success: true,
      message: 'Classification result saved successfully',
    });
  } else {
    callLogger.error('Failed to save classification result');

    return JSON.stringify({
      success: false,
      message: result.message || 'Failed to save classification result',
    });
  }
};

/**
 * Handle classify_and_save_user tool call
 * Classifies the user and automatically saves the result to the CRM (combined operation)
 */
const handleClassifyAndSaveUser = async (args: ClassifyUserArgs, callLogger: any): Promise<string> => {
  callLogger.info({ phoneNumber: maskPhoneNumber(args.phoneNumber) }, 'Tool: classify_and_save_user');

  // First, get the complete user data
  const userData = await vapiService.getUserData(args.phoneNumber);

  if (!userData.found || !userData.userData) {
    callLogger.error('Cannot classify: user data not found');

    return JSON.stringify({
      success: false,
      message: 'Cannot classify user: user data not found',
    });
  }

  if (!userData.isComplete) {
    callLogger.error(
      {
        missingFields: userData.missingFields,
      },
      'Cannot classify: user data incomplete'
    );

    return JSON.stringify({
      success: false,
      message: `Cannot classify user: data is incomplete. Missing: ${userData.missingFields.join(', ')}`,
    });
  }

  // Classify the user
  const classificationResult = await vapiService.classifyUser(userData.userData);

  if (!classificationResult.success || !classificationResult.classification) {
    callLogger.error('Classification failed');

    return JSON.stringify({
      success: false,
      message: classificationResult.message || 'Classification failed',
    });
  }

  const classification = classificationResult.classification;

  callLogger.info(
    {
      userId: classification.userId,
      result: classification.result,
      score: classification.score,
    },
    'User classified successfully'
  );

  // Automatically save the result
  const saveResult = await vapiService.saveClassificationResult(
    classification.userId,
    args.phoneNumber,
    classification.result,
    classification.score,
    classification.reason
  );

  if (saveResult.success) {
    callLogger.info({ userId: classification.userId }, 'Classification result saved automatically');

    // VICI Integration: Automatically send disposition to VICI
    try {
      const dispositionResult = await vapiService.sendVICIDisposition(
        args.phoneNumber,
        classification.result,
        classification.score,
        classification.reason
      );

      callLogger.info(
        {
          userId: classification.userId,
          disposition: dispositionResult.disposition,
          dispositionId: dispositionResult.dispositionId,
        },
        'VICI disposition sent successfully'
      );

      return JSON.stringify({
        success: true,
        result: classification.result,
        score: classification.score,
        reason: classification.reason,
        viciDisposition: dispositionResult.disposition,
        message: `Classification complete and saved: ${classification.result} (Score: ${classification.score}/100). ${classification.reason}. Disposition ${dispositionResult.disposition} sent to VICI.`,
      });
    } catch (viciError: any) {
      // Log VICI error but don't fail the entire operation
      callLogger.warn(
        { userId: classification.userId, error: viciError.message },
        'Failed to send VICI disposition (classification still saved)'
      );

      return JSON.stringify({
        success: true,
        result: classification.result,
        score: classification.score,
        reason: classification.reason,
        viciDispositionFailed: true,
        message: `Classification complete and saved: ${classification.result} (Score: ${classification.score}/100). ${classification.reason}. Warning: VICI disposition failed.`,
      });
    }
  } else {
    callLogger.warn({ userId: classification.userId }, 'Classification succeeded but saving failed');

    return JSON.stringify({
      success: true,
      result: classification.result,
      score: classification.score,
      reason: classification.reason,
      saveFailed: true,
      message: `Classification complete: ${classification.result} (Score: ${classification.score}/100). ${classification.reason}. Note: Result was not saved automatically.`,
    });
  }
};

/**
 * Main tool call router
 * Routes incoming tool calls to the appropriate handler function
 *
 * Available tools (4 total):
 * - check_lead: Find caller in system
 * - get_user_data: Get Medicare data and missing fields
 * - update_user_data: Collect Medicare info from conversation
 * - classify_and_save_user: Classify eligibility + Save + Send VICI disposition (all-in-one)
 */
const handleToolCall = async (toolName: string, args: any, callLogger: any): Promise<string> => {
  callLogger.debug({ toolName, args }, 'Routing tool call');

  try {
    switch (toolName) {
      case 'check_lead':
        return await handleCheckLead(args as CheckLeadArgs, callLogger);

      case 'get_user_data':
        return await handleGetUserData(args as GetUserDataArgs, callLogger);

      case 'update_user_data':
        return await handleUpdateUserData(args as UpdateUserDataArgs, callLogger);

      case 'classify_and_save_user':
        return await handleClassifyAndSaveUser(args as ClassifyUserArgs, callLogger);

      // Legacy tools - removed for simplified workflow
      // classify_user and save_classification_result have been replaced by classify_and_save_user

      default:
        callLogger.warn({ toolName }, 'Unknown tool name');
        return JSON.stringify({
          error: `Unknown tool: ${toolName}. Available tools: check_lead, get_user_data, update_user_data, classify_and_save_user`,
        });
    }
  } catch (error: any) {
    callLogger.error({ toolName, error: error.message }, 'Tool call handler error');

    return JSON.stringify({
      error: `Error executing tool ${toolName}: ${error.message}`,
    });
  }
};

/**
 * POST /api/vapi/tool-calls
 *
 * Main webhook endpoint for VAPI tool calls
 * VAPI sends tool call requests to this endpoint
 */
app.post('/api/vapi/tool-calls', async (req: Request, res: Response) => {
  // Extract call ID and phone number for logging context
  const callId = req.body.call?.id || 'unknown';
  const customerNumber = req.body.call?.customer?.number || req.body.call?.phoneNumberFrom || 'unknown';

  // Create call-specific logger
  const callLogger = createChildLogger({
    callId,
    customerNumber: maskPhoneNumber(customerNumber),
  });

  callLogger.info('Received VAPI tool call request');

  try {
    const vapiRequest: VAPIToolCallRequest = req.body;

    // Validate request structure
    if (!vapiRequest.message || !vapiRequest.message.toolCalls || vapiRequest.message.toolCalls.length === 0) {
      callLogger.warn('Invalid tool call request: missing toolCalls');

      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Invalid request: missing toolCalls',
      });
    }

    const toolCalls = vapiRequest.message.toolCalls;

    callLogger.info(
      {
        toolCallsCount: toolCalls.length,
        toolNames: toolCalls.map((tc) => tc.function.name),
      },
      'Processing tool calls'
    );

    // Process each tool call
    const results: VAPIToolResult[] = [];

    for (const toolCall of toolCalls) {
      const toolCallId = toolCall.id;
      const toolName = toolCall.function.name;
      const argsString = toolCall.function.arguments;

      callLogger.debug(
        {
          toolCallId,
          toolName,
          argsString,
        },
        'Processing individual tool call'
      );

      // Parse arguments
      let args: any;
      try {
        args = JSON.parse(argsString);
      } catch (error) {
        callLogger.error({ toolCallId, argsString }, 'Failed to parse tool arguments');

        results.push({
          toolCallId,
          result: JSON.stringify({
            error: 'Failed to parse tool arguments',
          }),
        });

        continue;
      }

      // Execute tool handler
      const startTime = Date.now();
      const result = await handleToolCall(toolName, args, callLogger);
      const duration = Date.now() - startTime;

      callLogger.info(
        {
          toolCallId,
          toolName,
          duration,
        },
        'Tool call completed'
      );

      results.push({
        toolCallId,
        result,
      });
    }

    // Build response for VAPI
    const response: VAPIToolCallResponse = {
      results,
    };

    callLogger.info(
      {
        resultsCount: results.length,
      },
      'Sending tool call results back to VAPI'
    );

    return res.status(HTTP_STATUS.OK).json(response);
  } catch (error: any) {
    callLogger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Unhandled error in tool call handler'
    );

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json({
    status: 'healthy',
    service: 'vapi-tool-handler',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/vapi/tools
 *
 * Returns the tool definitions for VAPI dashboard configuration
 * This is a helper endpoint to document the available tools
 */
app.get('/api/vapi/tools', (_req: Request, res: Response) => {
  const tools = [
    {
      name: 'check_lead',
      description: 'Check if a phone number exists in the leads database',
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: {
            type: 'string',
            description: 'Phone number in E.164 format (e.g., +12025551234)',
          },
        },
        required: ['phoneNumber'],
      },
    },
    {
      name: 'get_user_data',
      description: 'Retrieve Medicare member data and check for missing required information',
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: {
            type: 'string',
            description: 'Phone number in E.164 format',
          },
        },
        required: ['phoneNumber'],
      },
    },
    {
      name: 'update_user_data',
      description: 'Update Medicare member data with information collected during the conversation',
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: {
            type: 'string',
            description: 'Phone number in E.164 format',
          },
          medicareData: {
            type: 'object',
            description: 'Medicare data to update: medicareNumber (MBI), planLevel (A/B/C/D/Advantage), hasColorblindness (boolean), colorblindType, currentEyewear, etc.',
          },
          eligibilityData: {
            type: 'object',
            description: 'Eligibility data to update (usually set by system during classification)',
          },
        },
        required: ['phoneNumber'],
      },
    },
    {
      name: 'classify_and_save_user',
      description: 'ONE-STEP TOOL: Checks Medicare eligibility, saves result to CRM, and automatically sends VICI disposition (SALE if QUALIFIED, NQI if NOT_QUALIFIED). This is the final step after all data is collected.',
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: {
            type: 'string',
            description: 'Phone number in E.164 format',
          },
        },
        required: ['phoneNumber'],
      },
    },
  ];

  res.status(HTTP_STATUS.OK).json({
    tools,
    serverUrl: `http://localhost:${PORTS.VAPI_HANDLER}/api/vapi/tool-calls`,
    note: 'SIMPLIFIED 4-TOOL WORKFLOW: check_lead → get_user_data → update_user_data → classify_and_save_user. Copy these tool definitions to your VAPI dashboard. Update serverUrl if using ngrok or deployed URL.',
    totalTools: 4,
  });
});

/**
 * Error handling middleware
 */
app.use((err: Error, _req: Request, res: Response, _next: any) => {
  const requestLogger = (res as any).requestLogger || logger;

  requestLogger.error(
    {
      error: err.message,
      stack: err.stack,
    },
    'Unhandled error in VAPI Tool Handler server'
  );

  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    error: 'Internal server error',
    message: err.message,
  });
});

/**
 * Start the server
 */
const startServer = () => {
  app.listen(PORTS.VAPI_HANDLER, () => {
    logger.info(
      {
        port: PORTS.VAPI_HANDLER,
        service: 'vapi-tool-handler',
        webhookUrl: `http://localhost:${PORTS.VAPI_HANDLER}/api/vapi/tool-calls`,
        toolsUrl: `http://localhost:${PORTS.VAPI_HANDLER}/api/vapi/tools`,
        dashboardUrl: `http://localhost:${PORTS.VAPI_HANDLER}`,
      },
      `VAPI Tool Handler Server started on port ${PORTS.VAPI_HANDLER}`
    );

    logger.info('📊 Dashboard available at: http://localhost:' + PORTS.VAPI_HANDLER);
    logger.info('🔧 To view tool definitions for VAPI configuration, visit: /api/vapi/tools');
  });
};

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

export default app;
