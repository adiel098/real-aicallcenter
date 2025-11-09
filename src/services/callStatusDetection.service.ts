/**
 * Call Status Detection Service
 *
 * Detects call status based on VAPI events:
 * - Voicemail / Answering Machine
 * - Dead Air (6+ seconds silence)
 * - Busy / Fast Busy
 * - No Answer (30+ seconds)
 * - Disconnected
 * - Fax Tone
 * - Live Person
 * - IVR System
 *
 * Based on AlexAI_Workflow_Full_Detailed.md specifications
 */

import logger from '../config/logger';
import { CallStatus } from './callState.service';
import { VAPICall } from '../types/vapi.types';
import { VICIDisposition } from '../types/vici.types';

/**
 * Call Status Detector
 * Analyzes call events and determines call status
 */
class CallStatusDetectionService {
  // Timing thresholds (in milliseconds)
  private readonly DEAD_AIR_THRESHOLD_MS = 6000; // 6 seconds
  private readonly NO_ANSWER_THRESHOLD_MS = 30000; // 30 seconds
  private readonly VOICEMAIL_DETECTION_KEYWORDS = [
    'voicemail',
    'leave a message',
    'not available',
    'mailbox',
    'beep',
    'after the tone',
    'unable to take your call',
    'please leave',
    'record your message',
  ];

  // Track silence durations per call
  private silenceTracking: Map<string, { lastSpeechTime: number; silenceStart: number | null }> = new Map();

  constructor() {
    logger.info('Call status detection service initialized');
  }

  /**
   * Detect call status based on VAPI end reason
   * Maps VAPI end reasons to call statuses
   */
  detectStatusFromEndReason(endReason?: string): CallStatus {
    if (!endReason) {
      return 'UNKNOWN';
    }

    const reasonLower = endReason.toLowerCase();

    // Voicemail detected
    if (reasonLower.includes('voicemail')) {
      return 'VOICEMAIL';
    }

    // Customer didn't answer
    if (reasonLower.includes('did-not-answer') || reasonLower.includes('no-answer')) {
      return 'NO_ANSWER';
    }

    // Line disconnected
    if (reasonLower.includes('disconnect') || reasonLower.includes('websocket')) {
      return 'DISCONNECTED';
    }

    // Busy signal
    if (reasonLower.includes('busy')) {
      return 'BUSY';
    }

    // Default to unknown
    return 'UNKNOWN';
  }

  /**
   * Detect voicemail from transcript
   * Analyzes assistant/user messages for voicemail indicators
   */
  detectVoicemailFromTranscript(transcript: string): boolean {
    const transcriptLower = transcript.toLowerCase();

    // Check for voicemail keywords
    return this.VOICEMAIL_DETECTION_KEYWORDS.some((keyword) =>
      transcriptLower.includes(keyword)
    );
  }

  /**
   * Track silence duration
   * Called when speech events occur
   */
  trackSilence(callId: string, isSpeaking: boolean): { isDeadAir: boolean; silenceDurationMs: number } {
    const now = Date.now();
    let tracking = this.silenceTracking.get(callId);

    if (!tracking) {
      tracking = {
        lastSpeechTime: now,
        silenceStart: null,
      };
      this.silenceTracking.set(callId, tracking);
    }

    if (isSpeaking) {
      // Speech detected - reset silence tracking
      const silenceDuration = tracking.silenceStart ? now - tracking.silenceStart : 0;
      tracking.lastSpeechTime = now;
      tracking.silenceStart = null;

      return {
        isDeadAir: false,
        silenceDurationMs: silenceDuration,
      };
    } else {
      // No speech - track silence start
      if (tracking.silenceStart === null) {
        tracking.silenceStart = now;
      }

      const silenceDuration = now - tracking.silenceStart;
      const isDeadAir = silenceDuration >= this.DEAD_AIR_THRESHOLD_MS;

      return {
        isDeadAir,
        silenceDurationMs: silenceDuration,
      };
    }
  }

  /**
   * Detect dead air (6+ seconds silence before first hello)
   */
  detectDeadAir(callId: string, silenceDurationMs: number): boolean {
    const isDeadAir = silenceDurationMs >= this.DEAD_AIR_THRESHOLD_MS;

    if (isDeadAir) {
      logger.warn(
        { callId, silenceDurationMs },
        `Dead air detected: ${(silenceDurationMs / 1000).toFixed(1)}s silence`
      );
    }

    return isDeadAir;
  }

  /**
   * Detect no answer (call rings 30+ seconds without pickup)
   */
  detectNoAnswer(callStartTime: Date): boolean {
    const callDurationMs = Date.now() - callStartTime.getTime();
    return callDurationMs >= this.NO_ANSWER_THRESHOLD_MS;
  }

  /**
   * Detect fax tone from audio characteristics
   * Note: VAPI doesn't provide direct fax detection, so we use heuristics
   */
  detectFaxTone(transcript: string): boolean {
    // Fax tones usually result in garbled/empty transcripts or specific patterns
    const transcriptLower = transcript.toLowerCase().trim();

    // Common indicators of fax tone
    const faxIndicators = [
      transcriptLower.length === 0, // Empty transcript
      transcriptLower.includes('beep beep beep'),
      transcriptLower.includes('tone'),
      /^[^a-z]{20,}$/i.test(transcript), // Non-alphabetic noise
    ];

    return faxIndicators.some((indicator) => indicator);
  }

  /**
   * Detect IVR system from transcript patterns
   */
  detectIVR(transcript: string): boolean {
    const transcriptLower = transcript.toLowerCase();

    const ivrKeywords = [
      'press 1',
      'press 2',
      'dial',
      'extension',
      'directory',
      'automated',
      'for sales',
      'for support',
      'main menu',
      'options',
    ];

    return ivrKeywords.some((keyword) => transcriptLower.includes(keyword));
  }

  /**
   * Analyze call and determine status
   * This is the main entry point for call status detection
   */
  analyzeCallStatus(
    callId: string,
    call: VAPICall,
    recentTranscripts: string[] = []
  ): CallStatus {
    // First check end reason if call ended
    if (call.endReason) {
      const statusFromEndReason = this.detectStatusFromEndReason(call.endReason);
      if (statusFromEndReason !== 'UNKNOWN') {
        this.cleanupCallTracking(callId);
        return statusFromEndReason;
      }
    }

    // Analyze transcripts if available
    if (recentTranscripts.length > 0) {
      const combinedTranscript = recentTranscripts.join(' ');

      // Check for voicemail
      if (this.detectVoicemailFromTranscript(combinedTranscript)) {
        this.cleanupCallTracking(callId);
        return 'VOICEMAIL';
      }

      // Check for IVR
      if (this.detectIVR(combinedTranscript)) {
        return 'IVR';
      }

      // Check for fax tone
      if (this.detectFaxTone(combinedTranscript)) {
        this.cleanupCallTracking(callId);
        return 'FAX_TONE';
      }
    }

    // Check for no answer based on duration
    if (call.startedAt) {
      const noAnswer = this.detectNoAnswer(new Date(call.startedAt));
      if (noAnswer && call.status === 'ringing') {
        this.cleanupCallTracking(callId);
        return 'NO_ANSWER';
      }
    }

    // If call is in progress and we have transcripts, assume live person
    if (call.status === 'in-progress' && recentTranscripts.length > 0) {
      return 'LIVE_PERSON';
    }

    return 'UNKNOWN';
  }

  /**
   * Map call status to VICI disposition
   * Based on AlexAI_Workflow_Full_Detailed.md disposition mapping
   */
  mapStatusToDisposition(status: CallStatus): VICIDisposition | null {
    const mapping: Record<CallStatus, VICIDisposition | null> = {
      LIVE_PERSON: null, // Will be determined by classification (SALE/NQI)
      VOICEMAIL: 'AM', // Answering Machine
      DEAD_AIR: 'DAIR', // Dead Air
      BUSY: 'B', // Busy
      FAST_BUSY: 'B', // Busy (same as regular busy)
      NO_ANSWER: 'NA', // No Answer
      DISCONNECTED: 'DC', // Disconnected
      FAX_TONE: 'DC', // Disconnected (fax is a type of disconnect)
      IVR: 'NA', // No Answer (treat IVR as no answer)
      UNKNOWN: null, // Cannot determine disposition
    };

    return mapping[status];
  }

  /**
   * Cleanup tracking for ended call
   */
  cleanupCallTracking(callId: string): void {
    this.silenceTracking.delete(callId);
    logger.debug({ callId }, 'Call tracking cleaned up');
  }

  /**
   * Get voicemail message to leave
   * Based on AlexAI_Workflow_Full_Detailed.md voicemail script
   */
  getVoicemailMessage(): string {
    return `Hello, this is Alex from the Medicare Premium Eyewear Program. ` +
      `We're calling about your eligibility for specialized eyewear for colorblind Medicare members. ` +
      `This is an exclusive benefit that may be available to you at no additional cost. ` +
      `Please call us back at your earliest convenience. ` +
      `Again, this is Alex from the Medicare Premium Eyewear Program. ` +
      `We look forward to speaking with you. Goodbye.`;
  }

  /**
   * Check if we should leave a voicemail message
   * Based on business logic - only leave message on first attempt
   */
  shouldLeaveVoicemail(attemptNumber: number = 1): boolean {
    // Only leave voicemail on first attempt to avoid spam
    return attemptNumber === 1;
  }
}

// Export singleton instance
export const callStatusDetectionService = new CallStatusDetectionService();
