// Medicare API Types

export interface MedicareVerificationRequest {
  ssnLast4: string;
  dateOfBirth: string; // ISO format: YYYY-MM-DD
  firstName?: string;
  lastName?: string;
}

export interface MedicareVerificationResponse {
  verified: boolean;
  mbiNumber?: string; // Medicare Beneficiary Identifier
  beneficiaryId?: string;
  enrollmentDate?: string;
  error?: string;
}

export interface InsuranceCoverageRequest {
  mbi: string;
  serviceCode: string; // e.g., 'VISION_DME' (Durable Medical Equipment)
  effectiveDate: string; // ISO format
}

export interface InsuranceCoverageResponse {
  covered: boolean;
  planLevel: 'Part A' | 'Part B' | 'Part C' | 'Part D' | 'Advantage' | 'Supplement';
  copay: number;
  deductible: number;
  outOfPocketMax: number;
  authorizationRequired: boolean;
  coverageDetails?: {
    visionCoverage: boolean;
    dmeCoverage: boolean;
    preventiveCare: boolean;
  };
  error?: string;
}

export interface MedicareEligibilityResult {
  eligible: boolean;
  mbiNumber?: string;
  planLevel?: string;
  copay?: number;
  reason?: string;
  verifiedAt: string;
}
