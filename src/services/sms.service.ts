import twilio from 'twilio';
import logger from '../utils/logger';

/**
 * SMS Service for sending text messages via Twilio
 * Handles form link distribution for new user data collection
 */

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Initialize Twilio client
let twilioClient: twilio.Twilio | null = null;

if (accountSid && authToken && twilioPhoneNumber) {
  twilioClient = twilio(accountSid, authToken);
  logger.info('Twilio SMS client initialized successfully');
} else {
  logger.warn('Twilio credentials not configured. SMS functionality will be disabled.');
}

/**
 * Send SMS with form link to user
 * @param phoneNumber - Recipient phone number in E.164 format (e.g., "+12025551234")
 * @param formLink - Full URL to the data collection form
 * @returns Promise<boolean> - True if sent successfully, false otherwise
 */
export async function sendFormLinkSMS(
  phoneNumber: string,
  formLink: string
): Promise<boolean> {
  if (!twilioClient) {
    logger.error('Twilio client not initialized. Cannot send SMS.');
    return false;
  }

  if (!twilioPhoneNumber) {
    logger.error('TWILIO_PHONE_NUMBER not configured');
    return false;
  }

  try {
    const message = `Hi! To complete your Medicare eligibility screening, please fill out this secure form: ${formLink}\n\nAfter completing the form, call us back at ${twilioPhoneNumber} to continue.\n\nThank you!`;

    logger.info(`Sending SMS to ${phoneNumber}`);

    const result = await twilioClient.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });

    logger.info(`SMS sent successfully. SID: ${result.sid}, Status: ${result.status}`);
    return true;
  } catch (error: any) {
    logger.error(`Failed to send SMS to ${phoneNumber}:`, error.message);
    return false;
  }
}

/**
 * Send custom SMS message
 * @param phoneNumber - Recipient phone number in E.164 format
 * @param message - Custom message text
 * @returns Promise<boolean> - True if sent successfully, false otherwise
 */
export async function sendSMS(
  phoneNumber: string,
  message: string
): Promise<boolean> {
  if (!twilioClient) {
    logger.error('Twilio client not initialized. Cannot send SMS.');
    return false;
  }

  if (!twilioPhoneNumber) {
    logger.error('TWILIO_PHONE_NUMBER not configured');
    return false;
  }

  try {
    logger.info(`Sending custom SMS to ${phoneNumber}`);

    const result = await twilioClient.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });

    logger.info(`SMS sent successfully. SID: ${result.sid}, Status: ${result.status}`);
    return true;
  } catch (error: any) {
    logger.error(`Failed to send SMS to ${phoneNumber}:`, error.message);
    return false;
  }
}
