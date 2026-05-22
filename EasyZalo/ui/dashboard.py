# dashboard.py - Main Dashboard (Header + Sidebar + Chat)
import customtkinter as ctk
# Use VirtualSidebar for 1000+ friends without UI freeze
from ui.virtual_sidebar import VirtualSidebar as Sidebar
from ui.chat_panel import ChatPanel


class DashboardFrame(ctk.CTkFrame):
    """Main dashboard with header, sidebar, and chat panel"""

    def __init__(self, parent, app):
        super().__init__(parent, fg_color="#E8ECF1", corner_radius=0)
        self.app = app

        # ===== HEADER =====
        header = ctk.CTkFrame(self, fg_color="#2B3A4E", height=56, corner_radius=0)
        header.pack(fill="x")
        header.pack_propagate(False)

        # Logo
        ctk.CTkLabel(header, text="🤖", font=("", 22),
                     text_color="white").pack(side="left", padx=(16, 6))
        ctk.CTkLabel(header, text="Easy Zalo", font=("Segoe UI", 17, "bold"),
                     text_color="white").pack(side="left", padx=(0, 16))

        # Connection status
        status_frame = ctk.CTkFrame(header, fg_color="#3d4f63", corner_radius=14, height=28)
        status_frame.pack(side="left", padx=4)
        status_frame.pack_propagate(False)

        self.conn_dot = ctk.CTkLabel(status_frame, text="●",
                                      text_color="#10b981", font=("", 12))
        self.conn_dot.pack(side="left", padx=(10, 4), pady=4)

        self.conn_text = ctk.CTkLabel(status_frame, text="Đã kết nối",
                                       text_color="white", font=("Segoe UI", 11))
        self.conn_text.pack(side="left", padx=(0, 10), pady=4)

        # ===== AUTO-REPLY TOGGLES (like web app's header) =====
        toggles_frame = ctk.CTkFrame(header, fg_color="#3d4f63", corner_radius=12, height=32)
        toggles_frame.pack(side="left", padx=12)
        toggles_frame.pack_propagate(False)

        # Cá nhân toggle
        ctk.CTkLabel(toggles_frame, text="Cá nhân", text_color="#cbd5e1",
                     font=("Segoe UI", 11)).pack(side="left", padx=(10, 4), pady=4)
        self.user_ar_switch = ctk.CTkSwitch(
            toggles_frame, text="", width=36, height=18,
            switch_width=34, switch_height=17,
            progress_color="#10b981",
            command=lambda: self._toggle_builtin('user'))
        self.user_ar_switch.pack(side="left", padx=(0, 10), pady=4)
        self.user_ar_switch.select()

        # Separator
        ctk.CTkFrame(toggles_frame, fg_color="#566a7f", width=1, height=18).pack(side="left", pady=7)

        # Nhóm toggle
        ctk.CTkLabel(toggles_frame, text="Nhóm", text_color="#cbd5e1",
                     font=("Segoe UI", 11)).pack(side="left", padx=(10, 4), pady=4)
        self.group_ar_switch = ctk.CTkSwitch(
            toggles_frame, text="", width=36, height=18,
            switch_width=34, switch_height=17,
            progress_color="#10b981",
            command=lambda: self._toggle_builtin('group'))
        self.group_ar_switch.pack(side="left", padx=(0, 10), pady=4)
        self.group_ar_switch.select()

        # ===== User info (right side) =====
        self.user_frame = ctk.CTkFrame(header, fg_color="transparent")
        self.user_frame.pack(side="right", padx=16)

        self.user_name = ctk.CTkLabel(self.user_frame, text="",
                                       text_color="white", font=("Segoe UI", 13, "bold"))
        self.user_name.pack(side="left", padx=(0, 6))

        self.user_uid_label = ctk.CTkLabel(self.user_frame, text="",
                                            text_color="#a0aec0", font=("Segoe UI", 10))
        self.user_uid_label.pack(side="left")

        # Nút Kịch bản
        self.triggers_btn = ctk.CTkButton(self.user_frame, text="🤖 Kịch bản",
                                           width=80, height=28, fg_color="#3b82f6", hover_color="#2563eb",
                                           font=("Segoe UI", 12), command=self._open_triggers)
        self.triggers_btn.pack(side="left", padx=(10, 5))

        self.features_btn = ctk.CTkButton(self.user_frame, text="Features",
                                           width=82, height=28, fg_color="#0f766e", hover_color="#0d5f59",
                                           font=("Segoe UI", 12), command=self._open_features)
        self.features_btn.pack(side="left", padx=(5, 5))

        # Nút Đăng xuất
        self.logout_btn = ctk.CTkButton(self.user_frame, text="🚪 Đăng xuất",
                                         width=90, height=28, fg_color="#ef4444", hover_color="#dc2626",
                                         font=("Segoe UI", 12), command=self._logout)
        self.logout_btn.pack(side="left", padx=(5, 0))

        # ===== BODY (Sidebar + Chat) =====
        body = ctk.CTkFrame(self, fg_color="transparent", corner_radius=0)
        body.pack(fill="both", expand=True)

        # Sidebar
        self.sidebar = Sidebar(body, app)
        self.sidebar.pack(side="left", fill="y")

        # Separator
        ctk.CTkFrame(body, fg_color="#e2e8f0", width=1, corner_radius=0).pack(side="left", fill="y")

        # Chat Panel
        self.chat_panel = ChatPanel(body, app)
        self.chat_panel.pack(side="left", fill="both", expand=True)

        # Notification toast area
        self._notification_label = None

    def update_user(self, user):
        if user:
            name = user.get('name') or user.get('displayName') or 'User'
            uid = user.get('uid', '')
            self.user_name.configure(text=name)
            self.user_uid_label.configure(text=uid)

    def update_connection(self, connected):
        if connected:
            self.conn_dot.configure(text_color="#10b981")
            self.conn_text.configure(text="Đã kết nối")
        else:
            self.conn_dot.configure(text_color="#ef4444")
            self.conn_text.configure(text="Mất kết nối")

    def _toggle_builtin(self, scope):
        """Toggle built-in auto-reply (user or group)"""
        if scope == 'user':
            enabled = bool(self.user_ar_switch.get())
        else:
            enabled = bool(self.group_ar_switch.get())

        self.app.ws.send({
            'type': 'save_builtin_trigger_state',
            'scope': scope,
            'enabled': enabled
        })

    def update_builtin_toggles(self, user_enabled=True, group_enabled=True):
        """Update toggle states from server data"""
        if user_enabled:
            self.user_ar_switch.select()
        else:
            self.user_ar_switch.deselect()

        if group_enabled:
            self.group_ar_switch.select()
        else:
            self.group_ar_switch.deselect()

    def show_notification(self, sender, message):
        """Show in-app notification for new message"""
        if self._notification_label:
            self._notification_label.destroy()

        text = f"💬 {sender}: {message[:50]}"
        self._notification_label = ctk.CTkLabel(
            self, text=text, fg_color="#1a1a2e", text_color="white",
            corner_radius=10, font=("Segoe UI", 12), height=40,
            padx=20)
        self._notification_label.place(relx=0.5, y=66, anchor="n")

        self.after(4000, self._hide_notification)

    def _hide_notification(self):
        if self._notification_label:
            self._notification_label.destroy()
            self._notification_label = None

    def _open_triggers(self):
        """Open auto-reply triggers management modal"""
        from ui.triggers_panel import TriggersPanel
        TriggersPanel(self.app, self.app.db)

    def _open_features(self):
        """Open web-backed feature center."""
        from ui.feature_hub import FeatureHub
        FeatureHub(self.app)

    def _logout(self):
        """Handle logout command"""
        self.app.ws.send({'type': 'logout'})
        self.app.current_user = None
        self.app._show_login()
