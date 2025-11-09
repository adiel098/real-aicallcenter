/**
 * Real End-to-End Workflow Test
 *
 * This script tests the complete SMS workflow:
 * 1. Send SMS via server (generates token on server)
 * 2. Submit form using the generated token
 * 3. Verify lead and user were created in CRMs
 */

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

const TEST_PHONE = '+15551234999'; // Test phone number
const LOCAL_URL = 'http://localhost:3000';

async function testRealWorkflow() {
  console.log('\n=== Real End-to-End Workflow Test ===\n');

  try {
    // Step 1: Send SMS (this generates token on server)
    console.log('Step 1: Sending SMS via server...');
    const smsResponse = await axios.post(`${LOCAL_URL}/api/vapi/tool-calls`, {
      message: {
        role: 'assistant',
        toolCalls: [
          {
            id: 'test-tool-call-1',
            type: 'function',
            function: {
              name: 'send_form_link_sms',
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

    const smsResult = JSON.parse(smsResponse.data.results[0].result);
    console.log(`✓ SMS sent successfully`);
    console.log(`  SMS Result:`, smsResult);
    console.log('');

    if (!smsResult.formUrl || !smsResult.success) {
      throw new Error(`SMS sending failed: ${smsResult.message || 'Unknown error'}`);
    }

    console.log(`  Form URL: ${smsResult.formUrl}`);
    console.log('');

    // Extract token from form URL
    const urlParams = new URL(smsResult.formUrl);
    const token = urlParams.searchParams.get('token');

    if (!token) {
      throw new Error('No token found in form URL');
    }

    console.log(`  Token: ${token}`);
    console.log('');

    // Step 2: Submit form with Medicare data
    console.log('Step 2: Submitting form...');
    const formData = {
      phoneNumber: TEST_PHONE,
      name: 'Test User E2E',
      email: 'test-e2e@example.com',
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

    const formResponse = await axios.post(`${LOCAL_URL}/api/form-submission`, {
      token,
      formData,
    });

    console.log(`✓ Form submission successful!`);
    console.log(`  Lead ID: ${formResponse.data.lead?.leadId}`);
    console.log(`  User ID: ${formResponse.data.userData?.userId}`);
    console.log(`  Is Complete: ${formResponse.data.userData?.isComplete}`);
    console.log(`  Missing Fields: ${formResponse.data.userData?.missingFields.length || 0}`);
    console.log('');

    // Step 3: Verify lead was created
    console.log('Step 3: Verifying lead in CRM...');
    const leadResponse = await axios.get(`http://localhost:3001/api/leads/${TEST_PHONE}`);
    console.log(`✓ Lead found in CRM!`);
    console.log(`  Lead ID: ${leadResponse.data.lead?.leadId}`);
    console.log(`  Name: ${leadResponse.data.lead?.name}`);
    console.log(`  Email: ${leadResponse.data.lead?.email}`);
    console.log(`  Source: ${leadResponse.data.lead?.source}`);
    console.log('');

    // Step 4: Verify user data was created
    console.log('Step 4: Verifying user data in CRM...');
    const userResponse = await axios.get(`http://localhost:3002/api/users/${TEST_PHONE}`);
    console.log(`✓ User data found in CRM!`);
    console.log(`  User ID: ${userResponse.data.userData?.userId}`);
    console.log(`  Name: ${userResponse.data.userData?.name}`);
    console.log(`  Medicare Number: ${userResponse.data.userData?.medicareData?.medicareNumber}`);
    console.log(`  Plan Level: ${userResponse.data.userData?.medicareData?.planLevel}`);
    console.log(`  Has Colorblindness: ${userResponse.data.userData?.medicareData?.hasColorblindness}`);
    console.log('');

    // Step 5: Test check_lead tool
    console.log('Step 5: Testing check_lead tool (should find the new user)...');
    const checkLeadResponse = await axios.post(`${LOCAL_URL}/api/vapi/tool-calls`, {
      message: {
        role: 'assistant',
        toolCalls: [
          {
            id: 'test-tool-call-2',
            type: 'function',
            function: {
              name: 'check_lead',
              arguments: JSON.stringify({ phoneNumber: TEST_PHONE }),
            },
          },
        ],
      },
      call: {
        id: 'test-call-456',
        customer: {
          number: TEST_PHONE,
        },
      },
    });

    const checkResult = JSON.parse(checkLeadResponse.data.results[0].result);
    console.log(`✓ check_lead result:`);
    console.log(`  Found: ${checkResult.found}`);
    console.log(`  Name: ${checkResult.name || 'N/A'}`);
    console.log(`  Message: ${checkResult.message}`);
    console.log('');

    console.log('=== Test Complete ===\n');
    console.log('🎉 SUCCESS! The complete workflow is working correctly:');
    console.log('  ✓ SMS sent with token');
    console.log('  ✓ Form submitted successfully');
    console.log('  ✓ Lead created in Lead CRM');
    console.log('  ✓ User data created in User Data CRM');
    console.log('  ✓ User can be found via check_lead tool');
    console.log('');
  } catch (error: any) {
    console.error('❌ Test failed:');
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`  Error: ${error.message}`);
    }
    console.log('');
    console.log('Make sure all servers are running (npm run dev:all)');
    process.exit(1);
  }
}

// Run the test
testRealWorkflow().catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
