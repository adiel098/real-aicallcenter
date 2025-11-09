import axios, { AxiosInstance } from 'axios';
import { logger } from '../config/logger';
import {
  MedicareVerificationRequest,
  MedicareVerificationResponse,
  InsuranceCoverageRequest,
  InsuranceCoverageResponse,
  MedicareEligibilityResult
} from '../types/medicare.types';

class MedicareService {
  private medicareClient: AxiosInstance;
  private insuranceClient: AxiosInstance;
  private readonly maxRetries: number = 3;

  constructor() {
    // Medicare API client
    this.medicareClient = axios.create({
      baseURL: process.env.MEDICARE_API_URL || 'https://medicare-api.cms.gov',
      headers: {
        'Authorization': `Bearer ${process.env.MEDICARE_API_KEY || ''}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000 // 15 second timeout for government APIs
    });

    // Insurance eligibility API client
    this.insuranceClient = axios.create({
      baseURL: process.env.INSURANCE_API_URL || 'https://insurance-eligibility.example.com',
      headers: {
        'Authorization': `Bearer ${process.env.INSURANCE_API_KEY || ''}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Medicare API interceptors
    this.medicareClient.interceptors.request.use((config) => {
      logger.debug({ url: config.url }, 'Medicare API request');
      return config;
    });

    this.medicareClient.interceptors.response.use(
      (response) => {
        logger.debug('Medicare API response received');
        return response;
      },
      (error) => {
        logger.error({ error: error.message }, 'Medicare API error');
        throw error;
      }
    );

    // Insurance API interceptors
    this.insuranceClient.interceptors.request.use((config) => {
      logger.debug({ url: config.url }, 'Insurance API request');
      return config;
    });

    this.insuranceClient.interceptors.response.use(
      (response) => {
        logger.debug('Insurance API response received');
        return response;
      },
      (error) => {
        logger.error({ error: error.message }, 'Insurance API error');
        throw error;
      }
    );
  }

  /**
   * Complete Medicare eligibility workflow: SSN → MBI → Insurance Check
   */
  async validateMedicareEligibility(
    ssnLast4: string,
    dateOfBirth: string,
    firstName?: string,
    lastName?: string
  ): Promise<MedicareEligibilityResult> {
    const startTime = Date.now();

    try {
      // Step 1: Verify Medicare member and get MBI
      logger.info('Step 1: Verifying Medicare member');
      const mbiResponse = await this.verifyMedicareMember({
        ssnLast4,
        dateOfBirth,
        firstName,
        lastName
      });

      if (!mbiResponse.verified || !mbiResponse.mbiNumber) {
        logger.warn({ ssnLast4: `***${ssnLast4}` }, 'Medicare member not found');
        return {
          eligible: false,
          reason: 'MEDICARE_NOT_FOUND',
          verifiedAt: new Date().toISOString()
        };
      }

      logger.info({ mbi: this.maskMBI(mbiResponse.mbiNumber) }, 'Step 2: Checking insurance coverage');

      // Step 2: Check insurance coverage for vision DME
      const coverageResponse = await this.checkInsuranceCoverage({
        mbi: mbiResponse.mbiNumber,
        serviceCode: 'VISION_DME',
        effectiveDate: new Date().toISOString()
      });

      if (!coverageResponse.covered) {
        logger.warn('Vision DME not covered under plan');
        return {
          eligible: false,
          mbiNumber: mbiResponse.mbiNumber,
          planLevel: coverageResponse.planLevel,
          reason: 'SERVICE_NOT_COVERED',
          verifiedAt: new Date().toISOString()
        };
      }

      // Check if plan is suitable (Part C or Advantage plans typically cover DME)
      const suitablePlans = ['Part C', 'Advantage'];
      const isPlanSuitable = suitablePlans.includes(coverageResponse.planLevel);

      const duration = Date.now() - startTime;
      logger.info(
        {
          mbi: this.maskMBI(mbiResponse.mbiNumber),
          planLevel: coverageResponse.planLevel,
          copay: coverageResponse.copay,
          duration
        },
        'Medicare eligibility check completed'
      );

      return {
        eligible: coverageResponse.covered && isPlanSuitable,
        mbiNumber: mbiResponse.mbiNumber,
        planLevel: coverageResponse.planLevel,
        copay: coverageResponse.copay,
        reason: !isPlanSuitable ? 'PLAN_NOT_ELIGIBLE' : undefined,
        verifiedAt: new Date().toISOString()
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(
        { error: error.message, duration },
        'Medicare eligibility validation failed'
      );

      return {
        eligible: false,
        reason: `VALIDATION_ERROR: ${error.message}`,
        verifiedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Step 1: Verify Medicare member and retrieve MBI
   */
  private async verifyMedicareMember(
    request: MedicareVerificationRequest
  ): Promise<MedicareVerificationResponse> {
    try {
      const response = await this.callWithRetry(() =>
        this.medicareClient.post<MedicareVerificationResponse>('/verify-member', request)
      );

      return response.data;
    } catch (error: any) {
      // If Medicare API is not available, use mock data for development
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Using mock Medicare verification (development mode)');
        return this.mockMedicareVerification(request);
      }

      throw new Error(`Medicare verification failed: ${error.message}`);
    }
  }

  /**
   * Step 2: Check insurance coverage
   */
  private async checkInsuranceCoverage(
    request: InsuranceCoverageRequest
  ): Promise<InsuranceCoverageResponse> {
    try {
      const response = await this.callWithRetry(() =>
        this.insuranceClient.post<InsuranceCoverageResponse>('/check-coverage', request)
      );

      return response.data;
    } catch (error: any) {
      // If Insurance API is not available, use mock data for development
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Using mock insurance coverage check (development mode)');
        return this.mockInsuranceCoverage(request);
      }

      throw new Error(`Insurance coverage check failed: ${error.message}`);
    }
  }

  /**
   * Mock Medicare verification for development/testing
   */
  private mockMedicareVerification(request: MedicareVerificationRequest): MedicareVerificationResponse {
    // Simulate verification based on SSN last 4 digits
    const verified = request.ssnLast4 !== '0000';

    return {
      verified,
      mbiNumber: verified ? `1EG4-TE5-MK${request.ssnLast4.slice(-2)}` : undefined,
      beneficiaryId: verified ? `BENE-${request.ssnLast4}` : undefined,
      enrollmentDate: '2020-01-01',
      error: verified ? undefined : 'Member not found in Medicare database'
    };
  }

  /**
   * Mock insurance coverage for development/testing
   */
  private mockInsuranceCoverage(request: InsuranceCoverageRequest): InsuranceCoverageResponse {
    // Simulate coverage based on MBI
    const mbiSuffix = parseInt(request.mbi.slice(-2), 10);
    const covered = mbiSuffix % 3 !== 0; // ~66% coverage rate

    const planLevels: Array<'Part A' | 'Part B' | 'Part C' | 'Part D' | 'Advantage' | 'Supplement'> = [
      'Part C',
      'Advantage',
      'Part B',
      'Supplement'
    ];

    return {
      covered,
      planLevel: planLevels[mbiSuffix % planLevels.length],
      copay: covered ? (mbiSuffix % 2 === 0 ? 0 : 20) : 0,
      deductible: 0,
      outOfPocketMax: 3000,
      authorizationRequired: false,
      coverageDetails: {
        visionCoverage: covered,
        dmeCoverage: covered,
        preventiveCare: true
      },
      error: covered ? undefined : 'Service not covered under current plan'
    };
  }

  /**
   * Mask MBI for logging (show only last 2 characters)
   */
  private maskMBI(mbi: string): string {
    if (mbi.length <= 4) return '****';
    return `****-****-**${mbi.slice(-2)}`;
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
          throw error;
        }

        // Don't retry on client errors (4xx)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error;
        }

        // Exponential backoff: 2s, 4s, 8s (longer for government APIs)
        const delay = Math.pow(2, attempt) * 1000;
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

export const medicareService = new MedicareService();
