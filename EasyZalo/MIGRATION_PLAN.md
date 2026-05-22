# EasyZalo Web-to-Desktop Migration Plan

Goal: make EasyZalo the desktop app for the existing Zalo Automation platform while keeping the Node.js server as the Zalo/API runtime and keeping SQLite databases shared.

## Architecture

- Node.js remains the runtime owner for Zalo login, Zalo API calls, WebSocket events, auto reply execution, flow execution, payment callbacks, Gmail, Google Sheets, file processing, and AI calls.
- Python owns the desktop shell, native chat UI, native shortcuts, notifications, and progressively native manager screens.
- Both apps use the same SQLite files in `docs/data`.
- Python talks to Node through the existing WebSocket commands first. Direct SQLite writes are kept for simple local reads or low-risk CRUD only.

## Phase 1 - Desktop Access To All Existing Features

Status: started.

- Keep the native Python chat screen.
- Add a Feature Center window that links every existing web manager from the Python app.
- Use the same localhost server and logged-in Zalo session.
- This gives the desktop app access to the full web feature set immediately.

## Phase 2 - Native Core Automation Managers

Build native Python screens for:

- Trigger manager parity.
- Built-in trigger controls.
- Flow list and flow block summary.
- Scheduled message/routine manager.
- Variables manager.

Use WebSocket commands from `docs/system/websocket.js` for reads/writes.

## Phase 3 - Native Data Managers

Build native Python screens for:

- File manager.
- Image manager.
- Table manager.
- Google Sheets config manager.
- Storage dashboard.

Use WebSocket commands for uploads and API-backed actions so Node keeps filesystem and schema ownership.

## Phase 4 - Native Integration Managers

Build native Python screens for:

- AI config manager.
- Email/Gmail manager.
- Payment gate and transaction manager.
- Zalo bot manager.

Keep secrets and OAuth flows on the Node side.

## Phase 5 - Native Flow Builder

Rebuild the visual flow builder only after the CRUD managers are stable.

Minimum native parity:

- Flow list.
- Block list.
- Add/update/delete/reorder blocks.
- Block property editors for all block types in `docs/blocks`.
- Test-run and execution log views.

## Current Web Modules Exposed Through Feature Center

- Dashboard
- Trigger Manager
- Flow Builder
- Scheduled Messages
- Trigger Notifications
- Trigger Statistics
- Variables
- Files
- Images
- Tables
- Google Sheets
- Storage
- AI Manager
- Email Manager
- Bank Manager
- Sepay Test
- Zalo Bot
- Unified Manager
- System Settings
