# VAPI Webhook Setup Guide

This guide shows you how to automatically configure VAPI webhooks for real-time call event logging using the automated setup script.

## Prerequisites

Before running the setup script, you need:

1. **VAPI API Token** - Get from [VAPI Dashboard](https://dashboard.vapi.ai)
   - Go to Account → API Keys
   - Copy your token

2. **VAPI Assistant ID** - From your assistant in VAPI Dashboard
   - Go to Assistants
   - Click on your assistant
   - Copy the Assistant ID from the URL or settings

3. **Ngrok URL** - Expose your local server to the internet
   ```bash
   ngrok http 3000
   ```
   - Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.app`)

## Quick Setup (3 Steps)

### Step 1: Update .env File

Open your `.env` file and add these values:

```env
# VAPI Configuration
VAPI_TOKEN=your_actual_token_here
VAPI_ASSISTANT_ID=your_assistant_id_here
NGROK_URL=https://your-ngrok-url.ngrok-free.app
```

### Step 2: Run the Setup Script

```bash
npm run setup:webhooks
```

You should see output like:
```
=== VAPI Webhook Setup ===

✓ Environment variables validated
✓ Assistant found: Medicare Screening Assistant
✓ Assistant webhooks configured successfully!

Configured event endpoints:
  📞 Call Started:  https://your-ngrok-url.ngrok-free.app/api/vapi/events/call-started
  📴 Call Ended:    https://your-ngrok-url.ngrok-free.app/api/vapi/events/call-ended
  💬 Message:       https://your-ngrok-url.ngrok-free.app/api/vapi/events/message
  ⚠️  Interrupted:   https://your-ngrok-url.ngrok-free.app/api/vapi/events/speech-interrupted
  📞 Hang:          https://your-ngrok-url.ngrok-free.app/api/vapi/events/hang

🎉 Setup complete! Make a test call to see real-time logs.
```

### Step 3: Start Your Servers & Test

1. **Start all servers:**
   ```bash
   npm run dev:all
   ```

2. **Make a test call** to your VAPI phone number

3. **Watch the console** for real-time logs:
   ```
   📞 CALL STARTED - callId: abc123, phoneFrom: +15551234567
   👤 USER SAID: "Hello, I need help with Medicare"
   🤖 ASSISTANT SAID: "Hi! I'd be happy to help you..."
   🔧 Tool: check_lead - phoneNumber: +1555123****
   📴 CALL ENDED - Duration: 95s - Reason: customer-ended-call
   ```

## What the Script Configures

The setup script automatically configures your VAPI assistant to send these webhook events to your server:

| Event Type | Description | Endpoint |
|------------|-------------|----------|
| **status-update** | Call started/ended | `/api/vapi/events/call-started`, `/api/vapi/events/call-ended` |
| **speech-update** | User/assistant messages | `/api/vapi/events/message` |
| **user-interrupted** | User interrupts assistant | `/api/vapi/events/speech-interrupted` |
| **hang** | Call hung up | `/api/vapi/events/hang` |
| **transcript** | Real-time transcription | (logged automatically) |
| **end-of-call-report** | Call summary & statistics | (included in call-ended) |

## Troubleshooting

### Error: "Missing required environment variables"

**Solution:** Check that your `.env` file has all three variables:
- `VAPI_TOKEN`
- `VAPI_ASSISTANT_ID`
- `NGROK_URL`

### Error: "Assistant not found"

**Solution:**
1. Verify your `VAPI_ASSISTANT_ID` is correct
2. Go to [VAPI Dashboard](https://dashboard.vapi.ai) → Assistants
3. Copy the ID from your assistant's settings

### Error: "Unauthorized"

**Solution:**
1. Verify your `VAPI_TOKEN` is correct
2. Get a fresh token from [VAPI Dashboard](https://dashboard.vapi.ai) → API Keys

### Error: "NGROK_URL must start with https://"

**Solution:**
1. Make sure you copied the HTTPS URL from ngrok (not HTTP)
2. Format should be: `https://abc123.ngrok-free.app`

### Webhooks Not Receiving Events

**Solution:**
1. Verify ngrok is still running: `ngrok http 3000`
2. Check that your servers are running: `npm run dev:all`
3. Verify the ngrok URL hasn't changed (ngrok free tier changes URLs on restart)
4. Re-run the setup script if ngrok URL changed

## Manual Verification

You can verify the webhooks were configured by checking your assistant in the VAPI Dashboard:

1. Go to [VAPI Dashboard](https://dashboard.vapi.ai)
2. Click on your assistant
3. Look for "Server URL" - should show your ngrok URL
4. Look for "Server Messages" - should show the enabled event types

## Re-running Setup

You can safely re-run the setup script anytime:

```bash
npm run setup:webhooks
```

This is useful when:
- Your ngrok URL changes
- You want to update webhook configuration
- You created a new assistant

## Next Steps

After successful setup:

1. **Keep ngrok running** in a terminal window
2. **Start your servers**: `npm run dev:all`
3. **Make test calls** to your VAPI number (+15055421045)
4. **Monitor console logs** to see real-time call events
5. **Test the complete workflow** from greeting to classification

## Advanced: What Events Are Logged

When you receive a call, your console will show:

1. **Call Start** - When someone dials your number
   - Call ID
   - Caller phone number (masked)
   - Call type (inbound/outbound)

2. **Conversation** - Every message exchange
   - User messages with full text
   - Assistant responses with full text
   - Timestamps for each turn

3. **Tool Executions** - When tools are called
   - Tool name (check_lead, get_user_data, etc.)
   - Arguments passed
   - Results returned
   - Execution duration

4. **Call End** - When call completes
   - Total duration
   - End reason (customer-ended, assistant-ended, etc.)
   - Conversation statistics (message count, tool calls)

## Support

If you encounter issues:

1. Check this guide first
2. Verify all prerequisites are met
3. Check console logs for error messages
4. Verify ngrok tunnel is active
5. Ensure VAPI servers can reach your ngrok URL

---

**Generated with Claude Code** | [View Full Documentation](./README.md)
