/**
 * VAPI Service Layer
 *
 * Provides reusable functions to interact with the mock CRM APIs.
 * These functions are called by the VAPI tool handler when VAPI invokes tools.
 *
 * All HTTP communication with CRM servers is centralized here for easy maintenance.
 */

import logger from '../config/logger';
import { API_URLS } from '../config/constants';
import { maskPhoneNumber } from '../utils/phoneNumber.util';
import { LeadLookupResponse } from '../types/lead.types';
import { UserDataResponse, UserDataUpdateRequest } from '../types/userData.types';
import { ClassificationResponse, UpdateClassificationResultRequest } from '../types/classification.types';

/**
 * HTTP Client Helper
 *
 * Makes HTTP requests to CRM APIs with error handling and logging.
 * Reusable across all service functions.
 *
 * @param url - Full URL to request
 * @param options - Fetch options (method, body, headers)
 * @returns Response data as JSON
 */
const httpClient = async (url: string, options: RequestInit = {}): Promise<any> => {
  const startTime = Date.now();

  logger.debug(
    {
      url,
      method: options.method || 'GET',
    },
    'Making HTTP request to CRM API'
  );

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const duration = Date.now() - startTime;

    // Parse response body
    const data = await response.json();

    logger.debug(
      {
        url,
        status: response.status,
        duration,
      },
      'HTTP request completed'
    );

    // Return data even if not OK - let caller handle error responses
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    logger.error(
      {
        url,
        error: error.message,
        duration,
      },
      'HTTP request failed'
    );

    throw new Error(`Failed to fetch from ${url}: ${error.message}`);
  }
};

/**
 * Check Lead
 *
 * Check if a phone number exists in the Lead CRM.
 *
 * @param phoneNumber - Phone number to check
 * @returns Lead lookup response
 */
export const checkLead = async (phoneNumber: string): Promise<LeadLookupResponse> => {
  logger.info(
    {
      phoneNumber: maskPhoneNumber(phoneNumber),
      action: 'checkLead',
    },
    'Checking if lead exists'
  );

  const url = `${API_URLS.LEAD_CRM}/leads/${encodeURIComponent(phoneNumber)}`;

  try {
    const response = await httpClient(url);

    if (response.ok) {
      logger.info(
        {
          phoneNumber: maskPhoneNumber(phoneNumber),
          found: response.data.found,
          leadId: response.data.lead?.leadId,
        },
        'Lead check completed'
      );
    } else {
      logger.warn(
        {
          phoneNumber: maskPhoneNumber(phoneNumber),
          status: response.status,
        },
        'Lead not found or error occurred'
      );
    }

    return response.data;
  } catch (error: any) {
    logger.error(
      {
        phoneNumber: maskPhoneNumber(phoneNumber),
        error: error.message,
      },
      'Failed to check lead'
    );

    // Return error response
    return {
      found: false,
      lead: null,
      message: `Error checking lead: ${error.message}`,
    };
  }
};

/**
 * Get User Data
 *
 * Retrieve user bio and genetic data from User Data CRM.
 *
 * @param phoneNumber - Phone number to look up
 * @returns User data response
 */
export const getUserData = async (phoneNumber: string): Promise<UserDataResponse> => {
  logger.info(
    {
      phoneNumber: maskPhoneNumber(phoneNumber),
      action: 'getUserData',
    },
    'Retrieving user data'
  );

  const url = `${API_URLS.USERDATA_CRM}/users/${encodeURIComponent(phoneNumber)}`;

  try {
    const response = await httpClient(url);

    if (response.ok) {
      logger.info(
        {
          phoneNumber: maskPhoneNumber(phoneNumber),
          found: response.data.found,
          isComplete: response.data.isComplete,
          missingFieldsCount: response.data.missingFields?.length || 0,
        },
        'User data retrieved'
      );
    } else {
      logger.warn(
        {
          phoneNumber: maskPhoneNumber(phoneNumber),
          status: response.status,
        },
        'User data not found or error occurred'
      );
    }

    return response.data;
  } catch (error: any) {
    logger.error(
      {
        phoneNumber: maskPhoneNumber(phoneNumber),
        error: error.message,
      },
      'Failed to get user data'
    );

    return {
      found: false,
      userData: null,
      isComplete: false,
      missingFields: [],
      message: `Error retrieving user data: ${error.message}`,
    };
  }
};

/**
 * Update User Data
 *
 * Update Medicare member data and eligibility info in User Data CRM.
 *
 * @param phoneNumber - Phone number to identify user
 * @param medicareData - Medicare data updates (optional)
 * @param eligibilityData - Eligibility data updates (optional)
 * @returns Updated user data response
 */
export const updateUserData = async (
  phoneNumber: string,
  medicareData?: Record<string, unknown>,
  eligibilityData?: Record<string, unknown>
): Promise<UserDataResponse> => {
  logger.info(
    {
      phoneNumber: maskPhoneNumber(phoneNumber),
      action: 'updateUserData',
      hasMedicareData: !!medicareData,
      hasEligibilityData: !!eligibilityData,
    },
    'Updating user data'
  );

  const url = `${API_URLS.USERDATA_CRM}/users/${encodeURIComponent(phoneNumber)}`;

  const requestBody: UserDataUpdateRequest = {
    phoneNumber,
    medicareData,
    eligibilityData,
  };

  try {
    const response = await httpClient(url, {
      method: 'PUT',
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      logger.info(
        {
          phoneNumber: maskPhoneNumber(phoneNumber),
          isComplete: response.data.isComplete,
          missingFieldsCount: response.data.missingFields?.length || 0,
        },
        'User data updated successfully'
      );
    } else {
      logger.warn(
        {
          phoneNumber: maskPhoneNumber(phoneNumber),
          status: response.status,
        },
        'Failed to update user data'
      );
    }

    return response.data;
  } catch (error: any) {
    logger.error(
      {
        phoneNumber: maskPhoneNumber(phoneNumber),
        error: error.message,
      },
      'Error updating user data'
    );

    return {
      found: false,
      userData: null,
      isComplete: false,
      missingFields: [],
      message: `Error updating user data: ${error.message}`,
    };
  }
};

/**
 * Classify User
 *
 * Send user data to Classification CRM for analysis.
 * User data must be complete before classification.
 *
 * @param userData - Complete user data to classify
 * @returns Classification response
 */
export const classifyUser = async (userData: any): Promise<ClassificationResponse> => {
  logger.info(
    {
      userId: userData.userId,
      userName: userData.name,
      phoneNumber: maskPhoneNumber(userData.phoneNumber),
      action: 'classifyUser',
    },
    'Classifying user'
  );

  const url = `${API_URLS.CLASSIFICATION_CRM}/classify`;

  try {
    const response = await httpClient(url, {
      method: 'POST',
      body: JSON.stringify({ userData }),
    });

    if (response.ok) {
      logger.info(
        {
          userId: userData.userId,
          result: response.data.classification?.result,
          score: response.data.classification?.score,
        },
        'User classified successfully'
      );
    } else {
      logger.warn(
        {
          userId: userData.userId,
          status: response.status,
        },
        'Classification failed'
      );
    }

    return response.data;
  } catch (error: any) {
    logger.error(
      {
        userId: userData.userId,
        error: error.message,
      },
      'Error classifying user'
    );

    return {
      success: false,
      classification: null,
      message: `Error classifying user: ${error.message}`,
    };
  }
};

/**
 * Save Classification Result
 *
 * Save the classification result back to Classification CRM.
 * This is typically called after telling the user their result.
 *
 * @param userId - User ID
 * @param phoneNumber - User phone number
 * @param result - Classification result (QUALIFIED/NOT_QUALIFIED)
 * @param score - Classification score
 * @param reason - Reason for classification
 * @returns Success response
 */
export const saveClassificationResult = async (
  userId: string,
  phoneNumber: string,
  result: 'QUALIFIED' | 'NOT_QUALIFIED',
  score: number,
  reason: string
): Promise<{ success: boolean; message?: string }> => {
  logger.info(
    {
      userId,
      phoneNumber: maskPhoneNumber(phoneNumber),
      result,
      score,
      action: 'saveClassificationResult',
    },
    'Saving classification result'
  );

  const url = `${API_URLS.CLASSIFICATION_CRM}/classify/${encodeURIComponent(userId)}/result`;

  const requestBody: UpdateClassificationResultRequest = {
    userId,
    phoneNumber,
    result,
    score,
    reason,
  };

  try {
    const response = await httpClient(url, {
      method: 'PUT',
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      logger.info(
        {
          userId,
          result,
        },
        'Classification result saved successfully'
      );

      return {
        success: true,
        message: 'Classification result saved successfully',
      };
    } else {
      logger.warn(
        {
          userId,
          status: response.status,
        },
        'Failed to save classification result'
      );

      return {
        success: false,
        message: response.data.message || 'Failed to save classification result',
      };
    }
  } catch (error: any) {
    logger.error(
      {
        userId,
        error: error.message,
      },
      'Error saving classification result'
    );

    return {
      success: false,
      message: `Error saving classification result: ${error.message}`,
    };
  }
};

/**
 * Send VICI Disposition
 *
 * Automatically sends disposition to VICI after classification is complete.
 * Maps classification result to VICI disposition codes:
 * - QUALIFIED → SALE
 * - NOT_QUALIFIED → NQI
 *
 * @param phoneNumber - Customer phone number
 * @param classificationResult - QUALIFIED or NOT_QUALIFIED
 * @param score - Eligibility score
 * @param reason - Classification reason
 * @returns Disposition result with VICI disposition ID
 */
export const sendVICIDisposition = async (
  phoneNumber: string,
  classificationResult: 'QUALIFIED' | 'NOT_QUALIFIED',
  score: number,
  reason: string
): Promise<{ disposition: string; dispositionId: string; timestamp: string }> => {
  // Import VICI service
  const { viciService } = await import('./vici.service');

  // Map classification to VICI disposition
  const disposition = viciService.mapClassificationToDisposition(classificationResult);

  logger.info(
    {
      phoneNumber: maskPhoneNumber(phoneNumber),
      classificationResult,
      disposition,
      score,
      action: 'sendVICIDisposition',
    },
    'Sending disposition to VICI'
  );

  try {
    const viciResponse = await viciService.sendDisposition(phoneNumber, disposition, {
      eligibilityScore: score,
      classificationResult,
      mbiValidated: true, // Assume MBI validated if classification completed
      reason,
    });

    logger.info(
      {
        phoneNumber: maskPhoneNumber(phoneNumber),
        disposition,
        dispositionId: viciResponse.dispositionId,
      },
      'VICI disposition sent successfully'
    );

    return {
      disposition,
      dispositionId: viciResponse.dispositionId,
      timestamp: viciResponse.timestamp,
    };
  } catch (error: any) {
    logger.error(
      {
        phoneNumber: maskPhoneNumber(phoneNumber),
        disposition,
        error: error.message,
      },
      'Failed to send VICI disposition'
    );

    throw new Error(`Failed to send VICI disposition: ${error.message}`);
  }
};
