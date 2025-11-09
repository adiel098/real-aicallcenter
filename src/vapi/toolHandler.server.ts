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
  ValidateMedicareEligibilityArgs,
  ScheduleCallbackArgs,
  TransferCallArgs,
  VAPICallStartedEvent,
  VAPICallEndedEvent,
  VAPIMessageEvent,
  VAPISpeechInterruptedEvent,
  VAPIHangEvent,
  VAPIServerMessage,
} from '../types/vapi.types';
import * as vapiService from '../services/vapi.service';
import { maskPhoneNumber } from '../utils/phoneNumber.util';
import { medicareService } from '../services/medicare.service';
import { callStateService, CallStatus } from '../services/callState.service';
import { callStatusDetectionService } from '../services/callStatusDetection.service';
import { viciService } from '../services/vici.service';

// Initialize Express app
const app = express();

// Middleware
// Configure Helmet with relaxed CSP for local development
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "http://localhost:3001",
          "http://localhost:3002",
          "http://localhost:3003",
          "https://api.vapi.ai",
          "wss://api.vapi.ai",
          "https://*.daily.co",
          "wss://*.daily.co",
        ],
        scriptSrc: ["'self'", "https://unpkg.com", "https://c.daily.co"],
        scriptSrcAttr: ["'none'"],  // Explicitly block inline event handlers for security
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        frameSrc: ["'self'", "https://*.daily.co"],
        workerSrc: ["'self'", "blob:"],
        childSrc: ["'self'", "blob:"],
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
 * Unified VAPI Server Message Handler
 *
 * VAPI sends ALL server messages to the base serverUrl ("/").
 * This handler receives all events and routes them based on message.type.
 *
 * Message types:
 * - status-update: Call started/ended
 * - transcript: Real-time transcription
 * - speech-update: User/assistant speech events
 * - tool-calls: Function calls during conversation
 * - tool-calls-result: Results from tool execution
 * - hang: Call hung up
 * - user-interrupted: User interrupts assistant
 * - end-of-call-report: Complete call summary
 */
app.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as any;

    // Check if this is a VAPI server message
    if (!body.message || !body.message.type) {
      // Not a VAPI message, ignore
      return res.status(HTTP_STATUS.OK).send();
    }

    const messageType = body.message.type;
    const call = body.call;

    // Create logger with call context
    const eventLogger = createChildLogger({
      callId: call?.id,
      customerNumber: call?.customer?.number ? maskPhoneNumber(call.customer.number) :
                      call?.phoneNumberFrom ? maskPhoneNumber(call.phoneNumberFrom) : 'unknown',
      event: messageType,
    });

    // Route based on message type
    switch (messageType) {
      case 'status-update':
        await handleStatusUpdate(body, eventLogger);
        break;

      case 'transcript':
        handleTranscript(body, eventLogger);
        break;

      case 'speech-update':
        handleSpeechUpdate(body, eventLogger);
        break;

      case 'tool-calls':
        handleToolCalls(body, eventLogger);
        break;

      case 'tool-calls-result':
        handleToolCallsResult(body, eventLogger);
        break;

      case 'hang':
        handleHang(body, eventLogger);
        break;

      case 'user-interrupted':
        handleUserInterrupted(body, eventLogger);
        break;

      case 'end-of-call-report':
        handleEndOfCallReport(body, eventLogger);
        break;

      default:
        eventLogger.debug({ messageType }, 'Unknown message type received');
    }

    return res.status(HTTP_STATUS.OK).send();
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error processing VAPI server message');
    return res.status(HTTP_STATUS.OK).send(); // Always return 200 to VAPI
  }
});

/**
 * Event Handler Functions
 */

async function handleStatusUpdate(body: any, eventLogger: any): Promise<void> {
  const { message, call } = body;
  const { status, endedReason } = message;

  if (status === 'in-progress') {
    // Call started - create session and assign agent extension
    const phoneNumber = call.customer?.number || call.phoneNumberFrom || 'unknown';
    const session = callStateService.createCallSession(call.id, phoneNumber);

    eventLogger.info(
      {
        callType: call.type,
        phoneFrom: call.phoneNumberFrom,
        phoneTo: call.phoneNumberTo,
        startedAt: call.startedAt,
        agentExtension: session.agentExtension,
        withinBusinessHours: session.withinBusinessHours,
      },
      `📞 CALL STARTED - Agent: ${session.agentExtension} - Business Hours: ${session.withinBusinessHours ? 'Yes' : 'No'}`
    );

    // Check business hours and send disposition if outside hours
    if (!session.withinBusinessHours) {
      eventLogger.warn('Call received outside business hours');

      // Send NA (No Answer) disposition for after-hours calls
      try {
        const afterHoursDisposition = await viciService.sendDisposition(
          phoneNumber,
          'NA',
          {
            agentId: session.agentExtension,
            callDuration: 0,
            reason: 'After-hours call - outside business hours (9am-5:45pm EST Mon-Fri)',
          }
        );

        eventLogger.info(
          {
            disposition: 'NA',
            dispositionId: afterHoursDisposition.dispositionId,
          },
          'After-hours disposition sent'
        );
      } catch (error: any) {
        eventLogger.error({ error: error.message }, 'Failed to send after-hours disposition');
      }
    }

    // Update call state
    callStateService.updateCallState(call.id, 'CONNECTED');
  } else if (status === 'ended') {
    // Call ended - analyze status and send appropriate disposition
    const phoneNumber = call.customer?.number || call.phoneNumberFrom || 'unknown';
    const callDuration = call.duration || 0;

    // Detect call status
    const callStatus = callStatusDetectionService.detectStatusFromEndReason(endedReason || call.endReason);

    eventLogger.info(
      {
        duration: callDuration,
        endedReason: endedReason || call.endReason,
        endedAt: call.endedAt,
        detectedStatus: callStatus,
      },
      `📴 CALL ENDED - Duration: ${callDuration}s - Reason: ${endedReason || call.endReason || 'unknown'} - Status: ${callStatus}`
    );

    // Get call session
    const session = callStateService.getCallSession(call.id);

    // Only send disposition if one hasn't been sent already (during classify_and_save_user)
    if (session && !session.dispositionSent && callStatus !== 'LIVE_PERSON' && callStatus !== 'UNKNOWN') {
      // Map call status to disposition
      const disposition = callStatusDetectionService.mapStatusToDisposition(callStatus);

      if (disposition) {
        try {
          const dispositionResult = await viciService.sendDisposition(
            phoneNumber,
            disposition,
            {
              agentId: session.agentExtension,
              callDuration,
              reason: `Call status: ${callStatus}`,
            }
          );

          callStateService.markDispositionSent(call.id, disposition, dispositionResult.dispositionId);

          eventLogger.info(
            {
              disposition,
              dispositionId: dispositionResult.dispositionId,
              callStatus,
            },
            `Automatic disposition sent: ${disposition} (${callStatus})`
          );
        } catch (error: any) {
          eventLogger.error({ error: error.message, disposition }, 'Failed to send automatic disposition');
        }
      }
    }

    // End call session
    callStateService.endCallSession(call.id);
  } else {
    eventLogger.info({ status }, `📞 Call status: ${status}`);

    // Update call state
    if (call.id) {
      if (status === 'ringing') {
        callStateService.updateCallState(call.id, 'PRE_CONNECT');
      } else if (status === 'in-progress') {
        callStateService.updateCallState(call.id, 'IN_PROGRESS');
      }
    }
  }
}

function handleTranscript(body: any, eventLogger: any): void {
  const { message } = body;
  const { role, transcript, transcriptType } = message;

  if (transcriptType === 'final') {
    if (role === 'user') {
      eventLogger.info(
        { transcript },
        `👤 USER SAID: "${transcript}"`
      );
    } else if (role === 'assistant') {
      eventLogger.info(
        { transcript },
        `🤖 ASSISTANT SAID: "${transcript}"`
      );
    }
  } else {
    // Partial transcripts (optional, can be noisy)
    eventLogger.debug(
      { role, transcript, transcriptType },
      `💬 ${role.toUpperCase()} speaking... "${transcript}"`
    );
  }
}

function handleSpeechUpdate(body: any, eventLogger: any): void {
  const { message } = body;
  const { role, status } = message;

  if (status === 'started') {
    eventLogger.debug({ role }, `🗣️  ${role === 'user' ? 'User' : 'Assistant'} started speaking`);
  } else if (status === 'stopped') {
    eventLogger.debug({ role }, `🔇 ${role === 'user' ? 'User' : 'Assistant'} stopped speaking`);
  }
}

function handleToolCalls(body: any, eventLogger: any): void {
  const { message } = body;
  const { toolCallList } = message;

  if (!toolCallList || toolCallList.length === 0) {
    return;
  }

  eventLogger.info(
    { toolCallCount: toolCallList.length },
    `🔧 TOOL CALLS (${toolCallList.length})`
  );

  toolCallList.forEach((toolCall: any, index: number) => {
    const { function: func, id } = toolCall;
    const args = func.arguments ? JSON.parse(func.arguments) : {};

    // Mask phone numbers in arguments for privacy
    const maskedArgs = { ...args };
    if (maskedArgs.phoneNumber) {
      maskedArgs.phoneNumber = maskPhoneNumber(maskedArgs.phoneNumber);
    }

    eventLogger.info(
      {
        toolCallId: id,
        toolName: func.name,
        arguments: maskedArgs,
      },
      `  ${index + 1}. 🔧 ${func.name}`
    );
    eventLogger.info(
      { arguments: maskedArgs },
      `     📥 Arguments: ${JSON.stringify(maskedArgs, null, 2)}`
    );
  });
}

function handleToolCallsResult(body: any, eventLogger: any): void {
  const { message } = body;
  const { toolCallResults } = message;

  if (!toolCallResults || toolCallResults.length === 0) {
    return;
  }

  eventLogger.info(
    { resultCount: toolCallResults.length },
    `✅ TOOL RESULTS (${toolCallResults.length})`
  );

  toolCallResults.forEach((result: any, index: number) => {
    const { toolCallId, result: toolResult } = result;

    eventLogger.info(
      {
        toolCallId,
        result: toolResult,
      },
      `  ${index + 1}. ✅ Result for ${toolCallId}`
    );
    eventLogger.info(
      { result: toolResult },
      `     📤 Result: ${JSON.stringify(toolResult, null, 2)}`
    );
  });
}

function handleHang(body: any, eventLogger: any): void {
  eventLogger.info('📞 CALL HUNG UP');
}

function handleUserInterrupted(body: any, eventLogger: any): void {
  eventLogger.info('⚠️  USER INTERRUPTED ASSISTANT');
}

function handleEndOfCallReport(body: any, eventLogger: any): void {
  const { message, call } = body;
  const {
    endedReason,
    summary,
    messages,
    recordingUrl,
    transcript,
    costs,
  } = message;

  eventLogger.info('📊 END OF CALL REPORT');
  eventLogger.info({ endedReason }, `   End Reason: ${endedReason}`);

  if (summary) {
    eventLogger.info({ summary }, `   Summary: ${summary}`);
  }

  if (messages && messages.length > 0) {
    eventLogger.info({ messageCount: messages.length }, `   Messages: ${messages.length} total`);
  }

  if (recordingUrl) {
    eventLogger.info({ recordingUrl }, `   Recording: ${recordingUrl}`);
  }

  if (costs) {
    eventLogger.info({ costs }, `   Costs: $${costs.total?.toFixed(4) || '0.0000'}`);
  }

  if (transcript) {
    eventLogger.info('   Full Transcript:');
    eventLogger.info(transcript);
  }
}

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
 * Handle validate_medicare_eligibility tool call
 * Validates Medicare eligibility through SSN → MBI → Insurance Check workflow
 * Implements retry logic (max 3 attempts) as per AlexAI_Workflow_Full_Detailed.md
 */
const handleValidateMedicareEligibility = async (
  args: ValidateMedicareEligibilityArgs,
  callLogger: any,
  callId: string
): Promise<string> => {
  callLogger.info(
    {
      phoneNumber: maskPhoneNumber(args.phoneNumber),
      ssnLast4: `***${args.ssnLast4}`,
    },
    'Tool: validate_medicare_eligibility'
  );

  // Get or create call session
  let session = callStateService.getCallSession(callId);
  if (!session) {
    session = callStateService.createCallSession(callId, args.phoneNumber);
  }

  // Check if max retries exceeded
  if (callStateService.hasExceededMaxRetries(callId)) {
    callLogger.warn({ attempts: session.mbiValidationAttempts }, 'Max MBI validation retries exceeded');

    return JSON.stringify({
      success: false,
      validated: false,
      maxRetriesExceeded: true,
      attempts: session.mbiValidationAttempts,
      message: `Unable to validate Medicare eligibility after ${session.maxRetries} attempts. We're having trouble verifying your Medicare information. Would you like us to schedule a callback for when we can help you complete this process?`,
    });
  }

  // Increment validation attempt
  const canRetry = callStateService.incrementMBIAttempts(callId);

  try {
    // Call Medicare validation service
    const validationResult = await medicareService.validateMedicareEligibility(
      args.ssnLast4,
      args.dateOfBirth,
      args.firstName,
      args.lastName
    );

    if (validationResult.eligible) {
      // Mark as validated
      callStateService.markMedicareValidated(callId, true);

      callLogger.info(
        {
          mbi: validationResult.mbiNumber ? `****-****-**${validationResult.mbiNumber.slice(-2)}` : 'N/A',
          planLevel: validationResult.planLevel,
        },
        'Medicare eligibility validated successfully'
      );

      return JSON.stringify({
        success: true,
        validated: true,
        eligible: true,
        planLevel: validationResult.planLevel,
        copay: validationResult.copay,
        message: `Great news! Your Medicare eligibility has been verified. You have ${validationResult.planLevel} coverage${validationResult.copay ? ` with a $${validationResult.copay} copay` : ' with no copay'}.`,
      });
    } else {
      // Not eligible or validation failed
      callStateService.markMedicareValidated(callId, false);

      const reason = validationResult.reason || 'UNKNOWN';

      callLogger.warn({ reason, attempts: session.mbiValidationAttempts + 1 }, 'Medicare validation failed');

      // Check if we can retry
      if (canRetry && reason.includes('ERROR')) {
        return JSON.stringify({
          success: false,
          validated: false,
          canRetry: true,
          attempts: session.mbiValidationAttempts,
          maxRetries: session.maxRetries,
          message: `We encountered an issue verifying your Medicare information. Could you please verify your information and try again? This is attempt ${session.mbiValidationAttempts} of ${session.maxRetries}.`,
        });
      } else {
        // Max retries or permanent failure
        return JSON.stringify({
          success: false,
          validated: false,
          eligible: false,
          reason,
          message: `Unfortunately, we were unable to verify your Medicare eligibility. Reason: ${reason}. You may not qualify for this program, or there may be an issue with your Medicare information on file.`,
        });
      }
    }
  } catch (error: any) {
    callLogger.error({ error: error.message, attempts: session.mbiValidationAttempts }, 'Medicare validation error');

    if (canRetry) {
      return JSON.stringify({
        success: false,
        validated: false,
        error: error.message,
        canRetry: true,
        attempts: session.mbiValidationAttempts,
        message: `We're experiencing technical difficulties validating your Medicare information. Would you like to try again? This is attempt ${session.mbiValidationAttempts} of ${session.maxRetries}.`,
      });
    } else {
      return JSON.stringify({
        success: false,
        validated: false,
        error: error.message,
        maxRetriesExceeded: true,
        message: `We've tried ${session.maxRetries} times but are unable to validate your Medicare information due to technical issues. Would you like us to schedule a callback to help you later?`,
      });
    }
  }
};

/**
 * Handle schedule_callback tool call
 * Schedules a callback through VICI API
 * Triggered when: data collection incomplete, max retries exceeded, or after-hours calls
 */
const handleScheduleCallback = async (
  args: ScheduleCallbackArgs,
  callLogger: any,
  callId: string
): Promise<string> => {
  callLogger.info(
    {
      phoneNumber: maskPhoneNumber(args.phoneNumber),
      reason: args.reason,
    },
    'Tool: schedule_callback'
  );

  // Get call session
  const session = callStateService.getCallSession(callId);
  const agentId = session?.agentExtension || '8001';

  // Calculate callback date/time
  let callbackDateTime = args.preferredDate;
  if (!callbackDateTime) {
    // Default: next business day at 10am EST
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    callbackDateTime = tomorrow.toISOString();
  }

  try {
    // Call VICI callback API
    const callbackResult = await viciService.scheduleCallback(
      args.phoneNumber,
      callbackDateTime,
      args.reason,
      {
        agentId,
        notes: args.notes,
      }
    );

    // Mark callback as scheduled in session
    if (session) {
      callStateService.markCallbackScheduled(callId, callbackDateTime);
    }

    callLogger.info(
      {
        callbackId: callbackResult.callbackId,
        callbackDateTime,
      },
      'Callback scheduled successfully'
    );

    // Format callback time for user
    const callbackDate = new Date(callbackDateTime);
    const formattedTime = callbackDate.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    });

    return JSON.stringify({
      success: true,
      callbackScheduled: true,
      callbackId: callbackResult.callbackId,
      callbackDateTime,
      message: `Perfect! I've scheduled a callback for ${formattedTime} Eastern Time. We'll call you back then to complete your Medicare eligibility verification. Is there anything else I can help you with today?`,
    });
  } catch (error: any) {
    callLogger.error({ error: error.message }, 'Failed to schedule callback');

    return JSON.stringify({
      success: false,
      error: error.message,
      message: `I apologize, but I'm having trouble scheduling your callback right now. Please try calling us back at your convenience during our business hours: Monday through Friday, 9am to 5:45pm Eastern Time.`,
    });
  }
};

/**
 * Handle transfer_call tool call
 * Transfers call to human CRM agent (extension 2002)
 * Triggered after SALE disposition or when AI agent cannot handle request
 */
const handleTransferCall = async (
  args: TransferCallArgs,
  callLogger: any,
  callId: string
): Promise<string> => {
  callLogger.info(
    {
      phoneNumber: maskPhoneNumber(args.phoneNumber),
      transferReason: args.transferReason,
      extension: args.extension || '2002',
    },
    'Tool: transfer_call'
  );

  const targetExtension = args.extension || '2002'; // Default: human CRM agent

  try {
    // NOTE: Actual call transfer would be handled by VAPI's transfer functionality
    // This tool just logs the intent and prepares the transfer

    callLogger.info(
      {
        targetExtension,
        reason: args.transferReason,
      },
      'Call transfer initiated'
    );

    return JSON.stringify({
      success: true,
      transferInitiated: true,
      targetExtension,
      message: `Great! I'm transferring you now to one of our specialists at extension ${targetExtension} who can help you complete your enrollment. Please hold for just a moment.`,
    });
  } catch (error: any) {
    callLogger.error({ error: error.message }, 'Failed to transfer call');

    return JSON.stringify({
      success: false,
      error: error.message,
      message: `I apologize, but I'm having trouble transferring your call right now. Let me take down your information and have someone call you back shortly.`,
    });
  }
};

/**
 * Main tool call router
 * Routes incoming tool calls to the appropriate handler function
 *
 * Available tools (7 total):
 * - check_lead: Find caller in system
 * - get_user_data: Get Medicare data and missing fields
 * - update_user_data: Collect Medicare info from conversation
 * - validate_medicare_eligibility: SSN → MBI → Insurance validation (NEW)
 * - classify_and_save_user: Classify eligibility + Save + Send VICI disposition (all-in-one)
 * - schedule_callback: Schedule callback through VICI (NEW)
 * - transfer_call: Transfer to human agent extension 2002 (NEW)
 */
const handleToolCall = async (toolName: string, args: any, callLogger: any, callId: string): Promise<string> => {
  callLogger.debug({ toolName, args }, 'Routing tool call');

  try {
    switch (toolName) {
      case 'check_lead':
        return await handleCheckLead(args as CheckLeadArgs, callLogger);

      case 'get_user_data':
        return await handleGetUserData(args as GetUserDataArgs, callLogger);

      case 'update_user_data':
        return await handleUpdateUserData(args as UpdateUserDataArgs, callLogger);

      case 'validate_medicare_eligibility':
        return await handleValidateMedicareEligibility(args as ValidateMedicareEligibilityArgs, callLogger, callId);

      case 'classify_and_save_user':
        return await handleClassifyAndSaveUser(args as ClassifyUserArgs, callLogger);

      case 'schedule_callback':
        return await handleScheduleCallback(args as ScheduleCallbackArgs, callLogger, callId);

      case 'transfer_call':
        return await handleTransferCall(args as TransferCallArgs, callLogger, callId);

      // Legacy tools - removed for simplified workflow
      // classify_user and save_classification_result have been replaced by classify_and_save_user

      default:
        callLogger.warn({ toolName }, 'Unknown tool name');
        return JSON.stringify({
          error: `Unknown tool: ${toolName}. Available tools: check_lead, get_user_data, update_user_data, validate_medicare_eligibility, classify_and_save_user, schedule_callback, transfer_call`,
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
      const result = await handleToolCall(toolName, args, callLogger, callId);
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
 * VAPI Event Webhook Handlers
 * These endpoints receive real-time call events from VAPI
 */

/**
 * POST /api/vapi/events/call-started
 * Called when a new call begins
 */
app.post('/api/vapi/events/call-started', (req: Request, res: Response) => {
  try {
    const event: VAPICallStartedEvent = req.body;
    const { call, timestamp } = event;

    const eventLogger = createChildLogger({
      callId: call.id,
      customerNumber: maskPhoneNumber(call.customer?.number || call.phoneNumberFrom),
      event: 'CALL_STARTED',
    });

    eventLogger.info(
      {
        callType: call.type,
        status: call.status,
        phoneFrom: call.phoneNumberFrom,
        phoneTo: call.phoneNumberTo,
        startedAt: call.startedAt || timestamp,
      },
      '📞 CALL STARTED'
    );

    res.status(HTTP_STATUS.OK).send();
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error processing call.started event');
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to process event' });
  }
});

/**
 * POST /api/vapi/events/call-ended
 * Called when a call completes
 */
app.post('/api/vapi/events/call-ended', (req: Request, res: Response) => {
  try {
    const event: VAPICallEndedEvent = req.body;
    const { call, timestamp, summary, messages } = event;

    const eventLogger = createChildLogger({
      callId: call.id,
      customerNumber: maskPhoneNumber(call.customer?.number || call.phoneNumberFrom),
      event: 'CALL_ENDED',
    });

    eventLogger.info(
      {
        callType: call.type,
        status: call.status,
        duration: call.duration,
        endReason: call.endReason,
        endedAt: call.endedAt || timestamp,
        messageCount: messages?.length || 0,
      },
      `📴 CALL ENDED - Duration: ${call.duration}s - Reason: ${call.endReason}`
    );

    // Log call summary if available
    if (summary) {
      eventLogger.info({ summary }, 'Call summary');
    }

    // Log conversation statistics
    if (messages && messages.length > 0) {
      const userMessages = messages.filter((m) => m.role === 'user').length;
      const assistantMessages = messages.filter((m) => m.role === 'assistant').length;
      const toolCalls = messages.filter((m) => m.toolCalls && m.toolCalls.length > 0).length;

      eventLogger.info(
        {
          totalMessages: messages.length,
          userMessages,
          assistantMessages,
          toolCalls,
        },
        'Conversation statistics'
      );
    }

    res.status(HTTP_STATUS.OK).send();
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error processing call.ended event');
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to process event' });
  }
});

/**
 * POST /api/vapi/events/message
 * Called for each conversation turn (user says something or assistant responds)
 */
app.post('/api/vapi/events/message', (req: Request, res: Response) => {
  try {
    const event: VAPIMessageEvent = req.body;
    const { call, message, timestamp } = event;

    const eventLogger = createChildLogger({
      callId: call.id,
      customerNumber: maskPhoneNumber(call.customer?.number || call.phoneNumberFrom),
      event: 'MESSAGE',
    });

    // Format message for logging based on role
    if (message.role === 'user') {
      eventLogger.info(
        {
          role: message.role,
          content: message.content,
          timestamp: message.timestamp || timestamp,
        },
        `👤 USER SAID: "${message.content}"`
      );
    } else if (message.role === 'assistant') {
      eventLogger.info(
        {
          role: message.role,
          content: message.content,
          timestamp: message.timestamp || timestamp,
          duration: message.duration,
        },
        `🤖 ASSISTANT SAID: "${message.content}"`
      );
    } else if (message.role === 'tool') {
      eventLogger.info(
        {
          role: message.role,
          toolCallId: message.toolCallId,
          timestamp: message.timestamp || timestamp,
        },
        '🔧 TOOL RESPONSE'
      );
    } else {
      eventLogger.info(
        {
          role: message.role,
          content: message.content,
          timestamp: message.timestamp || timestamp,
        },
        `💬 MESSAGE (${message.role})`
      );
    }

    res.status(HTTP_STATUS.OK).send();
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error processing message event');
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to process event' });
  }
});

/**
 * POST /api/vapi/events/speech-interrupted
 * Called when user interrupts the assistant
 */
app.post('/api/vapi/events/speech-interrupted', (req: Request, res: Response) => {
  try {
    const event: VAPISpeechInterruptedEvent = req.body;
    const { call, timestamp } = event;

    const eventLogger = createChildLogger({
      callId: call.id,
      customerNumber: maskPhoneNumber(call.customer?.number || call.phoneNumberFrom),
      event: 'SPEECH_INTERRUPTED',
    });

    eventLogger.info(
      {
        timestamp,
      },
      '⚠️  USER INTERRUPTED ASSISTANT'
    );

    res.status(HTTP_STATUS.OK).send();
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error processing speech-interrupted event');
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to process event' });
  }
});

/**
 * POST /api/vapi/events/hang
 * Called when call is hung up
 */
app.post('/api/vapi/events/hang', (req: Request, res: Response) => {
  try {
    const event: VAPIHangEvent = req.body;
    const { call, timestamp } = event;

    const eventLogger = createChildLogger({
      callId: call.id,
      customerNumber: maskPhoneNumber(call.customer?.number || call.phoneNumberFrom),
      event: 'HANG',
    });

    eventLogger.info(
      {
        timestamp,
      },
      '📞 CALL HUNG UP'
    );

    res.status(HTTP_STATUS.OK).send();
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error processing hang event');
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to process event' });
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
            description: 'Phone number (e.g., +12025551234)',
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
            description: 'Phone number',
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
            description: 'Phone number',
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
      name: 'validate_medicare_eligibility',
      description: 'Validate Medicare eligibility through SSN → MBI → Insurance Check workflow. Implements 3-attempt retry logic. Call this BEFORE classify_and_save_user to verify Medicare coverage.',
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: {
            type: 'string',
            description: 'Phone number',
          },
          ssnLast4: {
            type: 'string',
            description: 'Last 4 digits of Social Security Number',
          },
          dateOfBirth: {
            type: 'string',
            description: 'Date of birth in YYYY-MM-DD format',
          },
          firstName: {
            type: 'string',
            description: 'First name (optional, helps with verification)',
          },
          lastName: {
            type: 'string',
            description: 'Last name (optional, helps with verification)',
          },
        },
        required: ['phoneNumber', 'ssnLast4', 'dateOfBirth'],
      },
    },
    {
      name: 'classify_and_save_user',
      description: 'ONE-STEP TOOL: Checks Medicare eligibility, saves result to CRM, and automatically sends VICI disposition (SALE if QUALIFIED, NQI if NOT_QUALIFIED). This is the final step after all data is collected and Medicare is validated.',
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: {
            type: 'string',
            description: 'Phone number',
          },
        },
        required: ['phoneNumber'],
      },
    },
    {
      name: 'schedule_callback',
      description: 'Schedule a callback through VICI system. Use when: (1) Max Medicare validation retries exceeded, (2) Data collection incomplete, (3) Customer requests callback, or (4) After-hours call.',
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: {
            type: 'string',
            description: 'Phone number',
          },
          reason: {
            type: 'string',
            description: 'Reason for callback (e.g., "Medicare validation failed after 3 attempts", "Customer requested callback", "After-hours call")',
          },
          preferredDate: {
            type: 'string',
            description: 'Preferred callback date/time in ISO format (optional, defaults to next business day at 10am EST)',
          },
          notes: {
            type: 'string',
            description: 'Additional notes about the callback (optional)',
          },
        },
        required: ['phoneNumber', 'reason'],
      },
    },
    {
      name: 'transfer_call',
      description: 'Transfer call to human CRM agent. Use after SALE disposition (qualified customer) or when AI cannot handle complex request.',
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: {
            type: 'string',
            description: 'Phone number',
          },
          transferReason: {
            type: 'string',
            description: 'Reason for transfer (e.g., "Customer qualified - SALE disposition", "Complex inquiry requiring human agent")',
          },
          extension: {
            type: 'string',
            description: 'Target extension (optional, defaults to 2002 for human CRM agent)',
          },
        },
        required: ['phoneNumber', 'transferReason'],
      },
    },
  ];

  res.status(HTTP_STATUS.OK).json({
    tools,
    serverUrl: `http://localhost:${PORTS.VAPI_HANDLER}/api/vapi/tool-calls`,
    note: 'COMPLETE 7-TOOL WORKFLOW: check_lead → get_user_data → update_user_data → validate_medicare_eligibility → classify_and_save_user → [schedule_callback OR transfer_call]. Copy these tool definitions to your VAPI dashboard. Update serverUrl if using ngrok or deployed URL.',
    totalTools: 7,
    workflow: {
      standard: 'check_lead → get_user_data → update_user_data → validate_medicare_eligibility → classify_and_save_user',
      onValidationFailure: 'After 3 failed Medicare validations → schedule_callback',
      onQualified: 'After SALE disposition → transfer_call to extension 2002',
      afterHours: 'Outside business hours (9am-5:45pm EST Mon-Fri) → schedule_callback',
    },
    dispositions: {
      SALE: 'Qualified - Medicare validated, eligible for premium eyewear',
      NQI: 'Not Qualified Insurance - Doesn\'t meet Medicare eligibility',
      NI: 'Not Interested - Caller declined program',
      NA: 'No Answer - No pickup or after-hours call',
      AM: 'Answering Machine - Voicemail detected',
      DC: 'Disconnected - Line disconnected or fax tone',
      B: 'Busy - Line busy signal',
      DAIR: 'Dead Air - 6+ seconds silence',
    },
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
    logger.info('');
    logger.info('📞 Event webhook endpoints (configure in VAPI dashboard):');
    logger.info(`   • Call Started: POST /api/vapi/events/call-started`);
    logger.info(`   • Call Ended:   POST /api/vapi/events/call-ended`);
    logger.info(`   • Message:      POST /api/vapi/events/message`);
    logger.info(`   • Interrupted:  POST /api/vapi/events/speech-interrupted`);
    logger.info(`   • Hang:         POST /api/vapi/events/hang`);
    logger.info('');
    logger.info('🌐 For production, expose these endpoints via ngrok and configure in VAPI dashboard');
  });
};

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

export default app;
