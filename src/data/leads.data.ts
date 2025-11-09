/**
 * Mock Lead Data
 *
 * Sample leads for testing the Lead CRM system.
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
    phoneNumber: '+12025551001',
    name: 'John Smith',
    email: 'john.smith@example.com',
    createdAt: '2024-01-15T10:30:00Z',
    source: 'website',
    notes: 'Interested in premium package',
  },
  {
    leadId: 'lead-002',
    phoneNumber: '+12025551002',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@example.com',
    createdAt: '2024-01-16T14:20:00Z',
    source: 'referral',
    notes: 'Referred by John Smith',
  },
  {
    leadId: 'lead-003',
    phoneNumber: '+12025551003',
    name: 'Michael Chen',
    email: 'michael.chen@example.com',
    createdAt: '2024-01-17T09:15:00Z',
    source: 'social_media',
    notes: 'High priority lead',
  },
  {
    leadId: 'lead-004',
    phoneNumber: '+12025551004',
    name: 'Emily Davis',
    email: 'emily.davis@example.com',
    createdAt: '2024-01-18T16:45:00Z',
    source: 'website',
  },
  {
    leadId: 'lead-005',
    phoneNumber: '+12025551005',
    name: 'David Wilson',
    email: 'david.wilson@example.com',
    createdAt: '2024-01-19T11:00:00Z',
    source: 'email_campaign',
    notes: 'Responded to January newsletter',
  },
  {
    leadId: 'lead-006',
    phoneNumber: '+12025551006',
    name: 'Lisa Anderson',
    email: 'lisa.anderson@example.com',
    createdAt: '2024-01-20T13:30:00Z',
    source: 'referral',
  },
  {
    leadId: 'lead-007',
    phoneNumber: '+12025551007',
    name: 'James Martinez',
    email: 'james.martinez@example.com',
    createdAt: '2024-01-21T10:00:00Z',
    source: 'website',
    notes: 'Needs follow-up call',
  },
  {
    leadId: 'lead-008',
    phoneNumber: '+12025551008',
    name: 'Jennifer Taylor',
    email: 'jennifer.taylor@example.com',
    createdAt: '2024-01-22T15:20:00Z',
    source: 'social_media',
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
