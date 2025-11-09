/**
 * Mock Lead Data
 *
 * Sample Medicare member leads for testing the Lead CRM system.
 * In a real system, this would be a database.
 */

import { Lead } from '../types/lead.types';

/**
 * In-memory storage for leads
 * Exported as mutable array so it can be updated during runtime
 */
export const leadsDatabase: Lead[] = [
  {
    leadId: 'lead-001',
    phoneNumber: '+972501234001',
    name: 'John Smith',
    email: 'john.smith@example.com',
    city: 'Washington',
    createdAt: '2024-01-15T10:30:00Z',
    source: 'medicare_referral',
    notes: 'Medicare Advantage member - interested in premium eyewear',
  },
  {
    leadId: 'lead-002',
    phoneNumber: '+972501234002',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@example.com',
    city: 'Baltimore',
    createdAt: '2024-01-16T14:20:00Z',
    source: 'medicare_referral',
    notes: 'Plan B member - has colorblindness diagnosis',
  },
  {
    leadId: 'lead-003',
    phoneNumber: '+972501234003',
    name: 'Michael Chen',
    email: 'michael.chen@example.com',
    city: 'Arlington',
    createdAt: '2024-01-17T09:15:00Z',
    source: 'website',
    notes: 'Plan C member - incomplete information',
  },
  {
    leadId: 'lead-004',
    phoneNumber: '+972501234004',
    name: 'Emily Davis',
    email: 'emily.davis@example.com',
    city: 'Alexandria',
    createdAt: '2024-01-18T16:45:00Z',
    source: 'medicare_portal',
    notes: 'Medicare Advantage - red-green colorblind',
  },
  {
    leadId: 'lead-005',
    phoneNumber: '+972501234005',
    name: 'David Wilson',
    email: 'david.wilson@example.com',
    city: 'Silver Spring',
    createdAt: '2024-01-19T11:00:00Z',
    source: 'healthcare_provider',
    notes: 'Plan D member - awaiting diagnosis confirmation',
  },
  {
    leadId: 'lead-006',
    phoneNumber: '+972501234006',
    name: 'Lisa Anderson',
    email: 'lisa.anderson@example.com',
    city: 'Bethesda',
    createdAt: '2024-01-20T13:30:00Z',
    source: 'medicare_referral',
    notes: 'Plan A member - qualified for premium subscription',
  },
  {
    leadId: 'lead-007',
    phoneNumber: '+972501234007',
    name: 'James Martinez',
    email: 'james.martinez@example.com',
    city: 'Rockville',
    createdAt: '2024-01-21T10:00:00Z',
    source: 'website',
    notes: 'Medicare Advantage - needs follow-up on eyewear preferences',
  },
  {
    leadId: 'lead-008',
    phoneNumber: '+972501234008',
    name: 'Jennifer Taylor',
    email: 'jennifer.taylor@example.com',
    city: 'Frederick',
    createdAt: '2024-01-22T15:20:00Z',
    source: 'healthcare_provider',
    notes: 'Plan C member - blue-yellow colorblind',
  },
];

/**
 * Helper function to find a lead by phone number
 * Reusable across the application
 *
 * @param phoneNumber - Phone number in E.164 format
 * @returns Lead if found, undefined otherwise
 */
export const findLeadByPhoneNumber = (phoneNumber: string): Lead | undefined => {
  return leadsDatabase.find((lead) => lead.phoneNumber === phoneNumber);
};

/**
 * Helper function to check if a lead exists
 *
 * @param phoneNumber - Phone number to check
 * @returns true if lead exists, false otherwise
 */
export const leadExists = (phoneNumber: string): boolean => {
  return findLeadByPhoneNumber(phoneNumber) !== undefined;
};
