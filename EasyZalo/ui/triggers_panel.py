import customtkinter as ctk
import tkinter.messagebox as messagebox

class TriggersPanel(ctk.CTkToplevel):
    """Cửa sổ quản lý Kịch bản tin nhắn tự động"""
    
    def __init__(self, app, db):
        super().__init__(app)
        self.app = app
        self.db = db
        
        self.title("Quản lý Kịch Bản (Auto-Reply)")
        self.geometry("850x600")
        self.minsize(800, 500)
        
        # Make modal
        self.transient(app)
        self.grab_set()
        
        # State
        self.triggers = []
        self.current_trigger = None
        user = self.app.current_user
        self.uid = user.get('uid', '') if user else ''
        
        # UI Setup
        self.grid_columnconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=2)
        self.grid_rowconfigure(0, weight=1)
        
        # --- LIFT PANE: Danh sách ---
        self.list_frame = ctk.CTkFrame(self, fg_color="#F8FAFC", corner_radius=0)
        self.list_frame.grid(row=0, column=0, sticky="nsew")
        
        header_frame = ctk.CTkFrame(self.list_frame, fg_color="transparent")
        header_frame.pack(fill="x", padx=10, pady=10)
        ctk.CTkLabel(header_frame, text="Danh sách Kịch bản", font=("Segoe UI", 16, "bold")).pack(side="left")
        ctk.CTkButton(header_frame, text="➕ Thêm mới", width=80, 
                      command=self._on_add_new).pack(side="right")
        
        self.scroll = ctk.CTkScrollableFrame(self.list_frame, fg_color="transparent")
        self.scroll.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        
        # --- RIGHT PANE: Form chỉnh sửa ---
        self.form_frame = ctk.CTkFrame(self, fg_color="#FFFFFF", corner_radius=0)
        self.form_frame.grid(row=0, column=1, sticky="nsew", padx=2, pady=0)
        
        self._build_form()
        
        # Load data
        self._load_data()
        
    def _build_form(self):
        self.form_title = ctk.CTkLabel(self.form_frame, text="Thêm kỷch bản mới", 
                                       font=("Segoe UI", 18, "bold"))
        self.form_title.pack(anchor="w", padx=20, pady=(20, 10))
        
        # Name
        ctk.CTkLabel(self.form_frame, text="Tên gọi gợi nhớ:", font=("Segoe UI", 12)).pack(anchor="w", padx=20, pady=(10, 2))
        self.entry_name = ctk.CTkEntry(self.form_frame, width=300)
        self.entry_name.pack(anchor="w", padx=20, fill="x")
        
        # Type
        ctk.CTkLabel(self.form_frame, text="Loại kích hoạt:", font=("Segoe UI", 12)).pack(anchor="w", padx=20, pady=(15, 2))
        self.combo_type = ctk.CTkComboBox(self.form_frame, values=["keyword", "any_message", "any_file"], width=300)
        self.combo_type.pack(anchor="w", padx=20)
        self.combo_type.set("keyword")
        
        # Keywords
        ctk.CTkLabel(self.form_frame, text="Từ khóa (cách nhau bởi dấu phẩy):", font=("Segoe UI", 12)).pack(anchor="w", padx=20, pady=(15, 2))
        self.entry_keys = ctk.CTkEntry(self.form_frame, width=300, placeholder_text="VD: xin chao, mua hang, gia bao nhieu")
        self.entry_keys.pack(anchor="w", padx=20, fill="x")
        
        # Content
        ctk.CTkLabel(self.form_frame, text="Nội dung trả lời:", font=("Segoe UI", 12)).pack(anchor="w", padx=20, pady=(15, 2))
        self.text_content = ctk.CTkTextbox(self.form_frame, height=120)
        self.text_content.pack(anchor="w", padx=20, fill="x")
        
        # Buttons
        btn_frame = ctk.CTkFrame(self.form_frame, fg_color="transparent")
        btn_frame.pack(anchor="w", padx=20, pady=20, fill="x")
        
        self.btn_save = ctk.CTkButton(btn_frame, text="💾 Lưu kịch bản", command=self._save_trigger, fg_color="#10b981", hover_color="#059669")
        self.btn_save.pack(side="left")
        
        self.btn_delete = ctk.CTkButton(btn_frame, text="🗑️ Xóa", command=self._delete_trigger, fg_color="#ef4444", hover_color="#dc2626")
        self.btn_delete.pack(side="right")
        self.btn_delete.pack_forget() # Hide originally
        
    def _load_data(self):
        if not self.uid:
            return
        self.triggers = self.db.get_triggers_by_user(self.uid)
        
        for w in self.scroll.winfo_children():
            w.destroy()
            
        for t in self.triggers:
            self._create_list_item(t)
            
        if not self.current_trigger:
            self._on_add_new()
        
    def _create_list_item(self, t):
        is_builtin = str(t.get('triggerKey', '')).startswith('__builtin_')
        name = t.get('triggerName', 'Unnamed')
        if is_builtin:
            name = f"🔧 {name}"
            
        current_id = self.current_trigger.get('id') if self.current_trigger else None
        frame = ctk.CTkFrame(self.scroll, fg_color="#DBEAFE" if t.get('id') == current_id else "transparent")
        frame.pack(fill="x", pady=2)
        
        name_lbl = ctk.CTkLabel(frame, text=name, font=("Segoe UI", 13, "bold" if not is_builtin else "normal"))
        name_lbl.pack(side="left", padx=10, pady=10)
        
        switch = ctk.CTkSwitch(frame, text="", width=36, command=lambda _t=t, _s=None: self._toggle_trigger(_t), progress_color="#10b981")
        switch.pack(side="right", padx=10)
        if t.get('enabled'):
            switch.select()
            
        # Bind click
        for w in [frame, name_lbl]:
            w.bind("<Button-1>", lambda e, _t=t: self._edit_trigger(_t))
            w.configure(cursor="hand2")
            
    def _on_add_new(self):
        self.current_trigger = None
        self.form_title.configure(text="Thêm kịch bản mới")
        self.entry_name.delete(0, 'end')
        self.entry_keys.delete(0, 'end')
        self.text_content.delete("0.0", 'end')
        self.combo_type.set("keyword")
        
        self.btn_delete.pack_forget()
        
    def _edit_trigger(self, t):
        self.current_trigger = t
        self.form_title.configure(text=f"Chỉnh sửa: {t.get('triggerName')}")
        
        self.entry_name.configure(state="normal")
        self.entry_keys.configure(state="normal")
        self.combo_type.configure(state="normal")
        self.text_content.configure(state="normal")
        
        self.entry_name.delete(0, 'end')
        self.entry_name.insert(0, t.get('triggerName', ''))
        
        self.entry_keys.delete(0, 'end')
        self.entry_keys.insert(0, t.get('triggerKey', ''))
        
        type_val = t.get('triggerType', 'keyword')
        if type_val not in ["keyword", "any_message", "any_file"]:
            type_val = "keyword"
        self.combo_type.set(type_val)
        
        self.text_content.delete("0.0", 'end')
        self.text_content.insert("0.0", t.get('triggerContent', ''))
        
        is_builtin = str(t.get('triggerKey', '')).startswith('__builtin_')
        if is_builtin:
            self.btn_delete.pack_forget()
            self.entry_name.configure(state="disabled")
            self.entry_keys.configure(state="disabled")
            self.combo_type.configure(state="disabled")
            # builtins don't allow modifying keys, but we allow modifying content
        else:
            self.btn_delete.pack(side="right")
        
        # Highlight list item without reloading data
        for child in self.scroll.winfo_children():
            # Actually just reload UI softly by recreating list items
            pass
        self._soft_refresh_list()
        
    def _soft_refresh_list(self):
        for w in self.scroll.winfo_children():
            w.destroy()
        for t in self.triggers:
            self._create_list_item(t)
            
    def _save_trigger(self):
        if not self.uid:
            return
            
        name = self.entry_name.get().strip()
        keys = self.entry_keys.get().strip()
        t_type = self.combo_type.get()
        content = self.text_content.get("0.0", 'end').strip()
        
        if not name or not content:
            messagebox.showwarning("Thiếu thông tin", "Vui lòng nhập đủ tên và nội dung.")
            return
            
        data = {
            'triggerName': name,
            'triggerKey': keys,
            'triggerType': t_type,
            'triggerContent': content,
            'enabled': True
        }
        
        if self.current_trigger:
            data['id'] = self.current_trigger['id']
            data['enabled'] = self.current_trigger.get('enabled', True)
            
        self.db.save_trigger(self.uid, data)
        self._notify_server()
        self._load_data()
        
    def _toggle_trigger(self, t):
        if not self.uid: return
        new_state = not t.get('enabled', False)
        self.db.toggle_trigger(t['id'], self.uid, new_state)
        self._notify_server()
        self._load_data()
        
    def _delete_trigger(self):
        if not self.uid or not self.current_trigger:
            return
        if messagebox.askyesno("Xác nhận", "Bạn có chắc chắn muốn xóa kịch bản này?"):
            self.db.delete_trigger(self.current_trigger['id'], self.uid)
            self._notify_server()
            self._on_add_new()
            self._load_data()
            
    def _notify_server(self):
        """Send command to Node WebSocket to reload triggers"""
        self.app.ws.send({'type': 'reload_builtin_triggers'})
        # Just send a simple reload signal, Node triggerDB reads from SQLite again
