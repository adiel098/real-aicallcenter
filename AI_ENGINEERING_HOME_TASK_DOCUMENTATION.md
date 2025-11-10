# AI Engineering Home Task — Alex AI / VICI Integration
## Technical Documentation


**Inbound Phone Number**: +972 033824127 (configured in VAPI)

---

## Table of Contents

1. [System Understanding](#1-system-understanding)
2. [Flow Analysis](#2-flow-analysis)
3. [API & Data Layer Design](#3-api--data-layer-design)
4. [Conversational Intelligence](#4-conversational-intelligence)
5. [Scalability & Reliability](#5-scalability--reliability)
6. [Implementation Sketch](#6-implementation-sketch)

---

## 1. System Understanding

### 1.1 End-to-End Logic

The Alex AI / VICI Integration system orchestrates a **complete Medicare eligibility verification workflow** for incoming callers from first contact to final disposition. The system flow is:

**System Flow:**
1. Incoming caller dials inbound phone number (+972 033824127)
2. Initial screening (name and city verification) via Lead CRM
3. VAPI Voice Agent (AlexAI) converses with caller, collects Medicare data
4. CRM Systems (Lead, UserData, Classification) validates, stores, classifies eligibility
5. VICI Disposition API records call outcome (SALE, NQI, NI, etc.)
6. Next Action: Transfer to human agent OR end call

**Key Flow Stages:**

1. **Inbound Call Received**: Caller dials inbound number, routed via Twilio to VAPI
2. **AI Agent Answers**: AlexAI receives call via SIP/WebRTC connection
3. **Initial Screening**: AI verifies caller identity using Lead CRM (name + city match)
4. **Status Detection**: AI determines if caller is live person (already connected)
5. **Live Conversation**: If verified and interested, AI collects Medicare data and validates eligibility
6. **Classification**: Binary matching determines QUALIFIED (100 points) or NOT_QUALIFIED (0 points)
7. **Disposition Sent**: Automatic disposition to VICI (SALE for qualified, NQI for not qualified)
8. **Next Action**: Transfer to human agent (qualified) OR end call politely (not qualified)
9. **Return to Ready**: AI agent returns to ready state, awaits next inbound call

### 1.2 Integration Layers

The system consists of **5 distinct integration layers**, each with specific responsibilities:

#### **Layer 1: Telephony (VAPI + Twilio)**

- **VAPI**: Manages voice conversation, speech-to-text, text-to-speech, tool orchestration
- **Twilio**: Underlying SIP infrastructure for call routing and media handling
- **Responsibility**: Audio streaming, real-time transcription, conversation flow control
- **Why This Layer**: Separates telephony infrastructure from business logic; allows VAPI to handle complex voice interactions while backend focuses on data validation

#### **Layer 2: AI Agent Logic (VAPI Tool Handler Server - Port 3000)**

- **Purpose**: Orchestrates the entire workflow, acts as "brain" of the system
- **Components**:
  - Webhook receiver for all VAPI events (status updates, transcripts, tool calls)
  - 10 specialized tools exposed to VAPI (check_lead, get_user_data, classify_and_save_user, etc.)
  - Call session management (tracks state, retry attempts, dispositions)
  - Business hours enforcement (9am-5:45pm EST, Monday-Friday)
- **Responsibility**: Route requests to appropriate CRM systems, handle errors, manage conversation state
- **Why This Layer**: Decouples VAPI from backend services; provides unified API surface for voice agent

#### **Layer 3: CRM Systems (3 Microservices)**

**Lead CRM (Port 3001)**
- **Purpose**: Phone number → Lead lookup and verification
- **Data**: Name, email, city, alternate phone numbers
- **Responsibility**: Initial caller identity verification ("Are you John from New York?")

**UserData CRM (Port 3002)**
- **Purpose**: Medicare member demographics and health data
- **Data**: Medicare plan level, MBI, colorblindness status, age, DOB
- **Responsibility**: Store and retrieve patient information, identify missing fields

**Classification CRM (Port 3003)**
- **Purpose**: Eligibility determination using binary matching
- **Logic**: 4 mandatory criteria (Medicare plan, plan covers vision, has colorblindness, has MBI)
- **Responsibility**: Return QUALIFIED (100) or NOT_QUALIFIED (0), send VICI disposition

**Why 3 Separate Services**: Simulates real enterprise architecture where Lead Management, Patient Records, and Eligibility Systems are owned by different teams/vendors

#### **Layer 4: External Validation (Medicare API - Mock)**

- **Purpose**: SSN → MBI → Insurance verification
- **Endpoints**:
  - `/verify-member`: Validates SSN + DOB → Returns Medicare ID
  - `/check-coverage`: Validates MBI + Plan Level → Returns coverage details
- **Retry Logic**: 3 attempts with exponential backoff (1s, 2s, 4s delays)
- **Responsibility**: Authoritative source for Medicare eligibility (in production, integrates with CMS systems)
- **Why This Layer**: Regulatory requirement to validate against official Medicare database before enrollment

#### **Layer 5: VICI Dialer Integration (Port 3004)**

- **Purpose**: Call disposition tracking and callback scheduling for inbound calls
- **Endpoints**:
  - `POST /dispositions`: Record call outcome (SALE, NQI, NI, NA, AM, DC, B, DAIR)
  - `POST /callbacks`: Schedule future callback
  - `GET /campaigns`: Retrieve campaign settings (if applicable)
- **Responsibility**: Receive dispositions after inbound call completion, track call outcomes, manage callback scheduling
- **Why This Layer**: VICI acts as the central disposition repository; after each inbound call, the system reports the outcome to VICI for tracking, analytics, and potential follow-up scheduling

### 1.3 Architectural Philosophy

**Design Decision: Microservices Architecture**

**Reasoning**:
- Real-world healthcare systems have siloed data (Lead CRM ≠ Patient EHR ≠ Insurance Verification)
- Each service can scale independently based on load
- Clear API contracts make testing easier (can mock each layer)

**Trade-offs**:
- ✅ **Pros**: Realistic simulation, independent scaling, fault isolation
- ❌ **Cons**: Network latency between services, more complex deployment

**Design Decision: VAPI as Orchestration Layer (Not Direct Twilio Integration)**

**Reasoning**:
- VAPI provides high-level abstractions (tools, conversation context, built-in ASR/TTS)
- Reduces code complexity (don't need to manage Twilio call state directly)
- Faster development (focus on business logic, not telephony plumbing)

**Trade-offs**:
- ✅ **Pros**: Rapid development, advanced NLP, pre-built voicemail detection
- ❌ **Cons**: Vendor lock-in to VAPI, less control over low-level telephony

---

## 2. Flow Analysis

### 2.1 State Transitions

The AI agent operates in a **finite state machine** with the following states:



**State Transition Triggers:**

| From State | To State | Trigger | Implementation |
|------------|----------|---------|----------------|
| READY | CONNECTED | Inbound caller connects via Twilio/VAPI | `POST / (status-update: in-progress)` |
| CONNECTED | SCREENING | AI begins identity verification | Lead CRM lookup initiated |
| SCREENING | CONVERSATION | Caller identity verified, shows interest | `check_lead` returns match |
| CONVERSATION | DISPOSITION | `classify_and_save_user` tool completes | Returns QUALIFIED/NOT_QUALIFIED result |
| DISPOSITION | READY | Call ends (hang up or transfer) | `POST / (status-update: ended)`, `callStateService.endCallSession()` |
| CONVERSATION | READY | Caller not interested or hangs up | Disposition NI sent, call ends |

**Critical State Logic:**

Each state has specific validation rules and transition criteria:

1. **READY**: AI idle, listening for VAPI webhooks
2. **CONNECTED**: Session created, callId tracked in database
3. **SCREENING**: Lead CRM verification - 2 attempts max before ending call
4. **CONVERSATION**: Medicare data collection with session persistence
5. **DISPOSITION**: Classification complete, send to VICI once (idempotent)
6. **Return to READY**: Session closed, ready for next call

All transitions logged to SQLite for audit trails.



### 2.2 Call Event Detection

The system must detect **8 distinct call states** to route appropriately:

#### **Detection Strategies:**

**1. Voicemail (AM - Answering Machine)**

VAPI provides built-in voicemail detection using advanced ML models. Our implementation adds business logic:



**Note**: For inbound calls, voicemail/busy/dead air detection is not typically needed since the caller has already connected. However, the system can detect:

**1. Call Connection Issues (DC - Disconnected)**

Covers scenarios during inbound call:
- Caller hangs up abruptly
- Network drops connection
- Technical failure mid-conversation

**Implementation**: VAPI detects disconnect events, backend logs disposition

**2. Live Person Verification**

Since inbound calls are already answered, the system focuses on:
- Verifying caller identity via Lead CRM
- Confirming caller interest in the program
- Detecting early hang-ups or disinterest

**Implementation**: VAPI conversation management tracks engagement signals

### 2.3 Twilio/VAPI vs Backend Responsibilities

**Clear Separation of Concerns:**

| Responsibility | Owner | Implementation |
|----------------|-------|----------------|
| **Call Media Handling** | Twilio | SIP signaling, RTP audio streaming, DTMF detection |
| **Speech Recognition** | VAPI | Real-time ASR (automatic speech recognition) |
| **Text-to-Speech** | VAPI | Natural voice synthesis for Alex's responses |
| **Voicemail Detection** | VAPI | ML-based VM detection, beep detection |
| **Conversation Management** | VAPI | Context tracking, turn-taking, interruption handling |
| **Tool Orchestration** | VAPI | Decides when to call tools based on conversation context |
| **Business Logic** | Backend | Medicare validation, classification, data storage |
| **CRM Integration** | Backend | API calls to Lead/UserData/Classification services |
| **Disposition Sending** | Backend | POST to VICI disposition API |
| **Session State** | Backend | Call sessions, retry tracking, disposition flags |
| **Error Handling** | Backend | Retry logic, exponential backoff, error logging |

**Why This Division:**

- **VAPI handles "voice stuff"**: Audio processing, speech understanding, conversation flow
- **Backend handles "business stuff"**: Data validation, eligibility rules, CRM updates
- **Benefit**: Each layer focuses on its expertise, easier to test and maintain
- **Example**: VAPI detects caller hang-up → Backend logs appropriate disposition (NI if during interest check, DC if unexpected disconnect)

**Critical Handoff Points:**

1. **VAPI → Backend**: Tool calls (VAPI decides "I need to validate Medicare" → calls `validate_medicare_eligibility` tool)
2. **Backend → VAPI**: Tool results (Backend returns validation result → VAPI uses in conversation: "Your Medicare is validated!")
3. **VAPI ↔ Twilio**: Managed internally by VAPI (we don't interact with Twilio directly)

---

## 3. API & Data Layer Design

### 3.1 VICI Disposition API

**Disposition Workflow:**

```
┌──────────────────────────────────────────────────────────────┐
│  classify_and_save_user Tool Called (Atomic Operation)      │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
       ┌─────────────────────────────┐
       │  Calculate Eligibility Score│
       │  - Medicare plan: Check     │
       │  - Vision coverage: Check   │
       │  - Colorblindness: Check    │
       │  - Has MBI: Check           │
       └─────────────┬───────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
    Score = 100              Score = 0
    (QUALIFIED)          (NOT_QUALIFIED)
        │                         │
        ▼                         ▼
  Save to                   Save to
  Classification DB         Classification DB
        │                         │
        ▼                         ▼
  Send VICI                 Send VICI
  Disposition: SALE         Disposition: NQI
        │                         │
        ▼                         ▼
  Transfer to               End call politely
  human agent               ("not qualified")
```

**8 Disposition Codes:**

| Code | Full Name | Trigger | Next Action |
|------|-----------|---------|-------------|
| **SALE** | Sale/Qualified | All 4 criteria met (plan + coverage + colorblindness + MBI) | Transfer to human agent for fulfillment |
| **NQI** | Not Qualified Insurance | Failed eligibility (missing plan, no coverage, no colorblindness, no MBI) | End call politely, log in VICI |
| **NI** | Not Interested | Caller declines program during interest check | End call, mark DNC in VICI |
| **NA** | No Answer | After-hours call (outside 9am-5:45pm EST) | Log in VICI for callback scheduling |
| **AM** | Answering Machine | Not applicable for inbound calls | N/A (outbound only) |
| **DC** | Disconnected | Call dropped or technical failure | Log technical issue in VICI |
| **B** | Busy | Not applicable for inbound calls | N/A (outbound only) |
| **DAIR** | Dead Air | Not applicable for inbound calls | N/A (outbound only) |

**Automatic Disposition Logic:**

The system automatically determines and sends dispositions based on call outcomes without requiring manual intervention. When a call completes, the backend analyzes the context to determine which disposition code to send to VICI. First, it checks if the call occurred outside business hours (9am-5:45pm EST), which triggers an NA disposition for callback scheduling. Next, if the caller explicitly declined interest in the program at any point, the system sends an NI disposition and marks them as do-not-call. If the call disconnected unexpectedly before completion—such as a network drop or caller hang-up—the system logs a DC disposition for technical tracking. Finally, when the classification tool completes successfully, it automatically sends either SALE for qualified members (all 4 criteria met) or NQI for those who don't meet eligibility requirements. This automated approach eliminates human error and ensures every call receives proper disposition tracking in VICI.



**Design Decision: All-in-One Tool**

**Why**: Previous design had 3 separate tools (`classify_user`, `save_classification_result`, `send_vici_disposition`), requiring VAPI to call them in sequence. This created:
- Race conditions (what if save fails but disposition succeeds?)
- Duplicate dispositions (VAPI might call send_vici_disposition twice)
- Conversation flow complexity

**Solution**: Single atomic operation ensures data consistency and disposition accuracy.

### 3.2 Validation Workflows

**SSN → MBI → Insurance Validation (3-Step Process):**

Step 1: AI collects SSN + DOB → Medicare API's verify-member endpoint returns MBI. Step 2: check-coverage endpoint validates MBI + plan level for vision benefits. Step 3: System correlates Medicare data with colorblindness status from UserData CRM. All three steps must succeed for QUALIFIED (100 points).

**Retry Strategy:**

Up to 3 retries with exponential backoff (1s, 2s, 4s delays) for transient errors. Client errors (400, 422) don't retry—AI asks caller to re-verify data instead. After 3 failures, offer callback via VICI.

**Retry Decision Tree:**

500-series errors: Retry with backoff. 429 rate limit: Wait 5s then retry. 401/403 auth errors: Log alert, don't retry. 400/422 validation errors: Ask caller to re-confirm data, increment counter. After 3 attempts: Explain verification issue, offer callback via VICI.



### 3.3 Error Handling Logic

**Exponential Backoff Implementation:**

Wait times double with each retry: 1s → 2s → 4s. Total wait of 7 seconds acts as a circuit breaker. After 3 attempts, stop retrying and offer callback or human transfer.

**Error Categories:**

| Category | Examples | Retry Strategy |
|----------|----------|----------------|
| **Transient** | Network timeout, 503 Service Unavailable | Retry with backoff |
| **Client Error** | 400 Bad Request, 422 Invalid Data | Do NOT retry, ask user to fix data |
| **Auth Error** | 401 Unauthorized, 403 Forbidden | Do NOT retry, log and alert |
| **Rate Limit** | 429 Too Many Requests | Retry with longer backoff (5s, 10s, 20s) |
| **Server Error** | 500 Internal Server Error | Retry with backoff |

**Graceful Degradation:**

If Medicare API fails completely: Collect all available data, save to UserData CRM with "pending validation" flag, schedule callback. If VICI API down: Store disposition locally with "pending sync" flag, background job syncs later. System continues operating with partial functionality instead of crashing.

### 3.4 Data Persistence Model

**Database Schema (SQLite):**

Four main tables: **call_sessions** (callId, phoneNumber, timestamps, finalDisposition), **user_data** (Medicare info: name, DOB, ssn encrypted, mbi, planLevel, colorblindness), **classifications** (result, score, dispositionSent flag), **tool_executions** (logs all tool calls with JSON parameters/results). Enables full audit trails.



**Why SQLite:**

- ✅ **Pros**: Zero-config, embedded database, ACID transactions, fast for < 100k records
- ✅ **Pros**: WAL mode enables concurrent reads during writes (good for 10-20 concurrent calls)
- ❌ **Cons**: Single-instance (no clustering), not suitable for 100+ concurrent calls
- ❌ **Cons**: No built-in replication

**Production Migration Path**: SQLite → PostgreSQL with connection pooling (pgBouncer)

**Data Retention Strategy:**

Call sessions: 90 days hot storage, then 7 years cold archive (compliance). User Medicare data: Retained while active, purged on opt-out. Classifications: 2 years for analytics. Tool logs: 30 days. PII (SSN, MBI) encrypted with AES-256, keys stored separately.

---

## 4. Conversational Intelligence

### 4.1 Call Quality & Engagement Detection

**For Inbound Calls:**

Since callers have already connected, the focus shifts from detecting voicemail/busy signals to maintaining conversation quality:

**Engagement Signals Monitored:**
- Active participation in conversation
- Response to AI prompts and questions
- Early hang-up detection
- Background noise or poor audio quality
- Caller frustration or confusion signals

**Implementation**: VAPI tracks these engagement metrics and the backend uses them to optimize conversation flow and determine if human handover is needed.



### 4.2 Live Contact vs Not Interested

**Early Interest Qualification (Phase 2 of Workflow):**

Within 30 seconds post-verification, AI asks: "Does premium eyewear for colorblind Medicare members interest you?" If yes → proceed to data collection. If no → send NI disposition, end call within 60 seconds. Prevents wasting time collecting data from uninterested callers.

**Why Early Exit:**

- **Benefit**: Saves time (don't collect 10 minutes of data for uninterested caller)
- **Benefit**: Better conversion metrics (focus on qualified leads)
- **Benefit**: Reduced API costs (fewer Medicare validation calls)
- **Trade-off**: Might lose some "warm up slowly" prospects (acceptable for efficiency)

**Live Person Engagement Strategies:**

Natural pacing with pauses. Explain why data is needed ("I need your MBI to verify vision coverage"). Listen for confusion signals (long pauses, "um"s) and rephrase with examples. Positive reinforcement ("Great, almost done"). Offer human transfer if frustrated. These tactics improve completion rates.

### 4.3 Interruption Handling & Human Handover

**Interruption Detection:**

VAPI's user-interrupted event triggers when caller speaks over AI. AI stops, listens, analyzes context. Clarifying questions → answer then resume. Frustration signals ("too long") → offer to speed up, schedule callback, or transfer to human. Interruptions = valuable feedback.

**Human Handover Triggers:**

Explicit request ("speak to person") → transfer immediately. Medicare validation fails 3x → offer specialist. Caller qualifies (SALE) → auto-transfer to fulfillment. Severe confusion detected → proactively offer specialist. Prevents abandoned calls.

**Graceful Transfer Script:**

"Connecting you with my colleague who specializes in Medicare enrollment. They'll have all our discussion details—no need to repeat anything. Please hold." Uses "colleague" (not "human agent") for collaborative tone.

**Transfer Warm Handoff Data:**

Backend sends comprehensive packet: caller identity, Medicare data (plan, MBI, DOB, colorblindness), classification result, errors, call duration, transfer reason. Appears on agent screen instantly for seamless handover: "Hi John, I see you're interested in colorblind eyewear and enrolled in Medicare Advantage—let's complete enrollment."



---

## 5. Scalability & Reliability

### 5.1 Scaling to 100+ Concurrent Calls

**Current Architecture Limitations:**

| Component | Current Limit | Bottleneck |
|-----------|---------------|------------|
| SQLite Database | ~10-20 concurrent writes | Write lock contention |
| In-Memory Sessions | ~50 sessions | Server restart = data loss |
| Single Server Instance | ~30 requests/sec | No horizontal scaling |
| Ngrok Tunnel | Development only | Not production-ready |

**Production Scaling Strategy:**

**Telephony Layer (Twilio SIP/WebRTC):** Twilio Elastic SIP Trunking supports 100+ concurrent calls per trunk. Configure multiple SIP trunks or use Twilio WebRTC Client for browser-based calls. VAPI manages connection pooling to Twilio—each concurrent call maintains one SIP/WebRTC session. Twilio auto-scales media servers globally for voice quality.

**Backend Layer:** Replace SQLite with PostgreSQL + pgBouncer for connection pooling. Use Redis for distributed session storage (survives server restarts). Deploy on AWS/GCP with auto-scaling (2-20 instances based on load). Load balancer distributes traffic across instances. Replace ngrok with production HTTPS endpoint.

**Scaling Configuration:**

Kubernetes auto-scaling: Scale up when CPU > 70% or request queue > 100. Scale down when CPU < 30%. Min 2 instances for redundancy, max 20 for cost control. PostgreSQL read replicas for heavy query loads.

**Horizontal Scaling Considerations:**

**Twilio SIP Capacity:** Each SIP trunk handles 100+ concurrent channels. For 500 concurrent calls, provision 5 trunks. Twilio bills per-minute, so cost scales linearly with usage.

**WebRTC Alternative:** Twilio Programmable Voice WebRTC allows browser/mobile clients to connect directly without phone lines. Supports 10,000+ concurrent connections per account. Lower latency than SIP for internet-based calls.

**Backend Scaling:** Stateless design—all session data in Redis, not in-memory. Sticky sessions not needed. Database connection pooling prevents exhaustion. VICI/VAPI webhook endpoints handle requests from any instance.



### 5.2 Monitoring & Performance Tracking

**Real-Time Metrics Dashboard:**

Track: Active calls count, avg call duration, disposition breakdown (SALE/NQI/NI), API response times (Medicare/VICI), error rates, tool execution success rates. Refresh every 30 seconds for real-time visibility.

**Prometheus Metrics (Production):**

Collect: HTTP request latency (p50, p95, p99), database query duration, Redis cache hit/miss rates, VAPI webhook processing time, classification tool execution time, external API error counts.

**Alerting Rules (Email/Slack or PagerDuty):**

Alert if: Error rate > 5% for 5min, API latency > 3s, database connections exhausted, Redis down, VICI disposition API failing, Medicare API unavailable. Email/Slack for dev, PagerDuty for production emergencies.



### 5.3 Business Hours & Callback Scheduling

**Business Hours Enforcement:**

Operating hours: 9:00am-5:45pm EST, Monday-Friday. Backend checks timestamp on every inbound call. Within hours → process normally. Outside hours → immediate NA disposition + callback offer.

**After-Hours Auto-Disposition:**

Call received at 7pm EST → AI says: "Our offices are currently closed (open 9am-5:45pm EST weekdays). May I schedule a callback during business hours?" If yes → collect preferred time, send to VICI scheduling API. If no → polite goodbye, NA disposition logged.

**Callback Scheduling:**

Caller provides preferred date/time → Validate against business hours → POST to VICI `/callbacks` endpoint with phoneNumber, preferredTime, reason ("after-hours call" or "technical validation failure"). VICI queues callback for next available agent slot.



---

## 6. Implementation Sketch

### 6.1 API Sequence Diagram

Inbound Call → VAPI Webhook (POST /) → check_lead tool → Lead CRM (GET /lead/:phone) → get_user_data tool → UserData CRM (GET /user-data/:phone) → validate_medicare_eligibility tool → Medicare API (POST /verify-member, POST /check-coverage) → classify_and_save_user tool → Classification CRM (POST /classify) → VICI Disposition API (POST /dispositions) → Transfer or End Call.

### 6.2 Local Testing Approach

**Mock APIs & Simulated Calls:**

All 5 servers (Lead, UserData, Classification, VICI, Tool Handler) run locally on ports 3000-3004. Mock Medicare API returns hardcoded responses. Use Postman to simulate VAPI webhooks (POST to localhost:3000 with call status/tool requests).

**Mock VAPI Call Simulator:**

Script simulates full call lifecycle: Send status-update webhook (in-progress) → Send tool-calls webhooks (check_lead, get_user_data, validate_medicare, classify_and_save_user) → Send status-update (ended). Validates responses and logs results.

**Running Local Tests:**

Run `npm run dev:all` to start all 5 servers. Use test script: `npm run test:simulate-call` with test phone numbers (+972501234001 for John Smith QUALIFIED, +12025551005 for David Wilson NOT_QUALIFIED). Verify dispositions logged in VICI mock.

### 6.3 Production Deployment Checklist

**Environment Variables (.env.production):**

VAPI_API_KEY, VAPI_ASSISTANT_ID, DATABASE_URL (PostgreSQL), REDIS_URL, MEDICARE_API_KEY, VICI_API_URL, NGROK_URL (replaced with production domain), PORT, NODE_ENV=production, LOG_LEVEL=info.



**Deployment Steps:**

1. **Pre-Deployment**
   - Run all tests (`npm run test:all`)
   - Check test coverage (> 80%)
   - Review security audit (`npm audit`)
   - Update CHANGELOG.md


4. **Post-Deployment Verification**
   - Check health endpoints (`/health`, `/metrics`)
   - Verify VAPI webhooks receiving events
   - Test complete workflow with test call
   - Monitor Prometheus dashboards for 1 hour

---

## Conclusion

This document provides a comprehensive technical overview of the Alex AI / VICI Integration system, covering:

1. **System Architecture**: 5-layer microservices architecture with clear separation of concerns
2. **Flow Analysis**: Detailed state transitions and call event detection strategies
3. **API & Data Design**: VICI dispositions, Medicare validation workflow, error handling with exponential backoff, SQLite persistence model
4. **Conversational Intelligence**: Voicemail detection, IVR navigation, interruption handling, human handover logic
5. **Scalability**: Scaling to 100+ concurrent calls with PostgreSQL, Redis, auto-scaling, comprehensive monitoring
6. **Implementation**: Complete sequence diagrams, local testing approach, production deployment checklist

**Key Architectural Decisions:**

- **Microservices over monolith** for realistic enterprise simulation
- **Binary matching classification** for regulatory compliance (QUALIFIED = 100, NOT_QUALIFIED = 0)
- **All-in-one classify_and_save_user tool** for atomic operations
- **Auto-check lead on call start** for reduced latency
- **Session-based retry tracking** (max 3 attempts for Medicare validation)
- **Disposition-once guarantee** to prevent duplicates in VICI
- **Business hours enforcement** with automatic NA disposition for after-hours calls

**Production Readiness:**

Current implementation handles **10-20 concurrent calls** (SQLite limitation). For **100+ concurrent calls**, migrate to:
- PostgreSQL with connection pooling
- Redis for distributed session storage
- Horizontal auto-scaling (2-20 instances)
- **Monitoring**: Postman for API testing, Winston/Morgan for logging, or Prometheus + Grafana for production-grade monitoring
- **Alerting**: Email/Slack notifications for development, or PagerDuty for enterprise on-call management

**Inbound Phone Number**: +972 033824127 (configured in VAPI dashboard)

