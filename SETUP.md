# 🚀 Zalo Automation - Setup Guide

This guide will help you set up the Zalo Automation project, including Google OAuth2 authentication for email sending.

## Prerequisites

- **Node.js**: v14.0.0 or higher ([Download](https://nodejs.org/))
- **npm**: v6.0.0 or higher (comes with Node.js)
- **Google Account**: For Gmail API access
- **Git**: For cloning the repository

## Step 1: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Express.js (web server)
- better-sqlite3 (database)
- googleapis (Gmail API)
- ws (WebSocket support)
- And more...

## Step 2: Set Up Environment Variables

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and update these values:
```env
PORT=3000
NODE_ENV=development
```

## Step 3: Configure Google OAuth2 for Gmail

This is the most important step for email functionality.

### 3.1 Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click "NEW PROJECT"
4. Enter name: `Zalo Automation`
5. Click "CREATE"

### 3.2 Enable Gmail API

1. In the left sidebar, click "APIs & Services" → "Library"
2. Search for "Gmail API"
3. Click on it and press "ENABLE"

### 3.3 Create OAuth2 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "+ CREATE CREDENTIALS" → "OAuth client ID"
3. If prompted, click "CONFIGURE CONSENT SCREEN" first:
   - Choose "External" user type
   - Fill in app name: "Zalo Automation"
   - Add your email as support contact
   - On scopes page, add "gmail.send" and "gmail.readonly"
   - On test users page, add your Gmail account email
   - Save and continue

4. Back to "Create OAuth Client ID":
   - Application type: "Web application"
   - Name: "Zalo Automation"
   - Under "Authorized redirect URIs", add:
     ```
     http://localhost:3000/api/email/auth/google/callback
     ```
   - Click "CREATE"

### 3.4 Download Credentials

1. You'll see your credentials with "Client ID" and "Client secret"
2. Click the download icon (↓) to save as JSON
3. Move this file to your project root and rename to:
   ```
   google-oauth-credentials.json
   ```

**⚠️ IMPORTANT**: This file contains secrets! 
- NEVER commit it to Git (already in .gitignore)
- NEVER share it publicly
- Keep it safe locally only

## Step 4: Start the Server

```bash
npm start
```

You should see output like:
```
✅ Server running on http://localhost:3000
🔗 WebSocket listening on ws://localhost:3000
```

## Step 5: Access the Application

Open your browser and go to:
```
http://localhost:3000
```

## Step 6: Link Your Gmail Account

1. Go to "Email Manager" section
2. Click "🔐 Liên kết với Google" (Link with Google)
3. You'll be redirected to Google login
4. Grant permissions for Gmail
5. You'll be redirected back - your email should now be linked!

## Step 7: Test Email Sending

1. Create a flow in the Flow Builder
2. Add a "Send Email" block
3. Select your linked Gmail account as sender
4. Set recipient email address
5. Configure subject and body with variables if needed
6. Save the flow
7. Trigger the flow - email should be sent!

## Troubleshooting

### "access_denied" error during OAuth

**Solution**: Make sure your email is added as a Test User:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. "APIs & Services" → "OAuth consent screen"
3. Scroll to "Test users"
4. Click "+ ADD USERS"
5. Add your Gmail account email
6. Try linking again

### Email not sending

1. Check server logs for errors
2. Verify Gmail account is linked (should show email in Email Manager)
3. Check sender account has Gmail API enabled
4. Verify recipient email is valid

### Port 3000 already in use

Change port in `.env`:
```env
PORT=3001
```

### Database error

Delete the database file and restart:
```bash
rm data/triggers.db
npm start
```

## Project Structure

```
├── blocks/                 # Flow builder blocks
│   ├── send-email.js      # Email sending block
│   ├── send-message.js    # Message sending
│   └── ...
├── public/                # HTML/CSS/JS frontend
│   ├── email-manager.html # Email account management
│   ├── dashboard.html     # Main dashboard
│   └── ...
├── system/               # Core system files
│   ├── google-oauth.js   # OAuth2 & Gmail API
│   ├── db.js             # Database setup
│   └── ...
├── data/                 # Auto-generated data
│   └── triggers.db       # SQLite database
├── server.js             # Express server
├── autoReply.js          # Flow execution
└── package.json          # Dependencies
```

## Security Notes

**Before deploying to production:**

1. ✅ Store `google-oauth-credentials.json` securely (NOT in Git)
2. ✅ Use environment variables for all secrets
3. ✅ Use HTTPS in production (not HTTP)
4. ✅ Update redirect URIs in Google Cloud Console for production URL
5. ✅ Use strong database passwords if exposing to network
6. ✅ Keep `.env` file local only (in .gitignore)

## Development Commands

```bash
# Start the server
npm start

# Run in development mode with logging
NODE_ENV=development npm start

# Production deployment
NODE_ENV=production npm start
```

## API Endpoints

### Email Management

- `GET /api/email/senders` - List all linked Gmail accounts
- `GET /api/email/auth/google/url` - Get OAuth login URL
- `GET /api/email/auth/google/callback` - OAuth callback handler
- `POST /api/email/send` - Send email via Gmail API
- `GET /api/email/recipients` - List saved recipient lists

## Database

SQLite database automatically created in `data/triggers.db` with:
- `email_senders` - Gmail account credentials (encrypted tokens)
- `email_logs` - Email sending history
- `flows` - Automation flow definitions
- And more...

## Next Steps

1. ✅ Set up environment
2. ✅ Link Gmail account
3. ✅ Create your first flow
4. ✅ Test email sending
5. 📝 Explore other blocks (images, files, conditions, etc.)

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Check server logs: `npm start` output
3. Check Google Cloud Console settings

## License

ISC
