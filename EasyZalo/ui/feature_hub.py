# feature_hub.py - Desktop entry point for web-backed Easy Zalo features
import tkinter.messagebox as messagebox
import webbrowser

import customtkinter as ctk


FEATURE_GROUPS = [
    {
        "title": "Automation",
        "items": [
            ("Flow Builder", "Build visual automation flows", "/trigger-builder.html"),
            ("Trigger Manager", "Manage keyword and built-in auto replies", "/trigger-manager.html"),
            ("Scheduled Messages", "Create scheduled Zalo messages", "/scheduled-manager.html"),
            ("Notifications", "Review trigger notifications", "/trigger-notifications.html"),
            ("Statistics", "View trigger and automation stats", "/trigger-statistics.html"),
            ("Variables", "Inspect and clear saved flow variables", "/variable-manager.html"),
        ],
    },
    {
        "title": "Content",
        "items": [
            ("Files", "Upload and manage reusable files", "/file-manager.html"),
            ("Images", "Upload and manage reusable images", "/image-manager.html"),
            ("Tables", "Manage internal data tables", "/table-manager.html"),
            ("Google Sheets", "Configure Google Sheet integrations", "/google-sheets-manager.html"),
            ("Storage", "Inspect storage and runtime data", "/storage-info.html"),
        ],
    },
    {
        "title": "Integrations",
        "items": [
            ("AI Manager", "Configure Gemini and AI response profiles", "/ai-manager.html"),
            ("Email Manager", "Configure Gmail senders and recipients", "/email-manager.html"),
            ("Bank Manager", "Manage payment gates and transactions", "/bank-manager.html"),
            ("Sepay Test", "Test Sepay/VietQR payment integration", "/sepay-test.html"),
            ("Zalo Bot", "Manage Zalo bot contacts and polling", "/zalo-bot-manager.html"),
        ],
    },
    {
        "title": "System",
        "items": [
            ("Web Dashboard", "Open the original full dashboard", "/dashboard"),
            ("Unified Manager", "Open the unified web manager", "/unified-manager.html"),
            ("System Settings", "Open system configuration", "/system-settings.html"),
            ("Home/Login", "Open the web login page", "/"),
        ],
    },
]


class FeatureHub(ctk.CTkToplevel):
    """Shows every web-backed module available from the Python desktop app."""

    def __init__(self, app):
        super().__init__(app)
        self.app = app
        self.base_url = app.config_port and f"http://localhost:{app.config_port}" or "http://localhost:3000"

        self.title("Easy Zalo Features")
        self.geometry("980x680")
        self.minsize(860, 560)
        self.transient(app)

        self.grid_rowconfigure(1, weight=1)
        self.grid_columnconfigure(0, weight=1)

        self._build_header()
        self._build_body()

    def _build_header(self):
        header = ctk.CTkFrame(self, fg_color="#172033", corner_radius=0, height=72)
        header.grid(row=0, column=0, sticky="ew")
        header.grid_propagate(False)
        header.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            header,
            text="Easy Zalo Feature Center",
            text_color="white",
            font=("Segoe UI", 20, "bold"),
        )
        title.grid(row=0, column=0, sticky="w", padx=22, pady=(13, 0))

        subtitle = ctk.CTkLabel(
            header,
            text="Uses the same local Node server, WebSocket session, and SQLite data as the web app.",
            text_color="#cbd5e1",
            font=("Segoe UI", 12),
        )
        subtitle.grid(row=1, column=0, sticky="w", padx=22, pady=(0, 12))

        ctk.CTkButton(
            header,
            text="Open Dashboard",
            width=140,
            height=34,
            fg_color="#2563eb",
            hover_color="#1d4ed8",
            command=lambda: self._open_path("/dashboard"),
        ).grid(row=0, column=1, rowspan=2, padx=22, pady=18)

    def _build_body(self):
        body = ctk.CTkScrollableFrame(self, fg_color="#eef2f7")
        body.grid(row=1, column=0, sticky="nsew")
        body.grid_columnconfigure((0, 1), weight=1)

        for index, group in enumerate(FEATURE_GROUPS):
            card = ctk.CTkFrame(body, fg_color="white", corner_radius=8)
            card.grid(row=index // 2, column=index % 2, sticky="nsew", padx=12, pady=12)
            card.grid_columnconfigure(0, weight=1)

            ctk.CTkLabel(
                card,
                text=group["title"],
                font=("Segoe UI", 16, "bold"),
                text_color="#111827",
            ).grid(row=0, column=0, sticky="w", padx=16, pady=(14, 6))

            for row, (name, desc, path) in enumerate(group["items"], start=1):
                self._add_feature_row(card, row, name, desc, path)

    def _add_feature_row(self, parent, row, name, desc, path):
        item = ctk.CTkFrame(parent, fg_color="#f8fafc", corner_radius=6)
        item.grid(row=row, column=0, sticky="ew", padx=12, pady=5)
        item.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            item,
            text=name,
            font=("Segoe UI", 13, "bold"),
            text_color="#1f2937",
            anchor="w",
        ).grid(row=0, column=0, sticky="ew", padx=12, pady=(8, 0))

        ctk.CTkLabel(
            item,
            text=desc,
            font=("Segoe UI", 11),
            text_color="#64748b",
            anchor="w",
        ).grid(row=1, column=0, sticky="ew", padx=12, pady=(0, 8))

        ctk.CTkButton(
            item,
            text="Open",
            width=74,
            height=30,
            fg_color="#0f766e",
            hover_color="#0d5f59",
            command=lambda p=path: self._open_path(p),
        ).grid(row=0, column=1, rowspan=2, padx=12, pady=8)

    def _open_path(self, path):
        url = f"{self.base_url}{path}"
        try:
            webbrowser.open(url)
        except Exception as exc:
            messagebox.showerror("Open feature failed", f"Could not open {url}\n\n{exc}")
