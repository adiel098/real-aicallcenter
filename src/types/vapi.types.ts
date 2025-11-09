/**
 * VAPI Type Definitions
 *
 * Types for VAPI webhook requests and tool call handling
 */

/**
 * VAPIToolCall - Individual tool call from VAPI
 */
export interface VAPIToolCall {
  /** Unique ID for this tool call - must be included in response */
  id: string;

  /** Type is always 'function' for function calls */
  type: 'function';

  /** Function details */
  function: {
    /** Name of the function/tool being called */
    name: string;

    /** Arguments passed to the function (JSON string) */
    arguments: string;
  };
}

/**
 * VAPIMessage - Message context from VAPI
 */
export interface VAPIMessage {
  /** Role of the message sender */
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';

  /** Message content */
  content?: string;

  /** Tool calls in this message */
  toolCalls?: VAPIToolCall[];

  /** Tool call ID (for tool role messages) */
  toolCallId?: string;
}

/**
 * VAPIToolCallRequest - Complete webhook request from VAPI
 *
 * This is what VAPI sends to our tool handler endpoint
 */
export interface VAPIToolCallRequest {
  /** The specific tool call being made */
  message: {
    /** Tool calls list */
    toolCalls: VAPIToolCall[];

    /** Role */
    role: string;
  };

  /** Call information */
  call?: {
    /** Unique call ID */
    id: string;

    /** Phone number from */
    phoneNumberFrom?: string;

    /** Phone number to */
    phoneNumberTo?: string;

    /** Customer info */
    customer?: {
      number?: string;
    };
  };
}

/**
 * VAPIToolResult - Result to return for a single tool call
 */
export interface VAPIToolResult {
  /** Must match the toolCallId from the request */
  toolCallId: string;

  /** Result data - can be string or object (will be stringified for VAPI) */
  result: string;
}

/**
 * VAPIToolCallResponse - Response to send back to VAPI
 *
 * This is what our tool handler sends back to VAPI
 */
export interface VAPIToolCallResponse {
  /** Array of results, one for each tool call in the request */
  results: VAPIToolResult[];
}

/**
 * Tool function argument types for type safety
 */

/** Arguments for check_lead tool */
export interface CheckLeadArgs {
  phoneNumber: string;
}

/** Arguments for get_user_data tool */
export interface GetUserDataArgs {
  phoneNumber: string;
}

/** Arguments for update_user_data tool */
export interface UpdateUserDataArgs {
  phoneNumber: string;
  medicareData?: Record<string, unknown>;
  eligibilityData?: Record<string, unknown>;
}

/** Arguments for classify_user tool */
export interface ClassifyUserArgs {
  phoneNumber: string;
}

/** Arguments for save_classification_result tool */
export interface SaveClassificationResultArgs {
  userId: string;
  phoneNumber: string;
  result: 'QUALIFIED' | 'NOT_QUALIFIED';
  score: number;
  reason: string;
}

/** Arguments for validate_medicare_eligibility tool */
export interface ValidateMedicareEligibilityArgs {
  phoneNumber: string;
  ssnLast4: string;
  dateOfBirth: string; // YYYY-MM-DD format
  firstName?: string;
  lastName?: string;
}

/** Arguments for schedule_callback tool */
export interface ScheduleCallbackArgs {
  phoneNumber: string;
  reason: string;
  preferredDate?: string; // ISO datetime
  notes?: string;
}

/** Arguments for transfer_call tool */
export interface TransferCallArgs {
  phoneNumber: string;
  transferReason: string;
  extension?: string; // Default: 2002 (human CRM agent)
}

/**
 * VAPI Call Event Types
 *
 * Types for VAPI webhook events (call lifecycle and conversation)
 */

/** Call object shared across all events */
export interface VAPICall {
  /** Unique call ID */
  id: string;

  /** Call type */
  type?: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';

  /** Call status */
  status?: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';

  /** Phone number the call is from */
  phoneNumberFrom?: string;

  /** Phone number the call is to */
  phoneNumberTo?: string;

  /** Customer information */
  customer?: {
    number?: string;
    name?: string;
    extension?: string;
  };

  /** Call started timestamp */
  startedAt?: string;

  /** Call ended timestamp */
  endedAt?: string;

  /** Call duration in seconds */
  duration?: number;

  /** End reason */
  endReason?: 'customer-ended-call' | 'assistant-ended-call' | 'customer-did-not-answer' |
              'assistant-forwarded-call' | 'voicemail' | 'phone-call-provider-closed-websocket';
}

/** Conversation message object */
export interface VAPIConversationMessage {
  /** Message role */
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';

  /** Message content/text */
  content?: string;

  /** Message timestamp */
  time?: number;

  /** Timestamp in ISO format */
  timestamp?: string;

  /** Message type (for assistant messages) */
  type?: 'request' | 'response';

  /** Tool calls (if any) */
  toolCalls?: VAPIToolCall[];

  /** Tool call ID (for tool response messages) */
  toolCallId?: string;

  /** Duration in ms (for assistant responses) */
  duration?: number;
}

/** Call Started Event */
export interface VAPICallStartedEvent {
  /** Event type */
  type: 'call.started';

  /** Call object */
  call: VAPICall;

  /** Event timestamp */
  timestamp: string;
}

/** Call Ended Event */
export interface VAPICallEndedEvent {
  /** Event type */
  type: 'call.ended';

  /** Call object with end details */
  call: VAPICall;

  /** Event timestamp */
  timestamp: string;

  /** Call summary */
  summary?: string;

  /** Messages from the conversation */
  messages?: VAPIConversationMessage[];
}

/** Message Event (conversation turn) */
export interface VAPIMessageEvent {
  /** Event type */
  type: 'message';

  /** Call object */
  call: VAPICall;

  /** The message */
  message: VAPIConversationMessage;

  /** Event timestamp */
  timestamp: string;
}

/** Speech Interrupted Event */
export interface VAPISpeechInterruptedEvent {
  /** Event type */
  type: 'speech-interrupted';

  /** Call object */
  call: VAPICall;

  /** Event timestamp */
  timestamp: string;
}

/** Hang Event */
export interface VAPIHangEvent {
  /** Event type */
  type: 'hang';

  /** Call object */
  call: VAPICall;

  /** Event timestamp */
  timestamp: string;
}

/** Union type for all VAPI events */
export type VAPIEvent =
  | VAPICallStartedEvent
  | VAPICallEndedEvent
  | VAPIMessageEvent
  | VAPISpeechInterruptedEvent
  | VAPIHangEvent;

/**
 * VAPI Server Message Types
 *
 * VAPI sends different types of server messages to the serverUrl.
 * Each message has a "message" field that contains the message type.
 */

/** Status Update Message (call started/ended) */
export interface VAPIStatusUpdateMessage {
  message: {
    type: 'status-update';
    status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';
    call: VAPICall;
    endedReason?: string;
  };
}

/** Transcript Message (real-time transcription) */
export interface VAPITranscriptMessage {
  message: {
    type: 'transcript';
    role: 'user' | 'assistant';
    transcript: string;
    transcriptType: 'partial' | 'final';
  };
  call: VAPICall;
}

/** Speech Update Message (user/assistant speech events) */
export interface VAPISpeechUpdateMessage {
  message: {
    type: 'speech-update';
    role: 'user' | 'assistant';
    status: 'started' | 'stopped';
  };
  call: VAPICall;
}

/** Tool Calls Message (function calling during conversation) */
export interface VAPIToolCallsMessage {
  message: {
    type: 'tool-calls';
    toolCalls: VAPIToolCall[];
    toolCallList: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string; // JSON string
      };
    }>;
  };
  call: VAPICall;
}

/** Tool Calls Result Message (results from tool execution) */
export interface VAPIToolCallsResultMessage {
  message: {
    type: 'tool-calls-result';
    toolCallResults: Array<{
      toolCallId: string;
      result: any;
    }>;
  };
  call: VAPICall;
}

/** Hang Message */
export interface VAPIHangMessage {
  message: {
    type: 'hang';
  };
  call: VAPICall;
}

/** User Interrupted Message */
export interface VAPIUserInterruptedMessage {
  message: {
    type: 'user-interrupted';
  };
  call: VAPICall;
}

/** End of Call Report Message */
export interface VAPIEndOfCallReportMessage {
  message: {
    type: 'end-of-call-report';
    endedReason: string;
    summary?: string;
    messages?: VAPIConversationMessage[];
    messagesOpenAIFormatted?: any[];
    recordingUrl?: string;
    stereoRecordingUrl?: string;
    transcript?: string;
    analysis?: any;
    costs?: {
      total: number;
      [key: string]: any;
    };
  };
  call: VAPICall;
}

/** Union type for all VAPI server messages */
export type VAPIServerMessage =
  | VAPIStatusUpdateMessage
  | VAPITranscriptMessage
  | VAPISpeechUpdateMessage
  | VAPIToolCallsMessage
  | VAPIToolCallsResultMessage
  | VAPIHangMessage
  | VAPIUserInterruptedMessage
  | VAPIEndOfCallReportMessage;
