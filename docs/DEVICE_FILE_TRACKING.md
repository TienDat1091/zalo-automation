# 📱 Device File Tracking - Tracking File Trên Các Thiết Bị Khác Nhau

## 🎯 Mục Đích
Theo dõi file được lưu trên thiết bị nào và hiển thị trạng thái file đó khi truy cập từ các thiết bị khác nhau.

## 🔧 Cách Thực Hiện

### 1. Device Identification
Mỗi thiết bị được gán một ID duy nhất:
```javascript
// Được tạo lần đầu và lưu vào localStorage
deviceId = "device_1707000000000_abc123def45"
```

### 2. File Metadata Lưu Trong IndexedDB
Khi file được nhận và lưu vào IndexedDB, nó sẽ bao gồm:
```javascript
{
  msgId: "msg_12345",
  fileData: { fileName: "document.pdf", ... },
  // ✅ Device Tracking Fields
  deviceId: "device_1707000000000_abc123def45",
  deviceName: "Windows",
  hasFileDataLocally: true,
  fileDataDeviceId: "device_1707000000000_abc123def45",
  fileDataDeviceName: "Windows"
}
```

### 3. Trạng Thái File Hiển Thị

#### 📂 Trạng Thái 1: File Có Trên Thiết Bị Hiện Tại
```
[📄] document.pdf (2.5 MB)
👁️ Xem   ⬇️ Tải
```
**Hiển thị**: Bình thường, có nút Xem và Tải

#### ⚠️ Trạng Thái 2: File Đã Lưu Vào Thiết Bị Khác
```
⚠️
📁 document.pdf
💾 File đã lưu vào thiết bị khác: Windows
Dung lượng: 2.5 MB
```
**Hiển thị**: Cảnh báo vàng, không có nút Xem/Tải

#### ❌ Trạng Thái 3: File Không Khả Dụng
```
❌
📁 document.pdf
Dữ liệu file không khả dụng trên bất kỳ thiết bị nào
```
**Hiển thị**: Lỗi đỏ, file metadata có nhưng dữ liệu không có

## 📊 Sơ Đồ Luồng

```
File nhận được
    ↓
Lưu vào IndexedDB (Thiết bị A)
    ↓
Thêm device tracking:
  - deviceId: device_A
  - deviceName: "Windows"
  - hasFileDataLocally: true
    ↓
User đăng nhập thiết bị B
    ↓
Tải message history từ server
    ↓
Kiểm tra: fileDataDeviceId === currentDeviceId?
    ├─ YES → Hiển thị nút Xem/Tải
    └─ NO → Hiển thị "File đã lưu vào thiết bị khác: Windows"
```

## 🔑 Hàm Chính

### `getDeviceId()`
Lấy hoặc tạo ID duy nhất cho thiết bị
```javascript
const deviceId = getDeviceId();
// Returns: "device_1707000000000_abc123def45"
```

### `getDeviceName()`
Phát hiện tên hệ điều hành
```javascript
const deviceName = getDeviceName();
// Returns: "Windows", "Mac", "Linux", "iOS", "Android"
```

### `autoSaveToIndexedDB(uid, message)`
Tự động lưu message với device tracking
```javascript
autoSaveToIndexedDB(selectedFriend.userId, messageObject);
// Sẽ tự động thêm:
// - deviceId
// - deviceName  
// - hasFileDataLocally
// - fileDataDeviceId
// - fileDataDeviceName
```

## 💾 Lưu Trữ LocalStorage

Device ID được lưu vĩnh viễn:
```javascript
localStorage.deviceId = "device_1707000000000_abc123def45"
```

## 🧪 Kiểm Tra

### Test Case 1: Nhận File Trên Thiết Bị A
1. Đăng nhập trên Thiết Bị A
2. Nhận file
3. Kiểm tra IndexedDB: `hasFileDataLocally = true`, `fileDataDeviceName = "Windows"`
4. ✅ File hiển thị với nút Xem/Tải

### Test Case 2: Truy Cập Từ Thiết Bị B
1. Đăng nhập trên Thiết Bị B (máy khác)
2. Xem tin nhắn lịch sử
3. ✅ File hiển thị: "File đã lưu vào thiết bị khác: Windows"
4. Không có nút Xem/Tải

### Test Case 3: Đăng Nhập Lại Thiết Bị A
1. Đăng nhập lại trên Thiết Bị A
2. Xem file cũ
3. ✅ File hiển thị bình thường (vì `fileDataDeviceId === currentDeviceId`)

## 📝 Cấu Trúc Message Object

```javascript
const message = {
  // Existing fields
  msgId: "msg_12345",
  content: "Gửi file...",
  timestamp: 1707000000000,
  senderId: "2118888339...",
  type: "file",
  fileData: {
    fileName: "document.pdf",
    fileType: "pdf",
    fileSize: 2621440,
    fileUrl: "base64_encoded_data"
  },
  
  // ✅ NEW: Device Tracking
  deviceId: "device_1707000000000_abc123def45",
  deviceName: "Windows",
  hasFileDataLocally: true,
  fileDataDeviceId: "device_1707000000000_abc123def45",
  fileDataDeviceName: "Windows"
}
```

## 🎨 CSS Styles

### File Có Sẵn
```css
background: #f5f5f5;
color: #333;
```

### File Trên Thiết Bị Khác
```css
background: #fff3cd;  /* Vàng */
border-left: 3px solid #ffc107;
```

### File Không Khả Dụng
```css
background: #f8d7da;  /* Đỏ nhạt */
border-left: 3px solid #dc3545;
```

## 🚀 Triển Khai

### Các File Được Cập Nhật:
1. **IndexedDB.js**
   - Thêm `getDeviceId()` và `getDeviceName()`
   - Cập nhật `autoSaveToIndexedDB()` thêm device tracking
   - Cập nhật `loadAllMessagesFromDB()` để preserve device fields

2. **load_data.js**
   - Thêm `getDeviceId()` helper
   - Cập nhật `renderMessages()` để check device status
   - 3 UI states cho file rendering

3. **dashboard.html**
   - Không cần thay đổi (khác biệt được xử lý tự động qua `autoSaveToIndexedDB`)

## 📱 Hỗ Trợ Thiết Bị

Device Detection hoạt động với:
- ✅ Windows
- ✅ Mac  
- ✅ Linux
- ✅ iOS
- ✅ Android
- ❓ Other (sẽ hiển thị "Unknown Device")

## 🔮 Tương Lai (Future Enhancements)

1. Cho phép re-download file từ thiết bị khác qua server
2. Sync file data qua cloud storage
3. Modal popup khi click file trên thiết bị khác
4. Device management panel để xem danh sách thiết bị
