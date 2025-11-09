// VICI API Types

export type DispositionCode =
  | 'SALE'        // Qualified and accepted
  | 'NQI'         // Not Qualified or Not Interested
  | 'NA'          // No Answer / Dead Air
  | 'AM'          // Answering Machine
  | 'CB'          // Callback Requested
  | 'DNC'         // Do Not Call
  | 'WN'          // Wrong Number
  | 'IVR';        // IVR Detected

export interface ViciDispositionRequest {
  leadId: string;
  campaignId: string;
  phoneNumber: string;
  disposition: DispositionCode;
  subDisposition?: string;
  agentId: string;
  callDuration: number;
  metadata?: {
    eligibilityScore?: number;
    medicareVerified?: boolean;
    nextAction?: string;
    reason?: string;
    [key: string]: any;
  };
}

export interface ViciDispositionResponse {
  success: boolean;
  leadId: string;
  dispositionId: string;
  timestamp: string;
}

export interface ViciLeadRequest {
  campaignId: string;
  status?: 'NEW' | 'CALLBACK' | 'PENDING';
  limit?: number;
}

export interface ViciLead {
  leadId: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  metadata?: Record<string, any>;
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
}
