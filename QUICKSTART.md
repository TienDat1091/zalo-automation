# 🚀 Quick Reference Card

Copy & paste commands for common tasks.

## Installation & Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your values
# Then start server
npm start
```

## Running the Application

```bash
# Development mode (with logging)
npm run dev

# Production mode
NODE_ENV=production npm start

# Check if running
# Open: http://localhost:3000
```

## Git Commands (First Time)

```bash
# Initialize Git
git init

# Add all files (respects .gitignore)
git add .

# Verify sensitive files are excluded
git status
# Should NOT show: .env, google-oauth-credentials.json, data/triggers.db

# Create first commit
git commit -m "Initial commit: Zalo automation with email integration"

# Add GitHub remote
git remote add origin https://github.com/YOUR_USERNAME/zalo-automation.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Git Commands (Ongoing)

```bash
# Check status
git status

# Add and commit changes
git add .
git commit -m "Your message"

# Push to GitHub
git push

# Pull latest changes
git pull

# View commit history
git log --oneline
```

## Environment Setup

### Google OAuth (Required for Email)

1. **Google Cloud Console**: https://console.cloud.google.com/
2. **Create Project** → "Zalo Automation"
3. **Enable API** → "Gmail API"
4. **Create Credentials** → "OAuth Client ID" → "Web application"
5. **Download JSON** → Save as `google-oauth-credentials.json`
6. **Never commit** - Already in .gitignore

### .env Configuration

```bash
# Copy template
cp .env.example .env

# Edit with values
PORT=3000
NODE_ENV=development
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/email/auth/google/callback

# For production, change to:
GOOGLE_OAUTH_REDIRECT_URI=https://yourdomain.com/api/email/auth/google/callback
```

## Troubleshooting

### Port Already in Use
```bash
# Change port in .env
PORT=3001

# Restart: npm start
```

### Database Error
```bash
# Delete database and restart
rm data/triggers.db
npm start
```

### Dependencies Issue
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Check for Security Issues
```bash
# Audit dependencies
npm audit

# Fix issues
npm audit fix
```

## Documentation Files

| File | Purpose | Read When |
|------|---------|-----------|
| **README.md** | Project overview | First time |
| **SETUP.md** | Installation steps | Setting up |
| **SECURITY.md** | Security practices | Before deploying |
| **DEPLOYMENT.md** | GitHub checklist | Before pushing |
| **.env.example** | Configuration template | Setting up .env |

## Project Structure

```
blocks/          - Flow builder components
system/          - Core systems (OAuth2, WebSocket, Database)
public/          - Frontend (HTML/CSS/JS)
file-function/   - File & Email APIs
data/            - Runtime data (ignored by Git)
```

## Common Issues & Solutions

**Email not showing in block selector?**
- ✅ Link your Gmail account in Email Manager
- ✅ Refresh the page
- ✅ Check console for errors

**Email not sending?**
- ✅ Verify Gmail account is linked
- ✅ Check email is in "From" field
- ✅ Verify recipient email address
- ✅ Check server logs for errors

**Google OAuth "access_denied"?**
- ✅ Add your email as Test User in Google Cloud Console
- ✅ Try again after adding
- ✅ Check redirect URI matches exactly

**Block data not saving?**
- ✅ Make sure blockId is set
- ✅ Check browser console for JavaScript errors
- ✅ Refresh page and try again

**Forgot .env configuration?**
```bash
# Copy again
cp .env.example .env

# Edit and fill in values
# GOOGLE_OAUTH_CLIENT_ID=xxx
# GOOGLE_OAUTH_CLIENT_SECRET=xxx
```

## API Endpoints Quick Reference

```
GET  /api/email/senders
POST /api/email/send
GET  /api/email/auth/google/url
GET  /api/email/auth/google/callback
GET  /api/email/recipients
POST /api/upload/file
POST /api/upload/image
```

## Security Checklist Before GitHub

```bash
# ✅ Verify these files are NOT in Git
git status | grep -E ".env|google-oauth-credentials|data/triggers.db"

# Should return NOTHING (means they're excluded)

# ✅ Verify documentation is present
ls -la README.md SETUP.md SECURITY.md DEPLOYMENT.md

# ✅ Verify .gitignore exists
ls -la .gitignore

# ✅ Then push
git push
```

## Email Sending Flow

1. User creates flow in Flow Builder
2. Adds "Send Email" block
3. Selects linked Gmail account
4. Configures recipient, subject, body
5. Saves block (blockId captured)
6. Flow triggered manually or by Zalo message
7. Block executes: `send-email.js`
8. Calls: `googleOAuth.sendEmailViaGmail()`
9. Gmail API sends email ✉️
10. Status logged to database

## Variable Substitution in Email

```
Subject: Hello {name}
Body: Your message: {message}

Variables available from flow:
- {name} - Contact name
- {message} - User message
- {email} - User email
- {timestamp} - Send time
```

## Monitoring & Logs

```bash
# Check for errors in console
npm start

# Should see:
# ✅ Server running on http://localhost:3000
# ✅ WebSocket listening on ws://localhost:3000
# ✅ Database initialized

# Email logs visible in:
# - Server console
# - Email Manager UI (email history)
# - Database: data/triggers.db (email_logs table)
```

## Production Deployment Checklist

```bash
# 1. Update .env
GOOGLE_OAUTH_REDIRECT_URI=https://yourdomain.com/api/email/auth/google/callback
NODE_ENV=production
PORT=443  # or behind HTTPS proxy

# 2. Enable HTTPS (required!)
# Use certificate from: Let's Encrypt, AWS, etc.

# 3. Update Google Cloud Console
# Add production redirect URI to OAuth credentials

# 4. Start with environment
NODE_ENV=production npm start

# 5. Monitor for errors
# Check logs continuously
```

## Useful Links

- **Google Cloud Console**: https://console.cloud.google.com/
- **Gmail API Docs**: https://developers.google.com/gmail/api
- **Node.js Docs**: https://nodejs.org/docs/
- **OAuth 2.0**: https://tools.ietf.org/html/rfc6749

## Emergency: Credentials Leaked

```bash
# 1. Revoke in Google Cloud Console
# APIs & Services > Credentials > Delete leaked credential

# 2. Delete local files
rm google-oauth-credentials.json

# 3. Create new credentials in Google Cloud

# 4. Update .env with new credentials

# 5. Restart
npm start
```

## Backup Your Data

```bash
# Backup database
cp data/triggers.db data/triggers.db.backup

# Backup .env (locally only!)
cp .env .env.backup

# Keep backups safe, never commit to Git
```

---

**Quick Reference Version**: 1.0
**Last Updated**: 2024
**Questions?** See README.md, SETUP.md, or SECURITY.md
