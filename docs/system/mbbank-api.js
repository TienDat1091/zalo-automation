// MB Bank API Integration
// =====================================================
// API để xác thực và lookup thông tin tài khoản ngân hàng

const https = require('https');

// MB Bank API Configuration
const MBBANK_CONFIG = {
  tokenUrl: 'https://api-sandbox.mbbank.com.vn/oauth2/v1/token',
  lookupUrl: 'https://api-sandbox.mbbank.com.vn/ms/ewallet/v1.0/domestic/lookup',
  // Credentials - should be stored in environment variables in production
  clientId: '',
  clientSecret: ''
};

// Store access token in memory
let accessToken = null;
let tokenExpiry = 0;

/**
 * Set MB Bank API credentials
 */
function setCredentials(clientId, clientSecret) {
  MBBANK_CONFIG.clientId = clientId;
  MBBANK_CONFIG.clientSecret = clientSecret;
  // Reset token when credentials change
  accessToken = null;
  tokenExpiry = 0;
}

/**
 * Get credentials status
 */
function getCredentialsStatus() {
  return {
    configured: !!(MBBANK_CONFIG.clientId && MBBANK_CONFIG.clientSecret),
    clientId: MBBANK_CONFIG.clientId ? MBBANK_CONFIG.clientId.substring(0, 10) + '...' : null
  };
}

/**
 * Get access token from MB Bank OAuth2
 */
async function getAccessToken() {
  // Return cached token if still valid
  if (accessToken && Date.now() < tokenExpiry - 60000) {
    return accessToken;
  }

  if (!MBBANK_CONFIG.clientId || !MBBANK_CONFIG.clientSecret) {
    throw new Error('MB Bank credentials not configured');
  }

  return new Promise((resolve, reject) => {
    const credentials = Buffer.from(`${MBBANK_CONFIG.clientId}:${MBBANK_CONFIG.clientSecret}`).toString('base64');

    const postData = 'grant_type=client_credentials';

    const url = new URL(MBBANK_CONFIG.tokenUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            accessToken = response.access_token;
            // Set expiry (default 1 hour if not specified)
            const expiresIn = response.expires_in || 3600;
            tokenExpiry = Date.now() + (expiresIn * 1000);
            console.log('MB Bank token obtained, expires in', expiresIn, 'seconds');
            resolve(accessToken);
          } else {
            reject(new Error(response.error_description || 'Failed to get token'));
          }
        } catch (e) {
          reject(new Error('Invalid response from MB Bank: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Lookup account information by account number and bank bin
 * @param {string} accountNumber - Account number to lookup
 * @param {number} bankBin - Bank BIN code (e.g., 970422 for MB Bank)
 */
async function lookupAccount(accountNumber, bankBin) {
  try {
    const token = await getAccessToken();

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        accountNumber: accountNumber,
        bin: bankBin.toString()
      });

      const url = new URL(MBBANK_CONFIG.lookupUrl);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.accountName || response.account_name) {
              resolve({
                success: true,
                accountNumber: accountNumber,
                accountName: response.accountName || response.account_name,
                bankBin: bankBin
              });
            } else if (response.error) {
              resolve({
                success: false,
                error: response.error_description || response.error || 'Account not found'
              });
            } else {
              resolve({
                success: false,
                error: 'Could not retrieve account information'
              });
            }
          } catch (e) {
            reject(new Error('Invalid response: ' + e.message));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Use VietQR API as fallback for account lookup (free, no auth required)
 * This is a public API that works for most Vietnamese banks
 */
async function lookupAccountVietQR(accountNumber, bankBin) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      bin: bankBin.toString(),
      accountNumber: accountNumber
    });

    const options = {
      hostname: 'api.vietqr.io',
      port: 443,
      path: '/v2/lookup',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'x-client-id': 'your-client-id', // Optional
        'x-api-key': 'your-api-key' // Optional
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.code === '00' && response.data) {
            resolve({
              success: true,
              accountNumber: accountNumber,
              accountName: response.data.accountName,
              bankBin: bankBin
            });
          } else {
            resolve({
              success: false,
              error: response.desc || 'Account not found'
            });
          }
        } catch (e) {
          resolve({
            success: false,
            error: 'Invalid response'
          });
        }
      });
    });

    req.on('error', () => {
      resolve({
        success: false,
        error: 'Connection failed'
      });
    });

    req.write(postData);
    req.end();
  });
}

module.exports = {
  setCredentials,
  getCredentialsStatus,
  getAccessToken,
  lookupAccount,
  lookupAccountVietQR
};
