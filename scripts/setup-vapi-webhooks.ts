/**
 * VAPI Webhook Setup Script
 *
 * Automatically configures VAPI assistant with webhook endpoints for:
 * - Tool calls (function execution)
 * - Call events (call.started, call.ended, message, etc.)
 *
 * Usage:
 *   npm run setup:webhooks
 *
 * Requirements:
 *   - VAPI_TOKEN in .env
 *   - VAPI_ASSISTANT_ID in .env
 *   - NGROK_URL in .env
 */

import dotenv from 'dotenv';
import axios from 'axios';
import logger from '../src/config/logger';

// Load environment variables
dotenv.config();

const VAPI_API_URL = 'https://api.vapi.ai';
const VAPI_TOKEN = process.env.VAPI_TOKEN;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const NGROK_URL = process.env.NGROK_URL;

/**
 * Validate required environment variables
 */
function validateEnvironment(): void {
  const missing: string[] = [];

  if (!VAPI_TOKEN || VAPI_TOKEN === 'your_vapi_token_here') {
    missing.push('VAPI_TOKEN');
  }

  if (!VAPI_ASSISTANT_ID || VAPI_ASSISTANT_ID === 'your_assistant_id_here') {
    missing.push('VAPI_ASSISTANT_ID');
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
    logger.info('  2. VAPI_ASSISTANT_ID: https://dashboard.vapi.ai → Assistants → Copy ID');
    logger.info('  3. NGROK_URL: Run "ngrok http 3000" and copy the HTTPS URL');
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
 * Get current assistant configuration
 */
async function getAssistant(): Promise<any> {
  try {
    logger.info({ assistantId: VAPI_ASSISTANT_ID }, 'Fetching assistant configuration...');

    const response = await axios.get(`${VAPI_API_URL}/assistant/${VAPI_ASSISTANT_ID}`, {
      headers: {
        Authorization: `Bearer ${VAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    logger.info({ name: response.data.name }, '✓ Assistant found');
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.error(
        { assistantId: VAPI_ASSISTANT_ID },
        'Assistant not found. Please check your VAPI_ASSISTANT_ID in .env'
      );
    } else if (error.response?.status === 401) {
      logger.error('Unauthorized. Please check your VAPI_TOKEN in .env');
    } else {
      logger.error({ error: error.message }, 'Failed to fetch assistant');
    }
    process.exit(1);
  }
}

/**
 * Update assistant with webhook configuration
 */
async function updateAssistantWebhooks(assistant: any): Promise<void> {
  try {
    logger.info('Configuring webhook endpoints...');

    // Build webhook configuration - only include updatable fields
    const updatePayload = {
      name: assistant.name,
      llm: assistant.llm,
      voice: assistant.voice,
      transcriber: assistant.transcriber,
      toolIds: assistant.toolIds,

      // Server Messages Configuration for Events
      serverMessages: [
        'status-update',        // Call started/ended events
        'hang',                 // Hang up events
        'speech-update',        // User speech events (includes messages)
        'transcript',           // Transcript updates
        'user-interrupted',     // User interruption events
        'end-of-call-report',   // End of call summary
      ],

      // Server URL for events
      serverUrl: NGROK_URL,
    };

    logger.info({ ngrokUrl: NGROK_URL }, 'Updating assistant configuration...');

    await axios.patch(
      `${VAPI_API_URL}/assistant/${VAPI_ASSISTANT_ID}`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${VAPI_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('✓ Assistant webhooks configured successfully!');
    logger.info('');
    logger.info('Configured event endpoints:');
    logger.info(`  📞 Call Started:  ${NGROK_URL}/api/vapi/events/call-started`);
    logger.info(`  📴 Call Ended:    ${NGROK_URL}/api/vapi/events/call-ended`);
    logger.info(`  💬 Message:       ${NGROK_URL}/api/vapi/events/message`);
    logger.info(`  ⚠️  Interrupted:   ${NGROK_URL}/api/vapi/events/speech-interrupted`);
    logger.info(`  📞 Hang:          ${NGROK_URL}/api/vapi/events/hang`);
    logger.info('');
    logger.info('🎉 Setup complete! Make a test call to see real-time logs.');
  } catch (error: any) {
    logger.error(
      {
        error: error.message,
        response: error.response?.data,
      },
      'Failed to update assistant webhooks'
    );
    process.exit(1);
  }
}

/**
 * Main setup function
 */
async function main(): Promise<void> {
  logger.info('');
  logger.info('=== VAPI Webhook Setup ===');
  logger.info('');

  // Step 1: Validate environment
  validateEnvironment();
  logger.info('');

  // Step 2: Get current assistant configuration
  const assistant = await getAssistant();
  logger.info('');

  // Step 3: Update webhooks
  await updateAssistantWebhooks(assistant);

  logger.info('');
  logger.info('Next steps:');
  logger.info('  1. Keep ngrok running: ngrok http 3000');
  logger.info('  2. Start your servers: npm run dev:all');
  logger.info('  3. Call your VAPI number to test');
  logger.info('  4. Watch the console for real-time call logs!');
  logger.info('');
}

// Run the script
main().catch((error) => {
  logger.error({ error: error.message }, 'Setup failed');
  process.exit(1);
});
