# flask_app.py - Flask + SocketIO Server for Easy Zalo
from flask import Flask, render_template, jsonify, request, send_file, redirect, Response
from flask_socketio import SocketIO, emit
import requests as http_requests
import os
import json
from io import BytesIO


def create_app(config, database, ws_client):
    """Create and configure Flask + SocketIO app"""

    app = Flask(__name__,
                template_folder=os.path.join(config.BASE_DIR, 'templates'),
                static_folder=os.path.join(config.BASE_DIR, 'static'))
    app.config['SECRET_KEY'] = 'easyzalo-secret-2026'

    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

    # Shared app state
    state = {
        'current_user': None,
        'is_logged_in': False,
        'friends': [],
        'groups': [],
        'blacklist': []
    }

    # Store references
    app.socketio = socketio
    app.state = state
    app.ws_client = ws_client
    app.database = database

    # ============================================
    # WS CLIENT EVENT HANDLER
    # ============================================
    def handle_ws_event(data):
        """Handle events from Node.js web server and forward to frontend"""
        msg_type = data.get('type', '')

        if msg_type == 'current_user':
            user = data.get('user')
            if user:
                state['current_user'] = user
                state['is_logged_in'] = True
                # Request friends/groups after login
                ws_client.request_friends()
                ws_client.request_groups()
            socketio.emit('current_user', data)

        elif msg_type == 'session_info':
            state['is_logged_in'] = data.get('isLoggedIn', False)
            socketio.emit('session_info', data)

        elif msg_type == 'friends_list':
            friends = data.get('friends', [])
            state['friends'] = friends
            # Enrich with last messages from DB
            last_msgs = database.get_all_last_messages()
            for f in friends:
                uid = f.get('userId')
                if uid and uid in last_msgs:
                    f['lastMessage'] = last_msgs[uid].get('lastMessage', '')
                    f['lastTimestamp'] = last_msgs[uid].get('timestamp', 0)
                    f['lastIsSelf'] = last_msgs[uid].get('isSelf', False)
            socketio.emit('friends_list', {'friends': friends})

        elif msg_type == 'groups_list':
            state['groups'] = data.get('groups', [])
            socketio.emit('groups_list', data)

        elif msg_type == 'new_message':
            socketio.emit('new_message', data)

        elif msg_type == 'conversation_updated':
            socketio.emit('conversation_updated', data)

        elif msg_type == 'friend_event':
            socketio.emit('friend_event', data)

        elif msg_type == 'typing':
            socketio.emit('typing', data)

        elif msg_type == 'image_received':
            socketio.emit('image_received', data)

        elif msg_type == 'file_received':
            socketio.emit('file_received', data)

        elif msg_type == 'reaction_received':
            socketio.emit('reaction_received', data)

        elif msg_type == 'auto_reply_blacklist':
            state['blacklist'] = data.get('blacklist', [])
            socketio.emit('auto_reply_blacklist', data)

        elif msg_type == 'send_message_result':
            socketio.emit('send_message_result', data)

        elif msg_type == '_ws_connected':
            socketio.emit('ws_status', {'connected': True})

        elif msg_type == '_ws_disconnected':
            socketio.emit('ws_status', {'connected': False})
            state['is_logged_in'] = False

    # Register the handler
    ws_client.on_event = handle_ws_event

    # ============================================
    # PAGE ROUTES
    # ============================================
    @app.route('/')
    def index():
        if state['is_logged_in'] and state['current_user']:
            return redirect('/dashboard')
        return render_template('login.html')

    @app.route('/dashboard')
    def dashboard():
        return render_template('dashboard.html')

    # ============================================
    # API ROUTES
    # ============================================
    @app.route('/api/session-status')
    def session_status():
        return jsonify({
            'isLoggedIn': state['is_logged_in'],
            'hasUser': state['current_user'] is not None,
            'wsConnected': ws_client.connected
        })

    @app.route('/api/current-user')
    def current_user():
        if state['current_user']:
            return jsonify(state['current_user'])
        return jsonify({'error': 'No user logged in'}), 404

    @app.route('/qr.png')
    def qr_code():
        """Proxy QR code from web server"""
        try:
            r = http_requests.get(f'{config.WEB_SERVER_URL}/qr.png', timeout=5)
            if r.status_code == 200:
                resp = Response(r.content, mimetype='image/png')
                resp.headers['Cache-Control'] = 'no-cache, no-store'
                return resp
        except Exception:
            pass
        # Fallback to local QR
        qr_path = os.path.join(config.PROJECT_ROOT, 'qr.png')
        if os.path.exists(qr_path):
            return send_file(qr_path, mimetype='image/png')
        return jsonify({'error': 'QR not found'}), 404

    @app.route('/api/messages/<conversation_id>')
    def get_messages(conversation_id):
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        messages = database.get_messages(conversation_id, limit, offset)
        return jsonify(messages)

    @app.route('/api/stats')
    def get_stats():
        uid = state['current_user'].get('uid') if state['current_user'] else None
        return jsonify(database.get_dashboard_stats(uid))

    @app.route('/api/proxy-file')
    def proxy_file():
        """Proxy file downloads through the web server"""
        try:
            r = http_requests.get(
                f'{config.WEB_SERVER_URL}/api/proxy-file',
                params=dict(request.args),
                timeout=30, stream=True
            )
            return Response(
                r.iter_content(chunk_size=8192),
                content_type=r.headers.get('content-type', 'application/octet-stream'),
                headers={'Content-Disposition': r.headers.get('Content-Disposition', '')}
            )
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    # ============================================
    # SOCKETIO EVENTS (Frontend → Python → Node.js)
    # ============================================
    @socketio.on('connect')
    def handle_connect():
        print('🌐 Frontend client connected')
        if state['current_user']:
            emit('current_user', {'user': state['current_user']})
            # Send cached friends if available
            if state['friends']:
                last_msgs = database.get_all_last_messages()
                friends = state['friends'].copy()
                for f in friends:
                    uid = f.get('userId')
                    if uid and uid in last_msgs:
                        f['lastMessage'] = last_msgs[uid].get('lastMessage', '')
                        f['lastTimestamp'] = last_msgs[uid].get('timestamp', 0)
                emit('friends_list', {'friends': friends})
            if state['groups']:
                emit('groups_list', {'groups': state['groups']})
        else:
            emit('session_info', {'isLoggedIn': False})
        # Always send WS status
        emit('ws_status', {'connected': ws_client.connected})

    @socketio.on('request_friends')
    def handle_request_friends():
        if state['friends']:
            last_msgs = database.get_all_last_messages()
            friends = state['friends'].copy()
            for f in friends:
                uid = f.get('userId')
                if uid and uid in last_msgs:
                    f['lastMessage'] = last_msgs[uid].get('lastMessage', '')
                    f['lastTimestamp'] = last_msgs[uid].get('timestamp', 0)
            emit('friends_list', {'friends': friends})
        else:
            ws_client.request_friends()

    @socketio.on('request_groups')
    def handle_request_groups():
        if state['groups']:
            emit('groups_list', {'groups': state['groups']})
        else:
            ws_client.request_groups()

    @socketio.on('request_messages')
    def handle_request_messages(data):
        uid = data.get('uid')
        if uid:
            messages = database.get_messages(uid)
            emit('message_history', {'uid': uid, 'messages': messages})

    @socketio.on('send_message')
    def handle_send_message(data):
        uid = data.get('uid')
        message = data.get('message', '')
        thread_type = data.get('threadType', 0)
        if uid and message:
            ws_client.send_text_message(uid, message, thread_type)

    @socketio.on('toggle_auto_reply')
    def handle_toggle_auto_reply(data):
        ws_client.toggle_auto_reply(
            data.get('targetId'),
            data.get('enabled')
        )

    @socketio.on('request_blacklist')
    def handle_request_blacklist():
        ws_client.send({'type': 'get_auto_reply_blacklist'})

    return app, socketio
