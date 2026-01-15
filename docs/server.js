const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');

const { loginZalo } = require('./loginZalo.js');
const { startWebSocketServer, triggerDB } = require('./system/websocket.js');
const { loadFriends } = require('./chat-function/friends.js');

// Create Express app
const app = express();
// Enable trust proxy for Render to get real client IP
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS for all origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const sessionManager = null; // SessionManager removed

// API state (Legacy/Global fallback)
const apiState = {
  api: null,
  currentUser: null,
  isLoggedIn: false,
  messageStore: new Map(),
  clients: new Set(),
  authorizedIP: null
};

// Start Global Fallback Login (optional, or remove if fully multi-user)
// apiState.loginZalo wrapper removed (using direct loginZalo call)

// Session & Zalo Session Middleware
const isSecure = process.env.RENDER || process.env.NODE_ENV === 'production';

app.use(session({
  secret: process.env.SESSION_SECRET || 'zalo-automation-secret-2026',
  resave: false,
  saveUninitialized: true, // Create session for new users
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: isSecure ? true : false, // Secure MUST be true on Render (HTTPS)
    httpOnly: true,
    sameSite: 'lax'
  },
  proxy: true // Trust the proxy
}));

// Session attachment middleware removed


// Simple IP check middleware cho dashboard và protected pages
// Updated to use req.zaloSession instead of global apiState
app.use((req, res, next) => {
  // Skip cho login page, static files, QR, API endpoints
  const skipPaths = ['/assets', '/qr.png', '/ping', '/health', '/api/'];
  if (req.path === '/' || skipPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  // Use session specific state
  const currentState = req.zaloSession || apiState;

  // STRICT PROTECTION
  if (!currentState.isLoggedIn) {
    return res.redirect('/');
  }

  // IP Lock Logic (Scoped to session)
  let clientIP = req.ip || req.connection.remoteAddress;
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) clientIP = forwarded.split(',')[0].trim();

  // If new session (just logged in), lock IP
  if (currentState.isLoggedIn && !currentState.authorizedIP) {
    currentState.authorizedIP = clientIP;
    console.log(`✅ Session ${req.sessionID} LOCKED to IP: ${clientIP}`);
  }

  next();
});


// Middleware
app.use((req, res, next) => {
  console.log(`📥 Request: ${req.method} ${req.path}`);
  next()
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/chat-function', express.static(path.join(__dirname, 'chat-function')));
app.use('/blocks', express.static(path.join(__dirname, 'blocks')));
app.use('/IndexedDB.js', (req, res) => res.sendFile(path.join(__dirname, 'IndexedDB.js')));

// Main page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/trigger-manager.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'trigger-manager.html')));
app.get('/trigger-builder.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'trigger-builder.html')));
app.get('/test-trigger-builder.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'test-trigger-builder.html')));
app.get('/file-manager.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'file-manager.html')));
app.get('/image-manager.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'image-manager.html')));
app.get('/table-manager.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'table-manager.html')));
app.get('/google-sheets-manager.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'google-sheets-manager.html')));
app.get('/bank-manager.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bank-manager.html')));
app.get('/ai-manager.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ai-manager.html')));
app.get('/trigger-notifications.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'trigger-notifications.html')));
app.get('/trigger-statistics.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'trigger-statistics.html')));
app.get('/storage-info.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'storage-info.html')));
app.get('/email-manager.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'email-manager.html')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    database: process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Keep-alive ping endpoint
app.get('/ping', (req, res) => {
  res.json({ pong: true, time: Date.now() });
});

// Endpoint to get client IP
app.get('/api/my-ip', (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  res.json({ ip: clientIP });
});

// QR code handler - check both working directory and __dirname
app.get('/qr.png', (req, res) => {
  // zca-js saves qr.png to current working directory
  const qrPathCwd = path.join(process.cwd(), 'qr.png');
  const qrPathDocs = path.join(__dirname, 'qr.png');

  // Try working directory first (when running from root: node docs/server.js)
  if (fs.existsSync(qrPathCwd)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(qrPathCwd);
    return;
  }

  // Fallback to __dirname (when running from docs: node server.js)
  if (fs.existsSync(qrPathDocs)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(qrPathDocs);
    return;
  }

  res.status(404).json({ error: 'QR code not found' });
});

// API for images
app.get('/api/images/:id', (req, res) => {
  try {
    const imageId = parseInt(req.params.id);
    if (!imageId) return res.status(400).json({ error: 'Invalid image ID' });

    const image = triggerDB.getImageById(imageId);
    if (!image) return res.status(404).json({ error: 'Image not found' });
    if (!fs.existsSync(image.filePath)) return res.status(404).json({ error: 'Image file not found on disk' });

    res.setHeader('Content-Type', image.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(image.filePath);
  } catch (error) {
    console.error('❌ Serve image error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Proxy endpoint để download file từ Zalo CDN (bypass 403)
app.get('/api/proxy-file', async (req, res) => {
  try {
    const fileUrl = req.query.url;
    const fileName = req.query.name || 'file';

    if (!fileUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    console.log(`📥 Proxying file: ${fileName} from ${fileUrl}`);

    // Fetch file from Zalo CDN
    const https = require('https');
    const http = require('http');
    const protocol = fileUrl.startsWith('https') ? https : http;

    protocol.get(fileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://chat.zalo.me/'
      }
    }, (response) => {
      if (response.statusCode === 200) {
        const contentType = response.headers['content-type'] || 'application/octet-stream';

        // ✅ Nếu mode=view thì inline, ngược lại download
        if (req.query.mode === 'view') {
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
        } else {
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        }
        res.setHeader('Content-Type', contentType);
        if (response.headers['content-length']) {
          res.setHeader('Content-Length', response.headers['content-length']);
        }
        response.pipe(res);
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        res.redirect(`/api/proxy-file?url=${encodeURIComponent(redirectUrl)}&name=${encodeURIComponent(fileName)}&mode=${req.query.mode || 'download'}`);
      } else {
        console.error(`❌ Proxy failed: ${response.statusCode}`);
        res.status(response.statusCode).json({ error: `Failed to fetch file: ${response.statusCode}` });
      }
    }).on('error', (err) => {
      console.error('❌ Proxy error:', err.message);
      res.status(500).json({ error: 'Failed to fetch file' });
    });
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register File & Template API endpoints
require('./file-function/file-api.js')(app, triggerDB);

// Register Email API endpoints
require('./file-function/email-api.js')(app, triggerDB);

// 404 handler
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>404 - Không tìm thấy trang</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }
        .container {
          text-align: center;
          padding: 40px;
        }
        .error-code {
          font-size: 120px;
          font-weight: bold;
          margin-bottom: 20px;
          text-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        h1 {
          font-size: 32px;
          margin-bottom: 16px;
        }
        p {
          font-size: 16px;
          opacity: 0.9;
          margin-bottom: 30px;
        }
        .btn {
          display: inline-block;
          padding: 12px 30px;
          background: white;
          color: #667eea;
          text-decoration: none;
          border-radius: 25px;
          font-weight: 600;
          transition: all 0.3s;
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.3);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="error-code">404</div>
        <h1>Không tìm thấy trang</h1>
        <p>Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển.</p>
        <a href="/" class="btn">🏠 Về trang chủ</a>
      </div>
    </body>
    </html>
  `);
});

// Create HTTP server from Express
const server = http.createServer(app);

// Use PORT from environment variable (for Render) or default to 3000
const PORT = process.env.PORT || 3000;

// Start listening
server.listen(PORT, () => {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║              🚀 ZALO MESSENGER SERVER - RUNNING                    ║");
  console.log("╠═══════════════════════════════════════════════════════════════════╣");
  console.log("");
  console.log(`🌐 HTTP Server: http://localhost:${PORT}`);
  console.log(`📡 WebSocket Server: Running on same port (${PORT})`);
  console.log("");
  console.log("📂 Đường dẫn trang chính:");
  console.log("   • Trang chủ: http://localhost:3000");
  console.log("   • Dashboard: http://localhost:3000/dashboard");
  console.log("   • Trigger Manager: http://localhost:3000/trigger-manager.html");
  console.log("   • Trigger Builder: http://localhost:3000/trigger-builder.html");
  console.log("   • File Manager: http://localhost:3000/file-manager.html");
  console.log("");
  console.log("📋 API Endpoints:");
  console.log("   • GET /api/files/:id - Serve file by ID");
  console.log("   • GET /api/templates/:id/generate - Generate template");
  console.log("");
  console.log("✅ Server is ready to accept connections!");
  console.log("");

  // Start WebSocket server on the same HTTP server
  startWebSocketServer(apiState, server);

  // Start Zalo login
  loginZalo(apiState);

  // Self-ping to prevent Render from spinning down (only on production)
  if (process.env.RENDER) {
    const SELF_URL = process.env.RENDER_EXTERNAL_URL || `https://zalo-automation.onrender.com`;
    console.log("🏓 Keep-alive enabled - pinging every 10 minutes");

    setInterval(() => {
      fetch(`${SELF_URL}/ping`)
        .then(res => res.json())
        .then(() => console.log('🏓 Keep-alive ping successful'))
        .catch(err => console.log('⚠️  Keep-alive ping failed:', err.message));
    }, 10 * 60 * 1000); // 10 minutes
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log("\n🛑 Shutting down server...");
  server.close(() => {
    console.log("✅ Server closed successfully");
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log("\n🛑 Server terminating...");
  process.exit(0);
});

module.exports = { app, apiState };