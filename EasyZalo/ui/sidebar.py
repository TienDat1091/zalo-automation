# sidebar.py - Friends/Groups List Sidebar (with Avatar)
import customtkinter as ctk
from datetime import datetime
import threading
import time

# Avatar colors palette
AVATAR_COLORS = [
    "#667eea", "#764ba2", "#f093fb", "#4facfe",
    "#43e97b", "#fa709a", "#6c5ce7", "#00cec9",
    "#e17055", "#0984e3", "#00b894", "#e84393"
]

# Shared avatar image cache
_avatar_cache = {}


def get_avatar_color(name):
    return AVATAR_COLORS[sum(ord(c) for c in (name or "?")) % len(AVATAR_COLORS)]


def format_time_short(ts):
    if not ts:
        return ""
    try:
        dt = datetime.fromtimestamp(ts / 1000)
        now = datetime.now()
        diff = (now - dt).total_seconds()
        if diff < 60:
            return "Vừa xong"
        if diff < 3600:
            return f"{int(diff // 60)} p"
        if diff < 86400:
            return f"{int(diff // 3600)} h"
        if diff < 604800:
            return f"{int(diff // 86400)} ngày"
        return dt.strftime("%d/%m")
    except Exception:
        return ""


def make_circular(img, size):
    """Create a circular image using PIL"""
    from PIL import Image, ImageDraw
    img = img.convert('RGBA').resize((size, size), Image.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    output = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    output.paste(img, (0, 0), mask)
    return output


class FriendItem(ctk.CTkFrame):
    """Individual friend/group list item with avatar"""

    def __init__(self, parent, data, on_click, is_group=False, config_port=3000):
        super().__init__(parent, fg_color="transparent", corner_radius=8,
                         height=62, cursor="hand2")
        self.pack_propagate(False)

        uid = data.get('userId', '') if not is_group else data.get('groupId', data.get('threadId', ''))
        name = data.get('displayName', data.get('zaloName', data.get('name', 'Unknown')))
        last_msg = data.get('lastMessage', '')
        last_time = data.get('lastTimestamp', 0)
        avatar_url = data.get('avatar', data.get('avatarUrl', ''))

        self.uid = uid
        self.friend_name = name
        self._active = False
        self._avatar_ref = None
        self._config_port = config_port

        self.grid_columnconfigure(1, weight=1)

        # Avatar
        color = get_avatar_color(name)
        initial = name[0].upper() if name else "?"
        self.avatar_label = ctk.CTkLabel(self, text=initial, width=42, height=42,
                                          fg_color=color, corner_radius=21,
                                          text_color="white", font=("Segoe UI", 16, "bold"))
        self.avatar_label.grid(row=0, column=0, rowspan=2, padx=(10, 8), pady=8)

        # Load real avatar
        if avatar_url:
            self._load_avatar(avatar_url)

        # Name
        name_label = ctk.CTkLabel(self, text=name, anchor="w",
                                   font=("Segoe UI", 13, "bold"), text_color="#1a1a2e")
        name_label.grid(row=0, column=1, sticky="w", padx=0, pady=(10, 0))

        # Last message
        if not last_msg:
            last_msg = "Nhấn để chat"
        truncated = (last_msg[:32] + "...") if len(last_msg) > 35 else last_msg
        self.msg_label = ctk.CTkLabel(self, text=truncated, anchor="w",
                                       font=("Segoe UI", 11), text_color="#94a3b8")
        self.msg_label.grid(row=1, column=1, sticky="w", padx=0, pady=(0, 10))

        # Time
        self.time_label = ctk.CTkLabel(self, text=format_time_short(last_time),
                                        font=("Segoe UI", 10), text_color="#94a3b8")
        self.time_label.grid(row=0, column=2, padx=(4, 12), pady=(10, 0), sticky="ne")

        # Click
        callback = lambda e, u=uid, n=name: on_click(u, n)
        for widget in [self, self.avatar_label, name_label, self.msg_label, self.time_label]:
            widget.bind("<Button-1>", callback)

        self.bind("<Enter>", lambda e: self._hover(True))
        self.bind("<Leave>", lambda e: self._hover(False))

    def _load_avatar(self, url):
        """Load avatar image in background"""
        global _avatar_cache

        # Check cache
        if url in _avatar_cache:
            self._set_avatar_image(_avatar_cache[url])
            return

        def _download():
            try:
                import requests
                from PIL import Image
                from io import BytesIO

                # Some Zalo URLs work directly
                r = requests.get(url, timeout=5)
                if r.status_code != 200 or len(r.content) < 100:
                    # Try via proxy
                    proxy_url = f'http://localhost:{self._config_port}/api/proxy-file?url={url}&mode=view'
                    r = requests.get(proxy_url, timeout=5)

                if r.status_code == 200 and len(r.content) > 100:
                    img = Image.open(BytesIO(r.content))
                    circular = make_circular(img, 42)
                    ctk_img = ctk.CTkImage(light_image=circular, dark_image=circular, size=(42, 42))
                    _avatar_cache[url] = ctk_img
                    self.after(0, lambda: self._set_avatar_image(ctk_img))
            except Exception:
                pass

        threading.Thread(target=_download, daemon=True).start()

    def _set_avatar_image(self, ctk_img):
        self._avatar_ref = ctk_img
        self.avatar_label.configure(image=ctk_img, text="", fg_color="transparent")

    def _hover(self, enter):
        if not self._active:
            self.configure(fg_color="#F1F5F9" if enter else "transparent")

    def set_active(self, active):
        self._active = active
        self.configure(fg_color="#DBEAFE" if active else "transparent")

    def update_last(self, msg, ts):
        truncated = (msg[:32] + "...") if len(msg) > 35 else msg
        self.msg_label.configure(text=truncated)
        self.time_label.configure(text=format_time_short(ts))


class Sidebar(ctk.CTkFrame):
    """Friends and Groups sidebar"""

    def __init__(self, parent, app):
        super().__init__(parent, fg_color="#FFFFFF", width=320, corner_radius=0)
        self.pack_propagate(False)
        self.app = app
        self.active_uid = None
        self.friend_widgets = {}
        self.all_friends = []
        self.current_tab = "friends"

        # Tabs
        tabs_frame = ctk.CTkFrame(self, fg_color="transparent", height=42)
        tabs_frame.pack(fill="x")
        tabs_frame.pack_propagate(False)

        self.friends_btn = ctk.CTkButton(
            tabs_frame, text="👥 Bạn bè", font=("Segoe UI", 13, "bold"),
            fg_color="transparent", text_color="#0068FF",
            hover_color="#f1f5f9", corner_radius=0, height=42,
            command=lambda: self.switch_tab("friends"))
        self.friends_btn.pack(side="left", fill="both", expand=True)

        self.groups_btn = ctk.CTkButton(
            tabs_frame, text="👪 Nhóm", font=("Segoe UI", 13),
            fg_color="transparent", text_color="#64748b",
            hover_color="#f1f5f9", corner_radius=0, height=42,
            command=lambda: self.switch_tab("groups"))
        self.groups_btn.pack(side="left", fill="both", expand=True)

        ctk.CTkFrame(self, fg_color="#0068FF", height=2).pack(fill="x")
        ctk.CTkFrame(self, fg_color="#e2e8f0", height=1).pack(fill="x")

        # Search
        search_frame = ctk.CTkFrame(self, fg_color="transparent")
        search_frame.pack(fill="x", padx=10, pady=8)
        self.search_entry = ctk.CTkEntry(
            search_frame, placeholder_text="🔍 Tìm bạn bè...",
            height=36, corner_radius=8, border_width=1,
            border_color="#e2e8f0", fg_color="#f8fafc", font=("Segoe UI", 12))
        self.search_entry.pack(fill="x")
        self.search_entry.bind("<KeyRelease>", self._on_search)

        # Friends scroll
        self.friends_scroll = ctk.CTkScrollableFrame(
            self, fg_color="transparent", scrollbar_button_color="#cbd5e1")
        self.friends_scroll.pack(fill="both", expand=True)

        # Groups scroll (hidden)
        self.groups_scroll = ctk.CTkScrollableFrame(
            self, fg_color="transparent", scrollbar_button_color="#cbd5e1")

        # Loading
        self.loading = ctk.CTkLabel(self.friends_scroll, text="⏳ Đang tải...",
                                     text_color="#94a3b8", font=("Segoe UI", 12))
        self.loading.pack(pady=40)

    def switch_tab(self, tab):
        self.current_tab = tab
        if tab == "friends":
            self.groups_scroll.pack_forget()
            self.friends_scroll.pack(fill="both", expand=True)
            self.friends_btn.configure(text_color="#0068FF", font=("Segoe UI", 13, "bold"))
            self.groups_btn.configure(text_color="#64748b", font=("Segoe UI", 13))
        else:
            self.friends_scroll.pack_forget()
            self.groups_scroll.pack(fill="both", expand=True)
            self.groups_btn.configure(text_color="#0068FF", font=("Segoe UI", 13, "bold"))
            self.friends_btn.configure(text_color="#64748b", font=("Segoe UI", 13))

    def update_friends(self, friends):
        self.all_friends = friends
        friends.sort(key=lambda f: f.get('lastTimestamp', 0), reverse=True)

        for w in self.friends_scroll.winfo_children():
            w.destroy()
        self.friend_widgets = {}

        if not friends:
            ctk.CTkLabel(self.friends_scroll, text="Chưa có bạn bè",
                         text_color="#94a3b8").pack(pady=40)
            return

        port = self.app.config_port
        for f in friends:
            uid = f.get('userId', '')
            item = FriendItem(self.friends_scroll, f, self._on_friend_click,
                              config_port=port)
            item.pack(fill="x", padx=4, pady=1)
            self.friend_widgets[uid] = item
            if uid == self.active_uid:
                item.set_active(True)

    def update_groups(self, groups):
        for w in self.groups_scroll.winfo_children():
            w.destroy()
        if not groups:
            ctk.CTkLabel(self.groups_scroll, text="Chưa có nhóm",
                         text_color="#94a3b8").pack(pady=40)
            return
        port = self.app.config_port
        for g in groups:
            item = FriendItem(self.groups_scroll, g, self._on_group_click,
                              is_group=True, config_port=port)
            item.pack(fill="x", padx=4, pady=1)

    def update_last_message(self, uid, msg, ts):
        if uid in self.friend_widgets:
            self.friend_widgets[uid].update_last(msg, ts)
        for f in self.all_friends:
            if f.get('userId', '') == uid:
                f['lastMessage'] = msg
                f['lastTimestamp'] = ts
                break

    def _on_friend_click(self, uid, name):
        if self.active_uid and self.active_uid in self.friend_widgets:
            self.friend_widgets[self.active_uid].set_active(False)
        self.active_uid = uid
        if uid in self.friend_widgets:
            self.friend_widgets[uid].set_active(True)
        self.app.open_chat(uid, name)

    def _on_group_click(self, gid, name):
        self.app.open_chat(gid, name)

    def _on_search(self, event=None):
        query = self.search_entry.get().lower().strip()
        if not query:
            self.update_friends(self.all_friends)
            return
        filtered = [f for f in self.all_friends
                     if query in (f.get('displayName', '') or '').lower()
                     or query in (f.get('userId', '') or '').lower()]
        self.update_friends(filtered)
