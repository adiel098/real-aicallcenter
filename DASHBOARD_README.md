# 📊 Web Dashboard - Medical Screening CRM

## Overview

A modern, responsive web dashboard to view and manage all leads, user data, and classification results from the VAPI Medical Screening system.

## Features

### ✅ Overview Tab
- **Statistics Cards**: Total leads, users, classifications, and data completion rate
- **Recent Activity**: Latest classification events
- **Visual Charts**: Classification results breakdown (Qualified vs Not Qualified)

### 👥 Leads Tab
- **Searchable Table**: View all leads with phone, email, and source
- **Search Functionality**: Filter by name, phone, or email
- **Detailed View**: Click to see full lead profile with medical data

### 📋 User Data Tab
- **User Cards Grid**: Visual cards showing each user's information
- **Completion Progress**: Progress bars showing data completeness
- **Status Badges**: Quick identification of complete vs incomplete profiles
- **Profile Details**: View bio data (age, gender, height, weight) and genetic data (blood type)

### ✅ Classifications Tab
- **Filter Options**: View all, only qualified, or only not qualified
- **Score Display**: Large score numbers with color coding (green ≥60, red <60)
- **Detailed Reasons**: See why each user was classified
- **Factor Breakdown**: Visual indicators showing positive/negative factors

## File Structure

```
homework2/
├── public/
│   ├── index.html           # Main dashboard page
│   ├── css/
│   │   └── styles.css       # Complete styling with modern design
│   └── js/
│       ├── api.js           # API service layer for all CRM endpoints
│       └── app.js           # Main application logic and UI rendering
├── src/
│   └── vapi/
│       └── toolHandler.server.ts  # Updated to serve static files
```

## How to Use

### 1. Start All Servers

Make sure all CRM servers and the VAPI handler are running:

```bash
npm run dev:all
```

This starts:
- **Port 3000**: VAPI Handler + Dashboard
- **Port 3001**: Lead CRM
- **Port 3002**: User Data CRM
- **Port 3003**: Classification CRM

### 2. Access the Dashboard

Open your browser and navigate to:

```
http://localhost:3000
```

### 3. Features You Can Use

#### Overview Tab
- See real-time statistics
- Monitor recent classification activity
- View acceptance rate charts

#### Leads Tab
- Browse all leads in a table
- Use the search box to filter leads
- Click "View Details" to see full lead profile including medical data and classification

#### User Data Tab
- See all users with their data completion status
- Green badge = Complete data
- Yellow badge = Incomplete data
- Progress bars show how much data is collected
- Click "View Full Profile" for detailed information

#### Classifications Tab
- Use filter buttons to view:
  - **All**: All classifications
  - **✅ Qualified**: Only users with score ≥ 60
  - **❌ Not Qualified**: Only users with score < 60
- See detailed reasons and factors for each classification
- Score displayed prominently with color coding

### 4. Refresh Data

Click the **🔄 Refresh** button in the header to reload all data from the APIs.

## API Endpoints Used

The dashboard communicates with these endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET http://localhost:3001/api/leads` | Fetch all leads |
| `GET http://localhost:3002/api/users` | Fetch all users with medical data |
| `GET http://localhost:3003/api/classifications` | Fetch all classification results |
| `GET http://localhost:3001/api/leads/:phone` | Get specific lead details |
| `GET http://localhost:3002/api/users/:phone` | Get specific user data |

## Design Features

### Modern UI/UX
- **Clean Design**: Professional medical dashboard aesthetic
- **Responsive Layout**: Works on desktop, tablet, and mobile
- **Color-Coded Status**: Easy visual identification
  - 🟢 Green: Qualified, Complete, Success
  - 🔴 Red: Not Qualified, Low Score
  - 🟡 Yellow: Incomplete, Warning
  - 🔵 Blue: Info, Actions

### Interactive Elements
- **Tab Navigation**: Switch between different views
- **Search & Filter**: Find specific records quickly
- **Modal Dialogs**: Detailed views without page reload
- **Hover Effects**: Visual feedback on interactive elements
- **Animations**: Smooth transitions and loading states

### Performance
- **Parallel Loading**: All APIs called simultaneously
- **Client-Side Filtering**: Instant search results
- **Minimal Dependencies**: Vanilla JavaScript for speed
- **Optimized Rendering**: Efficient DOM updates

## Technical Details

### Technologies Used
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Express.js (static file serving)
- **APIs**: RESTful JSON APIs
- **Styling**: CSS Grid, Flexbox, CSS Variables

### Browser Compatibility
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

### No Build Step Required
The dashboard uses vanilla JavaScript and runs directly in the browser without any build tools.

## Troubleshooting

### Dashboard shows "Loading..." indefinitely
**Solution**: Ensure all CRM servers are running (`npm run dev:all`)

### "Connection Error" in status indicator
**Solution**: Check that ports 3001, 3002, and 3003 are accessible

### No data displayed
**Solution**:
1. Refresh the page
2. Check browser console for errors (F12)
3. Verify servers are running: `curl http://localhost:3001/api/leads`

### Changes not reflecting
**Solution**: Hard refresh the browser (Ctrl+Shift+R or Cmd+Shift+R)

## Future Enhancements

Potential improvements for the dashboard:

- [ ] Real-time updates using WebSocket
- [ ] Export data to CSV/Excel
- [ ] Advanced filtering and sorting
- [ ] User data editing capability
- [ ] Classification history timeline
- [ ] Analytics and trends visualization
- [ ] Dark mode toggle
- [ ] Multi-language support
- [ ] User authentication

## Support

For issues or questions:
1. Check the browser console (F12) for errors
2. Verify all servers are running
3. Check the terminal output for server logs

---

**Built with ❤️ using Vanilla JavaScript and Express.js**
