# database.py - Shared Database Reader
# Reads from the SAME SQLite databases as the web app
import sqlite3
import json
import time
import os


class Database:
    """Reads/writes to shared SQLite databases (same as Node.js web app)"""

    def __init__(self, triggers_db_path, messages_db_path):
        self.triggers_db = triggers_db_path
        self.messages_db = messages_db_path

    def _conn(self, db_path):
        """Create a connection with WAL mode for concurrent access"""
        conn = sqlite3.connect(db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    # ============================================
    # MESSAGE OPERATIONS
    # ============================================
    def get_messages(self, conversation_id, limit=100, offset=0):
        """Get messages for a conversation (same as messageDB.getMessages)"""
        conn = self._conn(self.messages_db)
        try:
            rows = conn.execute(
                "SELECT * FROM messages WHERE conversationId = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?",
                (conversation_id, limit, offset)
            ).fetchall()

            messages = []
            for row in rows:
                msg = dict(row)
                # Parse metadata for image/file data
                if msg.get('metadata'):
                    try:
                        meta = json.loads(msg['metadata'])
                        msg['type'] = meta.get('type', 'text')
                        msg['imageData'] = meta.get('imageData')
                        msg['fileData'] = meta.get('fileData')
                        msg['imageUrl'] = meta.get('imageUrl')
                    except Exception:
                        pass
                else:
                    msg['type'] = 'text'
                messages.append(msg)
            return messages
        finally:
            conn.close()

    def save_message(self, conversation_id, message):
        """Save a message to the shared DB"""
        conn = self._conn(self.messages_db)
        try:
            metadata = None
            if message.get('imageData') or message.get('fileData'):
                metadata = json.dumps({
                    'type': message.get('type'),
                    'imageData': message.get('imageData'),
                    'fileData': message.get('fileData'),
                    'imageUrl': message.get('imageUrl')
                })

            conn.execute("""
                INSERT OR REPLACE INTO messages
                (conversationId, msgId, cliMsgId, globalMsgId, senderId, receiverId,
                 content, timestamp, isSelf, isAutoReply, attachmentType, attachmentPath,
                 attachmentName, attachmentSize, localFilePath, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                conversation_id,
                message.get('msgId', f'msg_{int(time.time() * 1000)}'),
                message.get('cliMsgId'),
                message.get('globalMsgId'),
                message.get('senderId', ''),
                message.get('receiverId', ''),
                message.get('content', ''),
                message.get('timestamp', int(time.time() * 1000)),
                1 if message.get('isSelf') else 0,
                1 if message.get('isAutoReply') else 0,
                message.get('attachmentType'),
                message.get('attachmentPath'),
                message.get('attachmentName'),
                message.get('attachmentSize'),
                message.get('localFilePath'),
                metadata
            ))
            conn.commit()
        except sqlite3.IntegrityError:
            pass  # Duplicate message
        finally:
            conn.close()

    def get_last_message(self, conversation_id):
        """Get last message for a conversation"""
        conn = self._conn(self.messages_db)
        try:
            row = conn.execute(
                "SELECT content, timestamp, isSelf FROM messages WHERE conversationId = ? ORDER BY timestamp DESC LIMIT 1",
                (conversation_id,)
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def get_all_last_messages(self):
        """Get last message for ALL conversations (for friend list enrichment)"""
        conn = self._conn(self.messages_db)
        try:
            rows = conn.execute("""
                SELECT conversationId, content, timestamp, isSelf
                FROM messages
                WHERE (conversationId, timestamp) IN (
                    SELECT conversationId, MAX(timestamp) FROM messages GROUP BY conversationId
                )
            """).fetchall()
            result = {}
            for row in rows:
                result[row['conversationId']] = {
                    'lastMessage': row['content'] or '',
                    'timestamp': row['timestamp'],
                    'isSelf': bool(row['isSelf'])
                }
            return result
        finally:
            conn.close()

    def get_dashboard_stats(self, user_uid=None):
        """Get message/file counts"""
        conn = self._conn(self.messages_db)
        try:
            if user_uid:
                sent = conn.execute("SELECT COUNT(*) as c FROM messages WHERE isSelf=1 AND senderId=?", (user_uid,)).fetchone()['c']
            else:
                sent = conn.execute("SELECT COUNT(*) as c FROM messages WHERE isSelf=1").fetchone()['c']
            recv = conn.execute("SELECT COUNT(*) as c FROM messages WHERE isSelf=0").fetchone()['c']
            return {'sentMessages': sent, 'receivedMessages': recv}
        finally:
            conn.close()

    # ============================================
    # TRIGGER / SETTINGS OPERATIONS
    # ============================================
    def get_user_setting(self, user_uid, target_id, key):
        """Get a user setting from triggers DB"""
        conn = self._conn(self.triggers_db)
        try:
            row = conn.execute(
                "SELECT settingValue FROM user_settings WHERE userId=? AND targetId=? AND settingKey=?",
                (user_uid, target_id, key)
            ).fetchone()
            return row['settingValue'] if row else None
        finally:
            conn.close()

    def get_auto_reply_blacklist(self, user_uid):
        """Get list of UIDs where auto-reply is disabled"""
        conn = self._conn(self.triggers_db)
        try:
            rows = conn.execute(
                "SELECT targetId FROM user_settings WHERE userId=? AND settingKey='auto_reply_enabled' AND settingValue='false'",
                (user_uid,)
            ).fetchall()
            return [row['targetId'] for row in rows]
        finally:
            conn.close()

    def get_triggers_by_user(self, user_uid):
        """Get all triggers for a user"""
        conn = self._conn(self.triggers_db)
        try:
            rows = conn.execute(
                "SELECT * FROM triggers WHERE triggerUserID = ? ORDER BY timeCreated DESC",
                (user_uid,)
            ).fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def save_trigger(self, user_uid, trigger_data):
        """Create or update a trigger"""
        conn = self._conn(self.triggers_db)
        try:
            if trigger_data.get('id'):
                # Update
                conn.execute('''
                    UPDATE triggers SET 
                    triggerName = ?, triggerKey = ?, triggerType = ?, 
                    triggerContent = ?, enabled = ?, timeUpdate = ?
                    WHERE id = ? AND triggerUserID = ?
                ''', (
                    trigger_data.get('triggerName', ''),
                    trigger_data.get('triggerKey', ''),
                    trigger_data.get('triggerType', 'keyword'),
                    trigger_data.get('triggerContent', ''),
                    1 if trigger_data.get('enabled') else 0,
                    int(time.time() * 1000),
                    trigger_data.get('id'),
                    user_uid
                ))
            else:
                # Insert
                conn.execute('''
                    INSERT INTO triggers (
                        triggerName, triggerKey, triggerType, triggerUserID, 
                        triggerContent, timeStartActive, timeEndActive, 
                        cooldown, scope, enabled, setMode, timeCreated, timeUpdate
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    trigger_data.get('triggerName', 'New Trigger'),
                    trigger_data.get('triggerKey', ''),
                    trigger_data.get('triggerType', 'keyword'),
                    user_uid,
                    trigger_data.get('triggerContent', ''),
                    '00:00', '23:59', 30000, 0, 
                    1 if trigger_data.get('enabled', True) else 0,
                    0, int(time.time() * 1000), int(time.time() * 1000)
                ))
            conn.commit()
        finally:
            conn.close()

    def toggle_trigger(self, trigger_id, user_uid, enabled):
        """Toggle a trigger's status"""
        conn = self._conn(self.triggers_db)
        try:
            conn.execute(
                "UPDATE triggers SET enabled = ?, timeUpdate = ? WHERE id = ? AND triggerUserID = ?",
                (1 if enabled else 0, int(time.time() * 1000), trigger_id, user_uid)
            )
            conn.commit()
        finally:
            conn.close()

    def delete_trigger(self, trigger_id, user_uid):
        """Delete a trigger"""
        conn = self._conn(self.triggers_db)
        try:
            conn.execute("DELETE FROM triggers WHERE id = ? AND triggerUserID = ?", (trigger_id, user_uid))
            conn.commit()
        finally:
            conn.close()
