/**
 * Test script to verify the callId extraction fix
 * Simulates VAPI tool call request without the "call" object
 */

const axios = require('axios');

const VAPI_HANDLER_URL = 'http://localhost:3000/api/vapi/tool-calls';

// Simulate VAPI tool call request WITHOUT call object (this is what VAPI actually sends)
const vapiToolCallRequest = {
  message: {
    toolCalls: [
      {
        id: 'call_test123',
        function: {
          name: 'get_user_data',
          arguments: JSON.stringify({
            phoneNumber: '+972527373474'
          })
        }
      }
    ],
    role: 'assistant'
  }
  // NOTE: "call" object is MISSING (this is the bug we're fixing)
};

async function testCallIdExtraction() {
  console.log('🧪 Testing VAPI callId extraction fix...\n');
  console.log('📤 Sending tool call request WITHOUT call object:');
  console.log(JSON.stringify(vapiToolCallRequest, null, 2));
  console.log('');

  try {
    const response = await axios.post(VAPI_HANDLER_URL, vapiToolCallRequest, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Response received:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('');
    console.log('📋 Check the server logs above for:');
    console.log('   1. "VAPI call object missing - using fallback extraction"');
    console.log('   2. callId should be "pseudo-XXXXX" (not "unknown")');
    console.log('   3. customerNumber should be "+97252****" (not "unk****")');
    console.log('   4. Database persistence should WORK (not skipped)');
    console.log('');
    console.log('🎉 Test completed successfully!');

  } catch (error) {
    if (error.response) {
      console.error('❌ Server responded with error:');
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else if (error.request) {
      console.error('❌ No response from server. Is it running?');
      console.error('Make sure to run: npm run dev:all');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

// Run the test
testCallIdExtraction();
