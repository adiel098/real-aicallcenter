/**
 * VICI Dialer Mock Server
 *
 * Simulates VICI dialer system for development and testing.
 * Handles:
 * - Disposition submissions (SALE, NQI, NA, AM, DC, B, DAIR)
 * - Callback scheduling
 * - Call tracking and reporting
 *
 * Port: 3004
 * Based on AlexAI + VICI Workflow specification
 */

import express, { Request, Response } from 'express';
import logger from '../config/logger';
import { PORTS } from '../config/constants';
import {
  VICIDispositionRequest,
  VICIDispositionResponse,
  VICICallbackRequest,
  VICICallbackResponse,
  VICICall,
  VICIDisposition,
} from '../types/vici.types';

const app = express();
app.use(express.json());

// ============================================================================
// In-Memory Storage
// ============================================================================

interface DispositionRecord extends VICIDispositionRequest {
  dispositionId: string;
  timestamp: string;
}

interface CallbackRecord extends VICICallbackRequest {
  callbackId: string;
  timestamp: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
}

const dispositions: DispositionRecord[] = [];
const callbacks: CallbackRecord[] = [];
const calls: VICICall[] = [];

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * POST /api/dispositions
 * Submit call disposition to VICI
 */
app.post('/api/dispositions', (req: Request, res: Response) => {
  try {
    const dispositionRequest = req.body as VICIDispositionRequest;

    // Validate required fields
    if (
      !dispositionRequest.leadId ||
      !dispositionRequest.phoneNumber ||
      !dispositionRequest.disposition
    ) {
      logger.warn({ body: req.body }, 'Invalid disposition request - missing required fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: leadId, phoneNumber, disposition',
      });
    }

    // Validate disposition code
    const validDispositions: VICIDisposition[] = [
      'SALE',
      'NQI',
      'NI',
      'NA',
      'AM',
      'DC',
      'B',
      'DAIR',
    ];
    if (!validDispositions.includes(dispositionRequest.disposition)) {
      logger.warn(
        { disposition: dispositionRequest.disposition },
        'Invalid disposition code'
      );
      return res.status(400).json({
        success: false,
        error: `Invalid disposition code. Must be one of: ${validDispositions.join(', ')}`,
      });
    }

    // Create disposition record
    const dispositionRecord: DispositionRecord = {
      ...dispositionRequest,
      dispositionId: `disp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    // Save to in-memory storage
    dispositions.push(dispositionRecord);

    logger.info(
      {
        dispositionId: dispositionRecord.dispositionId,
        leadId: dispositionRequest.leadId,
        phoneNumber: dispositionRequest.phoneNumber,
        disposition: dispositionRequest.disposition,
        classificationResult: dispositionRequest.metadata?.classificationResult,
      },
      'VICI disposition received'
    );

    // Create response
    const response: VICIDispositionResponse = {
      success: true,
      leadId: dispositionRequest.leadId,
      dispositionId: dispositionRecord.dispositionId,
      timestamp: dispositionRecord.timestamp,
      message: `Disposition ${dispositionRequest.disposition} recorded for lead ${dispositionRequest.leadId}`,
    };

    return res.status(200).json(response);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error processing disposition');
    return res.status(500).json({
      success: false,
      error: 'Internal server error processing disposition',
    });
  }
});

/**
 * POST /api/callbacks
 * Schedule callback for lead
 */
app.post('/api/callbacks', (req: Request, res: Response) => {
  try {
    const callbackRequest = req.body as VICICallbackRequest;

    // Validate required fields
    if (
      !callbackRequest.leadId ||
      !callbackRequest.phoneNumber ||
      !callbackRequest.callbackDateTime ||
      !callbackRequest.reason
    ) {
      logger.warn({ body: req.body }, 'Invalid callback request - missing required fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: leadId, phoneNumber, callbackDateTime, reason',
      });
    }

    // Validate datetime format
    const callbackDate = new Date(callbackRequest.callbackDateTime);
    if (isNaN(callbackDate.getTime())) {
      logger.warn({ callbackDateTime: callbackRequest.callbackDateTime }, 'Invalid datetime format');
      return res.status(400).json({
        success: false,
        error: 'Invalid callbackDateTime format. Must be ISO 8601 format.',
      });
    }

    // Create callback record
    const callbackRecord: CallbackRecord = {
      ...callbackRequest,
      callbackId: `cb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
    };

    // Save to in-memory storage
    callbacks.push(callbackRecord);

    logger.info(
      {
        callbackId: callbackRecord.callbackId,
        leadId: callbackRequest.leadId,
        phoneNumber: callbackRequest.phoneNumber,
        scheduledFor: callbackRequest.callbackDateTime,
        reason: callbackRequest.reason,
      },
      'VICI callback scheduled'
    );

    // Create response
    const response: VICICallbackResponse = {
      success: true,
      leadId: callbackRequest.leadId,
      callbackId: callbackRecord.callbackId,
      scheduledFor: callbackRequest.callbackDateTime,
      timestamp: callbackRecord.timestamp,
    };

    return res.status(200).json(response);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error scheduling callback');
    return res.status(500).json({
      success: false,
      error: 'Internal server error scheduling callback',
    });
  }
});

/**
 * GET /api/dispositions
 * Retrieve all dispositions (for testing/debugging)
 */
app.get('/api/dispositions', (_req: Request, res: Response) => {
  logger.info({ count: dispositions.length }, 'Retrieving all dispositions');

  res.status(200).json({
    count: dispositions.length,
    dispositions: dispositions.map((d) => ({
      dispositionId: d.dispositionId,
      leadId: d.leadId,
      phoneNumber: d.phoneNumber,
      disposition: d.disposition,
      timestamp: d.timestamp,
      metadata: d.metadata,
    })),
  });
});

/**
 * GET /api/dispositions/:leadId
 * Retrieve dispositions for specific lead
 */
app.get('/api/dispositions/:leadId', (req: Request, res: Response) => {
  const { leadId } = req.params;
  const leadDispositions = dispositions.filter((d) => d.leadId === leadId);

  logger.info({ leadId, count: leadDispositions.length }, 'Retrieving dispositions for lead');

  res.status(200).json({
    leadId,
    count: leadDispositions.length,
    dispositions: leadDispositions,
  });
});

/**
 * GET /api/callbacks
 * Retrieve all callbacks (for testing/debugging)
 */
app.get('/api/callbacks', (_req: Request, res: Response) => {
  logger.info({ count: callbacks.length }, 'Retrieving all callbacks');

  res.status(200).json({
    count: callbacks.length,
    callbacks: callbacks.map((cb) => ({
      callbackId: cb.callbackId,
      leadId: cb.leadId,
      phoneNumber: cb.phoneNumber,
      scheduledFor: cb.callbackDateTime,
      reason: cb.reason,
      status: cb.status,
      timestamp: cb.timestamp,
    })),
  });
});

/**
 * GET /api/callbacks/:leadId
 * Retrieve callbacks for specific lead
 */
app.get('/api/callbacks/:leadId', (req: Request, res: Response) => {
  const { leadId } = req.params;
  const leadCallbacks = callbacks.filter((cb) => cb.leadId === leadId);

  logger.info({ leadId, count: leadCallbacks.length }, 'Retrieving callbacks for lead');

  res.status(200).json({
    leadId,
    count: leadCallbacks.length,
    callbacks: leadCallbacks,
  });
});

/**
 * GET /api/stats
 * Get statistics about dispositions and callbacks
 */
app.get('/api/stats', (_req: Request, res: Response) => {
  // Count dispositions by type
  const dispositionStats = dispositions.reduce(
    (acc, d) => {
      acc[d.disposition] = (acc[d.disposition] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Count callbacks by status
  const callbackStats = callbacks.reduce(
    (acc, cb) => {
      acc[cb.status] = (acc[cb.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const stats = {
    totalDispositions: dispositions.length,
    dispositionBreakdown: dispositionStats,
    totalCallbacks: callbacks.length,
    callbackBreakdown: callbackStats,
    lastDisposition: dispositions[dispositions.length - 1]
      ? {
          dispositionId: dispositions[dispositions.length - 1].dispositionId,
          disposition: dispositions[dispositions.length - 1].disposition,
          timestamp: dispositions[dispositions.length - 1].timestamp,
        }
      : null,
    lastCallback: callbacks[callbacks.length - 1]
      ? {
          callbackId: callbacks[callbacks.length - 1].callbackId,
          scheduledFor: callbacks[callbacks.length - 1].callbackDateTime,
          timestamp: callbacks[callbacks.length - 1].timestamp,
        }
      : null,
  };

  logger.info(stats, 'VICI statistics requested');

  res.status(200).json(stats);
});

/**
 * DELETE /api/reset
 * Reset all data (for testing)
 */
app.delete('/api/reset', (_req: Request, res: Response) => {
  const beforeCounts = {
    dispositions: dispositions.length,
    callbacks: callbacks.length,
    calls: calls.length,
  };

  dispositions.length = 0;
  callbacks.length = 0;
  calls.length = 0;

  logger.warn(beforeCounts, 'VICI data reset - all records cleared');

  res.status(200).json({
    success: true,
    message: 'All VICI data has been reset',
    cleared: beforeCounts,
  });
});

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'VICI Mock Server',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Server Startup
// ============================================================================

const PORT = PORTS.VICI_MOCK || 3004;

app.listen(PORT, () => {
  logger.info(
    { port: PORT, service: 'VICI Mock Server' },
    `✓ VICI Mock Server running on http://localhost:${PORT}`
  );
  logger.info(
    { endpoints: ['/api/dispositions', '/api/callbacks', '/api/stats', '/health'] },
    'Available endpoints'
  );
});

export default app;
