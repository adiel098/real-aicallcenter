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
  bioData?: Record<string, unknown>;
  geneticData?: Record<string, unknown>;
}

/** Arguments for classify_user tool */
export interface ClassifyUserArgs {
  phoneNumber: string;
}

/** Arguments for save_classification_result tool */
export interface SaveClassificationResultArgs {
  userId: string;
  phoneNumber: string;
  result: 'ACCEPTABLE' | 'NOT_ACCEPTABLE';
  score: number;
  reason: string;
}
