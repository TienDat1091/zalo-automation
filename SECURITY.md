# 🔒 Security Guide

This document outlines security practices and features for the Zalo Automation project.

## Overview

This project handles sensitive data including:
- Gmail credentials and access tokens
- User messaging data
- Email recipient lists
- File uploads
- Database with flow configurations

Proper security practices are essential.

## Authentication & Authorization

### Google OAuth2 (Email)
- ✅ **Secure**: Uses industry-standard OAuth2 protocol
- ✅ **No Password Storage**: Tokens stored instead of passwords
- ✅ **Revocable**: Users can revoke access from Google account
- ✅ **Scoped**: Only requests necessary Gmail permissions

**Tokens Stored:**
- `googleRefreshToken` - Used to get new access tokens (stored securely)
- `googleAccessToken` - Short-lived token for Gmail API calls

**Never expose these tokens** - treat like passwords.

### Zalo Authentication
- Uses `zca-js` library for Zalo bot connection
- Credentials managed via environment variables
- Session-based authentication

## Environment Variables

**Critical**: Store all secrets in `.env` file, NOT in code.

### Required Variables
```env
# Google OAuth
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/email/auth/google/callback

# Server
PORT=3000
NODE_ENV=development

# Database
DB_PATH=./data/triggers.db
```

### Rules for Variables
- ✅ Store in `.env` file
- ✅ Add `.env` to `.gitignore`
- ✅ Never commit `.env` to Git
- ✅ Use `.env.example` as template
- ✅ Rotate secrets regularly
- ✅ Never log environment variables

## Credential Storage

### Gmail Credentials (OAuth Tokens)

**Location**: `system/google-oauth.js`

**Storage Strategy**:
```javascript
// Credentials file path (from environment)
const CREDENTIALS_PATH = process.env.GOOGLE_OAUTH_CREDENTIALS_FILE || 
                        './google-oauth-credentials.json';

// This file should NOT be committed to Git
// It's in .gitignore for protection
```

**Rules**:
- ✅ File path configurable via environment variable
- ✅ File automatically ignored by Git
- ✅ Never share or distribute this file
- ✅ Keep local backup separately from Git
- ✅ Regenerate if lost (from Google Cloud Console)

### Database Tokens

**Location**: `data/triggers.db` → `email_senders` table

**Stored Data**:
```sql
- email          (user's Gmail address)
- googleRefreshToken  (long-lived)
- googleAccessToken   (short-lived)
- displayName         (user's name)
```

**Security**:
- ✅ SQLite database encrypted with password (optional)
- ✅ Database file ignored by Git (in .gitignore)
- ✅ Tokens encrypted in transit (HTTPS in production)
- ✅ Access restricted to authenticated API calls

## API Security

### Email API Endpoints

```javascript
// GET /api/email/senders
// Returns: List of linked Gmail accounts
// Security: Returns only email and displayName, NOT tokens

// POST /api/email/send
// Requires: Valid sender profile with tokens
// Security: Tokens used only for Gmail API, never sent to client

// GET /api/email/auth/google/url
// Returns: OAuth login URL
// Security: Uses CSRF tokens in state parameter

// GET /api/email/auth/google/callback
// Security: Verifies Google signature, validates state parameter
```

### Best Practices
- ✅ Never expose tokens in API responses
- ✅ Always verify request authenticity
- ✅ Use HTTPS in production (encrypts all data)
- ✅ Implement rate limiting
- ✅ Log security events (failed auth, etc.)
- ✅ Validate all input data

## File Upload Security

### Upload Locations
```
data/files/     - General file uploads
data/images/    - Image uploads
data/templates/ - Document templates
```

### Security Measures
- ✅ Files stored outside `public/` directory
- ✅ Direct file path access prevented
- ✅ File type validation required
- ✅ File size limits enforced
- ✅ Virus scanning recommended (production)

### File Upload Rules
- ✅ Validate file types (whitelist, not blacklist)
- ✅ Limit file sizes
- ✅ Rename files (don't use original names)
- ✅ Scan for viruses (production)
- ✅ Prevent directory traversal attacks
- ✅ Store outside web-accessible directories

## Database Security

### SQLite Database

**Location**: `data/triggers.db`

**Initialization** (`system/db.js`):
```javascript
// Database created with:
const db = new Database('./data/triggers.db');

// Foreign keys enabled
db.exec('PRAGMA foreign_keys = ON');
```

**Tables**:
- `email_senders` - Gmail accounts (contains tokens!)
- `email_logs` - Email history
- `flows` - Automation workflows
- And more...

### Database Security
- ✅ File permissions restricted (user read/write only)
- ✅ File ignored by Git (.gitignore)
- ✅ Regular backups recommended
- ✅ Encryption optional (can be added)
- ✅ SQL injection protected (using parameterized queries)

### SQL Injection Prevention
```javascript
// ❌ UNSAFE - Never do this
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ SAFE - Use parameterized queries
const query = 'SELECT * FROM users WHERE id = ?';
db.prepare(query).get(userId);
```

The codebase uses `better-sqlite3` with parameterized queries throughout.

## Production Deployment Security

### Before Going Public

#### HTTPS/TLS
```
❌ DON'T: http://your-app.com
✅ DO: https://your-app.com

- Encrypts all data in transit
- Protects passwords, tokens, messages
- Required for OAuth2 in production
```

#### Environment Configuration
```env
# Production settings
NODE_ENV=production
PORT=443  # or behind HTTPS proxy

# Update redirect URI in Google Cloud Console!
GOOGLE_OAUTH_REDIRECT_URI=https://your-domain.com/api/email/auth/google/callback
```

#### Database Encryption
```javascript
// Consider enabling SQLite encryption
// Using sqlcipher or similar
// Adds password protection to database file
```

#### Secrets Management
- ✅ Use secret management service (AWS Secrets Manager, Vault, etc.)
- ✅ Rotate credentials regularly
- ✅ Use strong random values
- ✅ Never hardcode in source code
- ✅ Log access to secrets

#### Server Security
- ✅ Keep Node.js and dependencies updated
- ✅ Run with minimal permissions (not root)
- ✅ Configure firewall rules
- ✅ Enable logging and monitoring
- ✅ Set up intrusion detection

## Monitoring & Logging

### Security Events to Log
```javascript
// Failed authentication attempts
console.warn('❌ Failed OAuth callback: invalid state parameter');

// Successful account linkage
console.log('✅ Email account linked:', email);

// Failed email sending
console.error('❌ Email send failed:', error);

// File uploads
console.log('📁 File uploaded:', filename, 'by', user);
```

### Log Security
- ✅ Never log passwords or tokens
- ✅ Never log full credit card numbers
- ✅ Store logs securely (encrypted)
- ✅ Implement log rotation
- ✅ Monitor logs for suspicious activity
- ✅ Set up alerts for security events

## Incident Response

### If Credentials Leaked

#### Gmail Credentials Leaked
1. Immediately revoke access in Google Cloud Console
2. Delete `google-oauth-credentials.json`
3. Create new OAuth2 credentials
4. Update `.env` file
5. Redeploy application
6. Audit email account (check send history)
7. Notify users of compromise

#### Database Leaked
1. Database contains user data and email tokens
2. Revoke all Gmail credentials (same as above)
3. Notify affected users
4. Change any hardcoded secrets
5. Investigate how data was accessed
6. Implement preventive measures

#### Private Keys Leaked
1. Rotate all secrets
2. Update environment variables
3. Restart services
4. Monitor for unauthorized access
5. Audit logs for suspicious activity

## Dependency Security

### Keep Dependencies Updated
```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update

# Check outdated packages
npm outdated
```

### Vulnerable Packages
Monitor for:
- Security advisories (npm security alerts)
- Outdated packages (check npm)
- Malicious packages (use npm security)

### Recommended Packages
- Keep current versions of:
  - `express` (security patches)
  - `googleapis` (API updates)
  - `better-sqlite3` (stability)
  - `ws` (WebSocket fixes)

## Security Checklist

### Pre-Deployment
- [ ] All secrets in `.env` (not in code)
- [ ] `.env` in `.gitignore`
- [ ] `google-oauth-credentials.json` in `.gitignore`
- [ ] No hardcoded API keys or passwords
- [ ] HTTPS configured for production
- [ ] OAuth redirect URI updated for production
- [ ] Database file ignored by Git
- [ ] Secrets rotated and stored securely

### Regular Maintenance
- [ ] Dependencies updated (`npm audit`)
- [ ] Logs monitored for suspicious activity
- [ ] Database backups performed
- [ ] Credentials rotated (quarterly recommended)
- [ ] Security events logged and reviewed
- [ ] Access logs audited

### Ongoing Practices
- [ ] Code reviewed for security issues
- [ ] New dependencies vetted
- [ ] Security training for team
- [ ] Incident response plan in place
- [ ] Disaster recovery tested
- [ ] Security policy documented

## Additional Resources

### Security Standards
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OAuth 2.0 Security Best Practices](https://tools.ietf.org/html/draft-ietf-oauth-security-topics)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

### Tools
- [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit) - Check vulnerabilities
- [Snyk](https://snyk.io/) - Continuous vulnerability scanning
- [Burp Suite](https://portswigger.net/burp) - Security testing

### Google OAuth2
- [Google OAuth2 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Gmail API Security](https://developers.google.com/gmail/api/guides/best-practices/security)

---

**Remember**: Security is not a feature, it's a practice. Always prioritize protecting user data and credentials.

For questions or security concerns, please report them responsibly and privately.
