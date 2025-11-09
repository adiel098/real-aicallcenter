import axios, { AxiosInstance } from 'axios';
import { logger } from '../config/logger';
import {
  ViciDispositionRequest,
  ViciDispositionResponse,
  ViciLeadRequest,
  ViciLead,
  CallMetadata,
  DispositionCode
} from '../types/vici.types';

class ViciService {
  private client: AxiosInstance;
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly maxRetries: number = 3;

  constructor() {
    this.apiUrl = process.env.VICI_API_URL || 'https://vici-dialer.example.com/api';
    this.apiToken = process.env.VICI_API_TOKEN || '';

    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    this.client.interceptors.request.use((config) => {
      logger.debug({ url: config.url, method: config.method }, 'VICI API request');
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug({ status: response.status }, 'VICI API response');
        return response;
      },
      (error) => {
        logger.error({ error: error.message }, 'VICI API error');
        throw error;
      }
    );
  }

  /**
   * Send call disposition to VICI
   */
  async sendDisposition(callData: CallMetadata): Promise<ViciDispositionResponse> {
    const disposition = this.determineDisposition(callData);

    const payload: ViciDispositionRequest = {
      leadId: callData.leadId || 'UNKNOWN',
      campaignId: callData.campaignId || 'EYEWEAR_MEDICARE_2025',
      phoneNumber: callData.phoneNumber,
      disposition: disposition.code,
      subDisposition: disposition.subDisposition,
      agentId: 'AI_AGENT_001',
      callDuration: callData.duration,
      metadata: {
        eligibilityScore: callData.score,
        medicareVerified: callData.score !== undefined,
        nextAction: disposition.nextAction,
        completedAt: callData.completedAt
      }
    };

    logger.info(
      {
        leadId: payload.leadId,
        disposition: payload.disposition,
        score: callData.score
      },
      'Sending disposition to VICI'
    );

    try {
      const response = await this.callWithRetry(() =>
        this.client.post<ViciDispositionResponse>('/dispositions', payload)
      );

      return response.data;
    } catch (error: any) {
      logger.error({ error, payload }, 'Failed to send disposition to VICI');
      throw new Error(`VICI disposition failed: ${error.message}`);
    }
  }

  /**
   * Get next lead from VICI queue
   */
  async getNextLead(request: ViciLeadRequest): Promise<ViciLead | null> {
    try {
      const response = await this.callWithRetry(() =>
        this.client.post<ViciLead>('/leads/next', request)
      );

      logger.info({ leadId: response.data.leadId }, 'Retrieved next lead from VICI');
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.info('No leads available in VICI queue');
        return null;
      }

      logger.error({ error }, 'Failed to get next lead from VICI');
      throw error;
    }
  }

  /**
   * Update lead status in VICI
   */
  async updateLeadStatus(leadId: string, status: string, metadata?: Record<string, any>): Promise<void> {
    try {
      await this.callWithRetry(() =>
        this.client.patch(`/leads/${leadId}`, { status, metadata })
      );

      logger.info({ leadId, status }, 'Updated lead status in VICI');
    } catch (error: any) {
      logger.error({ error, leadId }, 'Failed to update lead status in VICI');
      throw error;
    }
  }

  /**
   * Determine disposition code based on call metadata
   */
  private determineDisposition(callData: CallMetadata): {
    code: DispositionCode;
    subDisposition?: string;
    nextAction?: string;
  } {
    // No live contact confirmed
    if (!callData.liveContactConfirmed) {
      return {
        code: 'NA',
        subDisposition: 'NO_ANSWER',
        nextAction: 'RETRY_LATER'
      };
    }

    // User declined to participate
    if (callData.userDeclined) {
      return {
        code: 'NQI',
        subDisposition: 'NOT_INTERESTED',
        nextAction: 'REMOVE_FROM_QUEUE'
      };
    }

    // User qualified (score >= 60)
    if (callData.score !== undefined && callData.score >= 60) {
      return {
        code: 'SALE',
        subDisposition: 'QUALIFIED',
        nextAction: 'SEND_SUBSCRIPTION_KIT'
      };
    }

    // User did not qualify
    if (callData.score !== undefined && callData.score < 60) {
      return {
        code: 'NQI',
        subDisposition: 'NOT_QUALIFIED',
        nextAction: 'SEND_ALTERNATIVE_OPTIONS'
      };
    }

    // Incomplete call - needs callback
    return {
      code: 'CB',
      subDisposition: 'INCOMPLETE',
      nextAction: 'SCHEDULE_CALLBACK'
    };
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
