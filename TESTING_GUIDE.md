# Testing Guide - VAPI Healthcare Eyewear System

## Quick Start Testing

### 1. Start the System

```bash
# Install dependencies (if not already done)
npm install

# Start all 4 servers
npm run dev:all
```

You should see:
- Lead CRM Server running on port 3001
- User Data CRM Server running on port 3002
- Classification CRM Server running on port 3003
- VAPI Handler Server running on port 3000

### 2. Expose Webhook (for VAPI)

```bash
# In a new terminal
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.app`)

### 3. Test the Inbound Phone Number

**Call:** +15055421045

**Current Assistant ID:** 8d220827-055b-4bc0-85ab-e740e5512b4b

---

## Test Scenarios

### Scenario 1: Complete Data User (Should Qualify)

**Phone Number:** +12025551001
**Name:** John Smith
**Expected Flow:**
1. AI greets and asks for verification
2. Finds lead in system
3. Retrieves existing complete data
4. Proceeds directly to classification
5. Returns QUALIFIED (score ≥ 60)
6. Disposition: SALE

**What to observe:**
- Check logs for `check_lead` tool call
- Check logs for `get_user_data` tool call
- Check logs for `classify_and_save_user` tool call
- Verify score in dashboard

### Scenario 2: Incomplete Data User

**Phone Number:** +12025551003
**Name:** Michael Chen
**Expected Flow:**
1. AI greets and verifies identity
2. Finds lead in system
3. Retrieves partial user data
4. Asks for missing fields: height, weight, allergies, blood type
5. Calls `update_user_data` after collection
6. Classifies once data is complete
7. Returns result based on updated data

**What to observe:**
- AI should ask specific questions for missing fields
- Multiple `update_user_data` calls may occur
- Final classification includes all collected data

### Scenario 3: New User (Not in System)

**Phone Number:** +15551234567 (or any number not in mock data)
**Expected Flow:**
1. AI greets caller
2. `check_lead` returns not found
3. AI asks for name, email, city
4. Creates new lead entry
5. Proceeds with data collection
6. Classifies and saves result

**What to observe:**
- "Lead not found" message in logs
- AI collects all required information
- New entry created in system

---

## API Testing

### Test Tool Endpoints Directly

**Get tool definitions:**
```bash
curl http://localhost:3000/api/vapi/tools
```

**Test check_lead tool:**
```bash
curl -X POST http://localhost:3000/api/vapi/tool-calls \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "toolCalls": [{
        "id": "test-1",
        "function": {
          "name": "check_lead",
          "arguments": "{\"phoneNumber\":\"+12025551001\"}"
        }
      }]
    },
    "call": {
      "id": "test-call-1"
    }
  }'
```

Expected response:
```json
{
  "results": [{
    "found": true,
    "leadId": "LEAD001",
    "name": "John Smith",
    "email": "john.smith@email.com",
    "message": "Lead found: John Smith"
  }]
}
```

**Test get_user_data tool:**
```bash
curl -X POST http://localhost:3000/api/vapi/tool-calls \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "toolCalls": [{
        "id": "test-2",
        "function": {
          "name": "get_user_data",
          "arguments": "{\"phoneNumber\":\"+12025551001\"}"
        }
      }]
    },
    "call": {
      "id": "test-call-2"
    }
  }'
```

**Test classify_and_save_user:**
```bash
curl -X POST http://localhost:3000/api/vapi/tool-calls \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "toolCalls": [{
        "id": "test-3",
        "function": {
          "name": "classify_and_save_user",
          "arguments": "{\"phoneNumber\":\"+12025551001\"}"
        }
      }]
    },
    "call": {
      "id": "test-call-3"
    }
  }'
```

---

## Dashboard Testing

### Access Dashboard

Open browser: http://localhost:3000

### Features to Test

1. **Overview Tab**
   - Total leads count (should show 8)
   - User data completion statistics
   - Recent classifications
   - Score distribution chart

2. **Leads Tab**
   - View all 8 mock leads
   - Search by name or phone
   - Click to view details

3. **User Data Tab**
   - View bio/genetic data cards
   - Check completion percentage
   - See missing fields highlighted

4. **Classifications Tab**
   - View all classification results
   - Filter by QUALIFIED/NOT_QUALIFIED
   - See scores and reasoning
   - Export functionality

---

## Medicare Validation Testing

The Medicare service is in **mock mode** for development.

### How Mock Mode Works

1. **SSN Last 4 = "0000"** → Not verified
2. **Any other SSN** → Verified, returns mock MBI
3. **MBI suffix determines coverage:**
   - MBI ending in 00, 03, 06, 09... → Not covered
   - Other MBI endings → Covered

### Test Medicare Validation

To test when integrated with classification:
```javascript
// In development console or test file
const { medicareService } = require('./src/services/medicare.service');

// Test verification
const result = await medicareService.validateMedicareEligibility(
  '1234',     // SSN last 4
  '1950-05-15', // DOB
  'John',
  'Smith'
);

console.log(result);
// Expected: { eligible: true/false, mbiNumber: '...', planLevel: '...', ... }
```

---

## VICI Integration Testing

The VICI service is configured but requires production credentials.

### Mock VICI Testing

To test locally without real VICI API:
```javascript
// Set mock mode in .env
VICI_API_URL=http://localhost:3004/mock-vici
```

### Expected Disposition Flow

After a call completes:
```
Call ends → Backend determines disposition → Sends to VICI

Dispositions:
- SALE: User qualified (score ≥ 60)
- NQI: Not qualified or declined
- NA: No answer / dead air
- CB: Callback requested
```

---

## Load Testing

### Test Concurrent Calls

Using `artillery`:
```bash
# Install artillery
npm install -g artillery

# Run load test (10 concurrent users, 20 iterations each)
artillery quick --count 200 --num 10 \
  http://localhost:3000/api/vapi/tool-calls \
  --payload test-payload.json
```

### Create test-payload.json

```json
{
  "message": {
    "toolCalls": [{
      "id": "load-test",
      "function": {
        "name": "check_lead",
        "arguments": "{\"phoneNumber\":\"+12025551001\"}"
      }
    }]
  },
  "call": {
    "id": "load-test-call"
  }
}
```

### Monitor Performance

Watch for:
- Response times <500ms
- No errors in logs
- CPU usage <70%
- Memory stable

---

## Troubleshooting

### Issue: "Cannot find module 'axios'"

**Solution:**
```bash
npm install axios
```

### Issue: Port already in use

**Solution:**
```bash
# Find process on port (Windows)
netstat -ano | findstr :3000

# Kill process
taskkill /PID <process_id> /F
```

### Issue: VAPI webhook not receiving calls

**Checklist:**
1. Verify ngrok is running
2. Update webhook URL in VAPI dashboard
3. Check firewall settings
4. Verify VAPI_TOKEN in .env
5. Check server logs for incoming requests

### Issue: Tool calls failing

**Debug steps:**
1. Check server logs for errors
2. Verify CRM services are running (ports 3001-3003)
3. Test endpoints directly with curl
4. Check request payload format
5. Verify phone number format (+E.164)

---

## Expected Log Output

When a call comes in, you should see:

```
[INFO] Incoming request - POST /api/vapi/tool-calls
[INFO] Tool: check_lead - phoneNumber: ****1001
[INFO] Lead found - leadId: LEAD001
[INFO] Tool: get_user_data - phoneNumber: ****1001
[INFO] User data retrieved - complete: true
[INFO] Tool: classify_and_save_user - phoneNumber: ****1001
[INFO] Classification: QUALIFIED - score: 72
[INFO] Classification saved - resultId: ...
```

---

## Success Criteria

✅ All 4 servers start without errors
✅ Dashboard accessible at localhost:3000
✅ Tool calls return valid JSON responses
✅ Phone call to +15055421045 connects to AI
✅ AI successfully calls all tools during conversation
✅ Classification scores are calculated correctly
✅ Dispositions are determined accurately
✅ Logs show masked phone numbers (PHI protection)

---

## Next Steps After Testing

1. **Production VICI Integration**
   - Add real VICI API credentials to .env
   - Test disposition callbacks
   - Verify lead routing

2. **Medicare API Access**
   - Apply for Medicare API access
   - Implement OAuth2 flow
   - Test with real MBI lookups

3. **Scale Testing**
   - Test with 100+ concurrent calls
   - Monitor performance metrics
   - Optimize database queries

4. **Compliance Audit**
   - Verify HIPAA compliance
   - Test PHI encryption
   - Audit access controls

---

**Happy Testing!**

For issues or questions, check:
- [README.md](README.md) - Full project documentation
- [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md) - Architecture details
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Quick reference
