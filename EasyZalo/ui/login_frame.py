# login_frame.py - Login Screen with QR Code
import customtkinter as ctk
import threading
import time


class LoginFrame(ctk.CTkFrame):
    """Login screen with QR code display and connection status"""

    def __init__(self, parent, app):
        super().__init__(parent, fg_color="#1a1a2e")
        self.app = app
        self.qr_image = None
        self._qr_running = False

        # ===== Center card =====
        card = ctk.CTkFrame(self, fg_color="#ffffff", corner_radius=20,
                            width=440, border_width=0)
        card.place(relx=0.5, rely=0.5, anchor="center")

        # Logo
        ctk.CTkLabel(card, text="🤖", font=("", 52)).pack(pady=(32, 4))
        ctk.CTkLabel(card, text="Easy Zalo", font=("Segoe UI", 30, "bold"),
                     text_color="#2B3A4E").pack()
        ctk.CTkLabel(card, text="Ứng dụng Zalo Desktop",
                     text_color="#64748b", font=("Segoe UI", 13)).pack(pady=(0, 16))

        # QR Frame
        qr_border = ctk.CTkFrame(card, fg_color="#f1f5f9", corner_radius=14,
                                  width=248, height=248)
        qr_border.pack(pady=8)
        qr_border.pack_propagate(False)

        self.qr_label = ctk.CTkLabel(qr_border, text="⏳\nĐang tải mã QR...",
                                      text_color="#94a3b8", font=("Segoe UI", 13))
        self.qr_label.pack(expand=True)

        # Status
        self.status_frame = ctk.CTkFrame(card, fg_color="transparent")
        self.status_frame.pack(pady=12)

        self.status_dot = ctk.CTkLabel(self.status_frame, text="●",
                                        text_color="#f59e0b", font=("", 14))
        self.status_dot.pack(side="left", padx=(0, 6))

        self.status_text = ctk.CTkLabel(self.status_frame, text="Đang kết nối...",
                                         text_color="#64748b", font=("Segoe UI", 12))
        self.status_text.pack(side="left")

        # Instructions
        instr = ctk.CTkFrame(card, fg_color="#f8fafc", corner_radius=10)
        instr.pack(padx=24, pady=(4, 8), fill="x")

        ctk.CTkLabel(instr, text="📱 Hướng dẫn đăng nhập",
                     font=("Segoe UI", 13, "bold"), text_color="#1a1a2e",
                     anchor="w").pack(padx=16, pady=(12, 6), anchor="w")

        steps = [
            "1. Mở ứng dụng Zalo trên điện thoại",
            "2. Vào Cài đặt → Thiết bị đã đăng nhập",
            "3. Nhấn Đăng nhập thiết bị mới",
            "4. Quét mã QR trên màn hình"
        ]
        for s in steps:
            ctk.CTkLabel(instr, text=s, text_color="#64748b",
                         font=("Segoe UI", 12), anchor="w").pack(padx=16, anchor="w")
        ctk.CTkLabel(instr, text="").pack(pady=3)

        # Footer
        ctk.CTkLabel(card, text=f"Easy Zalo v1.0 • Web Server: localhost:{self.app.config_port}",
                     text_color="#cbd5e1", font=("", 11)).pack(pady=(0, 20))

    def start_qr_refresh(self):
        """Start periodic QR refresh"""
        if not self._qr_running:
            self._qr_running = True
            self._refresh_qr()

    def stop_qr_refresh(self):
        self._qr_running = False

    def _refresh_qr(self):
        """Refresh QR code from web server"""
        if not self._qr_running or self.app.current_user:
            return

        # Load QR in background thread
        threading.Thread(target=self._load_qr_image, daemon=True).start()

        # Schedule next refresh
        self.after(3000, self._refresh_qr)

    def _load_qr_image(self):
        """Download QR image (runs in background thread)"""
        try:
            import requests
            from PIL import Image
            from io import BytesIO

            url = f'http://localhost:{self.app.config_port}/qr.png?t={int(time.time())}'
            r = requests.get(url, timeout=3)
            if r.status_code == 200:
                img = Image.open(BytesIO(r.content)).resize((220, 220), Image.LANCZOS)
                ctk_img = ctk.CTkImage(light_image=img, dark_image=img, size=(220, 220))
                # Update UI on main thread
                self.after(0, lambda: self._set_qr_image(ctk_img))
        except Exception:
            self.after(0, lambda: self.qr_label.configure(
                text="❌ Không tải được QR\nChạy: node docs/server.js",
                image=None
            ))

    def _set_qr_image(self, ctk_img):
        self.qr_image = ctk_img  # Keep reference
        self.qr_label.configure(image=ctk_img, text="")

    def update_status(self, connected):
        """Update connection status indicator"""
        if connected:
            self.status_dot.configure(text_color="#10b981")
            self.status_text.configure(text="Đã kết nối • Chờ quét mã QR...")
        else:
            self.status_dot.configure(text_color="#ef4444")
            self.status_text.configure(text="Chưa kết nối. Chạy: node docs/server.js")
