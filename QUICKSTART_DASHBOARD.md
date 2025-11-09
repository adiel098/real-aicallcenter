# 🚀 Dashboard Quick Start Guide

## Start the Dashboard in 3 Steps

### Step 1: Start All Servers
```bash
npm run dev:all
```

### Step 2: Open Dashboard
Navigate to: **http://localhost:3000**

### Step 3: Explore
- Click tabs to switch views
- Use search boxes to filter data
- Click "View Details" to see more information

---

## Quick Reference

### Server Ports
| Service | Port | URL |
|---------|------|-----|
| Dashboard | 3000 | http://localhost:3000 |
| Lead CRM | 3001 | http://localhost:3001 |
| User Data CRM | 3002 | http://localhost:3002 |
| Classification CRM | 3003 | http://localhost:3003 |

### Dashboard Tabs
1. **📊 Overview** - Statistics and recent activity
2. **👥 Leads** - All leads in searchable table
3. **📋 User Data** - Medical data with completion status
4. **✅ Classifications** - Results with scores and factors

### Key Features
- 🔄 Refresh button to reload data
- 🔍 Search to filter leads and users
- 📊 Visual charts for classification breakdown
- 📈 Progress bars for data completion
- 🎯 Click any item for detailed view

### Color Coding
- 🟢 **Green**: Qualified / Complete / Success
- 🔴 **Red**: Not Qualified / Low Score
- 🟡 **Yellow**: Incomplete / Warning
- 🔵 **Blue**: Info / Actions

---

## Troubleshooting

**Problem**: Dashboard not loading
- ✅ Run `npm run dev:all`
- ✅ Wait for all servers to start
- ✅ Refresh browser

**Problem**: No data showing
- ✅ Click the Refresh button
- ✅ Check browser console (F12)

**Problem**: Connection error
- ✅ Verify all 4 servers are running
- ✅ Check terminal for error messages

---

**That's it! You're ready to use the dashboard** 🎉
