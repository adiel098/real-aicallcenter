# 🚀 Quick Start Guide

Get your VAPI Voice Agent running in 5 minutes!

## Step 1: Install Dependencies (1 min)

```bash
npm install
```

## Step 2: Start All Servers (30 seconds)

```bash
npm run dev:all
```

You should see all 4 servers starting:
- ✅ Lead CRM Server (Port 3001)
- ✅ User Data CRM Server (Port 3002)
- ✅ Classification CRM Server (Port 3003)
- ✅ VAPI Tool Handler (Port 3000)

## Step 3: Test the APIs (1 min)

Open a new terminal and test:

```bash
# Test Lead CRM - should return John Smith
curl http://localhost:3001/api/leads/+12025551001

# Test User Data CRM - should return complete user data
curl http://localhost:3002/api/users/+12025551001

# Get tool definitions for VAPI
curl http://localhost:3000/api/vapi/tools
```

## Step 4: Expose to Internet with ngrok (1 min)

In a new terminal:

```bash
# Install ngrok if needed
npm install -g ngrok

# Start ngrok
ngrok http 3000
```

Copy the HTTPS URL (looks like: `https://abc123.ngrok.io`)

## Step 5: Configure VAPI (2 minutes)

1. **Go to VAPI Dashboard:** https://dashboard.vapi.ai

2. **Create a new Assistant**

3. **Copy the System Prompt:**
   - Open `VAPI_ASSISTANT_PROMPT.md` in this project
   - Copy the entire "System Prompt" section
   - Paste into VAPI Assistant configuration

4. **Add Tools:**
   - Visit http://localhost:3000/api/vapi/tools
   - Copy each tool definition
   - In VAPI dashboard, add 5 new tools
   - For each tool, set Server URL to: `https://your-ngrok-url.ngrok.io/api/vapi/tool-calls`
   - Replace `your-ngrok-url` with your actual ngrok URL

5. **Get a Phone Number:**
   - In VAPI dashboard, get a phone number
   - Assign your assistant to this number

## Step 6: Make a Test Call! 🎉

Call your VAPI phone number!

**Try these test scenarios:**

### Scenario 1: Complete User Data
- Call with phone: `+12025551001`
- Agent will find John Smith with complete data
- Will proceed straight to classification
- Result: QUALIFIED (score 65)

### Scenario 2: Incomplete User Data
- Call with phone: `+12025551003`
- Agent will find Michael Chen with missing fields
- Will ask for: height, weight, allergies, blood type
- After collecting, will classify
- Result: QUALIFIED (score 80+)

### Scenario 3: New User
- Call with any other phone number
- Agent will ask for all information from scratch
- Will create new lead and collect data
- Will classify when complete

## 📊 Monitor the Logs

Watch your terminal where servers are running. You'll see:

```
[INFO] Incoming request to Lead CRM
[DEBUG] Looking up lead by phone number
[INFO] Lead found successfully
[INFO] Tool: check_lead completed
```

Detailed logs show:
- Every tool call from VAPI
- Phone numbers (masked for privacy)
- Data being updated
- Classification decisions with reasoning

## 🐛 Troubleshooting

**Problem:** Servers won't start
```bash
# Make sure ports are free
netstat -an | findstr "3000 3001 3002 3003"

# Kill any processes using those ports if needed
```

**Problem:** VAPI can't reach webhook
- ✅ Check ngrok is running
- ✅ Verify HTTPS URL (not HTTP)
- ✅ Update VAPI tool Server URLs with correct ngrok URL
- ✅ Make sure firewall isn't blocking ngrok

**Problem:** Tool calls failing
- ✅ Check logs in terminal for error messages
- ✅ Verify tool definitions match exactly
- ✅ Ensure phone numbers are in E.164 format (+12025551001)

**Problem:** Classification failing
- ✅ Make sure all required fields are collected
- ✅ Check User Data CRM logs for missing fields
- ✅ User data must be complete before classification

## 🎯 Next Steps

1. **Customize the data:** Edit files in `src/data/` to add your own test users

2. **Modify classification logic:** Edit `src/mock-servers/classificationCrm.server.ts`

3. **Add more tools:** Extend `src/vapi/toolHandler.server.ts`

4. **Deploy to production:**
   - Build: `npm run build`
   - Deploy to a cloud service (Heroku, Railway, Render, etc.)
   - Update VAPI tool URLs to your production URL

5. **Add real database:** Replace in-memory data with PostgreSQL/MongoDB

## 📚 Important Files

- `README.md` - Complete documentation
- `VAPI_ASSISTANT_PROMPT.md` - Copy-paste prompt for VAPI
- `.env.example` - Environment configuration template
- `package.json` - NPM scripts and dependencies

## 🔍 Useful Commands

```bash
# Run all servers
npm run dev:all

# Run individual servers
npm run dev:vapi-handler
npm run dev:lead-crm
npm run dev:userdata-crm
npm run dev:classification-crm

# Build for production
npm run build

# Start production
npm start
```

## 🎉 You're Ready!

Your VAPI Voice Agent is now running and ready to handle calls!

**Test numbers available:**
- `+12025551001` - John Smith (complete data)
- `+12025551002` - Sarah Johnson (complete data)
- `+12025551003` - Michael Chen (incomplete - needs height, weight, allergies, blood type)
- `+12025551004` - Emily Davis (incomplete - needs weight, family history)
- `+12025551005` - David Wilson (complete data)
- `+12025551006` - Lisa Anderson (very incomplete)

Have fun building! 🚀

---

**Need Help?**
- Check logs first - they're very detailed!
- Read `README.md` for in-depth documentation
- Review `VAPI_ASSISTANT_PROMPT.md` for assistant configuration
