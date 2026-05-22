# chat_panel.py - Chat Messages & Input Panel (Full Featured)
import customtkinter as ctk
from datetime import datetime
from tkinter import filedialog
import threading
import time
import os
import json
import base64
import tempfile


class ChatPanel(ctk.CTkFrame):
    """Chat area with header, messages, input, image/file, paste, drag-drop"""

    def __init__(self, parent, app):
        super().__init__(parent, fg_color="#E8ECF1", corner_radius=0)
        self.app = app
        self.current_uid = None
        self.current_name = ""
        self._image_cache = {}

        # ===== EMPTY STATE =====
        self.empty_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.empty_frame.pack(fill="both", expand=True)
        ctk.CTkLabel(self.empty_frame, text="💬",
                     font=("", 64), text_color="#cbd5e1").pack(pady=(180, 8))
        ctk.CTkLabel(self.empty_frame, text="Chọn một cuộc trò chuyện để bắt đầu",
                     font=("Segoe UI", 15), text_color="#94a3b8").pack()

        # ===== CHAT HEADER =====
        self.header = ctk.CTkFrame(self, fg_color="#FFFFFF", height=65, corner_radius=0)
        self.header.grid_columnconfigure(1, weight=1)

        from ui.sidebar import get_avatar_color
        self._get_color = get_avatar_color

        self.chat_avatar = ctk.CTkLabel(self.header, text="?", width=42, height=42,
                                         fg_color="#667eea", corner_radius=21,
                                         text_color="white", font=("Segoe UI", 16, "bold"))
        self.chat_avatar.grid(row=0, column=0, rowspan=2, padx=(16, 10), pady=10)

        self.chat_name = ctk.CTkLabel(self.header, text="", anchor="w",
                                       font=("Segoe UI", 15, "bold"), text_color="#1a1a2e")
        self.chat_name.grid(row=0, column=1, sticky="w", pady=(12, 0))

        self.chat_uid = ctk.CTkLabel(self.header, text="", anchor="w",
                                      font=("Segoe UI", 11), text_color="#94a3b8")
        self.chat_uid.grid(row=1, column=1, sticky="w", pady=(0, 12))

        # Auto-reply toggle
        ar_frame = ctk.CTkFrame(self.header, fg_color="transparent")
        ar_frame.grid(row=0, column=2, rowspan=2, padx=(0, 16))
        ctk.CTkLabel(ar_frame, text="Auto Reply",
                     font=("Segoe UI", 11), text_color="#64748b").pack(side="left", padx=(0, 8))
        self.ar_switch = ctk.CTkSwitch(ar_frame, text="", width=44, height=22,
                                        switch_width=40, switch_height=20,
                                        progress_color="#10b981",
                                        command=self._toggle_auto_reply)
        self.ar_switch.pack(side="left")
        self.ar_switch.select()

        # Separator
        self.header_sep = ctk.CTkFrame(self, fg_color="#e2e8f0", height=1, corner_radius=0)

        # ===== MESSAGES AREA =====
        self.messages_scroll = ctk.CTkScrollableFrame(
            self, fg_color="#E8ECF1",
            scrollbar_button_color="#cbd5e1",
            scrollbar_button_hover_color="#94a3b8")

        # ===== DROP ZONE OVERLAY =====
        self.drop_label = ctk.CTkLabel(self, text="📂 Thả file vào đây để gửi",
                                        fg_color="#0068FF", text_color="white",
                                        corner_radius=12, font=("Segoe UI", 16, "bold"),
                                        height=60)

        # ===== INPUT AREA =====
        self.input_frame = ctk.CTkFrame(self, fg_color="#FFFFFF", height=60, corner_radius=0)
        self.input_sep = ctk.CTkFrame(self, fg_color="#e2e8f0", height=1, corner_radius=0)

        ctk.CTkButton(self.input_frame, text="😊", width=38, height=38,
                       fg_color="#f1f5f9", hover_color="#e2e8f0",
                       text_color="#64748b", corner_radius=19,
                       font=("", 18)).pack(side="left", padx=(12, 4), pady=11)

        ctk.CTkButton(self.input_frame, text="📎", width=38, height=38,
                       fg_color="#f1f5f9", hover_color="#e2e8f0",
                       text_color="#64748b", corner_radius=19,
                       font=("", 18), command=self._pick_file).pack(side="left", padx=4, pady=11)

        ctk.CTkButton(self.input_frame, text="🖼️", width=38, height=38,
                       fg_color="#f1f5f9", hover_color="#e2e8f0",
                       text_color="#64748b", corner_radius=19,
                       font=("", 18), command=self._pick_image).pack(side="left", padx=4, pady=11)

        self.msg_entry = ctk.CTkEntry(self.input_frame, placeholder_text="Nhập tin nhắn... (Ctrl+V dán ảnh)",
                                       height=38, corner_radius=19, border_width=1,
                                       border_color="#e2e8f0", fg_color="#f8fafc",
                                       font=("Segoe UI", 13))
        self.msg_entry.pack(side="left", fill="x", expand=True, padx=8, pady=11)
        self.msg_entry.bind("<Return>", lambda e: self._send_message())

        ctk.CTkButton(self.input_frame, text="➤", width=42, height=42,
                       fg_color="#0068FF", hover_color="#0052CC",
                       text_color="white", corner_radius=21,
                       font=("", 18), command=self._send_message
                       ).pack(side="right", padx=(4, 12), pady=9)

        # Bind Ctrl+V for paste image
        self.app.bind("<Control-v>", self._on_paste)

        # Setup drag-drop (Windows)
        self.after(500, self._setup_dragdrop)

    # ============================================
    # DRAG & DROP
    # ============================================
    def _setup_dragdrop(self):
        """Setup drag-drop file support using windnd"""
        try:
            import windnd
            windnd.hook_dropfiles(self.winfo_id(), func=self._on_drop_files)
            print("✅ Drag-drop đã bật (windnd)")
        except Exception as e:
            print(f"⚠️ Drag-drop không khả dụng: {e}")

    def _on_drop_files(self, files):
        """Handle dropped files"""
        if not self.current_uid or not files:
            return
        for f in files:
            filepath = f.decode('utf-8') if isinstance(f, bytes) else str(f)
            if os.path.isfile(filepath):
                ext = os.path.splitext(filepath)[1].lower()
                if ext in ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'):
                    self._send_file_as_base64(filepath, 'send_image')
                else:
                    self._send_file_as_base64(filepath, 'send_file')

    # ============================================
    # PASTE IMAGE (Ctrl+V)
    # ============================================
    def _on_paste(self, event=None):
        """Handle Ctrl+V - paste image from clipboard"""
        if not self.current_uid:
            return
        try:
            from PIL import ImageGrab
            img = ImageGrab.grabclipboard()
            if img:
                # Save to temp
                temp_path = os.path.join(tempfile.gettempdir(), f'paste_{int(time.time() * 1000)}.png')
                img.save(temp_path, 'PNG')
                self._send_file_as_base64(temp_path, 'send_image')
                # Clean temp
                self.after(5000, lambda: os.remove(temp_path) if os.path.exists(temp_path) else None)
                return "break"
        except Exception:
            pass

    # ============================================
    # SEND FILE/IMAGE (base64 - matches Node.js server)
    # ============================================
    def _send_file_as_base64(self, filepath, send_type='send_file'):
        """Read file, convert to base64, send via WebSocket"""
        if not self.current_uid or not os.path.isfile(filepath):
            return

        filename = os.path.basename(filepath)
        self._show_toast(f"📤 Đang gửi: {filename}...")

        def _do_send():
            try:
                with open(filepath, 'rb') as f:
                    data = f.read()
                b64 = base64.b64encode(data).decode('utf-8')

                self.app.ws.send({
                    'type': send_type,
                    'to': self.current_uid,
                    'fileData': b64,
                    'fileName': filename,
                    'content': ''
                })

                # Optimistic UI
                icon = '🖼️' if send_type == 'send_image' else '📎'
                self.after(0, lambda: self._add_bubble({
                    'content': f'{icon} {filename}',
                    'timestamp': int(time.time() * 1000),
                    'isSelf': True, 'isAutoReply': False
                }))
                self.after(0, self._scroll_bottom)
                self.after(0, lambda: self._show_toast(f"✅ Đã gửi: {filename}"))

            except Exception as e:
                self.after(0, lambda: self._show_toast(f"❌ Lỗi gửi: {str(e)[:40]}"))

        threading.Thread(target=_do_send, daemon=True).start()

    def _pick_file(self):
        if not self.current_uid:
            return
        filepath = filedialog.askopenfilename(
            title="Chọn file để gửi",
            filetypes=[("All Files", "*.*"),
                       ("Documents", "*.pdf;*.doc;*.docx;*.xls;*.xlsx"),
                       ("Archives", "*.zip;*.rar;*.7z")])
        if filepath:
            self._send_file_as_base64(filepath, 'send_file')

    def _pick_image(self):
        if not self.current_uid:
            return
        filepath = filedialog.askopenfilename(
            title="Chọn ảnh để gửi",
            filetypes=[("Images", "*.jpg;*.jpeg;*.png;*.gif;*.bmp;*.webp"),
                       ("All Files", "*.*")])
        if filepath:
            self._send_file_as_base64(filepath, 'send_image')

    # ============================================
    # CHAT OPEN / RENDER
    # ============================================
    def show_empty(self):
        self.header.pack_forget()
        self.header_sep.pack_forget()
        self.messages_scroll.pack_forget()
        self.input_sep.pack_forget()
        self.input_frame.pack_forget()
        self.empty_frame.pack(fill="both", expand=True)

    def open_chat(self, uid, name, avatar, messages):
        self.current_uid = uid
        self.current_name = name
        self.empty_frame.pack_forget()

        color = self._get_color(name)
        initial = name[0].upper() if name else "?"
        self.chat_avatar.configure(text=initial, fg_color=color)
        self.chat_name.configure(text=name)
        self.chat_uid.configure(text=f"UID: {uid}")

        if uid in self.app.blacklist:
            self.ar_switch.deselect()
        else:
            self.ar_switch.select()

        self.header.pack(fill="x", side="top")
        self.header_sep.pack(fill="x", side="top")
        self.input_sep.pack(fill="x", side="bottom")
        self.input_frame.pack(fill="x", side="bottom")
        self.messages_scroll.pack(fill="both", expand=True)

        self._render_messages(messages)
        self.msg_entry.focus_set()

    def _render_messages(self, messages):
        for w in self.messages_scroll.winfo_children():
            w.destroy()
        if not messages:
            ctk.CTkLabel(self.messages_scroll, text="Chưa có tin nhắn",
                         text_color="#94a3b8", font=("Segoe UI", 13)).pack(pady=60)
            return
        last_date = ""
        for msg in messages:
            try:
                msg_date = datetime.fromtimestamp(msg.get('timestamp', 0) / 1000).strftime("%d/%m/%Y")
                if msg_date != last_date:
                    self._add_date_divider(msg_date)
                    last_date = msg_date
            except Exception:
                pass
            self._add_bubble(msg)
        self.after(150, self._scroll_bottom)

    def _add_date_divider(self, date_str):
        divider = ctk.CTkFrame(self.messages_scroll, fg_color="transparent", height=30)
        divider.pack(fill="x", pady=4)
        ctk.CTkFrame(divider, fg_color="#d1d5db", height=1).place(relx=0, rely=0.5, relwidth=0.35)
        ctk.CTkLabel(divider, text=date_str, text_color="#94a3b8",
                     font=("Segoe UI", 11), fg_color="#E8ECF1").place(relx=0.5, rely=0.5, anchor="center")
        ctk.CTkFrame(divider, fg_color="#d1d5db", height=1).place(relx=0.65, rely=0.5, relwidth=0.35)

    def _add_bubble(self, msg):
        is_self = msg.get('isSelf') in (True, 1)
        is_auto = msg.get('isAutoReply') in (True, 1)
        content = msg.get('content', '') or ''
        timestamp = msg.get('timestamp', 0)

        msg_type = msg.get('type', 'text')
        attachment_type = msg.get('attachmentType', '')
        metadata = msg.get('metadata')
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
                msg_type = metadata.get('type', msg_type)
            except Exception:
                metadata = {}

        has_image = (msg_type == 'image' or attachment_type == 'image'
                     or msg.get('imageData') or msg.get('imageUrl'))
        has_file = (msg_type == 'file' or attachment_type == 'file' or msg.get('fileData'))

        container = ctk.CTkFrame(self.messages_scroll, fg_color="transparent")
        container.pack(fill="x", padx=12, pady=2)

        if is_auto:
            fg_color, text_color, anchor = "#BBDEFB", "#1a1a2e", "e"
        elif is_self:
            fg_color, text_color, anchor = "#0068FF", "#FFFFFF", "e"
        else:
            fg_color, text_color, anchor = "#FFFFFF", "#1a1a2e", "w"

        bubble = ctk.CTkFrame(container, fg_color=fg_color, corner_radius=16)
        bubble.pack(anchor=anchor, padx=4)

        if content:
            ctk.CTkLabel(bubble, text=content, text_color=text_color,
                         wraplength=450, justify="left",
                         font=("Segoe UI", 13)).pack(padx=14, pady=(10, 2), anchor="w")

        if has_image:
            self._add_image_to_bubble(bubble, msg, metadata or {})

        if has_file and not has_image:
            self._add_file_to_bubble(bubble, msg, metadata or {}, text_color)

        time_str = self._format_time(timestamp)
        if is_auto:
            time_str += "  🤖 Auto"
        time_color = "#b3d4ff" if (is_self and not is_auto) else "#94a3b8"
        ctk.CTkLabel(bubble, text=time_str, text_color=time_color,
                     font=("Segoe UI", 10)).pack(anchor="e", padx=10, pady=(0, 8))

    def _add_image_to_bubble(self, bubble, msg, metadata):
        image_url = (msg.get('imageUrl') or msg.get('attachmentPath')
                     or (metadata or {}).get('imageUrl') or '')
        local_path = msg.get('localFilePath', '')

        if not image_url and not local_path:
            ctk.CTkLabel(bubble, text="🖼️ Ảnh", text_color="#94a3b8",
                         font=("Segoe UI", 12)).pack(padx=14, pady=4)
            return

        img_label = ctk.CTkLabel(bubble, text="🖼️ Đang tải...",
                                  text_color="#94a3b8", font=("Segoe UI", 11),
                                  width=200, height=40)
        img_label.pack(padx=14, pady=4)

        cache_key = image_url or local_path

        def _load():
            try:
                from PIL import Image
                from io import BytesIO
                import requests as req

                img = None
                if local_path and os.path.exists(local_path):
                    img = Image.open(local_path)
                elif image_url:
                    proxy = f'http://localhost:{self.app.config_port}/api/proxy-file?url={image_url}&mode=view'
                    r = req.get(proxy, timeout=10)
                    if r.status_code == 200 and len(r.content) > 100:
                        img = Image.open(BytesIO(r.content))

                if img:
                    img.thumbnail((280, 280), Image.LANCZOS)
                    w, h = img.size
                    ctk_img = ctk.CTkImage(light_image=img, dark_image=img, size=(w, h))
                    self._image_cache[cache_key] = ctk_img
                    self.after(0, lambda: img_label.configure(image=ctk_img, text="", width=w, height=h))
                else:
                    self.after(0, lambda: img_label.configure(text="🖼️ Ảnh"))
            except Exception:
                self.after(0, lambda: img_label.configure(text="🖼️ Ảnh"))

        threading.Thread(target=_load, daemon=True).start()

    def _add_file_to_bubble(self, bubble, msg, metadata, text_color):
        file_data = msg.get('fileData') or (metadata or {}).get('fileData') or {}
        if isinstance(file_data, str):
            file_data = {}
        file_name = file_data.get('fileName') or msg.get('attachmentName') or 'File'
        file_size = file_data.get('fileSize') or msg.get('attachmentSize') or 0
        file_url = file_data.get('fileUrl') or msg.get('attachmentPath') or ''

        ext = os.path.splitext(file_name)[1].lower()
        icons = {'.pdf': '📄', '.doc': '📝', '.docx': '📝', '.xls': '📊',
                 '.xlsx': '📊', '.zip': '📦', '.rar': '📦', '.mp3': '🎵',
                 '.mp4': '🎬', '.jpg': '🖼️', '.png': '🖼️'}
        icon = icons.get(ext, '📎')

        file_frame = ctk.CTkFrame(bubble, fg_color="#f1f5f9", corner_radius=10)
        file_frame.pack(padx=10, pady=6, fill="x")

        ctk.CTkLabel(file_frame, text=icon, font=("", 28)).pack(side="left", padx=(10, 8), pady=8)
        info = ctk.CTkFrame(file_frame, fg_color="transparent")
        info.pack(side="left", fill="x", expand=True, pady=8)
        ctk.CTkLabel(info, text=file_name, font=("Segoe UI", 12, "bold"),
                     text_color="#1a1a2e", anchor="w").pack(anchor="w")
        if file_size:
            ctk.CTkLabel(info, text=self._format_size(file_size), font=("Segoe UI", 10),
                         text_color="#94a3b8", anchor="w").pack(anchor="w")

    # ============================================
    # SEND TEXT + NEW MESSAGE
    # ============================================
    def on_new_message(self, uid, msg):
        if self.current_uid == uid:
            self._add_bubble(msg)
            self._scroll_bottom()

    def _send_message(self):
        text = self.msg_entry.get().strip()
        if not text or not self.current_uid:
            return
        self.app.send_message(self.current_uid, text)
        msg = {'content': text, 'timestamp': int(time.time() * 1000),
               'isSelf': True, 'isAutoReply': False,
               'msgId': f'local_{int(time.time() * 1000)}'}
        self._add_bubble(msg)
        self._scroll_bottom()
        self.app.dashboard_frame.sidebar.update_last_message(
            self.current_uid, text, msg['timestamp'])
        self.msg_entry.delete(0, 'end')

    def _toggle_auto_reply(self):
        if not self.current_uid:
            return
        enabled = self.ar_switch.get()
        self.app.ws.toggle_auto_reply(self.current_uid, bool(enabled))
        if enabled:
            self.app.blacklist = [b for b in self.app.blacklist if b != self.current_uid]
        else:
            if self.current_uid not in self.app.blacklist:
                self.app.blacklist.append(self.current_uid)

    # ============================================
    # TOAST + UTILS
    # ============================================
    def _show_toast(self, message):
        toast = ctk.CTkLabel(self, text=message, fg_color="#1a1a2e",
                              text_color="white", corner_radius=8,
                              font=("Segoe UI", 12), height=36)
        toast.place(relx=0.5, rely=0.95, anchor="center")
        self.after(3000, toast.destroy)

    def _scroll_bottom(self):
        try:
            self.messages_scroll._parent_canvas.yview_moveto(1.0)
        except Exception:
            pass

    @staticmethod
    def _format_time(ts):
        if not ts:
            return ""
        try:
            return datetime.fromtimestamp(ts / 1000).strftime("%H:%M")
        except Exception:
            return ""

    @staticmethod
    def _format_size(size):
        if not size:
            return ""
        if size < 1024:
            return f"{size} B"
        if size < 1048576:
            return f"{size / 1024:.1f} KB"
        return f"{size / 1048576:.1f} MB"
