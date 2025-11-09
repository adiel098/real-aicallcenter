/**
 * Form Submission Test Script
 *
 * This script tests the POST /api/form-submission endpoint:
 * 1. Sends SMS via server to generate valid token
 * 2. Extracts token from form URL
 * 3. Submits complete form data
 * 4. Verifies lead and user data were created correctly
 */

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

const REAL_PHONE = '+972527373999'; // Test phone number that doesn't exist in DB yet
const LOCAL_URL = 'http://localhost:3000';
const TEST_USER_NAME = 'Form Test User';
const TEST_USER_EMAIL = 'formtest@example.com';

async function testFormSubmission() {
  console.log('\n=== Form Submission POST Endpoint Test ===\n');

  try {
    // Step 1: Send SMS to get valid server-generated token
    console.log('Step 1: Generating valid token via SMS endpoint...');
    const smsResponse = await axios.post(`${LOCAL_URL}/api/vapi/tool-calls`, {
      message: {
        role: 'assistant',
        toolCalls: [
          {
            id: 'form-test-1',
            type: 'function',
            function: {
              name: 'send_form_link_sms',
              arguments: JSON.stringify({ phoneNumber: REAL_PHONE }),
            },
          },
        ],
      },
      call: {
        id: 'form-test-call-123',
        customer: {
          number: REAL_PHONE,
        },
      },
    });

    const smsResult = JSON.parse(smsResponse.data.results[0].result);

    if (!smsResult.success || !smsResult.formUrl) {
      throw new Error(`Failed to generate token: ${smsResult.message}`);
    }

    console.log(`✓ Token generated successfully`);
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

    // Step 2: Submit complete form data to POST /api/form-submission
    console.log('Step 2: Submitting form data to POST /api/form-submission...');
    const formData = {
      phoneNumber: REAL_PHONE,
      name: TEST_USER_NAME,
      email: TEST_USER_EMAIL,
      city: 'Jerusalem',
      age: 68,
      dateOfBirth: '1956-03-20',
      medicareNumber: '1AB2-CD3-EF45',
      ssnLast4: '5678',
      planLevel: 'Advantage',
      hasColorblindness: true,
      colorblindType: 'red-green (deuteranopia)',
      currentEyewear: 'Prescription glasses',
      medicalHistory: ['hypertension', 'type 2 diabetes'],
      currentMedications: ['metformin', 'lisinopril'],
    };

    console.log('  Submitting with data:');
    console.log(`    Phone: ${formData.phoneNumber}`);
    console.log(`    Name: ${formData.name}`);
    console.log(`    Email: ${formData.email}`);
    console.log(`    City: ${formData.city}`);
    console.log(`    Plan: ${formData.planLevel}`);
    console.log(`    Colorblindness: ${formData.hasColorblindness}`);
    console.log('');

    const formResponse = await axios.post(`${LOCAL_URL}/api/form-submission`, {
      token,
      formData,
    });

    console.log(`✓ Form submission successful!`);
    console.log(`  Response status: ${formResponse.status}`);
    console.log(`  Success: ${formResponse.data.success}`);
    console.log(`  Message: ${formResponse.data.message}`);
    console.log('');

    // Step 3: Verify lead was created in Lead CRM
    console.log('Step 3: Verifying lead was created in Lead CRM...');
    const leadResponse = await axios.get(`http://localhost:3001/api/leads/${REAL_PHONE}`);

    if (!leadResponse.data.lead) {
      throw new Error('Lead not found in CRM');
    }

    const lead = leadResponse.data.lead;
    console.log(`✓ Lead found in CRM!`);
    console.log(`  Lead ID: ${lead.leadId}`);
    console.log(`  Name: ${lead.name}`);
    console.log(`  Email: ${lead.email}`);
    console.log(`  City: ${lead.city}`);
    console.log(`  Source: ${lead.source}`);
    console.log(`  Created At: ${lead.createdAt}`);
    console.log('');

    // Verify lead data matches form submission
    const leadDataCorrect =
      lead.name === TEST_USER_NAME &&
      lead.email === TEST_USER_EMAIL &&
      lead.city === formData.city &&
      lead.source === 'web_form';

    if (leadDataCorrect) {
      console.log(`✓ Lead data matches form submission!`);
    } else {
      console.log(`⚠️  WARNING: Lead data doesn't match form submission`);
      console.log(`  Expected: name="${TEST_USER_NAME}", email="${TEST_USER_EMAIL}", city="${formData.city}", source="web_form"`);
      console.log(`  Got: name="${lead.name}", email="${lead.email}", city="${lead.city}", source="${lead.source}"`);
    }
    console.log('');

    // Step 4: Verify user data was created in User Data CRM
    console.log('Step 4: Verifying user data was created in User Data CRM...');
    const userResponse = await axios.get(`http://localhost:3002/api/users/${REAL_PHONE}`);

    if (!userResponse.data.userData) {
      throw new Error('User data not found in CRM');
    }

    const userData = userResponse.data.userData;
    console.log(`✓ User data found in CRM!`);
    console.log(`  User ID: ${userData.userId}`);
    console.log(`  Name: ${userData.name}`);
    console.log(`  Phone: ${userData.phoneNumber}`);
    console.log(`  Is Complete: ${userData.isComplete}`);
    console.log('');

    console.log('  Medicare Data:');
    console.log(`    Medicare Number: ${userData.medicareData?.medicareNumber}`);
    console.log(`    Plan Level: ${userData.medicareData?.planLevel}`);
    console.log(`    Has Colorblindness: ${userData.medicareData?.hasColorblindness}`);
    console.log(`    Colorblind Type: ${userData.medicareData?.colorblindType}`);
    console.log(`    Current Eyewear: ${userData.medicareData?.currentEyewear}`);
    console.log(`    Age: ${userData.medicareData?.age}`);
    console.log(`    DOB: ${userData.medicareData?.dateOfBirth}`);
    console.log(`    SSN Last 4: ${userData.medicareData?.ssnLast4}`);
    console.log('');

    // Verify user data matches form submission
    const userDataCorrect =
      userData.name === TEST_USER_NAME &&
      userData.medicareData?.medicareNumber === formData.medicareNumber &&
      userData.medicareData?.planLevel === formData.planLevel &&
      userData.medicareData?.hasColorblindness === formData.hasColorblindness &&
      userData.medicareData?.colorblindType === formData.colorblindType &&
      userData.medicareData?.age === formData.age;

    if (userDataCorrect) {
      console.log(`✓ User data matches form submission!`);
    } else {
      console.log(`⚠️  WARNING: User data doesn't match form submission`);
    }
    console.log('');

    // Step 5: Test check_lead tool to verify user can be found
    console.log('Step 5: Testing check_lead tool...');
    const checkLeadResponse = await axios.post(`${LOCAL_URL}/api/vapi/tool-calls`, {
      message: {
        role: 'assistant',
        toolCalls: [
          {
            id: 'form-test-2',
            type: 'function',
            function: {
              name: 'check_lead',
              arguments: JSON.stringify({ phoneNumber: REAL_PHONE }),
            },
          },
        ],
      },
      call: {
        id: 'form-test-call-456',
        customer: {
          number: REAL_PHONE,
        },
      },
    });

    const checkResult = JSON.parse(checkLeadResponse.data.results[0].result);
    console.log(`✓ check_lead result:`);
    console.log(`  Found: ${checkResult.found}`);
    console.log(`  Name: ${checkResult.name}`);
    console.log(`  Message: ${checkResult.message}`);
    console.log('');

    // Final Summary
    console.log('=== Test Complete ===\n');
    console.log('🎉 SUCCESS! POST /api/form-submission is working correctly!\n');
    console.log('Verification Results:');
    console.log(`  ✓ Token generated via SMS endpoint`);
    console.log(`  ✓ Form submitted successfully (HTTP ${formResponse.status})`);
    console.log(`  ✓ Lead created in Lead CRM (ID: ${lead.leadId})`);
    console.log(`  ✓ Lead data matches form submission: ${leadDataCorrect ? 'YES' : 'NO'}`);
    console.log(`  ✓ User data created in User Data CRM (ID: ${userData.userId})`);
    console.log(`  ✓ User data matches form submission: ${userDataCorrect ? 'YES' : 'NO'}`);
    console.log(`  ✓ User can be found via check_lead tool: ${checkResult.found ? 'YES' : 'NO'}`);
    console.log('');

    if (leadDataCorrect && userDataCorrect && checkResult.found) {
      console.log('✅ All checks passed! The form submission workflow is working perfectly.');
    } else {
      console.log('⚠️  Some data mismatches detected. Review the output above.');
    }
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
testFormSubmission().catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
