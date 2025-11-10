# Alex AI / VICI Integration - Medicare Eligibility Voice Agent

A production-ready voice agent system for Medicare eligibility verification. Built with VAPI and Twilio, integrating with CRM microservices and VICI dialer to handle inbound calls, validate Medicare coverage, and classify members for premium colorblind eyewear subscription.

## 🏗️ Architecture

**Business Case:** A healthcare retailer provides premium eyewear for colorblind Medicare members under a subscription program. Incoming callers are screened (name + city), then handed to an AI agent that combines phone system data with CRM demographics to verify Medicare eligibility and classify qualification for the premium subscription. Final outcomes are sent to the retailer CRM.

**System Components (5 Microservices):**

1. **VAPI Tool Handler** (Port 3000) - Webhook endpoint orchestrating all VAPI tool calls and events
2. **Lead CRM Server** (Port 3001) - Phone number → lead lookup (name, city verification)
3. **UserData CRM Server** (Port 3002) - Medicare member demographics (plan level, MBI, colorblindness)
4. **Classification CRM Server** (Port 3003) - Binary matching eligibility engine (QUALIFIED/NOT_QUALIFIED)
5. **VICI Mock Server** (Port 3004) - Call disposition tracking (SALE, NQI, NI, NA, AM, DC, B, DAIR)

**Inbound Phone Number:** +972 033824127 (configured in VAPI dashboard)

## 📁 Project Structure

Key files (TypeScript microservices):
- `src/vapi/toolHandler.server.ts` - VAPI webhook handler (4 tools exposed)
- `src/mock-servers/leadCrm.server.ts` - Lead CRM API (name/city verification)
- `src/mock-servers/userDataCrm.server.ts` - UserData CRM (Medicare info)
- `src/mock-servers/classificationCrm.server.ts` - Eligibility classification + VICI disposition
- `src/mock-servers/viciMock.server.ts` - VICI dialer mock (disposition logging)
- `src/types/vici.types.ts` - VICI disposition types (SALE, NQI, NI, NA, AM, DC, B, DAIR)
- `src/services/vici.service.ts` - VICI API client with retry logic
- `monitoring.db` - SQLite database (call sessions, user data, classifications, tool executions)

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- VAPI account (get one at https://vapi.ai)

### Installation

1. **Clone and navigate to the project:**
   ```bash
   cd homework2
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   # Copy the example env file
   cp .env.example .env

   # Edit .env and add your VAPI token
   # Get your token from https://dashboard.vapi.ai
   ```

4. **Run all servers:**
   ```bash
   npm run dev:all
   ```

   This will start all 5 servers concurrently:
   - VAPI Tool Handler: http://localhost:3000
   - Lead CRM: http://localhost:3001
   - User Data CRM: http://localhost:3002
   - Classification CRM: http://localhost:3003
   - VICI Mock Server: http://localhost:3004

### Running Individual Servers

You can also run servers individually for testing:

```bash
npm run dev:lead-crm           # Lead CRM only
npm run dev:userdata-crm       # User Data CRM only
npm run dev:classification-crm # Classification CRM only
npm run dev:vici               # VICI Mock Server only
npm run dev:vapi-handler       # VAPI handler only
```

## 🔧 VAPI Configuration

### Step 1: Expose Your Local Server (Development)

For local testing, you need to expose your local server to the internet using ngrok or similar:

```bash
# Install ngrok if you haven't
npm install -g ngrok

# Expose port 3000
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### Step 2: Get Tool Definitions

Visit http://localhost:3000/api/vapi/tools to see the complete tool definitions for VAPI.

### Step 3: Configure VAPI Assistant

1. **Create a new Assistant** in the VAPI Dashboard (https://dashboard.vapi.ai)

2. **Add the following 4 tools** to your assistant (copy from `/api/vapi/tools` endpoint):

   - `check_lead` - Verify caller is in leads database (name + city match)
   - `get_user_data` - Retrieve Medicare member demographics
   - `update_user_data` - Save collected Medicare information
   - `classify_and_save_user` - **Atomic operation**: Classify eligibility → Save to DB → Send VICI disposition (SALE/NQI)

   **Simplified 4-tool workflow** (down from original 10 tools - removed classify_user and save_classification_result)

3. **Configure Server URL** for each tool:
   ```
   https://your-ngrok-url.ngrok.io/api/vapi/tool-calls
   ```

4. **Configure Event Webhooks** (for real-time call logging):

   In the VAPI Dashboard, under Server Messages, add the following webhook endpoints:

   - **Call Started**: `https://your-ngrok-url.ngrok.io/api/vapi/events/call-started`
   - **Call Ended**: `https://your-ngrok-url.ngrok.io/api/vapi/events/call-ended`
   - **Message**: `https://your-ngrok-url.ngrok.io/api/vapi/events/message`
   - **Speech Interrupted**: `https://your-ngrok-url.ngrok.io/api/vapi/events/speech-interrupted`
   - **Hang**: `https://your-ngrok-url.ngrok.io/api/vapi/events/hang`

   This enables real-time logging of:
   - 📞 When calls start (with caller phone number and call type)
   - 👤 What the user says during the conversation
   - 🤖 What the assistant responds
   - ⚠️  When the user interrupts the assistant
   - 📴 When calls end (with duration, reason, and statistics)

5. **Set up the Assistant Prompt:**

   ```
   You are Alex, a friendly Medicare Premium Eyewear Program assistant. You help Medicare members determine their eligibility for specialized eyewear for colorblind individuals.

   IMPORTANT: The caller's phone number is available as {{customer.number}}.

   **Complete Workflow:**

   1. **Greet warmly:** "Hi, this is Alex from the Medicare Premium Eyewear Program! How can I help you today?"

   2. **Check lead:** Use check_lead with {{customer.number}} to verify if caller is in system

   3. **Get member data:** Use get_user_data to retrieve Medicare information

   4. **Collect missing info** (if incomplete):
      - Medicare plan level (Advantage, Part A, B, C, or D)
      - MBI (Medicare Beneficiary Identifier)
      - Colorblindness diagnosis (MANDATORY for qualification)
      - Age (65+ preferred)

   5. **Update data:** Use update_user_data to save collected information

   6. **Classify eligibility:** Use classify_and_save_user (atomic operation):
      - Binary matching: ALL 4 criteria must be met
      - Criteria: (1) Has Medicare plan (2) Plan covers vision (Advantage/B/C) (3) Has colorblindness (4) Has MBI
      - QUALIFIED → Score 100 → SALE disposition sent to VICI → Transfer to human agent
      - NOT_QUALIFIED → Score 0 → NQI disposition sent to VICI → End call politely

   7. **Close professionally:** Thank them for their time

   **Business Hours:** 9:00am - 5:45pm EST, Monday-Friday
   - After-hours calls: Politely explain hours and use schedule_callback

   **Important Notes:**
   - Colorblindness diagnosis is MANDATORY for qualification
   - Be empathetic and conversational
   - Don't overwhelm with questions - ask one at a time
   - Always explain why you need specific information
   ```

6. **Set up Phone Number:**
   - Get a phone number in VAPI dashboard
   - Assign your assistant to this number

### Step 4: Test Your System

Call the VAPI phone number and the flow will execute automatically!

**Viewing Call Logs:**
When you make a call, your terminal will display real-time logs showing:
- Call start with phone numbers and call type
- Each message exchanged between user and assistant
- Tool executions (check_lead, get_user_data, etc.)
- Classification results
- VICI disposition sending
- Call end with duration and statistics

## 📊 Call Flow

**Complete Workflow:**

1. Inbound call → VAPI answers → Extract phone number from {{customer.number}}
2. check_lead tool → Verify caller in Lead CRM (name + city match)
3. get_user_data tool → Retrieve Medicare demographics
4. If data incomplete → Ask questions → update_user_data tool → Save to UserData CRM
5. classify_and_save_user tool (atomic) → Binary matching (4 criteria) → QUALIFIED (100) or NOT_QUALIFIED (0) → Save to Classification CRM → Send VICI disposition (SALE/NQI)
6. If SALE → Transfer to human agent extension 2002 for fulfillment
7. If NQI → Explain result politely → End call
8. All state transitions logged to SQLite (call_sessions, tool_executions tables)

## 🧪 Testing the APIs

### Test Lead CRM

```bash
# Get all leads
curl http://localhost:3001/api/leads

# Look up a specific lead
curl http://localhost:3001/api/leads/+12025551001
```

### Test User Data CRM

```bash
# Get all users
curl http://localhost:3002/api/users

# Get specific user data
curl http://localhost:3002/api/users/+12025551001

# Update Medicare member data
curl -X PUT http://localhost:3002/api/users/+972501234003 \
  -H "Content-Type: application/json" \
  -d '{"medicareData": {"planLevel": "Advantage", "hasColorblindness": true, "colorblindType": "red-green (deuteranopia)"}}'
```

### Test Classification CRM

```bash
# Get all classifications
curl http://localhost:3003/api/classifications

# Classify a user (requires complete data)
curl -X POST http://localhost:3003/api/classify \
  -H "Content-Type: application/json" \
  -d @sample-user-data.json
```

### Test VAPI Tool Handler

```bash
# View tool definitions
curl http://localhost:3000/api/vapi/tools

# Test tool call (simulating VAPI)
curl -X POST http://localhost:3000/api/vapi/tool-calls \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "toolCalls": [{
        "id": "test-123",
        "type": "function",
        "function": {
          "name": "check_lead",
          "arguments": "{\"phoneNumber\": \"+12025551001\"}"
        }
      }]
    },
    "call": {
      "id": "test-call-123",
      "customer": {
        "number": "+12025551001"
      }
    }
  }'
```

## 📝 Sample Data

### Sample Test Data

The system comes with pre-configured test leads (call these numbers to test):

- `+972501234001` - John Smith (New York) - **QUALIFIED** (all 4 criteria met: Advantage + vision coverage + colorblindness + MBI) → SALE disposition
- `+12025551005` - David Wilson (San Francisco) - **NOT_QUALIFIED** (has Advantage plan but no colorblindness diagnosis) → NQI disposition
- `+15555550100` - Unknown caller (lead not found) → DC disposition
- After-hours call (outside 9am-5:45pm EST) → NA disposition

### Classification Criteria

Medicare members are classified using **binary matching** (ALL criteria must be met):

**QUALIFIED** requires ALL of the following:

1. ✅ **Has Medicare Plan**: Member has active Medicare coverage (A, B, C, D, or Advantage)
2. ✅ **Plan Covers Premium Eyewear**: Medicare plan includes vision coverage
   - **Approved plans**: Advantage, Plan B, Plan C
   - **Limited coverage**: Plan A (hospital only), Plan D (prescriptions only)
3. ✅ **Has Colorblindness Diagnosis**: MANDATORY - Confirmed diagnosis (any type: red-green, blue-yellow, or total)
4. ✅ **Medicare Beneficiary Identifier (MBI)**: Valid MBI on file

**Classification Logic:**
- ALL 4 criteria met = **QUALIFIED** (Score: 100, Disposition: SALE)
- ANY criterion fails = **NOT_QUALIFIED** (Score: 0, Disposition: NQI)
- Classification is atomic: classify → save to DB → send VICI disposition (prevents race conditions)

**VICI Integration - Disposition Tracking:**

The system automatically sends dispositions to VICI dialer (POST to port 3004):

1. **SALE** - Qualified (all 4 criteria met) → Transfers to human agent
2. **NQI** - Not Qualified Insurance (failed eligibility)
3. **NI** - Not Interested (caller declines)
4. **NA** - No Answer (after-hours calls outside 9am-5:45pm EST)
5. **AM** - Answering Machine (voicemail - VAPI detects automatically)
6. **DC** - Disconnected (call dropped or technical failure)
7. **B** - Busy (busy signal - Twilio detects at SIP level)
8. **DAIR** - Dead Air (6+ seconds silence - backend timeout)

**Automatic Disposition Logic:**

The classify_and_save_user tool automatically sends SALE (qualified) or NQI (not qualified) based on binary matching result. Other dispositions (NA, AM, DC, B, DAIR) are sent by event listeners when detected.

**VICI API Details:**
- Endpoint: POST http://localhost:3004/dispositions
- Payload: {callId, phoneNumber, disposition, campaign, agentId, timestamp}
- Retry logic: Exponential backoff (1s, 2s, 4s) for transient errors
- All dispositions logged to monitoring.db for audit trails

## 🔍 Logging

The system uses Pino for high-performance structured logging.

**Log Levels:**
- `debug` - Detailed function execution
- `info` - Successful operations
- `warn` - Missing data, non-critical issues
- `error` - API failures, exceptions

**View Logs:**
All servers output detailed logs to the console. Each request includes:
- Request ID
- Call ID (for VAPI calls)
- Phone number (masked for privacy)
- Tool names and arguments
- Execution duration
- Results

## 🔒 Security Notes

- Phone numbers are masked in logs (last 4 digits only)
- Helmet.js enabled for security headers
- CORS enabled for development (restrict in production)
- Input validation on all endpoints
- Error messages don't expose internal details

## 🏗️ Development

### Build for Production

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

### Code Structure Principles

- **Modular**: Each CRM is independent
- **Reusable**: Shared utilities and types
- **Type-safe**: Full TypeScript coverage
- **Logged**: Comprehensive logging throughout
- **Documented**: Comments explain business logic

## 🐛 Troubleshooting

### Servers won't start

- Check if ports 3000-3003 are available
- Ensure Node.js version is 18+
- Delete `node_modules` and reinstall

### VAPI can't reach webhook

- Verify ngrok is running
- Check VAPI tool configuration has correct URL
- Ensure webhook URL uses HTTPS (not HTTP)

### Classification fails

- Ensure user data is complete
- Check logs for specific error messages
- Verify all required fields are present

### Tool calls not working

- Check VAPI dashboard tool definitions
- Verify server URL matches ngrok URL
- Check logs for incoming requests

## 📚 Additional Resources

- [VAPI Documentation](https://docs.vapi.ai)
- [VAPI Tool Calling Guide](https://docs.vapi.ai/tools)
- [Pino Logger Docs](https://getpino.io)
- [Express.js Guide](https://expressjs.com)

## 🤝 Contributing

This is a demo project. Feel free to extend it with:

- Real database integration (PostgreSQL, MongoDB)
- Authentication and authorization
- More sophisticated classification algorithms
- SMS notifications
- Email reports
- Dashboard UI
- Unit and integration tests

## 📄 License

MIT

---

**Built with ❤️ using TypeScript, Express, and VAPI**

For questions or issues, check the logs first - they're very detailed!
