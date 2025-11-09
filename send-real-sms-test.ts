/**
 * Real SMS Test Script
 *
 * This script sends an actual SMS to a real phone number using the send_form_link_sms tool
 * Make sure you have configured Twilio credentials in your .env file before running this
 */

import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import axios from 'axios';

const REAL_PHONE = '+972527373474'; // Your real phone number
const NGROK_URL = 'https://9dd7c45bc998.ngrok-free.app'; // Your ngrok URL

async function sendRealSMS() {
  console.log('\n=== Real SMS Send Test ===\n');
  console.log(`Target phone: ${REAL_PHONE}`);
  console.log(`Ngrok URL: ${NGROK_URL}`);
  console.log('');

  try {
    // Call the send_form_link_sms tool via VAPI tool handler
    console.log('Sending SMS via send_form_link_sms tool...');

    const response = await axios.post(`http://localhost:3000/api/vapi/tool-calls`, {
      message: {
        role: 'assistant',
        toolCalls: [
          {
            id: 'real-sms-test-1',
            type: 'function',
            function: {
              name: 'send_form_link_sms',
              arguments: JSON.stringify({
                phoneNumber: REAL_PHONE
              }),
            },
          },
        ],
      },
      call: {
        id: 'real-sms-test-call-123',
        customer: {
          number: REAL_PHONE,
        },
      },
    });

    const result = JSON.parse(response.data.results[0].result);

    console.log('✓ SMS tool call completed!');
    console.log('');
    console.log('Response:');
    console.log(`  Success: ${result.success}`);
    console.log(`  SMS Sent: ${result.smsSent}`);
    console.log(`  Form URL: ${result.formUrl}`);
    console.log(`  Expires At: ${result.expiresAt}`);
    console.log(`  Message: ${result.message}`);
    console.log('');

    if (result.success && result.smsSent) {
      console.log('🎉 SUCCESS! SMS has been sent to your phone!');
      console.log('');
      console.log('Next steps:');
      console.log('1. Check your phone for the SMS message');
      console.log('2. Click the link in the SMS');
      console.log('3. Fill out the Medicare eligibility form');
      console.log('4. Submit the form');
      console.log('5. Call back to test the complete workflow');
      console.log('');
      console.log(`Form Link (if you want to test directly):`);
      console.log(result.formUrl);
    } else {
      console.log('❌ SMS was not sent. Check the error message above.');
      console.log('');
      console.log('Common issues:');
      console.log('- Twilio credentials not configured in .env file');
      console.log('- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER missing');
      console.log('- Insufficient Twilio account balance');
      console.log('- Phone number not verified in Twilio (for trial accounts)');
    }

  } catch (error: any) {
    console.error('❌ Failed to send SMS:');
    console.error(`  Error: ${error.response?.data || error.message}`);
    console.log('');
    console.log('Make sure:');
    console.log('1. All servers are running (npm run dev:all)');
    console.log('2. Twilio credentials are configured in .env file');
    console.log('3. NGROK_URL is set correctly in .env file');
  }

  console.log('\n=== Test Complete ===\n');
}

// Check if Twilio credentials are configured
console.log('\nChecking Twilio configuration...');
console.log(`TWILIO_ACCOUNT_SID: ${process.env.TWILIO_ACCOUNT_SID ? '✓ Set' : '✗ Not set'}`);
console.log(`TWILIO_AUTH_TOKEN: ${process.env.TWILIO_AUTH_TOKEN ? '✓ Set' : '✗ Not set'}`);
console.log(`TWILIO_PHONE_NUMBER: ${process.env.TWILIO_PHONE_NUMBER || '✗ Not set'}`);
console.log(`NGROK_URL: ${process.env.NGROK_URL || '✗ Not set'}`);
console.log('');

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
  console.log('⚠️  WARNING: Twilio credentials not found in environment variables!');
  console.log('');
  console.log('To configure Twilio:');
  console.log('1. Create a .env file (copy from .env.example)');
  console.log('2. Sign up at https://www.twilio.com/');
  console.log('3. Get your Account SID and Auth Token from Twilio Console');
  console.log('4. Get a phone number with SMS capabilities');
  console.log('5. Add the credentials to your .env file');
  console.log('');
  console.log('The test will continue, but SMS sending will fail without proper credentials.');
  console.log('');
}

// Run the test
sendRealSMS().catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
