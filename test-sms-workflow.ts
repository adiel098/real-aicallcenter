/**
 * Test Script for SMS Workflow
 *
 * This script tests the complete SMS-based new user registration workflow:
 * 1. Generate form token
 * 2. Build form URL
 * 3. Simulate sending SMS (without Twilio)
 * 4. Display form link
 * 5. Test form submission endpoint
 */

import { generateFormToken, buildFormUrl, validateFormToken } from './src/services/token.service';
import axios from 'axios';

const TEST_PHONE = '+15551234999'; // Test phone number
const LOCAL_URL = 'http://localhost:3000'; // Use this if testing locally

async function testSMSWorkflow() {
  console.log('\n=== SMS Workflow Test ===\n');

  // Step 1: Generate form token
  console.log('Step 1: Generating form token...');
  const formToken = generateFormToken(TEST_PHONE);
  console.log(`✓ Token generated: ${formToken.token}`);
  console.log(`  Phone: ${formToken.phoneNumber}`);
  console.log(`  Expires: ${formToken.expiresAt.toISOString()}`);
  console.log('');

  // Step 2: Build form URL
  console.log('Step 2: Building form URL...');
  const formUrl = buildFormUrl(LOCAL_URL, formToken.token, TEST_PHONE);
  console.log(`✓ Form URL: ${formUrl}`);
  console.log('');

  // Step 3: Validate token
  console.log('Step 3: Validating token...');
  const validation = validateFormToken(formToken.token);
  console.log(`✓ Token valid: ${validation.valid}`);
  console.log(`  Phone number: ${validation.phoneNumber}`);
  console.log('');

  // Step 4: Test form submission
  console.log('Step 4: Testing form submission...');
  const formData = {
    phoneNumber: TEST_PHONE,
    name: 'Test User',
    email: 'test@example.com',
    city: 'Test City',
    age: 70,
    dateOfBirth: '1954-01-15',
    medicareNumber: '1AB2-CD3-EF45',
    ssnLast4: '1234',
    planLevel: 'Advantage',
    hasColorblindness: true,
    colorblindType: 'red-green (deuteranopia)',
    currentEyewear: 'Standard glasses',
    medicalHistory: ['hypertension', 'diabetes'],
    currentMedications: ['metformin', 'lisinopril'],
  };

  try {
    const response = await axios.post(`${LOCAL_URL}/api/form-submission`, {
      token: formToken.token,
      formData,
    });

    console.log(`✓ Form submission successful!`);
    console.log(`  Lead ID: ${response.data.lead?.leadId}`);
    console.log(`  User ID: ${response.data.userData?.userId}`);
    console.log(`  Is Complete: ${response.data.userData?.isComplete}`);
    console.log(`  Missing Fields: ${response.data.userData?.missingFields.length || 0}`);
    console.log('');
  } catch (error: any) {
    console.error('✗ Form submission failed:');
    console.error(`  Error: ${error.response?.data?.message || error.message}`);
    console.log('');
  }

  // Step 5: Verify lead was created
  console.log('Step 5: Verifying lead in CRM...');
  try {
    const leadResponse = await axios.get(`http://localhost:3001/api/leads/${TEST_PHONE}`);
    console.log(`✓ Lead found in CRM!`);
    console.log(`  Lead ID: ${leadResponse.data.lead?.leadId}`);
    console.log(`  Name: ${leadResponse.data.lead?.name}`);
    console.log(`  Email: ${leadResponse.data.lead?.email}`);
    console.log('');
  } catch (error: any) {
    console.error('✗ Lead not found in CRM');
    console.log('');
  }

  // Step 6: Verify user data was created
  console.log('Step 6: Verifying user data in CRM...');
  try {
    const userResponse = await axios.get(`http://localhost:3002/api/users/${TEST_PHONE}`);
    console.log(`✓ User data found in CRM!`);
    console.log(`  User ID: ${userResponse.data.userData?.userId}`);
    console.log(`  Name: ${userResponse.data.userData?.name}`);
    console.log(`  Medicare Number: ${userResponse.data.userData?.medicareData?.medicareNumber}`);
    console.log(`  Plan Level: ${userResponse.data.userData?.medicareData?.planLevel}`);
    console.log(`  Has Colorblindness: ${userResponse.data.userData?.medicareData?.hasColorblindness}`);
    console.log('');
  } catch (error: any) {
    console.error('✗ User data not found in CRM');
    console.log('');
  }

  // Step 7: Test check_lead tool
  console.log('Step 7: Testing check_lead tool (should find the new user)...');
  try {
    const checkLeadResponse = await axios.post(`${LOCAL_URL}/api/vapi/tool-calls`, {
      message: {
        role: 'assistant',
        toolCalls: [
          {
            id: 'test-tool-call-1',
            type: 'function',
            function: {
              name: 'check_lead',
              arguments: JSON.stringify({ phoneNumber: TEST_PHONE }),
            },
          },
        ],
      },
      call: {
        id: 'test-call-123',
        customer: {
          number: TEST_PHONE,
        },
      },
    });

    const result = JSON.parse(checkLeadResponse.data.results[0].result);
    console.log(`✓ check_lead result:`);
    console.log(`  Found: ${result.found}`);
    console.log(`  Name: ${result.name || 'N/A'}`);
    console.log(`  Message: ${result.message}`);
    console.log('');
  } catch (error: any) {
    console.error('✗ check_lead tool call failed');
    console.error(`  Error: ${error.response?.data || error.message}`);
    console.log('');
  }

  console.log('=== Test Complete ===\n');
  console.log(`📋 Summary:`);
  console.log(`  • Form URL: ${formUrl}`);
  console.log(`  • You can open this URL in a browser to test the web form`);
  console.log(`  • The form will be pre-filled with phone number: ${TEST_PHONE}`);
  console.log(`  • After submission, the user will be created in both CRMs`);
  console.log('');
}

// Run the test
testSMSWorkflow().catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
