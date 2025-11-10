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



**Design Decision: All-in-One Tool**

**Why**: Previous design had 3 separate tools (`classify_user`, `save_classification_result`, `send_vici_disposition`), requiring VAPI to call them in sequence. This created:
- Race conditions (what if save fails but disposition succeeds?)
- Duplicate dispositions (VAPI might call send_vici_disposition twice)
- Conversation flow complexity

**Solution**: Single atomic operation ensures data consistency and disposition accuracy.

### 3.2 Validation Workflows

**SSN → MBI → Insurance Validation (3-Step Process):**



**Retry Strategy:**



**Retry Decision Tree:**



### 3.3 Error Handling Logic

**Exponential Backoff Implementation:**



**Error Categories:**

| Category | Examples | Retry Strategy |
|----------|----------|----------------|
| **Transient** | Network timeout, 503 Service Unavailable | Retry with backoff |
| **Client Error** | 400 Bad Request, 422 Invalid Data | Do NOT retry, ask user to fix data |
| **Auth Error** | 401 Unauthorized, 403 Forbidden | Do NOT retry, log and alert |
| **Rate Limit** | 429 Too Many Requests | Retry with longer backoff (5s, 10s, 20s) |
| **Server Error** | 500 Internal Server Error | Retry with backoff |

**Graceful Degradation:**



### 3.4 Data Persistence Model

**Database Schema (SQLite):**



**Why SQLite:**

- ✅ **Pros**: Zero-config, embedded database, ACID transactions, fast for < 100k records
- ✅ **Pros**: WAL mode enables concurrent reads during writes (good for 10-20 concurrent calls)
- ❌ **Cons**: Single-instance (no clustering), not suitable for 100+ concurrent calls
- ❌ **Cons**: No built-in replication

**Production Migration Path**: SQLite → PostgreSQL with connection pooling (pgBouncer)

**Data Retention Strategy:**



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



**Why Early Exit:**

- **Benefit**: Saves time (don't collect 10 minutes of data for uninterested caller)
- **Benefit**: Better conversion metrics (focus on qualified leads)
- **Benefit**: Reduced API costs (fewer Medicare validation calls)
- **Trade-off**: Might lose some "warm up slowly" prospects (acceptable for efficiency)

**Live Person Engagement Strategies:**



### 4.3 Interruption Handling & Human Handover

**Interruption Detection:**

VAPI provides `user-interrupted` event when user speaks over assistant:



**Human Handover Triggers:**



**Graceful Transfer Script:**



**Transfer Warm Handoff Data:**



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



**Scaling Configuration:**



**Horizontal Scaling Considerations:**



### 5.2 Monitoring & Performance Tracking

**Real-Time Metrics Dashboard:**



**Prometheus Metrics (Production):**



**Alerting Rules (PagerDuty/Opsgenie):**



### 5.3 Business Hours & Callback Scheduling

**Business Hours Enforcement:**



**After-Hours Auto-Disposition:**



**Callback Scheduling:**



---

## 6. Implementation Sketch

### 6.1 API Sequence Diagram



### 6.2 Local Testing Approach

**Mock APIs & Simulated Calls:**



**Mock VAPI Call Simulator:**



**Running Local Tests:**



### 6.3 Production Deployment Checklist

**Environment Variables (.env.production):**



**Deployment Steps:**

1. **Pre-Deployment**
   - Run all tests (`npm run test:all`)
   - Check test coverage (> 80%)
   - Review security audit (`npm audit`)
   - Update CHANGELOG.md

2. **Database Migration**
   - Backup production database
   - Run migrations (`npm run migrate:prod`)
   - Verify schema changes

3. **Blue-Green Deployment**
   - Deploy to green environment
   - Run smoke tests
   - Switch traffic gradually (10% → 50% → 100%)
   - Monitor error rates and latency
   - Rollback if error rate > 1%

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

