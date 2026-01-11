# GitHub Backup Setup Guide

Hệ thống tự động backup SQLite database lên GitHub repository để tránh mất dữ liệu khi deploy lại trên Render.

## Tính năng

- ✅ Tự động restore database từ GitHub khi khởi động
- ✅ Auto-backup mỗi 5 phút (chỉ khi có thay đổi)
- ✅ Instant backup sau mỗi create/update/delete trigger
- ✅ Không backup nếu database không thay đổi (hash check)
- ✅ Export database ra JSON (backup bổ sung)

## Cách Setup

### Bước 1: Tạo GitHub Personal Access Token

1. Đi tới: https://github.com/settings/tokens
2. Click **"Generate new token (classic)"**
3. Đặt tên: `Zalo Automation Backup`
4. Chọn quyền: **`repo`** (Full control of private repositories)
5. Click **"Generate token"**
6. **Copy token** (chỉ hiện 1 lần duy nhất!)

### Bước 2: Thêm Token vào Render

1. Đi tới Render Dashboard: https://dashboard.render.com
2. Chọn service **zalo-automation**
3. Click tab **"Environment"**
4. Click **"Add Environment Variable"**
5. Thêm biến:
   - **Key**: `GITHUB_BACKUP_TOKEN`
   - **Value**: Paste token vừa copy (ghp_xxxxxxxxxxxx)
6. Click **"Save Changes"**

### Bước 3: Deploy lại

Render sẽ tự động deploy lại với backup system được kích hoạt.

## Cách hoạt động

### Khi khởi động (Render deploy)
```
1. Server start
2. Backup system check GITHUB_BACKUP_TOKEN
3. Nếu có token:
   - Setup git authentication
   - Pull latest từ GitHub (git pull origin main)
   - Restore docs/data/triggers.db nếu tìm thấy
4. Init database (tạo tables nếu cần)
5. Start WebSocket server
```

### Trong quá trình chạy
```
- Mỗi 5 phút: Check database có thay đổi không
  - Nếu có: git add + commit + push
  - Nếu không: Skip backup

- Khi create/update/delete trigger:
  - Thực hiện thao tác database
  - Wait 2 giây
  - Trigger instant backup
```

### Khi deploy lại
```
1. Render tạo container mới
2. Pull code từ GitHub
3. Backup system restore database từ GitHub
4. Tiếp tục với dữ liệu đã backup
```

## Kiểm tra Backup có hoạt động không

### Cách 1: Xem logs trên Render

Vào Render Dashboard → Service → Logs, tìm các dòng:

```
🔄 Initializing GitHub backup system...
🔐 Git authentication configured
✅ Database restored from GitHub
📦 Auto-backup every 5 minutes
✅ GitHub backup system initialized
```

Khi có thay đổi:
```
➕ Created trigger: 123
📤 Backing up database to GitHub...
✅ Database backed up to GitHub at 2026-01-11T10:30:00.000Z
```

### Cách 2: Kiểm tra GitHub commits

Vào repository: https://github.com/TienDat1091/zalo-automation/commits/main

Sẽ thấy các commits:
```
Auto-backup database - 2026-01-11T10:30:00.000Z
Auto-backup database - 2026-01-11T10:35:00.000Z
...
```

### Cách 3: Test restore

1. Tạo vài triggers
2. Chờ backup (xem logs)
3. Deploy lại service trên Render (Manual Deploy)
4. Check lại triggers còn hay không

## Nếu backup KHÔNG hoạt động

### Kiểm tra Token

Logs hiển thị:
```
⚠️  GitHub backup disabled (GITHUB_BACKUP_TOKEN not set)
```

**Giải pháp**: Kiểm tra lại Environment Variable trên Render

### Kiểm tra Git Permission

Logs hiển thị:
```
❌ Backup failed: Permission denied
```

**Giải pháp**:
- Token phải có quyền `repo`
- Repo phải là của bạn hoặc bạn có quyền push

### Database không restore

Logs hiển thị:
```
ℹ️  No backup found in GitHub, starting fresh
```

**Giải pháp**:
- Chưa có backup nào được tạo
- Tạo trigger mới để trigger backup đầu tiên

## Tắt Backup

Nếu muốn tắt backup, xóa environment variable `GITHUB_BACKUP_TOKEN` trên Render.

## Backup thủ công (Manual)

Nếu cần export database ra JSON:

```javascript
// Trong code, gọi:
const backup = require('./docs/system/backup');
const jsonPath = backup.exportDatabaseToJSON();
// Sẽ tạo file: docs/data/backup.json
```

## Lưu ý quan trọng

1. **Git conflicts**: Nếu bạn push code thủ công và backup system cũng push, có thể xảy ra conflict
   - Giải pháp: Luôn pull trước khi push thủ công

2. **Backup frequency**: 5 phút là khá thường xuyên, nếu muốn giảm:
   - Sửa trong `docs/system/backup.js`:
   - `const BACKUP_INTERVAL = 15 * 60 * 1000; // 15 minutes`

3. **Database size**: GitHub có giới hạn file 100MB
   - SQLite thường < 50MB cho hầu hết use cases
   - Nếu quá lớn, cân nhắc dùng PostgreSQL thay vì SQLite

4. **Private repository**: Nên để repo ở chế độ private vì database chứa dữ liệu người dùng

## Các file liên quan

- `docs/system/backup.js` - Backup system logic
- `docs/system/websocket.js` - Tích hợp backup triggers
- `docs/data/triggers.db` - SQLite database file
- `.gitignore` - Đảm bảo KHÔNG ignore `docs/data/triggers.db`

## Support

Nếu có vấn đề:
1. Check Render logs
2. Check GitHub commits
3. Verify token có quyền `repo`
4. Test local bằng cách set `GITHUB_BACKUP_TOKEN` trong terminal
