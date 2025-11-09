/**
 * Call State Management Service
 *
 * Tracks call lifecycle, status detection, retry attempts, and business hours
 * Implements AlexAI_Workflow_Full_Detailed.md specifications
 */

import logger from '../config/logger';
import { CallState, AgentPhone, VICIDisposition } from '../types/vici.types';
import { maskPhoneNumber } from '../utils/phoneNumber.util';

/**
 * Call Status Types
 * Based on AlexAI_Workflow_Full_Detailed.md call detection requirements
 */
export type CallStatus =
  | 'LIVE_PERSON'       // Human answered, conversation in progress
  | 'VOICEMAIL'         // Answering machine detected
  | 'DEAD_AIR'          // 6+ seconds silence before hello
  | 'BUSY'              // Busy signal
  | 'FAST_BUSY'         // Fast busy / network congestion
  | 'NO_ANSWER'         // Rings 30+ seconds, no pickup
  | 'DISCONNECTED'      // Line disconnected
  | 'FAX_TONE'          // Fax machine detected
  | 'IVR'               // Interactive Voice Response system
  | 'UNKNOWN';          // Status not yet determined

/**
 * Call Session Data
 * Tracks all data for an active call session
 */
export interface CallSession {
  callId: string;
  phoneNumber: string;
  state: CallState;
  status: CallStatus;
  agentExtension: AgentPhone;
  startTime: Date;
  endTime?: Date;

  // Retry tracking for Medicare validation
  mbiValidationAttempts: number;
  maxRetries: number;

  // Data collection
  userData?: any;
  medicareValidated: boolean;
  classificationResult?: 'QUALIFIED' | 'NOT_QUALIFIED';
  eligibilityScore?: number;

  // Disposition tracking
  dispositionSent: boolean;
  disposition?: VICIDisposition;
  dispositionId?: string;

  // Callback tracking
  callbackScheduled: boolean;
  callbackDateTime?: string;

  // Business hours
  withinBusinessHours: boolean;

  // Metadata
  metadata: Record<string, any>;
}

/**
 * Business Hours Configuration
 * 9:00am - 5:45pm EST, Monday-Friday
 */
export interface BusinessHours {
  timezone: string;
  daysOfWeek: number[]; // 1-7 (Monday-Sunday)
  startHour: number;    // 0-23
  startMinute: number;  // 0-59
  endHour: number;      // 0-23
  endMinute: number;    // 0-59
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: 'America/New_York', // EST/EDT
  daysOfWeek: [1, 2, 3, 4, 5],  // Monday-Friday
  startHour: 9,
  startMinute: 0,
  endHour: 17,  // 5:00 PM
  endMinute: 45,
};

class CallStateService {
  private activeCalls: Map<string, CallSession> = new Map();
  private agentExtensions: Map<AgentPhone, boolean> = new Map(); // Extension => isAvailable
  private businessHours: BusinessHours = DEFAULT_BUSINESS_HOURS;

  constructor() {
    // Initialize all agent extensions as available
    const extensions: AgentPhone[] = ['8001', '8002', '8003', '8004', '8005', '8006'];
    extensions.forEach((ext) => {
      this.agentExtensions.set(ext, true);
    });

    logger.info({ extensions: Array.from(this.agentExtensions.keys()) }, 'Call state service initialized with agent extensions');
  }

  /**
   * Check if current time is within business hours
   */
  isWithinBusinessHours(date: Date = new Date()): boolean {
    try {
      // Convert to EST/EDT timezone
      const estTime = new Date(date.toLocaleString('en-US', { timeZone: this.businessHours.timezone }));

      const dayOfWeek = estTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const hour = estTime.getHours();
      const minute = estTime.getMinutes();

      // Check if it's a valid day of week
      if (!this.businessHours.daysOfWeek.includes(dayOfWeek)) {
        logger.debug({ dayOfWeek }, 'Outside business hours - not a business day');
        return false;
      }

      // Check if within time range
      const currentMinutes = hour * 60 + minute;
      const startMinutes = this.businessHours.startHour * 60 + this.businessHours.startMinute;
      const endMinutes = this.businessHours.endHour * 60 + this.businessHours.endMinute;

      const withinHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes;

      if (!withinHours) {
        logger.debug(
          {
            currentTime: `${hour}:${minute.toString().padStart(2, '0')}`,
            businessHours: `${this.businessHours.startHour}:${this.businessHours.startMinute.toString().padStart(2, '0')}-${this.businessHours.endHour}:${this.businessHours.endMinute.toString().padStart(2, '0')}`,
          },
          'Outside business hours - not within time range'
        );
      }

      return withinHours;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error checking business hours');
      return true; // Default to allowing calls on error
    }
  }

  /**
   * Get next available agent extension
   */
  getAvailableAgent(): AgentPhone | null {
    for (const [extension, isAvailable] of this.agentExtensions.entries()) {
      if (isAvailable) {
        return extension;
      }
    }
    return null;
  }

  /**
   * Mark agent extension as busy
   */
  markAgentBusy(extension: AgentPhone): void {
    this.agentExtensions.set(extension, false);
    logger.debug({ extension }, 'Agent extension marked busy');
  }

  /**
   * Mark agent extension as available
   */
  markAgentAvailable(extension: AgentPhone): void {
    this.agentExtensions.set(extension, true);
    logger.debug({ extension }, 'Agent extension marked available');
  }

  /**
   * Create new call session
   */
  createCallSession(callId: string, phoneNumber: string): CallSession {
    const agentExtension = this.getAvailableAgent() || '8001'; // Fallback to 8001
    const withinBusinessHours = this.isWithinBusinessHours();

    this.markAgentBusy(agentExtension);

    const session: CallSession = {
      callId,
      phoneNumber,
      state: 'PRE_CONNECT',
      status: 'UNKNOWN',
      agentExtension,
      startTime: new Date(),
      mbiValidationAttempts: 0,
      maxRetries: 3,
      medicareValidated: false,
      dispositionSent: false,
      callbackScheduled: false,
      withinBusinessHours,
      metadata: {},
    };

    this.activeCalls.set(callId, session);

    logger.info(
      {
        callId,
        phoneNumber: maskPhoneNumber(phoneNumber),
        agentExtension,
        withinBusinessHours,
      },
      'Call session created'
    );

    return session;
  }

  /**
   * Get call session by ID
   */
  getCallSession(callId: string): CallSession | undefined {
    return this.activeCalls.get(callId);
  }

  /**
   * Update call state
   */
  updateCallState(callId: string, state: CallState): void {
    const session = this.activeCalls.get(callId);
    if (session) {
      session.state = state;
      logger.debug({ callId, state }, 'Call state updated');
    }
  }

  /**
   * Update call status (call detection result)
   */
  updateCallStatus(callId: string, status: CallStatus): void {
    const session = this.activeCalls.get(callId);
    if (session) {
      session.status = status;
      session.state = 'CONNECTED'; // Move to connected state when status is detected
      logger.info({ callId, status, phoneNumber: maskPhoneNumber(session.phoneNumber) }, 'Call status detected');
    }
  }

  /**
   * Increment MBI validation attempts
   * Returns true if max retries not exceeded
   */
  incrementMBIAttempts(callId: string): boolean {
    const session = this.activeCalls.get(callId);
    if (session) {
      session.mbiValidationAttempts++;
      logger.info(
        { callId, attempts: session.mbiValidationAttempts, maxRetries: session.maxRetries },
        'MBI validation attempt incremented'
      );
      return session.mbiValidationAttempts < session.maxRetries;
    }
    return false;
  }

  /**
   * Check if max retries exceeded
   */
  hasExceededMaxRetries(callId: string): boolean {
    const session = this.activeCalls.get(callId);
    return session ? session.mbiValidationAttempts >= session.maxRetries : false;
  }

  /**
   * Mark Medicare as validated
   */
  markMedicareValidated(callId: string, validated: boolean): void {
    const session = this.activeCalls.get(callId);
    if (session) {
      session.medicareValidated = validated;
      logger.info({ callId, validated }, 'Medicare validation status updated');
    }
  }

  /**
   * Save classification result
   */
  saveClassificationResult(
    callId: string,
    result: 'QUALIFIED' | 'NOT_QUALIFIED',
    score: number
  ): void {
    const session = this.activeCalls.get(callId);
    if (session) {
      session.classificationResult = result;
      session.eligibilityScore = score;
      logger.info({ callId, result, score }, 'Classification result saved');
    }
  }

  /**
   * Mark disposition as sent
   */
  markDispositionSent(callId: string, disposition: VICIDisposition, dispositionId: string): void {
    const session = this.activeCalls.get(callId);
    if (session) {
      session.dispositionSent = true;
      session.disposition = disposition;
      session.dispositionId = dispositionId;
      logger.info({ callId, disposition, dispositionId }, 'Disposition marked as sent');
    }
  }

  /**
   * Mark callback as scheduled
   */
  markCallbackScheduled(callId: string, callbackDateTime: string): void {
    const session = this.activeCalls.get(callId);
    if (session) {
      session.callbackScheduled = true;
      session.callbackDateTime = callbackDateTime;
      logger.info({ callId, callbackDateTime }, 'Callback marked as scheduled');
    }
  }

  /**
   * End call session
   */
  endCallSession(callId: string): CallSession | undefined {
    const session = this.activeCalls.get(callId);
    if (session) {
      session.endTime = new Date();
      session.state = 'COMPLETED';

      // Free up agent extension
      this.markAgentAvailable(session.agentExtension);

      logger.info(
        {
          callId,
          phoneNumber: maskPhoneNumber(session.phoneNumber),
          duration: session.endTime.getTime() - session.startTime.getTime(),
          disposition: session.disposition,
          agentExtension: session.agentExtension,
        },
        'Call session ended'
      );

      // Remove from active calls
      this.activeCalls.delete(callId);

      return session;
    }
    return undefined;
  }

  /**
   * Get all active call sessions
   */
  getActiveCalls(): CallSession[] {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Get active call count
   */
  getActiveCallCount(): number {
    return this.activeCalls.size;
  }

  /**
   * Get available agent count
   */
  getAvailableAgentCount(): number {
    return Array.from(this.agentExtensions.values()).filter((available) => available).length;
  }
}

// Export singleton instance
export const callStateService = new CallStateService();
