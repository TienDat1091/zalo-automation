# Development Guide - Hướng dẫn phát triển Local

## Chạy Server với Auto-Reload

### Cách 1: Auto-reload Frontend + Backend (Khuyến nghị)
```bash
npm run dev:sync
```

**Truy cập:** http://localhost:3001

**Tự động reload khi:**
- ✅ Sửa file HTML/CSS/JS trong `public/` → Browser tự động reload
- ✅ Sửa file backend (server.js, websocket.js) → Server tự restart → Trang tự reload

**Cách hoạt động:**
- Nodemon watch backend files → auto restart server
- Browser-Sync watch frontend files → auto reload browser
- Auto-reconnect script detect server restart → auto reload page

---

### Cách 2: Chỉ auto-restart Backend
```bash
npm run dev
```

**Truy cập:** http://localhost:3000

**Tự động:**
- ✅ Sửa backend → Server tự restart
- ❌ Cần F5 thủ công để reload trang

---

### Cách 3: Chạy bình thường (Production mode)
```bash
npm start
```

**Truy cập:** http://localhost:3000

Không có auto-reload, giống production.

---

## Quy trình làm việc

### 1. Khởi động Development Server
```bash
cd docs
npm run dev:sync
```

### 2. Sửa Code

#### Frontend (HTML/CSS/JavaScript):
```
Mở file: docs/public/trigger-manager.html
Sửa code → Ctrl+S (Save)
→ Browser tự động reload ngay lập tức ✨
```

#### Backend (Node.js):
```
Mở file: docs/server.js hoặc docs/system/websocket.js
Sửa code → Ctrl+S (Save)
→ Server tự động restart
→ Browser tự động reload sau 2 giây ✨
```

### 3. Test
- Thay đổi hiển thị ngay trên browser
- Không cần F5 thủ công
- Console logs xuất hiện trong terminal

### 4. Commit Changes
```bash
git add .
git commit -m "Your changes"
git push origin main
```

---

## Files quan trọng

### Development Config:
- `package.json` - NPM scripts (dev, dev:sync, start)
- `nodemon.json` - Nodemon configuration (watch files)
- `.vscode/settings.json` - VSCode Live Server config

### Auto-Reload:
- `public/assets/auto-reconnect.js` - Auto reconnect WebSocket khi server restart

### Server:
- `server.js` - Main HTTP server + Express routes
- `system/websocket.js` - WebSocket server + Database init
- `triggerDB.js` - Database operations

---

## Các công cụ được dùng

### Nodemon
- Auto-restart server khi file backend thay đổi
- Watch: `server.js`, `system/**/*.js`, `blocks/**/*.js`, `chat-function/**/*.js`
- Ignore: `node_modules/`, `data/`, `public/`

### Browser-Sync
- Proxy localhost:3000 → localhost:3001
- Auto-reload browser khi file frontend thay đổi
- Watch: `public/**/*`
- Inject live-reload script vào HTML

### Concurrently
- Chạy đồng thời Nodemon và Browser-Sync
- Output logs từ cả 2 processes

---

## Troubleshooting

### Port đã bị chiếm
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Hoặc đổi port trong server.js
const PORT = process.env.PORT || 3001;
```

### Browser không auto-reload
1. Kiểm tra console có lỗi không (F12)
2. Đảm bảo truy cập qua port 3001 (không phải 3000)
3. Hard refresh: `Ctrl + Shift + R`

### Server không auto-restart
1. Kiểm tra nodemon đã cài: `npm list nodemon`
2. Kiểm tra file có trong watch list không (xem `nodemon.json`)
3. Restart thủ công: `Ctrl+C` → `npm run dev:sync`

### WebSocket không reconnect
1. Kiểm tra `auto-reconnect.js` đã load: Console → Network tab
2. Kiểm tra `/api/health` endpoint hoạt động: http://localhost:3000/api/health
3. Xem console logs: `🔌 WebSocket closed, attempting to reconnect...`

---

## Tips

### 1. VSCode Auto Save
Bật auto save để không cần Ctrl+S:
```
File → Auto Save (tick)
```

Hoặc Settings:
```json
{
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 1000
}
```

### 2. Multiple Terminals
Mở 2 terminals:
- Terminal 1: `npm run dev:sync` (server)
- Terminal 2: Git commands, npm install, v.v.

### 3. Clear Console
- `Ctrl + K` - Clear terminal
- `Ctrl + L` - Clear terminal (Linux style)

### 4. Quick Restart
Khi cần restart nhanh:
- Trong terminal chạy server: `rs` + Enter (nodemon restart)

---

## Deployment

### Trước khi push lên Render:
1. Test với production mode:
```bash
npm start
```

2. Kiểm tra không có dev dependencies trong production code

3. Commit và push:
```bash
git add .
git commit -m "Feature: ..."
git push origin main
```

Render sẽ tự động deploy và chạy `npm start`.

---

## Environment Variables

### Local Development:
Không cần set env vars, mọi thứ sẽ dùng default:
- PORT: 3000
- Database: SQLite (docs/data/triggers.db)
- Backup: Disabled

### Production (Render):
Set trong Render Dashboard → Environment:
- `PORT` - Auto set bởi Render
- `GITHUB_BACKUP_TOKEN` - Token để backup database
- `RENDER` - Auto set bởi Render
- `RENDER_EXTERNAL_URL` - Auto set bởi Render

---

Chúc code vui! 🚀
