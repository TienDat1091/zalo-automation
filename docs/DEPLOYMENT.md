# 📋 Deployment Checklist

Use this checklist before deploying to GitHub or production.

## Pre-Deployment Security Audit

### ✅ Secrets & Credentials
- [ ] `.env` file is in `.gitignore` (never committed)
- [ ] `google-oauth-credentials.json` is in `.gitignore`
- [ ] `data/triggers.db` is in `.gitignore` (database with user data)
- [ ] No hardcoded API keys in any `.js` files
- [ ] No hardcoded passwords or tokens
- [ ] No credentials in comments

### ✅ Configuration
- [ ] `.env.example` created with template values
- [ ] `PORT` uses environment variable
- [ ] `GOOGLE_OAUTH_CLIENT_ID/SECRET` uses environment variables
- [ ] Database path uses environment variable or default
- [ ] All hardcoded URLs changed to use `process.env.API_HOST`

### ✅ Files to Exclude
```
.gitignore includes:
- .env
- google-oauth-*.json
- data/triggers.db
- node_modules/
- logs/
- OS files (.DS_Store, Thumbs.db)
- IDE files (.vscode, .idea)
```

## GitHub Repository Setup

### 1. Create Repository
- [ ] Go to https://github.com/new
- [ ] Repository name: `zalo-automation`
- [ ] Description: "Intelligent automation platform for Zalo with email integration"
- [ ] Visibility: **Public** (for sharing) or **Private** (for personal use)
- [ ] Do NOT initialize with README (you already have one)
- [ ] Do NOT add .gitignore (you already have one)
- [ ] Click "Create repository"

### 2. Initialize Local Git
```bash
# If not already initialized
git init

# Add all files (except those in .gitignore)
git add .

# Verify .gitignore is working - these should NOT show:
git status
# (should NOT show: .env, google-oauth-credentials.json, data/triggers.db, node_modules/)
```

### 3. Configure Git
```bash
# Set user information
git config user.name "Your Name"
git config user.email "your.email@example.com"

# Or globally
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 4. Create Initial Commit
```bash
git add .
git commit -m "Initial commit: Zalo automation with email integration"
```

### 5. Push to GitHub
```bash
# Add remote (replace USERNAME with your GitHub username)
git remote add origin https://github.com/USERNAME/zalo-automation.git

# Push to main branch
git branch -M main
git push -u origin main
```

## Post-Deployment Verification

### ✅ GitHub Repository Check
- [ ] README.md displays correctly
- [ ] SETUP.md is available
- [ ] .env.example shows configuration template
- [ ] .gitignore prevents sensitive files
- [ ] package.json shows dependencies

### ✅ Verify NO Sensitive Data
In GitHub repository, verify these files are NOT present:
- [ ] ❌ `.env` file
- [ ] ❌ `google-oauth-credentials.json`
- [ ] ❌ `data/triggers.db`
- [ ] ❌ `node_modules/` folder
- [ ] ❌ Any files with passwords or API keys

### ✅ Test Installation from GitHub
```bash
# Fresh clone test
cd /tmp
git clone https://github.com/USERNAME/zalo-automation.git
cd zalo-automation

# Should NOT see sensitive files
ls -la
# .env - should NOT exist
# google-oauth-credentials.json - should NOT exist
# data/ - should NOT exist (will be created on first run)

# Install dependencies
npm install

# Copy template
cp .env.example .env

# User edits .env with their values
# npm start should work after setup
```

## Documentation Updates

- [ ] README.md has clear quick-start instructions
- [ ] SETUP.md has detailed Google OAuth setup
- [ ] .env.example includes all required variables
- [ ] Code comments explain complex sections
- [ ] Error messages are helpful and actionable

## Production Deployment Considerations

When deploying to production (not just GitHub):

### Security
- [ ] Use HTTPS (not HTTP)
- [ ] Update `.env` with production values
- [ ] Change Google OAuth redirect URI:
  ```
  From: http://localhost:3000/api/email/auth/google/callback
  To: https://yourdomain.com/api/email/auth/google/callback
  ```
- [ ] Enable database encryption
- [ ] Use strong secrets and passwords
- [ ] Set `NODE_ENV=production`

### Performance
- [ ] Test with multiple concurrent flows
- [ ] Monitor database query performance
- [ ] Set up logging and monitoring
- [ ] Configure email rate limiting
- [ ] Test file upload size limits

### Reliability
- [ ] Set up automated backups of `data/triggers.db`
- [ ] Test error recovery
- [ ] Configure health checks
- [ ] Monitor server logs
- [ ] Set up alerts for failures

## Quick Reference: What Gets Committed

✅ **COMMIT these to Git:**
```
README.md
SETUP.md
.gitignore
.env.example
package.json
package-lock.json
server.js
autoReply.js
blocks/*.js
system/*.js (except google-oauth credentials handling)
public/*.html
public/assets/*.css
```

❌ **DO NOT COMMIT these (in .gitignore):**
```
.env                              # Environment secrets
google-oauth-credentials.json     # API credentials
data/                             # User database
node_modules/                     # Dependencies
.DS_Store                         # OS files
.vscode/                          # IDE settings
logs/                             # Log files
```

## Git Commands Cheat Sheet

```bash
# Check what will be committed
git status

# Add all files (respects .gitignore)
git add .

# Commit changes
git commit -m "Descriptive message"

# Push to GitHub
git push

# Pull latest changes
git pull

# View commit history
git log --oneline

# Create a new branch
git checkout -b feature-name

# Switch branches
git checkout main

# Delete local branch
git branch -d feature-name
```

## Troubleshooting

### Files accidentally committed?
```bash
# Remove from Git (but keep locally)
git rm --cached filename

# Update .gitignore
# Then commit
git commit -m "Remove sensitive files"
```

### Want to remove commit history?
```bash
# WARNING: This deletes all history!
git reset --hard HEAD~1  # Remove last commit

# Then force push (be careful!)
git push --force
```

### Check if sensitive data leaked
```bash
# Search commit history for patterns
git log -p | grep -i "password\|secret\|token"
```

---

**Review this checklist before any deployment to ensure security and best practices!**
