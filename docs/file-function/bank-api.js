// bank-api.js - API endpoints cho Bank Account Lookup
// ============================================

const fs = require('fs');
const path = require('path');
const mbbankApi = require('../system/mbbank-api');

// Path to store MB Bank credentials
const MBBANK_CREDENTIALS_PATH = path.join(__dirname, '..', 'mbbank-credentials.json');

// Load credentials on startup
try {
  if (fs.existsSync(MBBANK_CREDENTIALS_PATH)) {
    const creds = JSON.parse(fs.readFileSync(MBBANK_CREDENTIALS_PATH, 'utf8'));
    if (creds.clientId && creds.clientSecret) {
      mbbankApi.setCredentials(creds.clientId, creds.clientSecret);
      console.log('MB Bank credentials loaded');
    }
  }
} catch (e) {
  console.warn('Could not load MB Bank credentials:', e.message);
}

module.exports = function(app, triggerDB) {
  console.log('Bank API endpoints registering...');

  // =====================================================
  // GET MB BANK CREDENTIALS STATUS
  // =====================================================
  app.get('/api/bank/mbbank/status', (req, res) => {
    try {
      const status = mbbankApi.getCredentialsStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // SAVE MB BANK CREDENTIALS
  // =====================================================
  app.post('/api/bank/mbbank/credentials', (req, res) => {
    try {
      const { clientId, clientSecret } = req.body;

      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: 'Missing clientId or clientSecret', success: false });
      }

      // Save to file
      fs.writeFileSync(MBBANK_CREDENTIALS_PATH, JSON.stringify({ clientId, clientSecret }, null, 2), 'utf8');

      // Update in memory
      mbbankApi.setCredentials(clientId, clientSecret);

      console.log('MB Bank credentials saved');

      res.json({
        success: true,
        message: 'Credentials saved successfully'
      });
    } catch (error) {
      console.error('Save MB Bank credentials error:', error.message);
      res.status(500).json({ error: error.message, success: false });
    }
  });

  // =====================================================
  // LOOKUP ACCOUNT INFO (using VietQR - free, no auth)
  // =====================================================
  app.post('/api/bank/lookup', async (req, res) => {
    try {
      const { accountNumber, bankBin } = req.body;

      if (!accountNumber || !bankBin) {
        return res.status(400).json({ error: 'Missing accountNumber or bankBin', success: false });
      }

      console.log(`Looking up account: ${accountNumber} at bank ${bankBin}`);

      // Use VietQR API (free, works for most banks)
      const result = await mbbankApi.lookupAccountVietQR(accountNumber, bankBin);

      if (result.success) {
        res.json({
          success: true,
          accountNumber: result.accountNumber,
          accountName: result.accountName,
          bankBin: result.bankBin
        });
      } else {
        res.json({
          success: false,
          error: result.error || 'Account not found'
        });
      }
    } catch (error) {
      console.error('Lookup error:', error.message);
      res.status(500).json({ error: error.message, success: false });
    }
  });

  // =====================================================
  // LOOKUP ACCOUNT INFO (using MB Bank API - requires auth)
  // =====================================================
  app.post('/api/bank/mbbank/lookup', async (req, res) => {
    try {
      const { accountNumber, bankBin } = req.body;

      if (!accountNumber || !bankBin) {
        return res.status(400).json({ error: 'Missing accountNumber or bankBin', success: false });
      }

      const status = mbbankApi.getCredentialsStatus();
      if (!status.configured) {
        return res.status(400).json({ error: 'MB Bank credentials not configured', success: false });
      }

      console.log(`MB Bank lookup: ${accountNumber} at bank ${bankBin}`);

      const result = await mbbankApi.lookupAccount(accountNumber, bankBin);

      if (result.success) {
        res.json({
          success: true,
          accountNumber: result.accountNumber,
          accountName: result.accountName,
          bankBin: result.bankBin
        });
      } else {
        res.json({
          success: false,
          error: result.error || 'Account not found'
        });
      }
    } catch (error) {
      console.error('MB Bank lookup error:', error.message);
      res.status(500).json({ error: error.message, success: false });
    }
  });

  console.log('   Bank API endpoints registered');
};
