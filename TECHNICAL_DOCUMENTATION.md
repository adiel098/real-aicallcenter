# VAPI/VICI Integration - Technical Documentation
## Healthcare Eyewear Medicare Eligibility System

**Project:** Premium Colorblind Eyewear Subscription Program
**Phone Number:** +15055421045
**Assistant:** Healthcare Eyewear Screening Assistant
**Author:** AI Engineering Team
**Date:** 2025-11-09

---

## 1. System Understanding

### End-to-End Flow

**VICI (Legacy Dialer) → Twilio/VAPI → AI Agent → CRMs → Final Disposition**

1. **VICI initiates outbound call** or routes inbound call with lead data
2. **Twilio handles telephony** - establishes SIP connection, manages media streams
3. **VAPI receives call** - extracts caller phone number via `{{customer.number}}`
4. **AI Agent conducts screening** - conversational flow with tool calls
5. **Backend APIs verify data** - Lead CRM, User Data CRM, Classification CRM
6. **Medicare eligibility check** - validates plan level and qualification
7. **Final disposition sent to VICI** - SALE, NQI (Not Qualified/Interested), NA (No Answer), etc.
8. **Results stored in CRM** - complete audit trail maintained

### Integration Layers

| Layer | Component | Purpose |
|-------|-----------|---------|
| **Telephony** | Twilio SIP/PSTN | Media handling, call routing, DTMF detection |
| **AI Orchestration** | VAPI | Call state management, LLM coordination, TTS/STT |
| **Business Logic** | Express.js Backend | Tool handlers, validation, CRM integration |
| **Data Services** | Mock CRMs (3 services) | Lead lookup, user data, classification |
| **Legacy Integration** | VICI API Client | Disposition callbacks, lead routing |

---

## 2. Flow Analysis

### State Transitions

```
[IDLE] → [PRE-CONNECT] → [CONNECTED] → [SCREENING] → [API DISPOSITION] → [NEXT CALL]
```

**State Change Triggers:**

| Transition | Trigger | VICI Action | VAPI Action |
|------------|---------|-------------|-------------|
| IDLE → PRE-CONNECT | VICI dispatches lead from queue | Sends call initiation request | Creates call session |
| PRE-CONNECT → CONNECTED | Live person detected (not VM/IVR) | Updates lead status to "contacted" | Begins assistant conversation |
| CONNECTED → SCREENING | AI agent greets caller successfully | Logs call start time | Executes tool calls for data |
| SCREENING → API DISPOSITION | Classification complete or call ends | N/A | Sends webhook with final status |
| API DISPOSITION → NEXT CALL | Backend sends disposition to VICI | Moves to next lead in queue | Terminates call session |

### Call Event Detection Design

**Voicemail/Dead Air/IVR Detection:**

```javascript
// VAPI's built-in capabilities handle most detection
// Custom logic adds validation layer

if (silenceDuration > 5000ms && noSpeechDetected) {
  disposition = "NA" // Dead air
} else if (detectedPattern.match(/beep|tone|leave.*message/)) {
  disposition = "AM" // Answering Machine
} else if (ivrMenuDetected) {
  disposition = "IVR" // Interactive Voice Response
} else if (conversationExchanges >= 2) {
  disposition = "LIVE" // Live person confirmed
}
```

**Implementation Strategy:**
- VAPI transcriber provides real-time audio analysis
- Backend monitors conversation turn count
- Silence detection via VAPI's `maxDurationSeconds` setting
- Post-call analysis validates disposition accuracy

### Media vs Conversation State Boundaries

| Responsibility | Handled By | Rationale |
|----------------|------------|-----------|
| **Audio streaming** | Twilio | Optimized for low-latency media transport |
| **Speech-to-Text** | VAPI (Deepgram) | Real-time transcription with medical vocabulary |
| **LLM conversation** | VAPI (OpenAI GPT-4) | Natural language understanding |
| **Tool execution** | Backend (Express.js) | Business logic, CRM integration, security |
| **Call disposition** | Backend → VICI | System of record for lead management |
| **Conversation context** | VAPI | Maintains dialogue state, variables |
| **Data validation** | Backend | SSN→MBI→Insurance checks, scoring |

---

## 3. API & Data Layer Design

### VICI Disposition API

**Backend → VICI Communication:**

```http
POST https://vici-dialer.example.com/api/dispositions
Authorization: Bearer {VICI_API_TOKEN}
Content-Type: application/json

{
  "leadId": "12345",
  "campaignId": "EYEWEAR_MEDICARE_2025",
  "phoneNumber": "+12025551001",
  "disposition": "SALE",
  "subDisposition": "QUALIFIED",
  "agentId": "AI_AGENT_001",
  "callDuration": 420,
  "metadata": {
    "eligibilityScore": 72,
    "medicareVerified": true,
    "nextAction": "SEND_SUBSCRIPTION_KIT"
  }
}
```

**Disposition Codes:**
- **SALE** - Qualified and accepted
- **NQI** - Not Qualified or Not Interested
- **NA** - No Answer / Dead Air
- **AM** - Answering Machine
- **CB** - Callback Requested
- **DNC** - Do Not Call

### Validation Workflows

**SSN → MBI → Insurance Check Flow:**

```
1. User provides last 4 of SSN (for identity verification)
   ↓
2. Backend calls Medicare API: GET /verify-member
   Response: { mbiNumber: "1EG4-TE5-MK73", verified: true }
   ↓
3. Backend calls Insurance Eligibility API: POST /check-coverage
   Request: { mbi: "1EG4-TE5-MK73", serviceCode: "VISION_DME" }
   Response: { planLevel: "Part C", covered: true, copay: 0 }
   ↓
4. If all checks pass → proceed to classification
   If any fail → log reason, disposition as NQI
```

### Error Handling Strategy

```javascript
// Retry logic with exponential backoff
async function callWithRetry(apiFunction, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiFunction();
    } catch (error) {
      if (attempt === maxRetries) {
        // Log to monitoring system
        logger.error({ error, attempt }, 'API call failed after retries');

        // Return graceful degradation response
        return {
          success: false,
          disposition: 'CB', // Callback - we'll try again
          reason: 'SYSTEM_ERROR'
        };
      }

      // Exponential backoff: 1s, 2s, 4s
      await sleep(Math.pow(2, attempt - 1) * 1000);
    }
  }
}
```

**Error Scenarios:**
- **Invalid Data** - Ask user to repeat, validate format
- **API Timeout** - Retry once, then schedule callback
- **Medicare API Down** - Queue for manual review
- **Unexpected Response** - Log for analysis, ask different question

### Data Persistence Model

**What We Store & Why:**

| Data Type | Storage Location | Retention | Purpose |
|-----------|------------------|-----------|---------|
| Lead info | Lead CRM | Indefinite | Contact details, campaign tracking |
| Bio/genetic data | User Data CRM | 7 years (HIPAA) | Eligibility determination, health profile |
| Classification results | Classification CRM | 7 years | Audit trail, compliance reporting |
| Call recordings | Twilio S3 bucket | 90 days | Quality assurance, dispute resolution |
| Conversation logs | Application DB | 1 year | Performance analytics, model training |
| VICI dispositions | VICI Database | Indefinite | Lead lifecycle, campaign ROI |

---

## 4. Conversational Intelligence

### Voicemail & Automated System Detection

**Detection Logic:**

```javascript
// Pattern-based detection
const vmIndicators = [
  /leave.*message/i,
  /not available/i,
  /after.*tone/i,
  /press.*for/i,  // IVR menu
  /dial.*extension/i
];

// Acoustic features (handled by VAPI)
- Beep tone frequency (1000Hz)
- Silence after initial audio
- Background noise patterns

// Behavioral signals
if (userTurns === 0 && assistantTurns > 2) {
  // No response from user after 2 prompts
  likelyVoicemail = true;
}
```

**Adaptation Strategy:**
- If voicemail detected → Leave brief callback message, disposition as AM
- If IVR detected → Attempt to navigate menu, escalate to human if complex
- If busy tone → Immediate hang-up, disposition as NA, retry later

### Live Contact vs Not Interested Detection

**Decision Tree:**

```
User responds to greeting?
├─ NO → Likely VM/Dead Air (disposition: NA/AM)
└─ YES
   ├─ User confirms identity (name + city)?
   │  ├─ NO → Wrong number (disposition: WN)
   │  └─ YES → LIVE CONTACT confirmed
   │     └─ User willing to continue screening?
   │        ├─ NO → Not Interested (disposition: NQI)
   │        │  └─ Reason: "Too busy", "Not interested", "Already enrolled"
   │        └─ YES → Proceed with full screening
   │           └─ Completes data collection?
   │              ├─ YES → Classification
   │              └─ NO → Callback (disposition: CB)
```

**"Not Interested" Signals:**
- Explicit: "I'm not interested", "Don't call me again"
- Implicit: Repeated deflection, hurried responses, irritation in tone
- Contextual: "I already have coverage", "I don't need this"

### Interruption & Handover Management

**Interruption Handling:**

```
AI Agent: "Can you tell me your age and—"
User: "Wait, wait, what is this about again?"

→ AI pauses current question
→ Re-explains program briefly
→ Checks if user wants to continue
→ Resumes from last completed data point
```

**Human Handover Triggers:**
- User requests to speak with person (3+ times)
- Complex medical question outside AI scope
- Dispute or complaint escalation
- Technical issue with hearing/understanding AI
- Emotional distress detected

**Handover Process:**
```
1. AI: "I understand you'd like to speak with a specialist. Let me connect you."
2. Play hold music
3. Backend: POST /vici/transfer-to-agent with context payload
4. Agent receives screen-pop with conversation summary
5. Warm transfer (AI introduces agent to caller)
```

---

## 5. Scalability & Reliability

### Scaling to 100+ Concurrent Calls

**Architecture Approach:**

```
┌─────────────────────────────────────────┐
│  Load Balancer (AWS ALB / Cloudflare)  │
└──────────────┬──────────────────────────┘
               │
     ┌─────────┴─────────┐
     ▼                   ▼
┌─────────┐         ┌─────────┐
│ Backend │         │ Backend │  (Auto-scaling group)
│ Node 1  │         │ Node 2  │  Min: 2, Max: 10 instances
└────┬────┘         └────┬────┘
     │                   │
     └─────────┬─────────┘
               ▼
        ┌──────────────┐
        │  Redis Cache │  (Session state, rate limiting)
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │  PostgreSQL  │  (Primary data store)
        └──────────────┘
```

**Capacity Planning:**

| Component | Concurrent Capacity | Scaling Strategy |
|-----------|---------------------|------------------|
| VAPI | 100+ calls (per API key) | Multiple API keys, round-robin |
| Twilio | 1000+ SIP channels | Elastic SIP trunking |
| Backend | 50 calls/instance | Horizontal auto-scaling (CPU > 70%) |
| Database | 500 qps | Read replicas, connection pooling |

**Resource Requirements per 100 Calls:**
- 2-3 backend instances (2 vCPU, 4GB RAM each)
- Redis: 1GB memory (session caching)
- Database: 100 connections, 20GB storage

### Performance Monitoring

**Key Metrics Dashboard:**

```javascript
// Metrics to track
const metrics = {
  callMetrics: {
    totalCalls: Counter,
    activeCallsGauge: Gauge,
    avgCallDuration: Histogram,
    callsPerMinute: Rate
  },

  qualityMetrics: {
    droppedCallRate: Percentage,    // Target: <2%
    avgLatency: Histogram,           // Target: <500ms API response
    transcriptionAccuracy: Percentage, // Target: >95%
    toolCallSuccess: Percentage      // Target: >98%
  },

  businessMetrics: {
    conversionRate: Percentage,      // SALE / total calls
    nqiRate: Percentage,             // Not qualified/interested
    callbackRate: Percentage,        // Needs follow-up
    avgEligibilityScore: Average
  }
};
```

**Monitoring Stack:**
- **APM:** Datadog / New Relic for real-time performance
- **Logs:** CloudWatch / ELK Stack with structured JSON logging
- **Alerts:** PagerDuty for critical failures (>5% drop rate)
- **Dashboards:** Grafana for business metrics visualization

**Alert Thresholds:**
- API latency >1s for 5 minutes → Warning
- Dropped call rate >5% → Critical
- VAPI webhook failures >10/min → Critical
- Database connection pool >90% → Warning

### Reliability Guarantees

**System Design Principles:**

1. **Circuit Breakers** - Fail fast on downstream service issues
2. **Graceful Degradation** - Continue with reduced functionality
3. **Idempotency** - Safe to retry API calls without duplication
4. **Data Consistency** - Eventual consistency for non-critical data

**Disaster Recovery:**
- Database: Daily backups, 15-minute PITR (Point-in-Time Recovery)
- Call recordings: Multi-region S3 replication
- Redis: AOF persistence with hourly snapshots
- RTO (Recovery Time Objective): 30 minutes
- RPO (Recovery Point Objective): 15 minutes

---

## 6. Implementation Sketch

### API Sequence Diagram

```
VICI Dialer          Twilio/VAPI      AI Agent (GPT)    Backend API       CRMs
     │                    │                  │               │              │
     │──Call Initiate────>│                  │               │              │
     │                    │                  │               │              │
     │                    │──Connect Call───>│               │              │
     │                    │                  │               │              │
     │                    │                  │──check_lead──>│              │
     │                    │                  │               │──GET /leads─>│
     │                    │                  │               │<─Lead Found──│
     │                    │                  │<─Lead Data────│              │
     │                    │                  │               │              │
     │                    │                  │──get_user────>│              │
     │                    │                  │               │──GET /users─>│
     │                    │                  │               │<─User Data───│
     │                    │                  │<─User Data────│              │
     │                    │                  │               │              │
     │                    │<──Conversation───┤               │              │
     │                    │──(collect data)──>│               │              │
     │                    │                  │               │              │
     │                    │                  │──update_user─>│              │
     │                    │                  │               │──PUT /users─>│
     │                    │                  │               │<─Success─────│
     │                    │                  │<─Confirmed────│              │
     │                    │                  │               │              │
     │                    │                  │──classify────>│              │
     │                    │                  │               │──POST ──────>│
     │                    │                  │               │  /classify   │
     │                    │                  │               │<─Score: 72───│
     │                    │                  │<─ACCEPTABLE───│              │
     │                    │                  │               │              │
     │                    │<──Final Message──┤               │              │
     │                    │──Call Ends───────┤               │              │
     │                    │                  │               │              │
     │                    │                  │               │──POST ──────>│
     │                    │                  │               │  /save_result│
     │<──Disposition──────┤                  │               │              │
     │  (SALE, Score:72)  │                  │               │              │
     │                    │                  │               │              │
     │──Next Lead────────>│                  │               │              │
```

### Pseudocode: Key Integration Points

**1. VAPI Webhook Handler**

```javascript
// src/vapi/toolHandler.server.ts
app.post('/api/vapi/tool-calls', async (req, res) => {
  const { message, call } = req.body;
  const toolName = message.toolCalls[0].function.name;
  const args = JSON.parse(message.toolCalls[0].function.arguments);

  try {
    let result;

    switch(toolName) {
      case 'check_lead':
        result = await vapiService.checkLead(args.phoneNumber);
        break;
      case 'get_user_data':
        result = await vapiService.getUserData(args.phoneNumber);
        break;
      case 'update_user_data':
        result = await vapiService.updateUserData(args);
        break;
      case 'classify_and_save_user':
        result = await vapiService.classifyAndSaveUser(args.phoneNumber);
        break;
    }

    res.json({ results: [result] });
  } catch (error) {
    logger.error({ error, toolName }, 'Tool execution failed');
    res.status(500).json({ error: 'Tool failed' });
  }
});
```

**2. VICI Disposition Sender**

```javascript
// New service: src/services/vici.service.ts
async function sendDisposition(callData) {
  const disposition = determineDisposition(callData);

  const payload = {
    leadId: callData.leadId,
    disposition: disposition.code,
    metadata: {
      eligibilityScore: callData.score,
      callDuration: callData.duration,
      completedAt: new Date().toISOString()
    }
  };

  await axios.post(
    `${VICI_API_URL}/api/dispositions`,
    payload,
    { headers: { Authorization: `Bearer ${VICI_TOKEN}` }}
  );
}

function determineDisposition(callData) {
  if (!callData.liveContactConfirmed) return { code: 'NA' };
  if (callData.userDeclined) return { code: 'NQI' };
  if (callData.score >= 60) return { code: 'SALE' };
  return { code: 'NQI' };
}
```

**3. SSN → MBI → Insurance Validation**

```javascript
// New service: src/services/medicare.service.ts
async function validateMedicareEligibility(ssn, dateOfBirth) {
  // Step 1: Get MBI from SSN
  const mbiResponse = await axios.post(
    `${MEDICARE_API}/verify-member`,
    { ssnLast4: ssn.slice(-4), dob: dateOfBirth }
  );

  if (!mbiResponse.data.verified) {
    return { eligible: false, reason: 'MBI_NOT_FOUND' };
  }

  // Step 2: Check insurance coverage
  const insuranceResponse = await axios.post(
    `${INSURANCE_API}/check-coverage`,
    {
      mbi: mbiResponse.data.mbiNumber,
      serviceCode: 'VISION_DME',
      effectiveDate: new Date()
    }
  );

  return {
    eligible: insuranceResponse.data.covered,
    planLevel: insuranceResponse.data.planLevel,
    copay: insuranceResponse.data.copay
  };
}
```

### Local Testing Approach

**Setup:**

```bash
# 1. Start all backend services
npm run dev:all

# 2. Expose webhook with ngrok
ngrok http 3000

# 3. Update VAPI webhook URL in dashboard
# https://your-ngrok-url.ngrok.io/api/vapi/tool-calls

# 4. Use VAPI's test call feature
# Or call +15055421045 from your phone
```

**Mock API Testing:**

```javascript
// tests/integration/call-flow.test.js
describe('Complete Call Flow', () => {
  it('should qualify user with complete data', async () => {
    const mockCallData = {
      customer: { number: '+12025551001' },
      message: {
        toolCalls: [{
          function: { name: 'check_lead', arguments: '{"phoneNumber":"+12025551001"}' }
        }]
      }
    };

    // Test each tool call step
    const leadResult = await request(app)
      .post('/api/vapi/tool-calls')
      .send(mockCallData);

    expect(leadResult.body.results[0].found).toBe(true);
    expect(leadResult.body.results[0].name).toBe('John Smith');
  });
});
```

**Simulated Concurrent Calls:**

```bash
# Use artillery for load testing
artillery quick --count 100 --num 10 \
  http://localhost:3000/api/vapi/tool-calls \
  --payload mock-call-payload.json
```

---

## Summary & Next Steps

### Current Implementation Status

✅ **Completed:**
- VAPI phone number configured (+15055421045)
- Healthcare assistant with proper instructions
- 4 tool handlers (check_lead, get_user_data, update_user_data, classify_and_save)
- 3 mock CRM services operational
- Web dashboard for monitoring

🔄 **In Progress:**
- VICI integration layer (API client for dispositions)
- SSN→MBI→Insurance validation workflow
- Enhanced error handling with retry logic

📋 **Planned:**
- Production deployment with load balancer
- Monitoring dashboard with Grafana
- Performance testing at scale

### Key Design Decisions

1. **Separation of Concerns:** VAPI handles conversation, backend handles business logic
2. **Idempotent APIs:** Safe retry on failures without data duplication
3. **Graceful Degradation:** System continues with reduced functionality during outages
4. **HIPAA Compliance:** 7-year data retention, encrypted storage, audit logging
5. **Horizontal Scaling:** Stateless backend enables easy auto-scaling

### Testing the System

**Call the number:** +15055421045
**Expected flow:** Greeting → Identity verification → Data collection → Eligibility → Result

**Test scenarios:**
- Existing lead (+12025551001) - Complete data
- Incomplete lead (+12025551003) - Missing fields
- New caller - Not in system

---

**Documentation Version:** 1.0
**Last Updated:** 2025-11-09
**Contact:** AI Engineering Team
