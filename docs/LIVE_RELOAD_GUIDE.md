# Live Reload Guide - Tự động reload trang khi sửa code

## Cách 1: Dùng Live Server Extension (VSCode) ⭐ KHUYẾN NGHỊ

### Bước 1: Cài đặt Live Server
1. Mở VSCode
2. Vào Extensions (Ctrl + Shift + X)
3. Tìm "**Live Server**" của Ritwick Dey
4. Click Install

### Bước 2: Chạy backend server
Mở terminal 1:
```bash
cd docs
npm run dev
```
→ Backend chạy ở **http://localhost:3000**

### Bước 3: Chạy Live Server
1. Mở file HTML bất kỳ trong `docs/public/` (ví dụ: index.html)
2. Click chuột phải → **"Open with Live Server"**
3. Hoặc click nút "Go Live" ở góc dưới bên phải VSCode

→ Live Server mở **http://localhost:5500**

### Bước 4: Code và xem tự động reload! ✨
- Sửa HTML/CSS/JS trong `public/` → **Tự động reload ngay lập tức!**
- Sửa backend (server.js) → Server tự restart (nodemon)
- WebSocket vẫn hoạt động bình thường qua port 3000

---

## Cách 2: Dùng Browser Extension (Chrome/Edge)

### Option A: Live Reload Extension
1. Cài extension: [LiveReload](https://chrome.google.com/webstore/detail/livereload/jnihajbhpnppcggbcgedagnkighmdlei)
2. Cài trong project:
```bash
npm install -g livereload
cd docs
livereload public/ -w 1000
```
3. Mở http://localhost:3000
4. Click icon LiveReload extension để enable

### Option B: Auto Refresh Plus
1. Cài extension: [Auto Refresh Plus](https://chrome.google.com/webstore/detail/auto-refresh-plus/hgeljhfekpckiiplhkigfehkdpldcggm)
2. Set refresh interval: 1-2 giây
3. Mở http://localhost:3000
4. Enable auto refresh

---

## Cách 3: Dùng nodemon + browser-sync (Full auto-reload)

### Bước 1: Thêm script vào package.json
File `docs/package.json`:
```json
{
  "scripts": {
    "dev:live": "concurrently \"nodemon server.js\" \"browser-sync start --proxy localhost:3000 --files 'public/**/*' --no-notify --no-open\""
  }
}
```

### Bước 2: Chạy
```bash
cd docs
npm run dev:live
```

### Bước 3: Truy cập
**http://localhost:3001** (Browser-Sync proxy)

**Auto reload:**
- ✅ Sửa frontend → Tự động reload
- ✅ Sửa backend → Server restart → Tự động reload

---

## So sánh các cách

| Cách | Frontend Auto-Reload | Backend Auto-Restart | WebSocket | Độ phức tạp |
|------|---------------------|---------------------|-----------|-------------|
| **Live Server (VSCode)** | ✅ Ngay lập tức | ✅ (nodemon) | ✅ | ⭐ Dễ nhất |
| Browser Extension | ✅ Định kỳ | ✅ (nodemon) | ✅ | ⭐⭐ Trung bình |
| Browser-Sync | ✅ Ngay lập tức | ✅ (nodemon) | ✅ | ⭐⭐⭐ Phức tạp |
| Manual F5 | ❌ Thủ công | ✅ (nodemon) | ✅ | ⭐ Đơn giản |

---

## Khuyến nghị

### Cho người mới bắt đầu:
→ **Live Server Extension** (Cách 1)
- Dễ setup nhất
- Không cần config gì thêm
- Reload cực nhanh
- Tích hợp sẵn trong VSCode

### Cho người có kinh nghiệm:
→ **Browser-Sync** (Cách 3)
- Auto reload mọi thứ
- Sync scroll, click giữa nhiều browser
- Test responsive trên nhiều thiết bị

### Nếu không muốn cài gì:
→ **Auto Refresh Extension** (Cách 2)
- Chỉ cần cài extension
- Refresh tự động theo interval
- Đơn giản, không config

---

## Setup hiện tại của project

File `.vscode/settings.json` đã được cấu hình:
```json
{
  "liveServer.settings.root": "/public",
  "liveServer.settings.port": 5500,
  "liveServer.settings.proxy": {
    "enable": true,
    "baseUri": "",
    "proxyUri": "http://localhost:3000"
  }
}
```

→ Live Server sẽ:
- Serve files từ `docs/public/`
- Chạy trên port 5500
- Proxy API calls tới port 3000
- Auto reload khi file thay đổi

---

## Troubleshooting

### Live Server không reload
1. Check file có được save không (Ctrl+S)
2. Check Live Server đang chạy (xem góc dưới: "Port: 5500")
3. Hard refresh: Ctrl+Shift+R

### WebSocket không connect khi dùng Live Server
→ Đã fix! `websocket-helper.js` luôn connect tới port 3000

### Port 5500 đã bị chiếm
Đổi port trong `.vscode/settings.json`:
```json
{
  "liveServer.settings.port": 5501
}
```

### Backend không auto-restart
Check nodemon đang chạy:
```bash
npm run dev
```

---

## Quick Start (Nhanh nhất)

```bash
# Terminal 1: Start backend
cd docs
npm run dev

# VSCode:
# 1. Mở file index.html
# 2. Click "Go Live" ở góc dưới bên phải
# 3. Browser tự mở http://localhost:5500
# 4. Sửa code → Tự động reload! ✨
```

---

Chúc code vui! 🚀
