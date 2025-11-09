/**
 * VAPI Tool Configuration Script
 *
 * Automatically configures all VAPI tools with the correct server endpoint
 * to fix the "callId: unknown" issue where tool calls weren't being routed
 * to the tool execution endpoint.
 *
 * Root Cause:
 * - Tools were not configured with a server.url
 * - VAPI was falling back to sending tool calls to base serverUrl (/)
 * - The unified handler only logged tool calls, didn't execute them
 * - The actual tool executor at /api/vapi/tool-calls never received requests
 *
 * Solution:
 * - This script updates each tool's server.url to point to /api/vapi/tool-calls
 * - Ensures callId and customerNumber are properly extracted from requests
 *
 * Usage:
 *   npm run setup:tools
 *
 * Requirements:
 *   - VAPI_TOKEN in .env
 *   - NGROK_URL in .env
 */

import dotenv from 'dotenv';
import axios from 'axios';
import logger from '../src/config/logger';

// Load environment variables
dotenv.config();

const VAPI_API_URL = 'https://api.vapi.ai';
const VAPI_TOKEN = process.env.VAPI_TOKEN;
const NGROK_URL = process.env.NGROK_URL;

/**
 * Validate required environment variables
 */
function validateEnvironment(): void {
  const missing: string[] = [];

  if (!VAPI_TOKEN || VAPI_TOKEN === 'your_vapi_token_here') {
    missing.push('VAPI_TOKEN');
  }

  if (!NGROK_URL || NGROK_URL === 'https://your-ngrok-url.ngrok.io') {
    missing.push('NGROK_URL');
  }

  if (missing.length > 0) {
    logger.error(
      {
        missingVariables: missing,
      },
      'Missing required environment variables in .env file'
    );

    logger.info('');
    logger.info('Please update your .env file with:');
    missing.forEach((varName) => {
      logger.info(`  ${varName}=<your_value_here>`);
    });
    logger.info('');
    logger.info('How to get these values:');
    logger.info('  1. VAPI_TOKEN: https://dashboard.vapi.ai → Account → API Keys');
    logger.info('  2. NGROK_URL: Run "ngrok http 3000" and copy the HTTPS URL');
    logger.info('');

    process.exit(1);
  }

  // Validate ngrok URL format
  if (NGROK_URL && !NGROK_URL.startsWith('https://')) {
    logger.error('NGROK_URL must start with https://');
    process.exit(1);
  }

  logger.info('✓ Environment variables validated');
}

/**
 * Fetch all tools from VAPI
 */
async function fetchAllTools(): Promise<any[]> {
  try {
    logger.info('Fetching all tools from VAPI...');

    const response = await axios.get(`${VAPI_API_URL}/tool`, {
      headers: {
        Authorization: `Bearer ${VAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    const tools = response.data;
    logger.info({ count: tools.length }, `✓ Found ${tools.length} tools`);

    // Log tool names for visibility
    tools.forEach((tool: any, index: number) => {
      logger.info(`  ${index + 1}. ${tool.name || tool.function?.name || 'Unnamed tool'} (${tool.id})`);
    });

    return tools;
  } catch (error: any) {
    if (error.response?.status === 401) {
      logger.error('Unauthorized. Please check your VAPI_TOKEN in .env');
    } else {
      logger.error({ error: error.message }, 'Failed to fetch tools');
    }
    process.exit(1);
  }
}

/**
 * Update a single tool's server configuration
 */
async function updateToolServer(tool: any, toolEndpointUrl: string): Promise<boolean> {
  try {
    const toolId = tool.id;
    const toolName = tool.name || tool.function?.name || 'Unnamed tool';

    // Check if tool already has correct server URL
    if (tool.server?.url === toolEndpointUrl) {
      logger.info({ toolName, toolId }, `  ✓ Already configured (skipping)`);
      return false; // No update needed
    }

    logger.info({ toolName, toolId }, `  Updating tool...`);

    // Build update payload based on tool type
    const updatePayload: any = {
      type: tool.type,
    };

    // Copy tool-type-specific fields
    if (tool.type === 'function') {
      updatePayload.function = tool.function;
      updatePayload.server = {
        url: toolEndpointUrl,
        secret: tool.server?.secret, // Preserve existing secret if any
      };
    } else if (tool.type === 'transferCall') {
      updatePayload.transferCall = tool.transferCall;
    } else if (tool.type === 'sms') {
      updatePayload.sms = tool.sms;
    } else {
      // Generic copy for other tool types
      Object.keys(tool).forEach((key) => {
        if (key !== 'id' && key !== 'orgId' && key !== 'createdAt' && key !== 'updatedAt') {
          updatePayload[key] = tool[key];
        }
      });
    }

    // Update the tool
    await axios.patch(
      `${VAPI_API_URL}/tool/${toolId}`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${VAPI_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info({ toolName, toolId }, `  ✓ Updated successfully`);
    return true; // Update performed
  } catch (error: any) {
    logger.error(
      {
        toolId: tool.id,
        toolName: tool.name || tool.function?.name,
        error: error.message,
        response: error.response?.data,
      },
      '  ✗ Failed to update tool'
    );
    return false;
  }
}

/**
 * Update all tools with correct server endpoint
 */
async function updateAllTools(tools: any[]): Promise<void> {
  const toolEndpointUrl = `${NGROK_URL}/api/vapi/tool-calls`;

  logger.info('');
  logger.info({ endpoint: toolEndpointUrl }, 'Configuring tools with server endpoint:');
  logger.info('');

  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const tool of tools) {
    const wasUpdated = await updateToolServer(tool, toolEndpointUrl);
    if (wasUpdated) {
      updatedCount++;
    } else if (tool.server?.url === toolEndpointUrl) {
      skippedCount++;
    } else {
      failedCount++;
    }
  }

  logger.info('');
  logger.info('=== Summary ===');
  logger.info(`  Updated: ${updatedCount} tools`);
  logger.info(`  Skipped: ${skippedCount} tools (already configured)`);
  logger.info(`  Failed:  ${failedCount} tools`);
  logger.info('');

  if (updatedCount > 0 || skippedCount > 0) {
    logger.info('✓ Tool configuration complete!');
    logger.info('');
    logger.info('All function tools now point to:');
    logger.info(`  ${toolEndpointUrl}`);
    logger.info('');
    logger.info('This ensures:');
    logger.info('  ✓ callId is properly extracted from VAPI requests');
    logger.info('  ✓ customerNumber is captured correctly');
    logger.info('  ✓ Database persistence works (no more "callId: unknown")');
    logger.info('  ✓ Tool execution happens at the correct endpoint');
  }

  if (failedCount > 0) {
    logger.warn('');
    logger.warn(`⚠️  ${failedCount} tool(s) failed to update. Check errors above.`);
  }
}

/**
 * Main setup function
 */
async function main(): Promise<void> {
  logger.info('');
  logger.info('=== VAPI Tool Configuration Setup ===');
  logger.info('');

  // Step 1: Validate environment
  validateEnvironment();
  logger.info('');

  // Step 2: Fetch all tools
  const tools = await fetchAllTools();
  logger.info('');

  // Step 3: Update all tools with correct server URL
  await updateAllTools(tools);

  logger.info('');
  logger.info('Next steps:');
  logger.info('  1. Keep ngrok running: ngrok http 3000');
  logger.info('  2. Start your servers: npm run dev:all');
  logger.info('  3. Make a test call to verify callId appears in logs');
  logger.info('  4. Check logs for: callId: "actual-call-id" (not "unknown")');
  logger.info('');
}

// Run the script
main().catch((error) => {
  logger.error({ error: error.message }, 'Setup failed');
  process.exit(1);
});
