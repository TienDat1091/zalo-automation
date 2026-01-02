const http = require('http');
const fs = require('fs');
const path = require('path');

const { loginZalo } = require('./loginZalo');
const { startWebSocketServer } = require('./websocket');
const { loadFriends } = require('./friends');

// API state dùng chung
const apiState = {
  api: null,
  currentUser: null,
  isLoggedIn: false,
  messageStore: new Map(),
  clients: new Set()
};

// Gắn hàm loginZalo vào apiState để WS có thể gọi khi logout
apiState.loginZalo = () => loginZalo(apiState);

// MIME types cho static files
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf'
};

// Helper function to serve files
const serveFile = (filePath, contentType, res) => {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`❌ ${err.message}`);
      return;
    }
    res.writeHead(200, { 
      'Content-Type': `${contentType}; charset=utf-8`,
      'Cache-Control': contentType.startsWith('image/') ? 'public, max-age=86400' : 'no-cache'
    });
    res.end(data);
  });
};

// HTTP server
const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  
  // Remove trailing slash (except for root)
  if (url !== '/' && url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  console.log(`📥 Request: ${req.method} ${url}`);

  // ============================================
  // MAIN PAGES
  // ============================================
  
  // Index / Login page
  if (url === '/' || url === '/index.html') {
    serveFile(path.join(__dirname, 'public', 'index.html'), 'text/html', res);
  }
  
  // Dashboard
  else if (url === '/dashboard.html') {
    serveFile(path.join(__dirname, 'public', 'dashboard.html'), 'text/html', res);
  }
  
  // ============================================
  // AUTO REPLY & TRIGGER MANAGEMENT
  // ============================================

  
  // NEW: Trigger Manager (main page)
  else if (url === '/trigger-manager.html') {
    serveFile(path.join(__dirname, 'public', 'trigger-manager.html'), 'text/html', res);
  }
  
  // NEW: Trigger Builder (flow design page - opens in new tab)
  else if (url === '/trigger-builder.html') {
    serveFile(path.join(__dirname, 'public', 'trigger-builder.html'), 'text/html', res);
  }
  
  // TEST: Debug page for trigger builder
  else if (url === '/test-trigger-builder.html') {
    serveFile(path.join(__dirname, 'public', 'test-trigger-builder.html'), 'text/html', res);
  }
  
  // Bank Manager
  else if (url === '/bank-manager.html') {
    serveFile(path.join(__dirname, 'public', 'bank-manager.html'), 'text/html', res);
  }
  
  // ============================================
  // UTILITY PAGES
  // ============================================
  
  
  // Storage info
  else if (url === '/storage-info.html') {
    serveFile(path.join(__dirname, 'public', 'storage-info.html'), 'text/html', res);
  }

  // JavaScript files
  else if (url.startsWith('/assets/') || url.startsWith('/js/') || url.endsWith('.js')) {
    const filePath = path.join(__dirname, 'public', url);
    serveFile(filePath, 'application/javascript', res);
  }
  
  // CSS files
  else if (url.startsWith('/css/') || url.endsWith('.css')) {
    const filePath = path.join(__dirname, 'public', url);
    serveFile(filePath, 'text/css', res);
  }
  
  // Images
  else if (url.startsWith('/images/') || url.startsWith('/img/')) {
    const filePath = path.join(__dirname, 'public', url);
    const ext = path.extname(url).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    serveFile(filePath, contentType, res);
  }
  
  // QR code (special handling - root level)
  else if (url === '/qr.png') {
    const qrPath = path.join(__dirname, 'qr.png');
    fs.access(qrPath, fs.constants.F_OK, err => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end("QR đang tạo...");
        return;
      }
      fs.readFile(qrPath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end("Không tìm thấy QR");
          return;
        }
        res.writeHead(200, { 
          'Content-Type': 'image/png', 
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(data);
      });
    });
  }
  
  // ============================================
  // FALLBACK: Try to serve any file from public directory
  // ============================================
  else {
    const filePath = path.join(__dirname, 'public', url);
    const ext = path.extname(url).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
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
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
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
        return;
      }
      serveFile(filePath, contentType, res);
    });
  }
});

// Chạy HTTP server
server.listen(3000, () => {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║              🚀 ZALO MESSENGER SERVER - RUNNING                    ║");
  console.log("╠═══════════════════════════════════════════════════════════════════╣");
  console.log("");
  console.log("📡 WebSocket Server: ws://localhost:8080");
  console.log("✅ Server is ready to accept connections!");
  console.log("");
  
  // Khởi động WebSocket server
  startWebSocketServer(apiState);
  
  // Khởi động Zalo login
  loginZalo(apiState);
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
  console.log("\n🛑 Shutting down server...");
  server.close(() => {
    console.log("✅ Server closed successfully");
    process.exit(0);
  });
});