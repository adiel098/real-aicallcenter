/**
 * VICI Dialer Service
 *
 * Handles communication with VICI dialer system:
 * - Sending call dispositions (SALE, NQI, NA, AM, etc.)
 * - Scheduling callbacks
 * - Managing call metadata
 *
 * Based on AlexAI + VICI Workflow specification
 */

import axios, { AxiosInstance } from 'axios';
import logger from '../config/logger';
import { API_URLS } from '../config/constants';
import {
  VICIDispositionRequest,
  VICIDispositionResponse,
  VICICallbackRequest,
  VICICallbackResponse,
  VICIDisposition,
  AgentPhone,
} from '../types/vici.types';

class ViciService {
  private client: AxiosInstance;
  private readonly apiUrl: string;
  private readonly maxRetries: number = 3;
  private readonly defaultCampaignId = 'MEDICARE_EYEWEAR_2025';
  private readonly defaultAgentId: AgentPhone = '8001';

  constructor() {
    // Use localhost VICI mock server (port 3004) or environment variable
    this.apiUrl = process.env.VICI_API_URL || 'http://localhost:3004/api';

    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 second timeout
    });

    // Request interceptor for logging
    this.client.interceptors.request.use((config) => {
      logger.debug(
        { url: config.url, method: config.method, data: config.data },
        'VICI API request'
      );
      return config;
    });

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug({ status: response.status, data: response.data }, 'VICI API response');
        return response;
      },
      (error) => {
        logger.error({ error: error.message, response: error.response?.data }, 'VICI API error');
        throw error;
      }
    );
  }

  /**
   * Send call disposition to VICI
   *
   * Automatically called after classify_and_save_user completes
   * Maps classification result to VICI disposition codes
   *
   * @param phoneNumber - Customer phone number
   * @param disposition - VICI disposition code (SALE, NQI, NI, etc.)
   * @param metadata - Additional call metadata
   * @returns Disposition response from VICI
   */
  async sendDisposition(
    phoneNumber: string,
    disposition: VICIDisposition,
    metadata: {
      leadId?: string;
      campaignId?: string;
      agentId?: AgentPhone;
      callDuration?: number;
      eligibilityScore?: number;
      classificationResult?: 'QUALIFIED' | 'NOT_QUALIFIED';
      mbiValidated?: boolean;
      reason?: string;
    } = {}
  ): Promise<VICIDispositionResponse> {
    const payload: VICIDispositionRequest = {
      leadId: metadata.leadId || `lead-${phoneNumber}`,
      campaignId: metadata.campaignId || this.defaultCampaignId,
      phoneNumber,
      disposition,
      agentId: metadata.agentId || this.defaultAgentId,
      callDuration: metadata.callDuration || 0,
      metadata: {
        eligibilityScore: metadata.eligibilityScore,
        classificationResult: metadata.classificationResult,
        mbiValidated: metadata.mbiValidated,
        medicareVerified: metadata.mbiValidated,
        reason: metadata.reason,
      },
    };

    logger.info(
      {
        leadId: payload.leadId,
        phoneNumber,
        disposition,
        classificationResult: metadata.classificationResult,
      },
      'Sending disposition to VICI'
    );

    try {
      const response = await this.callWithRetry(() =>
        this.client.post<VICIDispositionResponse>('/dispositions', payload)
      );

      logger.info(
        { dispositionId: response.data.dispositionId, leadId: payload.leadId },
        'Disposition sent successfully to VICI'
      );

      return response.data;
    } catch (error: any) {
      logger.error({ error, payload }, 'Failed to send disposition to VICI');
      throw new Error(`VICI disposition failed: ${error.message}`);
    }
  }

  /**
   * Schedule callback in VICI
   *
   * Used when:
   * - MBI validation fails after 3 retries
   * - Customer requests to be called back later
   * - Incomplete data collection
   *
   * @param phoneNumber - Customer phone number
   * @param callbackDateTime - ISO 8601 datetime for callback
   * @param reason - Reason for callback
   * @param metadata - Additional metadata
   * @returns Callback response from VICI
   */
  async scheduleCallback(
    phoneNumber: string,
    callbackDateTime: string,
    reason: string,
    metadata: {
      leadId?: string;
      campaignId?: string;
      agentId?: AgentPhone;
      notes?: string;
    } = {}
  ): Promise<VICICallbackResponse> {
    const payload: VICICallbackRequest = {
      leadId: metadata.leadId || `lead-${phoneNumber}`,
      campaignId: metadata.campaignId || this.defaultCampaignId,
      phoneNumber,
      callbackDateTime,
      agentId: metadata.agentId || this.defaultAgentId,
      reason,
      notes: metadata.notes,
    };

    logger.info(
      {
        leadId: payload.leadId,
        phoneNumber,
        callbackDateTime,
        reason,
      },
      'Scheduling callback in VICI'
    );

    try {
      const response = await this.callWithRetry(() =>
        this.client.post<VICICallbackResponse>('/callbacks', payload)
      );

      logger.info(
        { callbackId: response.data.callbackId, scheduledFor: response.data.scheduledFor },
        'Callback scheduled successfully in VICI'
      );

      return response.data;
    } catch (error: any) {
      logger.error({ error, payload }, 'Failed to schedule callback in VICI');
      throw new Error(`VICI callback scheduling failed: ${error.message}`);
    }
  }

  /**
   * Map classification result to VICI disposition
   *
   * Business logic:
   * - QUALIFIED → SALE (eligible for premium eyewear)
   * - NOT_QUALIFIED → NQI (not qualified insurance)
   *
   * @param classificationResult - Classification result
   * @returns VICI disposition code
   */
  mapClassificationToDisposition(
    classificationResult: 'QUALIFIED' | 'NOT_QUALIFIED'
  ): VICIDisposition {
    return classificationResult === 'QUALIFIED' ? 'SALE' : 'NQI';
  }

  /**
   * Retry logic with exponential backoff
   */
  private async callWithRetry<T>(
    apiFunction: () => Promise<T>,
    maxRetries: number = this.maxRetries
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await apiFunction();
      } catch (error: any) {
        if (attempt === maxRetries) {
          logger.error({ error, attempt }, 'API call failed after retries');
          throw error;
        }

        // Don't retry on client errors (4xx)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        logger.warn({ attempt, delay }, 'Retrying API call');
        await this.sleep(delay);
      }
    }

    throw new Error('Retry logic failed');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const viciService = new ViciService();
