/**
 * Lead CRM Server (Port 3001)
 *
 * Mock CRM server for lead lookup and management.
 * Handles incoming requests to check if a phone number exists in the leads database.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from '../config/logger';
import { PORTS, HTTP_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } from '../config/constants';
import { leadsDatabase, findLeadByPhoneNumber, createLead, leadExists } from '../data/leads.data';
import { normalizePhoneNumber, isValidPhoneNumber, maskPhoneNumber } from '../utils/phoneNumber.util';
import { LeadLookupResponse } from '../types/lead.types';

// Initialize Express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for all origins
app.use(express.json()); // Parse JSON request bodies

/**
 * Request logging middleware
 * Logs all incoming requests with timestamp and details
 */
app.use((req: Request, res: Response, next) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create child logger with request context
  const requestLogger = logger.child({ requestId, server: 'lead-crm' });

  requestLogger.info(
    {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
    },
    'Incoming request'
  );

  // Store logger on response object for use in route handlers
  (res as any).requestLogger = requestLogger;

  next();
});

/**
 * GET /api/leads/:phoneNumber
 *
 * Find a lead by phone number
 *
 * @param phoneNumber - Phone number to search for (in URL path)
 * @returns LeadLookupResponse with lead data if found
 */
app.get('/api/leads/:phoneNumber', (req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;
  const { phoneNumber } = req.params;

  requestLogger.debug({ phoneNumber: maskPhoneNumber(phoneNumber) }, 'Looking up lead by phone number');

  // Validate phone number format
  if (!isValidPhoneNumber(phoneNumber)) {
    requestLogger.warn({ phoneNumber: maskPhoneNumber(phoneNumber) }, 'Invalid phone number format');

    const response: LeadLookupResponse = {
      found: false,
      lead: null,
      message: ERROR_MESSAGES.INVALID_PHONE,
    };

    return res.status(HTTP_STATUS.BAD_REQUEST).json(response);
  }

  // Normalize phone number for consistent lookup
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  // Search for lead in database
  const lead = findLeadByPhoneNumber(normalizedPhone);

  if (!lead) {
    requestLogger.info({ phoneNumber: maskPhoneNumber(normalizedPhone) }, 'Lead not found');

    const response: LeadLookupResponse = {
      found: false,
      lead: null,
      message: ERROR_MESSAGES.LEAD_NOT_FOUND,
    };

    return res.status(HTTP_STATUS.NOT_FOUND).json(response);
  }

  // Lead found successfully
  requestLogger.info(
    {
      phoneNumber: maskPhoneNumber(normalizedPhone),
      leadId: lead.leadId,
      leadName: lead.name,
    },
    'Lead found successfully'
  );

  const response: LeadLookupResponse = {
    found: true,
    lead: lead,
    message: SUCCESS_MESSAGES.LEAD_FOUND,
  };

  return res.status(HTTP_STATUS.OK).json(response);
});

/**
 * GET /api/leads
 *
 * Get all leads (for debugging/testing purposes)
 *
 * @returns Array of all leads
 */
app.get('/api/leads', (_req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;

  requestLogger.debug('Fetching all leads');

  // Return all leads from database
  const count = leadsDatabase.length;

  requestLogger.info({ count }, 'Retrieved all leads');

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    count,
    leads: leadsDatabase,
  });
});

/**
 * POST /api/leads
 *
 * Create a new lead in the system
 * Used when a new user fills out the web form
 *
 * @body phoneNumber - Phone number (E.164 format, required)
 * @body name - Full name (required)
 * @body email - Email address (required)
 * @body city - City (required)
 * @body source - Lead source (optional, defaults to "inbound_call")
 * @body notes - Additional notes (optional)
 * @returns Newly created lead object
 */
app.post('/api/leads', (req: Request, res: Response) => {
  const requestLogger = (res as any).requestLogger;
  const { phoneNumber, name, email, city, source, notes } = req.body;

  requestLogger.debug({ phoneNumber: maskPhoneNumber(phoneNumber) }, 'Creating new lead');

  // Validate required fields
  if (!phoneNumber || !name || !email || !city) {
    requestLogger.warn('Missing required fields for lead creation');
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Missing required fields: phoneNumber, name, email, city are required',
    });
  }

  // Validate phone number format
  if (!isValidPhoneNumber(phoneNumber)) {
    requestLogger.warn({ phoneNumber: maskPhoneNumber(phoneNumber) }, 'Invalid phone number format');
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: ERROR_MESSAGES.INVALID_PHONE,
    });
  }

  // Normalize phone number
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  // Check if lead already exists
  if (leadExists(normalizedPhone)) {
    requestLogger.warn(
      { phoneNumber: maskPhoneNumber(normalizedPhone) },
      'Lead already exists with this phone number'
    );
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message: 'A lead with this phone number already exists',
      existingLead: findLeadByPhoneNumber(normalizedPhone),
    });
  }

  // Create new lead
  try {
    const newLead = createLead({
      phoneNumber: normalizedPhone,
      name,
      email,
      city,
      source,
      notes,
    });

    requestLogger.info(
      {
        phoneNumber: maskPhoneNumber(normalizedPhone),
        leadId: newLead.leadId,
        leadName: newLead.name,
      },
      'Lead created successfully'
    );

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Lead created successfully',
      lead: newLead,
    });
  } catch (error: any) {
    requestLogger.error({ error: error.message }, 'Failed to create lead');
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to create lead',
      error: error.message,
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json({ status: 'healthy', service: 'lead-crm' });
});

/**
 * Error handling middleware
 * Catches any unhandled errors and returns a consistent error response
 */
app.use((err: Error, _req: Request, res: Response, _next: any) => {
  const requestLogger = (res as any).requestLogger || logger;

  requestLogger.error(
    {
      error: err.message,
      stack: err.stack,
    },
    'Unhandled error in Lead CRM server'
  );

  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: 'Internal server error',
    error: err.message,
  });
});

/**
 * Start the server
 */
const startServer = () => {
  app.listen(PORTS.LEAD_CRM, () => {
    logger.info(
      {
        port: PORTS.LEAD_CRM,
        service: 'lead-crm',
        leadsCount: leadsDatabase.length,
      },
      `Lead CRM Server started on port ${PORTS.LEAD_CRM}`
    );
  });
};

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

export default app;
