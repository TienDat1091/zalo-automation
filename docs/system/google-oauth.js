// Google OAuth2 Handler
// =====================================================

const { google } = require('googleapis');
const path = require('path');

// IMPORTANT: You need to setup Google OAuth2 credentials at Google Cloud Console
// Steps:
// 1. Go to: https://console.cloud.google.com/
// 2. Create new project
// 3. Enable Gmail API
// 4. Create OAuth2 Credentials (Desktop app or Web app)
// 5. Download credentials JSON and rename to 'google-oauth-credentials.json'
// 6. Place in root folder of this project
// 7. Update CLIENT_ID, CLIENT_SECRET, REDIRECT_URI below if different

const fs = require('fs');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'google-oauth-credentials.json');
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/api/email/auth/google/callback';

// Load credentials from file dynamically (reads fresh each time)
function loadCredentials() {
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
      const clientId = credentials.web?.client_id || credentials.installed?.client_id || '';
      const clientSecret = credentials.web?.client_secret || credentials.installed?.client_secret || '';
      const redirectUri = credentials.web?.redirect_uris?.[0] || DEFAULT_REDIRECT_URI;

      return { clientId, clientSecret, redirectUri, loaded: true };
    }
  } catch (error) {
    console.warn('⚠️ Could not load google-oauth-credentials.json:', error.message);
  }

  return { clientId: '', clientSecret: '', redirectUri: DEFAULT_REDIRECT_URI, loaded: false };
}

// Create OAuth2 client (loads credentials fresh each time)
function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri, loaded } = loadCredentials();

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth2 credentials not configured. Please setup Google Cloud credentials.');
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

// Generate authorization URL for user
function getAuthorizationUrl() {
  try {
    const oauth2Client = createOAuth2Client();
    
    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });

    return authUrl;
  } catch (error) {
    console.error('❌ Error generating auth URL:', error.message);
    throw error;
  }
}

// Exchange authorization code for tokens
async function exchangeCodeForTokens(code) {
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('✅ Tokens obtained:', {
      access_token: tokens.access_token ? '***' : 'missing',
      refresh_token: tokens.refresh_token ? '***' : 'missing',
      expires_in: tokens.expiry_date
    });

    return tokens;
  } catch (error) {
    console.error('❌ Error exchanging code for tokens:', error.message);
    throw error;
  }
}

// Get user email and name from Google
async function getUserInfo(accessToken) {
  try {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });

    const people = google.people('v1');
    const response = await people.people.get({
      resourceName: 'people/me',
      personFields: 'emailAddresses,names',
      auth: oauth2Client
    });

    const email = response.data.emailAddresses?.[0]?.value;
    const name = response.data.names?.[0]?.displayName || '';

    console.log('✅ User info retrieved:', { email, name });
    return { email, name };
  } catch (error) {
    console.error('❌ Error getting user info:', error.message);
    throw error;
  }
}

// Refresh access token using refresh token
async function refreshAccessToken(refreshToken) {
  try {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials.access_token;
  } catch (error) {
    console.error('❌ Error refreshing access token:', error.message);
    throw error;
  }
}

// Send email using Gmail API
async function sendEmailViaGmail(accessToken, refreshToken, recipientEmail, subject, htmlBody, textBody) {
  try {
    const oauth2Client = createOAuth2Client();
    
    // Set credentials
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Create email message
    const message = [
      `To: ${recipientEmail}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlBody || textBody
    ].join('\n');

    // Encode message
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Send email
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    console.log('✅ Email sent:', { messageId: response.data.id, to: recipientEmail });
    return { success: true, messageId: response.data.id };
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    throw error;
  }
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserInfo,
  refreshAccessToken,
  sendEmailViaGmail,
  loadCredentials,
  CREDENTIALS_PATH
};
