# ws_client.py - WebSocket Client to Node.js Web Server
# Connects to the EXISTING web server (localhost:3000) for real-time sync
import websocket
import json
import threading
import time


class ZaloWSClient:
    """WebSocket client that connects to the Node.js web server for real-time data"""

    def __init__(self, ws_url, on_event_callback):
        self.ws_url = ws_url
        self.on_event = on_event_callback
        self.ws = None
        self.connected = False
        self.current_user = None
        self.friends = []
        self.groups = []
        self._thread = None
        self._should_reconnect = True

    def connect(self):
        """Start WebSocket connection in background thread"""
        self._should_reconnect = True
        self._thread = threading.Thread(target=self._connect_loop, daemon=True)
        self._thread.start()

    def _connect_loop(self):
        """Connection loop with auto-reconnect"""
        while self._should_reconnect:
            try:
                print(f'🔌 Connecting to web server: {self.ws_url}')
                self.ws = websocket.WebSocketApp(
                    self.ws_url,
                    on_open=self._on_open,
                    on_message=self._on_message,
                    on_error=self._on_error,
                    on_close=self._on_close
                )
                self.ws.run_forever(ping_interval=30, ping_timeout=10)
            except Exception as e:
                print(f'❌ WS connection error: {e}')

            if self._should_reconnect:
                print('🔄 Reconnecting in 3 seconds...')
                time.sleep(3)

    def _on_open(self, ws):
        self.connected = True
        print('✅ Connected to Node.js web server')
        self.on_event({'type': '_ws_connected'})

    def _on_message(self, ws, message):
        try:
            data = json.loads(message)
            msg_type = data.get('type', '')

            # Track important state
            if msg_type == 'current_user' and data.get('user'):
                self.current_user = data['user']
                print(f'👤 Logged in as: {self.current_user.get("name")}')

            elif msg_type == 'friends_list':
                self.friends = data.get('friends', [])
                print(f'👥 Received {len(self.friends)} friends')

            elif msg_type == 'groups_list':
                self.groups = data.get('groups', [])
                print(f'👪 Received {len(self.groups)} groups')

            # Forward ALL events to the callback
            self.on_event(data)

        except json.JSONDecodeError:
            pass
        except Exception as e:
            print(f'❌ WS message parse error: {e}')

    def _on_error(self, ws, error):
        print(f'⚠️ WS Error: {error}')

    def _on_close(self, ws, close_status_code, close_msg):
        self.connected = False
        print(f'🔌 WS Disconnected (code: {close_status_code})')
        self.on_event({'type': '_ws_disconnected'})

    def send(self, data):
        """Send a message to the Node.js web server"""
        if self.ws and self.connected:
            try:
                self.ws.send(json.dumps(data))
                return True
            except Exception as e:
                print(f'❌ WS send error: {e}')
        return False

    def send_text_message(self, uid, text, thread_type=0):
        """Send a text message via the web server"""
        return self.send({
            'type': 'send_message',
            'uid': uid,
            'text': text,
            'threadType': thread_type
        })

    def request_friends(self):
        """Request friends list from web server"""
        return self.send({'type': 'get_friends'})

    def request_groups(self):
        """Request groups list from web server"""
        return self.send({'type': 'get_groups'})

    def toggle_auto_reply(self, target_id, enabled):
        """Toggle auto-reply for a specific user"""
        return self.send({
            'type': 'toggle_user_auto_reply',
            'targetId': target_id,
            'enabled': enabled
        })

    def disconnect(self):
        """Gracefully disconnect"""
        self._should_reconnect = False
        if self.ws:
            self.ws.close()
