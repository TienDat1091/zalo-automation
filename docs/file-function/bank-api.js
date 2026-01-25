// bank-api.js - API endpoints cho Bank Account Lookup
// ============================================

const fs = require('fs');
const path = require('path');
const mbbankApi = require('../system/mbbank-api');

// Path to store MB Bank credentials
const MBBANK_CREDENTIALS_PATH = path.join(__dirname, '..', 'mbbank-credentials.json');
const VIETQR_CREDENTIALS_PATH = path.join(__dirname, '..', 'vietqr-credentials.json');

// Load MB credentials
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

// Load VietQR credentials
try {
  if (fs.existsSync(VIETQR_CREDENTIALS_PATH)) {
    const creds = JSON.parse(fs.readFileSync(VIETQR_CREDENTIALS_PATH, 'utf8'));
    if (creds.apiKey) {
      mbbankApi.setVietQRKey(creds.apiKey, creds.clientId || '');
      console.log('VietQR credentials loaded');
    }
  }
} catch (e) {
  console.warn('Could not load VietQR credentials:', e.message);
}

module.exports = function (app, triggerDB, apiState) {
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
  // GET VIETQR CREDENTIALS STATUS
  // =====================================================
  app.get('/api/bank/vietqr/status', (req, res) => {
    try {
      const creds = fs.existsSync(VIETQR_CREDENTIALS_PATH)
        ? JSON.parse(fs.readFileSync(VIETQR_CREDENTIALS_PATH, 'utf8'))
        : {};

      res.json({
        configured: !!creds.apiKey,
        apiKey: creds.apiKey ? creds.apiKey.substring(0, 8) + '...' : null,
        clientId: creds.clientId ? creds.clientId.substring(0, 8) + '...' : null
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // SAVE VIETQR CREDENTIALS
  // =====================================================
  app.post('/api/bank/vietqr/credentials', (req, res) => {
    try {
      const { apiKey, clientId } = req.body;

      if (!apiKey) {
        return res.status(400).json({ error: 'Missing apiKey', success: false });
      }

      // Save to file
      fs.writeFileSync(VIETQR_CREDENTIALS_PATH, JSON.stringify({ apiKey, clientId }, null, 2), 'utf8');

      // Update in memory
      mbbankApi.setVietQRKey(apiKey, clientId);

      console.log('VietQR credentials saved');

      res.json({
        success: true,
        message: 'VietQR credentials saved successfully'
      });
    } catch (error) {
      console.error('Save VietQR credentials error:', error.message);
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

  // =====================================================
  // TRANSACTIONS CRUD
  // =====================================================
  app.get('/api/transactions', (req, res) => {
    try {
      const userUID = req.query.userUID;
      const transactions = triggerDB.getAllTransactions(userUID);
      res.json({ success: true, transactions });
    } catch (error) {
      res.status(500).json({ error: error.message, success: false });
    }
  });

  app.delete('/api/transactions/:id', (req, res) => {
    try {
      const success = triggerDB.deleteTransaction(parseInt(req.params.id));
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: error.message, success: false });
    }
  });

  // =====================================================
  // PAYMENT GATES CRUD
  // =====================================================
  app.get('/api/payment-gates', (req, res) => {
    try {
      const userUID = req.query.userUID;
      const gates = triggerDB.getAllPaymentGates(userUID);
      res.json({ success: true, gates });
    } catch (error) {
      res.status(500).json({ error: error.message, success: false });
    }
  });

  app.post('/api/payment-gates', (req, res) => {
    try {
      const userUID = req.body.userUID || apiState.currentUser?.uid || 'system';
      const data = {
        gateName: req.body.gateName,
        bankCode: req.body.bankCode,
        accountNumber: req.body.accountNumber,
        accountName: req.body.accountName,
        isDefault: req.body.isDefault || 0
      };

      console.log('📬 POST /api/payment-gates - Request Body:', JSON.stringify(req.body));
      const gate = triggerDB.createPaymentGate(userUID, data);
      res.json({ success: true, gate });
    } catch (error) {
      console.error('❌ POST /api/payment-gates error:', error.message);
      res.status(500).json({ error: error.message, success: false });
    }
  });

  app.post('/api/payment-gates/:id/set-default', (req, res) => {
    try {
      const userUID = req.body.userUID || apiState.currentUser?.uid || 'system';
      const success = triggerDB.setDefaultGate(userUID, parseInt(req.params.id));
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: error.message, success: false });
    }
  });

  app.delete('/api/payment-gates/:id', (req, res) => {
    try {
      const success = triggerDB.deletePaymentGate(parseInt(req.params.id));
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: error.message, success: false });
    }
  });

  console.log('   ✓ GET /api/transactions');
  console.log('   ✓ DELETE /api/transactions/:id');
  console.log('   ✓ GET /api/payment-gates');
  console.log('   ✓ POST /api/payment-gates');
  console.log('   ✓ POST /api/payment-gates/:id/set-default');
  console.log('   ✓ DELETE /api/payment-gates/:id');
  console.log('   Bank API endpoints registered');
};
