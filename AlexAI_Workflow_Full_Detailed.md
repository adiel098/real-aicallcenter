
# AlexAI + VICI Workflow — Full Detailed Documentation (ASCII + Explanation)

## 1. Overview
This document provides a complete, deeply detailed breakdown of the **AlexAI ↔ VICI** telephony workflow, based directly on the PDF provided by the user.  
It includes:
- Fully detailed ASCII diagram
- Complete explanation of every step
- Coverage of both Page 1 and Page 2 of the workflow

---

# 2. ASCII DIAGRAM — FULL WORKFLOW  
Below is an extended, fully‑annotated ASCII diagram describing the entire flow end‑to‑end.

```
                         ┌──────────────────────────────────────────┐
                         │              VICI DIALER                 │
                         │        (Outbound Campaign List)          │
                         └───────────────────┬──────────────────────┘
                                             │
                                             ▼
                                   Dials target phone #
                                             │
           ┌─────────────────────────────────┴──────────────────────────────────┐
           │                        CALL CONNECTED?                             │
           └─────────────────────────────────┬──────────────────────────────────┘
                                             │Yes
                                             ▼
                         ┌──────────────────────────────────────────┐
                         │   VICI scans for available AI Agents     │
                         └───────────────────┬──────────────────────┘
                                             │
                                             ▼
                           Connect to available AI Agent phone
                                     (8001–8006)
                                             │
                                             ▼
                         ┌──────────────────────────────────────────┐
                         │        ALEX AI AGENT RECEIVES CALL       │
                         └───────────────────┬──────────────────────┘
                                             │
                                             ▼
                              Alex Determine Call Status
                                             │
      ┌───────────────────────────────┬───────────────────────────────┬──────────────────────────────┐
      ▼                               ▼                               ▼
LIVE PERSON                      ANSWERING MACHINE               BUSY / FAST BUSY / NO ANSWER /
      │                               │                          DISCONNECTED / FAX / DEAD AIR
      │                               │                                      │
      │                               ▼                                      ▼
      │                  Voicemail Analysis Logic:                 ┌──────────────────────────────┐
      │                  - Real voicemail?                         │ Auto Disposition: DC / B /   │
      │                  - Standard greeting?                      │ DAIR / NA / Fax Tone         │
      │                  - Custom greeting?                        └──────────────────────────────┘
      │                  - Leave message after beep?                          │
      │                  - Box full?                                         ▼
      │                  - User not allowed voicemail                   Alex hangs up
      │                  - Distinguish beep vs fax                      Set disposition
      │                               │                                  Return to IDLE
      │                               ▼
      │                   Leave message? ───── Yes → Disposition AM  
      │                               │
      │                               No → Hangup + Disposition AM
      │
      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              ALEX AI STARTS LIVE SCRIPT WITH CALLER                    │
└─────────────────────────────────────────────────────────────────────────┘
      │
      ▼
Collect data:
- Name
- Address / City / State / ZIP
- DOB
- Contact details
      │
      ▼
Ask for SSN or Medicare Beneficiary ID (MBI)
      │
      ▼
               ┌──────────────────────────────────────────────┐
               │ Call insurance validation APIs               │
               │ - SSN Lookup → Medicare ID                   │
               │ - MBI Validation → Insurance Eligibility     │
               └──────────────────────────────┬───────────────┘
                                              │
         ┌────────────────────────────────────┼───────────────────────────────────────────┐
         ▼                                    ▼                                           ▼
VALID RESPONSE                        INVALID DATA                                 API FAILURE
         │                                    │                                           │
         │                                    ▼                                           ▼
         │                         Retry up to 3 times                           Retry up to 3 times
         │                                    │                                           │
         │                                    └─────────┬──────────────────────────────────┘
         │                                              ▼
         │                                   After 3 failures:
         │                              - Bad MBI Data Script
         │                              - Offer Callback
         │                              - Schedule Callback API
         │
         ▼
Insurance Qualified
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Send Patient Data to CRM (Order Insert)                                 │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Send VICI Disposition: SALE
         │
         ▼
Transfer call to CRM Human Agent Phone (ex: 2002)
         │
         ▼
Call ends → Alex returns to IDLE  
AI Waiting for next call
```

---

# 3. FULL EXPLANATION OF THE WORKFLOW (FROM PDF)

## 3.1 VICI Outbound Dialing  
VICI starts a campaign and dials numbers from its lead list.  
When a call connects, it checks for an available AlexAI virtual agent (phones 8001–8006).  
The first available AI agent is selected.

## 3.2 AI Pre-Connect Phase  
The AI softphone (SIP/WebRTC/IAX) must be registered and “READY”.  
Once VICI transfers the call, Alex receives SIP audio and moves to call‑status detection.

---

# 4. CALL STATUS DETECTION AND DISPOSITIONS

Alex immediately determines the call state:

### Possible outcomes:
- DC – Disconnected  
- DC – Fax Tone  
- DC – Ring then Fast Busy  
- B – Busy  
- DAIR – Dead Air (must wait at least 6 seconds before “hello”)  
- NA – No Answer (rings 30 seconds)  
- AM – Answering Machine  

If any of these are detected → Alex sets disposition via API → hangs up → returns to IDLE.

---

# 5. ANSWERING MACHINE LOGIC

The AI performs advanced voicemail detection:

- Is it a real voicemail?  
- Is there a standard greeting?  
- Is it a custom greeting with a name?  
- Is there **no** greeting?  
- When exactly to leave a message after beep  
- Box full?  
- Are messages allowed for this campaign?  
- Distinguish beep vs fax tone  
- Detect IVR vs real voicemail

If voicemail → leave message (or skip), mark disposition AM.

---

# 6. LIVE CONTACT FLOW

When a human answers:

1. Alex greets and begins scripted flow  
2. Asks for demographic info  
3. Determines if caller is interested  
   - If NOT interested → Disposition NI → Hangup

If interested → proceeds to SSN/MBI collection.

---

# 7. INSURANCE VALIDATION (PAGE 2)

Flow:

1. Caller provides SSN → API returns Medicare ID  
2. Caller provides MBI → API validates Medicare ID  
3. Alex checks:
   - Is insurance valid?
   - Does qualification meet program rules?

### Retry Rules:
- Retry data collection up to **3 times** for:
  - Invalid MBI
  - Data mismatch (name/DOB)
  - API errors
- After 3 failures:
  - Run Bad MBI script  
  - Offer callback  
  - Schedule callback via VICI API

### If insurance NOT qualified:
- Run "Insurance Not Qualified" script  
- Send disposition NQI  
- Return to IDLE

### If insurance IS qualified:
- Alex reads “Insurance Qualified” script  
- Sends patient/order data to CRM (Order Insert)  
- Send VICI disposition SALE  
- Transfers call to human CRM agent  
- AI returns to IDLE waiting for next call

---

# 8. CALLBACK LOGIC

At any moment the caller may say:
“I don’t have time, call me later.”

Process:
1. Alex runs callback script  
2. Collects callback date/time  
3. Sends Schedule Callback API to VICI  
4. AI returns to IDLE

This same logic applies when invalid data happens more than 3 times.

---

# 9. SYSTEM TIMING RULES

- AI Agent Hours:  
  **9:00am – 5:45pm EST, Mon–Fri**
- DAIR requires waiting at least **6 seconds**
- No Answer = **30 seconds ringing**

---

# 10. END OF WORKFLOW

At the end of any branch:
- Alex sends correct disposition  
- Ends call  
- Returns to “Ready for next call”

---

# END OF DOCUMENT
