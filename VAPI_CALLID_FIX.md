# VAPI callId Fix Documentation

## Problem Summary

**Issue**: Tool calls were showing `callId: "unknown"` and `customerNumber: "unk****"` in logs, causing database persistence to be skipped.

**Example from logs**:
```
[4] [2025-11-10 00:14:26.022 +0200] WARN: User data not found
[4]     callId: "unknown"
[4]     customerNumber: "unk****"
```

## Root Cause Analysis

### Initial Hypothesis (INCORRECT)
We initially thought tools weren't configured with the correct server URL, causing VAPI to send requests to the wrong endpoint (`/` instead of `/api/vapi/tool-calls`).

### Actual Root Cause (CORRECT)
After running `npm run setup:tools`, we discovered:
- **9 out of 10 tools were already correctly configured** with server URL: `https://9dd7c45bc998.ngrok-free.app/api/vapi/tool-calls`
- Tools ARE being executed at `/api/vapi/tool-calls` (confirmed by CRM API calls in logs)
- **The real issue**: VAPI is NOT sending the `call` object in tool call requests

### Why This Happens

Looking at [toolHandler.server.ts:1503-1504](src/vapi/toolHandler.server.ts#L1503-L1504):
```typescript
const callId = req.body.call?.id || 'unknown';
const customerNumber = req.body.call?.customer?.number || req.body.call?.phoneNumberFrom || 'unknown';
```

The code extracts `callId` from `req.body.call.id`, but VAPI's tool call requests may not include the `call` object depending on how the assistant is configured.

## VAPI API Request Structure

### Expected Structure (with call context):
```json
{
  "message": {
    "toolCalls": [
      {
        "id": "call_xyz",
        "function": {
          "name": "get_user_data",
          "arguments": "{\"phoneNumber\":\"+972527373474\"}"
        }
      }
    ]
  },
  "call": {
    "id": "abc123-def456-ghi789",
    "customer": {
      "number": "+972527373474"
    },
    "phoneNumberFrom": "+972527373474"
  }
}
```

### Actual Structure (without call context):
```json
{
  "message": {
    "toolCalls": [
      {
        "id": "call_xyz",
        "function": {
          "name": "get_user_data",
          "arguments": "{\"phoneNumber\":\"+972527373474\"}"
        }
      }
    ]
  }
}
```

**Result**: `call` is undefined, so `callId` becomes "unknown"

## Solution Implemented

### 1. Tool Configuration Script
Created [scripts/setup-vapi-tools.ts](scripts/setup-vapi-tools.ts) to automatically configure all tools with the correct server endpoint.

**Usage**:
```bash
npm run setup:tools
```

**What it does**:
- Fetches all tools from VAPI API
- Updates each tool's `server.url` to point to `/api/vapi/tool-calls`
- Skips tools that are already configured
- Reports summary of updates/skips/failures

### 2. Debug Logging
Added comprehensive debug logging to [toolHandler.server.ts:1493-1500](src/vapi/toolHandler.server.ts#L1493-L1500) to diagnose request structure:

```typescript
logger.debug({
  requestBody: JSON.stringify(req.body, null, 2),
  hasCall: !!req.body.call,
  callKeys: req.body.call ? Object.keys(req.body.call) : [],
  hasMessage: !!req.body.message,
  messageKeys: req.body.message ? Object.keys(req.body.message) : [],
}, 'DEBUG: Full VAPI tool call request structure');
```

This logs:
- Full request body structure
- Whether `call` object exists
- Keys available in `call` and `message` objects

### 3. Fallback Strategy (NEXT STEP)

Since VAPI may not always send the `call` object, we need to implement fallback logic:

```typescript
// Extract call context from multiple possible sources
const callId =
  req.body.call?.id ||                    // Standard VAPI call object
  req.body.callId ||                      // Alternative field
  req.headers['x-vapi-call-id'] ||        // Custom header
  'unknown';

const customerNumber =
  req.body.call?.customer?.number ||      // Standard customer.number
  req.body.call?.phoneNumberFrom ||       // Alternative field
  req.body.customer?.number ||            // Top-level customer
  req.body.phoneNumber ||                 // Top-level phoneNumber
  extractPhoneFromToolArgs(req.body) ||   // Parse from tool arguments
  'unknown';
```

## Testing Instructions

### Step 1: Run Tool Configuration
```bash
npm run setup:tools
```

Expected output:
```
=== VAPI Tool Configuration Setup ===
✓ Environment variables validated
✓ Found 10 tools
...
✓ Tool configuration complete!
```

### Step 2: Start Servers
```bash
npm run dev:all
```

### Step 3: Make a Test Call
Call your VAPI phone number and trigger a tool (e.g., `get_user_data`)

### Step 4: Check Logs

**Look for the DEBUG log**:
```
DEBUG: Full VAPI tool call request structure
  requestBody: "{ ... }"
  hasCall: true/false
  callKeys: [...]
  messageKeys: [...]
```

**Check if callId appears**:
```
Received VAPI tool call request
  callId: "abc123-def456" (GOOD!)
  customerNumber: "+97252****"
```

OR

```
Received VAPI tool call request
  callId: "unknown" (BAD - call object missing)
  customerNumber: "unk****"
```

### Step 5: Verify Database Persistence

If `callId` is NOT "unknown":
```
✓ Tool execution logged to database
  toolExecutionId: 123
```

If `callId` IS "unknown":
```
⚠️  Skipping database persistence for tool execution
  reason: "callId is unknown - missing call context from VAPI"
```

## Next Steps (If call object is missing)

If the debug logs show `hasCall: false`, we need to:

1. **Check VAPI Assistant Configuration**
   - Go to VAPI Dashboard → Assistants → [Your Assistant]
   - Check if there's a setting to include call context in tool requests

2. **Implement Phone Number Extraction from Tool Arguments**
   Since tools receive `phoneNumber` as an argument, we can extract it:
   ```typescript
   function extractPhoneFromToolArgs(body: any): string | null {
     try {
       const toolCalls = body.message?.toolCalls || [];
       for (const toolCall of toolCalls) {
         const args = JSON.parse(toolCall.function.arguments);
         if (args.phoneNumber) {
           return args.phoneNumber;
         }
       }
     } catch (error) {
       return null;
     }
     return null;
   }
   ```

3. **Generate Pseudo Call ID**
   If VAPI doesn't provide `callId`, generate one:
   ```typescript
   const callId = req.body.call?.id || `pseudo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
   ```

4. **Contact VAPI Support**
   Ask if there's a way to include call context in tool execution requests

## Files Modified

1. [scripts/setup-vapi-tools.ts](scripts/setup-vapi-tools.ts) - NEW
   - Automated tool configuration script

2. [package.json](package.json) - MODIFIED
   - Added `setup:tools` script

3. [src/vapi/toolHandler.server.ts](src/vapi/toolHandler.server.ts) - MODIFIED
   - Added debug logging at lines 1493-1500

4. [VAPI_CALLID_FIX.md](VAPI_CALLID_FIX.md) - NEW (this file)
   - Documentation of the fix

## Configuration Verification

Run this to verify tool configuration:
```bash
npm run setup:tools
```

Expected: 9-10 tools show "Already configured (skipping)"

## Monitoring

Keep an eye on these log patterns:

**Good Signs**:
```
✓ callId: "real-call-id" (not "unknown")
✓ customerNumber: "+97252****" (not "unk****")
✓ Tool execution logged to database
```

**Bad Signs**:
```
✗ callId: "unknown"
✗ customerNumber: "unk****"
✗ Skipping database persistence
```

## Summary

- **Tools are correctly configured** (9/10 working)
- **Endpoint routing is correct** (`/api/vapi/tool-calls`)
- **Real issue**: VAPI not sending `call` object in requests
- **Solution**: Added debug logging to confirm, implement fallback extraction
- **Testing**: Make a call and check DEBUG logs

---

**Status**: PARTIAL FIX - Tools configured correctly, debug logging added, awaiting test call to confirm VAPI request structure.
