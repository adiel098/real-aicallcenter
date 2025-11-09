/**
 * VICI Dialer Integration Types
 *
 * Based on AlexAI + VICI Workflow specification
 * Supports call status detection, dispositions, and agent management
 */

// ============================================================================
// VICI Disposition Codes (per AlexAI_Workflow_Full_Detailed.md)
// ============================================================================

export type VICIDisposition =
  | 'SALE'        // Qualified - Insurance validated, eligible for premium eyewear
  | 'NQI'         // Not Qualified Insurance - Doesn't meet Medicare eligibility
  | 'NI'          // Not Interested - Caller declined program
  | 'NA'          // No Answer - Rings 30 seconds, no pickup
  | 'AM'          // Answering Machine - Voicemail detected
  | 'DC'          // Disconnected - Line disconnected, fax tone, or fast busy
  | 'B'           // Busy - Line busy signal
  | 'DAIR';       // Dead Air - At least 6 seconds silence before "hello"

// ============================================================================
// Call State Management
// ============================================================================

export type CallState =
  | 'IDLE'          // AI Agent waiting for next call
  | 'PRE_CONNECT'   // VICI transferring call to AI Agent
  | 'CONNECTED'     // Call connected, detecting status (live/VM/busy/etc)
  | 'IN_PROGRESS'   // Live conversation in progress
  | 'COMPLETING'    // Classification done, sending disposition
  | 'COMPLETED';    // Call ended, returned to IDLE

// ============================================================================
// AI Agent Phone Extensions (8001-8006)
// ============================================================================

export type AgentPhone = '8001' | '8002' | '8003' | '8004' | '8005' | '8006';

// ============================================================================
// VICI API Request/Response Types
// ============================================================================

export interface VICIDispositionRequest {
  leadId: string;
  campaignId: string;
  phoneNumber: string;
  disposition: VICIDisposition;
  subDisposition?: string;
  agentId: AgentPhone;
  callDuration: number; // in seconds
  metadata?: {
    eligibilityScore?: number;
    medicareVerified?: boolean;
    mbiValidated?: boolean;
    classificationResult?: 'QUALIFIED' | 'NOT_QUALIFIED';
    nextAction?: string;
    reason?: string;
    [key: string]: any;
  };
}

export interface VICIDispositionResponse {
  success: boolean;
  leadId: string;
  dispositionId: string;
  timestamp: string;
  message?: string;
}

export interface VICICallbackRequest {
  leadId: string;
  campaignId: string;
  phoneNumber: string;
  callbackDateTime: string; // ISO 8601 format
  agentId: AgentPhone;
  reason: string;
  notes?: string;
}

export interface VICICallbackResponse {
  success: boolean;
  leadId: string;
  callbackId: string;
  scheduledFor: string;
  timestamp: string;
}

export interface VICILeadRequest {
  campaignId: string;
  status?: 'NEW' | 'CALLBACK' | 'PENDING';
  limit?: number;
}

export interface VICILead {
  leadId: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Call Tracking and Metadata
// ============================================================================

export interface VICICall {
  callId: string;
  leadId: string;
  campaignId: string;
  phoneNumber: string;
  agentId: AgentPhone;
  state: CallState;
  startTime: string;
  endTime?: string;
  duration?: number; // in seconds
  disposition?: VICIDisposition;
  metadata?: CallMetadata;
}

export interface CallMetadata {
  callId?: string;
  phoneNumber: string;
  liveContactConfirmed: boolean;
  userDeclined: boolean;
  score?: number;
  duration: number;
  leadId?: string;
  campaignId?: string;
  completedAt: string;
  retryCount?: number; // For MBI validation retries (max 3)
  callbackRequested?: boolean;
}

// ============================================================================
// Business Hours Configuration
// ============================================================================

export interface BusinessHours {
  timezone: string; // e.g., "America/New_York" (EST)
  workDays: number[]; // 1-5 for Mon-Fri
  startTime: string; // "09:00"
  endTime: string; // "17:45" (5:45 PM)
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: 'America/New_York',
  workDays: [1, 2, 3, 4, 5], // Mon-Fri
  startTime: '09:00',
  endTime: '17:45',
};

// ============================================================================
// Campaign Configuration
// ============================================================================

export interface VICICampaign {
  campaignId: string;
  name: string;
  description?: string;
  active: boolean;
  businessHours: BusinessHours;
  availableAgents: AgentPhone[];
  maxRetries: number; // For MBI validation (default: 3)
  voicemailEnabled: boolean;
  callbackEnabled: boolean;
}

// ============================================================================
// Legacy Type Aliases (for backwards compatibility)
// ============================================================================

/**
 * @deprecated Use VICIDisposition instead
 */
export type DispositionCode = VICIDisposition;
