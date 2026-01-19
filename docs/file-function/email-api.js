// email-api.js - API endpoints cho Email Management
// ============================================

const fs = require('fs');
const path = require('path');
const googleOAuth = require('../system/google-oauth');

module.exports = function(app, triggerDB) {
  console.log('📧 Registering Email API endpoints...');

  // =====================================================
  // GET GOOGLE OAUTH URL
  // =====================================================
  app.get('/api/email/auth/google/url', (req, res) => {
    try {
      const authUrl = googleOAuth.getAuthorizationUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error('❌ Get auth URL error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // GOOGLE OAUTH CALLBACK
  // =====================================================
  app.get('/api/email/auth/google/callback', async (req, res) => {
    try {
      const code = req.query.code;
      const state = req.query.state;

      if (!code) {
        return res.status(400).send('❌ Authorization code not provided');
      }

      // Exchange code for tokens
      const tokens = await googleOAuth.exchangeCodeForTokens(code);

      // Get user info
      const userInfo = await googleOAuth.getUserInfo(tokens.access_token);

      // Save sender to database
      const sender = triggerDB.createEmailSender({
        email: userInfo.email,
        displayName: userInfo.name || userInfo.email.split('@')[0],
        description: 'Liên kết thông qua Google OAuth2',
        refreshToken: tokens.refresh_token || '',
        accessToken: tokens.access_token || ''
      });

      if (!sender) {
        return res.status(400).send('❌ Tài khoản email này đã tồn tại. Hãy xóa tài khoản cũ trước.');
      }

      // Redirect back to email-manager with success
      const redirectUrl = `/email-manager.html?success=1&email=${encodeURIComponent(userInfo.email)}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ OAuth callback error:', error.message);
      res.status(500).send(`❌ Lỗi xác thực: ${error.message}`);
    }
  });

  // =====================================================
  // GET ALL SENDERS
  // =====================================================
  app.get('/api/email/senders', (req, res) => {
    try {
      const senders = triggerDB.getAllEmailSenders();
      res.json({ senders: senders || [] });
    } catch (error) {
      console.error('❌ Get senders error:', error.message);
      res.status(500).json({ error: 'Failed to get senders' });
    }
  });

  // =====================================================
  // ADD SENDER PROFILE (DEPRECATED - use OAuth instead)
  // =====================================================
  app.post('/api/email/senders', (req, res) => {
    try {
      const { email, displayName, description } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email is required', success: false });
      }

      // Note: This endpoint now requires OAuth tokens
      // For legacy support, only allow if refreshToken is provided
      const { refreshToken, accessToken } = req.body;
      
      if (!refreshToken || !accessToken) {
        return res.status(400).json({ 
          error: 'Vui lòng dùng nút "Liên kết Google" để xác thực OAuth2 thay vì nhập thủ công', 
          success: false 
        });
      }

      const sender = triggerDB.createEmailSender({
        email,
        displayName: displayName || '',
        description: description || '',
        refreshToken,
        accessToken
      });

      if (!sender) {
        return res.status(400).json({ error: 'Failed to create sender (email may already exist)', success: false });
      }

      res.json({ success: true, sender });
    } catch (error) {
      console.error('❌ Create sender error:', error.message);
      res.status(500).json({ error: 'Failed to create sender: ' + error.message, success: false });
    }
  });

  // =====================================================
  // DELETE SENDER
  // =====================================================
  app.delete('/api/email/senders/:id', (req, res) => {
    try {
      const success = triggerDB.deleteEmailSender(parseInt(req.params.id));
      res.json({ success });
    } catch (error) {
      console.error('❌ Delete sender error:', error.message);
      res.status(500).json({ error: 'Failed to delete sender' });
    }
  });

  // =====================================================
  // GET ALL RECIPIENTS
  // =====================================================
  app.get('/api/email/recipients', (req, res) => {
    try {
      const recipients = triggerDB.getAllEmailRecipients();
      res.json({ recipients: recipients || [] });
    } catch (error) {
      console.error('❌ Get recipients error:', error.message);
      res.status(500).json({ error: 'Failed to get recipients' });
    }
  });

  // =====================================================
  // ADD RECIPIENT
  // =====================================================
  app.post('/api/email/recipients', (req, res) => {
    try {
      const { email, name, company } = req.body;
      
      if (!email || !name) {
        return res.status(400).json({ error: 'Email and name are required', success: false });
      }

      const recipient = triggerDB.createEmailRecipient({
        email,
        name,
        company: company || ''
      });

      if (!recipient) {
        return res.status(400).json({ error: 'Failed to create recipient (email may already exist)', success: false });
      }

      res.json({ success: true, recipient });
    } catch (error) {
      console.error('❌ Create recipient error:', error.message);
      res.status(500).json({ error: 'Failed to create recipient: ' + error.message, success: false });
    }
  });

  // =====================================================
  // DELETE RECIPIENT
  // =====================================================
  app.delete('/api/email/recipients/:id', (req, res) => {
    try {
      const success = triggerDB.deleteEmailRecipient(parseInt(req.params.id));
      res.json({ success });
    } catch (error) {
      console.error('❌ Delete recipient error:', error.message);
      res.status(500).json({ error: 'Failed to delete recipient' });
    }
  });

  // =====================================================
  // GET EMAIL LOGS
  // =====================================================
  app.get('/api/email/logs', (req, res) => {
    try {
      const logs = triggerDB.getEmailLogs(100); // Last 100 emails
      res.json({ logs: logs || [] });
    } catch (error) {
      console.error('❌ Get logs error:', error.message);
      res.status(500).json({ error: 'Failed to get logs' });
    }
  });

  // =====================================================
  // GET LOG DETAIL
  // =====================================================
  app.get('/api/email/logs/:id', (req, res) => {
    try {
      const log = triggerDB.getEmailLogById(parseInt(req.params.id));
      if (!log) {
        return res.status(404).json({ error: 'Log not found' });
      }
      res.json({ log });
    } catch (error) {
      console.error('❌ Get log error:', error.message);
      res.status(500).json({ error: 'Failed to get log' });
    }
  });

  // =====================================================
  // SEND EMAIL (called from flow)
  // =====================================================
  app.post('/api/email/send', async (req, res) => {
    try {
      const { senderProfileId, recipientEmail, subject, body, htmlBody } = req.body;
      
      if (!senderProfileId || !recipientEmail || !subject) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Get sender profile with tokens
      const sender = triggerDB.getEmailSenderById(senderProfileId);
      if (!sender) {
        return res.status(404).json({ error: 'Sender profile not found' });
      }

      if (!sender.googleAccessToken || !sender.googleRefreshToken) {
        return res.status(400).json({ error: 'Sender profile not properly authenticated. Please re-authenticate with Google.' });
      }

      // Log email send attempt
      const log = triggerDB.createEmailLog({
        senderProfileId,
        recipientEmail,
        subject,
        body: body || htmlBody || '',
        status: 'pending',
        errorMessage: null
      });

      // Send email using Gmail API
      try {
        await googleOAuth.sendEmailViaGmail(
          sender.googleAccessToken,
          sender.googleRefreshToken,
          recipientEmail,
          subject,
          htmlBody || null,
          body || null
        );
        
        // Mark as success
        triggerDB.updateEmailLogStatus(log.id, 'success', null);
        res.json({ success: true, log, message: 'Email sent successfully' });
      } catch (sendError) {
        console.error('❌ Email send failed:', sendError.message);
        
        // Check if it's a token refresh issue
        if (sendError.message.includes('token') || sendError.message.includes('unauthorized')) {
          triggerDB.updateEmailLogStatus(log.id, 'failed', 'Token expired or invalid. Please re-authenticate.');
          return res.status(401).json({ 
            error: 'Authentication expired. Please re-authenticate the sender profile with Google.',
            log 
          });
        }
        
        // Mark as failed
        triggerDB.updateEmailLogStatus(log.id, 'failed', sendError.message);
        res.status(500).json({ error: sendError.message, log });
      }
    } catch (error) {
      console.error('❌ Send email error:', error.message);
      res.status(500).json({ error: 'Failed to send email: ' + error.message });
    }
  });

  // =====================================================
  // UPLOAD GOOGLE OAUTH CREDENTIALS JSON
  // =====================================================
  app.post('/api/email/upload-credentials', (req, res) => {
    try {
      const { credentials } = req.body;

      if (!credentials) {
        return res.status(400).json({ error: 'No credentials provided', success: false });
      }

      // Validate credentials structure
      const parsed = typeof credentials === 'string' ? JSON.parse(credentials) : credentials;

      // Check for web or installed app credentials
      const clientId = parsed.web?.client_id || parsed.installed?.client_id;
      const clientSecret = parsed.web?.client_secret || parsed.installed?.client_secret;

      if (!clientId || !clientSecret) {
        return res.status(400).json({
          error: 'File JSON không hợp lệ. Cần có client_id và client_secret trong web hoặc installed.',
          success: false
        });
      }

      // Save credentials to file
      const credentialsPath = path.join(__dirname, '..', 'google-oauth-credentials.json');
      fs.writeFileSync(credentialsPath, JSON.stringify(parsed, null, 2), 'utf8');

      console.log('✅ Google OAuth credentials saved to:', credentialsPath);

      // Reload credentials in google-oauth module
      try {
        // Clear require cache to reload module
        delete require.cache[require.resolve('../system/google-oauth')];
        // Re-require to load new credentials
        const reloadedOAuth = require('../system/google-oauth');
        console.log('✅ Google OAuth module reloaded');
      } catch (reloadErr) {
        console.warn('⚠️ Could not reload OAuth module:', reloadErr.message);
      }

      res.json({
        success: true,
        message: 'Credentials đã được lưu thành công!',
        clientId: clientId.substring(0, 20) + '...'
      });
    } catch (error) {
      console.error('❌ Upload credentials error:', error.message);
      res.status(500).json({ error: 'Failed to save credentials: ' + error.message, success: false });
    }
  });

  // =====================================================
  // CHECK CREDENTIALS STATUS
  // =====================================================
  app.get('/api/email/credentials-status', (req, res) => {
    try {
      const credentialsPath = path.join(__dirname, '..', 'google-oauth-credentials.json');
      const exists = fs.existsSync(credentialsPath);

      let info = null;
      if (exists) {
        try {
          const content = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
          const clientId = content.web?.client_id || content.installed?.client_id || '';
          info = {
            type: content.web ? 'Web Application' : 'Desktop Application',
            clientId: clientId ? clientId.substring(0, 30) + '...' : 'Unknown'
          };
        } catch (e) {
          info = { error: 'Invalid JSON file' };
        }
      }

      res.json({
        configured: exists,
        info
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log('   ✓ Email API endpoints registered');
};
