# app.py - Easy Zalo Desktop Application (Native Python GUI)
# Uses CustomTkinter for native desktop interface
# Auto-starts Node.js server when launched
import sys
import os
import time
import subprocess
import threading
import requests

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# Add project to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import customtkinter as ctk
import config
from server.database import Database
from server.ws_client import ZaloWSClient
from server.watchdog import AppWatchdog
from ui.login_frame import LoginFrame
from ui.dashboard import DashboardFrame
from ui.virtual_sidebar import VirtualSidebar

# Appearance
ctk.set_appearance_mode("light")
ctk.set_default_color_theme("blue")


def is_server_running(port=3000):
    """Check if Node.js server is already running"""
    try:
        r = requests.get(f'http://localhost:{port}/api/session-status', timeout=2)
        return r.status_code == 200
    except Exception:
        return False


def start_node_server():
    """Start Node.js web server as subprocess"""
    server_js = os.path.join(config.PROJECT_ROOT, 'docs', 'server.js')
    if not os.path.exists(server_js):
        print(f"❌ Không tìm thấy server.js: {server_js}")
        return None

    print("🚀 Đang khởi động Node.js server...")

    # Start Node.js process
    process = subprocess.Popen(
        ['node', server_js],
        cwd=config.PROJECT_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0,
        encoding='utf-8',
        errors='replace'
    )

    # Log output in background
    def _log_output(proc):
        try:
            for line in proc.stdout:
                line = line.strip()
                if line:
                    print(f"  [Node] {line}")
        except Exception:
            pass

    threading.Thread(target=_log_output, args=(process,), daemon=True).start()

    # Wait for server to be ready (max 15 seconds)
    for i in range(30):
        time.sleep(0.5)
        if is_server_running(config.WEB_SERVER_PORT):
            print(f"✅ Node.js server sẵn sàng (port {config.WEB_SERVER_PORT})")
            return process
        if process.poll() is not None:
            print("❌ Node.js server đã thoát bất ngờ!")
            return None

    print("⚠️ Node.js server khởi động chậm, tiếp tục...")
    return process


class EasyZaloApp(ctk.CTk):
    """Main Easy Zalo Desktop Application"""

    def __init__(self, node_process=None):
        super().__init__()

        self.node_process = node_process

        # Window setup
        self.title("Easy Zalo")
        self.geometry("1400x850")
        self.minsize(1000, 600)

        # Center window on screen
        self.update_idletasks()
        w = 1400
        h = 850
        x = (self.winfo_screenwidth() // 2) - (w // 2)
        y = (self.winfo_screenheight() // 2) - (h // 2) - 30
        self.geometry(f"{w}x{h}+{x}+{y}")

        # Config
        self.config_port = config.WEB_SERVER_PORT

        # App state
        self.current_user = None
        self.friends = []
        self.groups = []
        self.blacklist = []
        self.messages_cache = {}

        # Database (shared with web app)
        self.db = Database(config.TRIGGERS_DB, config.MESSAGES_DB)

        # WebSocket client (connects to Node.js web server)
        self.ws = ZaloWSClient(config.WEB_SERVER_WS, self._on_ws_event)

        # 🏥 Watchdog for health checking (auto-restart if response time > 10s)
        self.watchdog = AppWatchdog(node_process, {
            'check_url': f'http://localhost:{config.WEB_SERVER_PORT}/api/session-status',
            'response_timeout': 10,  # Max 10 seconds
            'max_slow_checks': 3,    # Restart after 3 consecutive slow checks
            'check_interval': 5      # Check every 5 seconds
        })
        self.watchdog.set_restart_callback(self._on_app_restart)

        # UI Frames
        self.login_frame = LoginFrame(self, self)
        self.dashboard_frame = DashboardFrame(self, self)

        # Show login first
        self._show_login()

        # Connect to web server
        self.ws.connect()
        
        # Start health checking in background
        self.watchdog.start()

        # Handle window close
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ============================================
    # WebSocket Event Handler (from Node.js)
    # ============================================
    def _on_ws_event(self, data):
        """Called from WS thread → schedule on main GUI thread"""
        try:
            self.after(0, self._process_event, data)
        except Exception:
            pass

    def _process_event(self, data):
        """Process WebSocket events (runs on main thread)"""
        t = data.get('type', '')

        if t == '_ws_connected':
            self.login_frame.update_status(True)
            self.login_frame.start_qr_refresh()
            if hasattr(self.dashboard_frame, 'update_connection'):
                self.dashboard_frame.update_connection(True)

        elif t == '_ws_disconnected':
            self.login_frame.update_status(False)
            if hasattr(self.dashboard_frame, 'update_connection'):
                self.dashboard_frame.update_connection(False)

        elif t == 'current_user':
            user = data.get('user')
            if user and user.get('uid'):
                self.current_user = user
                print(f"👤 Đăng nhập: {user.get('name')} ({user.get('uid')})")
                self.login_frame.stop_qr_refresh()
                self._show_dashboard()
                # Request all data
                self.ws.request_friends()
                self.ws.request_groups()
                self.ws.send({'type': 'get_auto_reply_blacklist'})
                self.ws.send({'type': 'get_builtin_triggers'})

        elif t == 'session_info':
            if not data.get('isLoggedIn'):
                if self.current_user is None:
                    self._show_login()

        elif t == 'friends_list':
            self.friends = data.get('friends', [])
            try:
                last_msgs = self.db.get_all_last_messages()
                for f in self.friends:
                    uid = f.get('userId', '')
                    if uid in last_msgs:
                        f['lastMessage'] = last_msgs[uid].get('lastMessage', '')
                        f['lastTimestamp'] = last_msgs[uid].get('timestamp', 0)
            except Exception:
                pass
            self.dashboard_frame.sidebar.update_friends(self.friends)
            print(f"👥 Loaded {len(self.friends)} bạn bè")

        elif t == 'groups_list':
            self.groups = data.get('groups', [])
            self.dashboard_frame.sidebar.update_groups(self.groups)
            print(f"👪 Loaded {len(self.groups)} nhóm")

        elif t == 'new_message':
            uid = data.get('uid', '')
            msg = data.get('message', {})
            if uid and msg:
                if uid not in self.messages_cache:
                    self.messages_cache[uid] = []
                if not any(m.get('msgId') == msg.get('msgId') for m in self.messages_cache[uid]):
                    self.messages_cache[uid].append(msg)
                self.dashboard_frame.chat_panel.on_new_message(uid, msg)
                self.dashboard_frame.sidebar.update_last_message(
                    uid, msg.get('content', ''), msg.get('timestamp', 0))

                # Notification if not current chat
                if not msg.get('isSelf'):
                    current_chat_uid = self.dashboard_frame.chat_panel.current_uid
                    if uid != current_chat_uid:
                        sender = self._find_friend_name(uid)
                        self.dashboard_frame.show_notification(
                            sender, msg.get('content', ''))
                        self._flash_window()

        elif t in ('image_received', 'file_received'):
            # Forward to chat panel as new_message
            uid = data.get('uid', '')
            msg = data.get('message', data)
            if uid:
                self.dashboard_frame.chat_panel.on_new_message(uid, msg)

        elif t == 'auto_reply_blacklist':
            self.blacklist = data.get('blacklist', [])

        elif t == 'builtin_triggers':
            # Update header toggles
            user_on = data.get('user_enabled', True)
            group_on = data.get('group_enabled', True)
            self.dashboard_frame.update_builtin_toggles(user_on, group_on)

        elif t == 'conversation_updated':
            uid = data.get('uid', '')
            if uid:
                self.dashboard_frame.sidebar.update_last_message(
                    uid, data.get('lastMessage', ''), data.get('timestamp', 0))

        elif t == 'typing':
            pass  # Can add typing indicator later

        elif t == 'friend_event':
            # Refresh friends list
            self.ws.request_friends()

    # ============================================
    # Health Check & Auto-Restart
    # ============================================
    def _on_app_restart(self):
        """Called when watchdog detects unresponsive app"""
        print("\n🔄 Auto-restarting Node.js server due to timeout...")
        
        # Disconnect WS
        self.ws.disconnect()
        
        # Stop old process
        try:
            if self.node_process and self.node_process.poll() is None:
                self.node_process.terminate()
                self.node_process.wait(timeout=3)
        except:
            pass
        
        # Restart server
        import time
        time.sleep(2)
        
        # Re-establish connection
        self.ws.connect()
        print("✅ Server restarted, reconnecting...\n")

    # ============================================
    # Navigation
    # ============================================
    def _show_login(self):
        self.dashboard_frame.pack_forget()
        self.login_frame.pack(fill="both", expand=True)
        self.login_frame.start_qr_refresh()

    def _show_dashboard(self):
        self.login_frame.pack_forget()
        self.dashboard_frame.pack(fill="both", expand=True)
        self.dashboard_frame.update_user(self.current_user)

    # ============================================
    # Chat Actions
    # ============================================
    def open_chat(self, uid, name, avatar=''):
        """Open chat with a friend/group - called by sidebar"""
        messages = self.db.get_messages(uid)
        self.messages_cache[uid] = messages
        self.dashboard_frame.chat_panel.open_chat(uid, name, avatar, messages)

    def send_message(self, uid, text, thread_type=0):
        """Send message via WebSocket to Node.js server"""
        self.ws.send_text_message(uid, text, thread_type)

    def _find_friend_name(self, uid):
        """Find friend name by UID"""
        for f in self.friends:
            if f.get('userId', '') == uid:
                return f.get('displayName') or f.get('zaloName') or 'Unknown'
        return uid[:8] + '...'

    def _flash_window(self):
        """Flash taskbar icon to alert user"""
        try:
            self.bell()
            # Windows-specific flash
            import ctypes
            hwnd = ctypes.windll.user32.GetForegroundWindow()
            if hwnd != self.winfo_id():
                ctypes.windll.user32.FlashWindow(self.winfo_id(), True)
        except Exception:
            pass

    # ============================================
    # Cleanup
    # ============================================
    def _on_close(self):
        """Handle window close - stop Node.js server too"""
        print("\n🛑 Đóng Easy Zalo...")
        self.login_frame.stop_qr_refresh()
        self.ws.disconnect()
        
        # Stop health checker
        self.watchdog.stop()

        # Terminate Node.js server if we started it
        if self.node_process and self.node_process.poll() is None:
            print("🛑 Đang dừng Node.js server...")
            self.node_process.terminate()
            try:
                self.node_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.node_process.kill()
            print("✅ Node.js server đã dừng")

        self.destroy()
        print("✅ Tạm biệt!")


if __name__ == '__main__':
    print("")
    print("╔══════════════════════════════════════════╗")
    print("║       🚀 Easy Zalo Desktop v1.0         ║")
    print("╠══════════════════════════════════════════╣")
    print(f"║  Web Server: {config.WEB_SERVER_URL:<27}║")
    print(f"║  Database:   Shared with web app        ║")
    print(f"║  Mode:       Native Desktop (CTk)       ║")
    print("╚══════════════════════════════════════════╝")
    print("")

    # Auto-start Node.js server if not running
    node_proc = None
    if is_server_running(config.WEB_SERVER_PORT):
        print(f"✅ Node.js server đã chạy sẵn (port {config.WEB_SERVER_PORT})")
    else:
        node_proc = start_node_server()

    # Launch GUI
    app = EasyZaloApp(node_process=node_proc)
    app.mainloop()
