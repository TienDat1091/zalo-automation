# 📧 Hướng Dẫn Setup Google OAuth2 cho Email Manager

## ❌ Vấn đề Hiện Tại
Trước đây, email-manager cho phép nhập linh tinh mà không xác thực thực sự với Google.

## ✅ Giải Pháp: Google OAuth2
Bây giờ hệ thống yêu cầu **xác thực thực sự** với tài khoản Google của bạn.

## 📋 Các Bước Setup

### Bước 1: Tạo Google Cloud Project
1. Truy cập: https://console.cloud.google.com/
2. Đăng nhập với tài khoản Google
3. Click **"Chọn một dự án"** → **"Dự án mới"**
4. Nhập tên: `Zalo Automation Email`
5. Click **"Tạo"**

### Bước 2: Enable Gmail API
1. Tìm kiếm **"Gmail API"** ở thanh tìm kiếm
2. Click vào Gmail API
3. Click **"Enable"** (bật API)

### Bước 3: Tạo OAuth2 Credentials
1. Truy cập: https://console.cloud.google.com/apis/credentials
2. Click **"Tạo Credentials"** → **"OAuth client ID"**
3. Chọn **"Desktop app"** (Ứng dụng desktop)
4. Click **"Tạo"**
5. Một cửa sổ sẽ hiện ra với **Client ID** và **Client Secret**

### Bước 4: Tải Credentials
1. Click **"Tải JSON"** 
2. File sẽ được tải về là `client_secret_*.json`
3. Đổi tên file thành: `google-oauth-credentials.json`
4. **Sao chép file này vào thư mục gốc của dự án** (cùng cấp với `server.js`)

```
Zalo_Automation/
├── server.js
├── package.json
├── google-oauth-credentials.json  ← Đặt file ở đây
├── blocks/
├── public/
└── ...
```

### Bước 5: Cấu Hình Redirect URI (Nếu Cần)
1. Quay lại Google Cloud Console
2. Click vào OAuth client ID vừa tạo
3. Thêm **Authorized redirect URIs**:
   ```
   http://localhost:3000/api/email/auth/google/callback
   ```
4. Click **"Lưu"**

## 🚀 Sử Dụng

### Trong Email Manager
1. Mở: `http://localhost:3000/email-manager.html`
2. Click **"+ Thêm tài khoản"**
3. Click nút **"🔐 Liên kết với Google"**
4. Đăng nhập với tài khoản Gmail của bạn
5. Xác nhận quyền truy cập
6. Tài khoản sẽ được lưu **kèm Token từ Google**

## ✔️ Quyền được Cấp
Hệ thống yêu cầu các quyền sau:
- **Gmail Send**: Gửi email
- **Gmail Read**: Đọc email (tuỳ chọn)
- **User Info**: Lấy tên và email của người dùng

## 🔒 Bảo Mật
- ✅ Token được lưu **an toàn** trong database
- ✅ Không lưu mật khẩu
- ✅ Token có thể **refresh** tự động
- ✅ Có thể **hủy** quyền truy cập bất kỳ lúc nào tại Google Account

## 📝 Ghi Chú
- Nếu quên lưu file `google-oauth-credentials.json`, sẽ thấy lỗi:
  ```
  ⚠️ Could not load google-oauth-credentials.json
  ```
- Kiểm tra console server xem có lỗi gì không
- Có thể tạo nhiều OAuth client ID cho các chế độ khác nhau

## 💡 Troubleshooting

### Lỗi: "Redirect URI mismatch"
**Giải pháp**: Kiểm tra redirect URI trong Google Cloud Console phải chính xác

### Lỗi: "Invalid Client"
**Giải pháp**: Kiểm tra credentials.json có đúng không, đặt ở vị trí đúng

### Lỗi: "Token expired"
**Giải pháp**: Hệ thống sẽ tự động refresh token

---

**Sau khi setup xong, email của bạn sẽ được xác thực 100% với Google! 🎉**
