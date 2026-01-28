// messageDB.js - SQLite module for message storage
const path = require('path');
const fs = require('fs');

let db = null;

// ============================================
// INITIALIZE DATABASE
// ============================================
function init() {
    try {
        const Database = require('better-sqlite3');
        const dbPath = path.join(__dirname, 'data', 'messages.db');

        const dataDir = path.dirname(dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = new Database(dbPath);

        // MESSAGES TABLE
        db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversationId TEXT NOT NULL,
        msgId TEXT UNIQUE,
        cliMsgId TEXT,
        globalMsgId TEXT,
        senderId TEXT NOT NULL,
        receiverId TEXT,
        content TEXT,
        timestamp INTEGER NOT NULL,
        isSelf INTEGER DEFAULT 0,
        isAutoReply INTEGER DEFAULT 0,
        attachmentType TEXT,
        attachmentPath TEXT,
        attachmentName TEXT,
        attachmentSize INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // INDEXES
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_msgId ON messages(msgId);
      CREATE INDEX IF NOT EXISTS idx_messages_cliMsgId ON messages(cliMsgId);
      CREATE INDEX IF NOT EXISTS idx_messages_globalMsgId ON messages(globalMsgId);
    `);

        // FILE ACTIVITY LOGS (NEW)
        db.exec(`
      CREATE TABLE IF NOT EXISTS file_activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        senderId TEXT NOT NULL,
        fileName TEXT,
        fileType TEXT,
        action TEXT, -- RECEIVED, PRINTED
        status TEXT, -- SUCCESS, FAIL
        details TEXT
      )
    `);

        // RECEIVED FILES (LEGACY/BACKUP)
        db.exec(`
      CREATE TABLE IF NOT EXISTS received_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversationId TEXT NOT NULL,
        msgId TEXT,
        fileName TEXT NOT NULL,
        filePath TEXT NOT NULL,
        fileSize INTEGER,
        mimeType TEXT,
        senderId TEXT,
        timestamp INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // ============================================
        // AUTO MIGRATION (Fix for Render/Production)
        // ============================================
        try {
            const tableInfo = db.prepare('PRAGMA table_info(messages)').all();

            if (!tableInfo.some(c => c.name === 'cliMsgId')) {
                console.log('🔄 Auto-Migration: Adding cliMsgId column...');
                db.exec('ALTER TABLE messages ADD COLUMN cliMsgId TEXT');
            }

            if (!tableInfo.some(c => c.name === 'globalMsgId')) {
                console.log('🔄 Auto-Migration: Adding globalMsgId column...');
                db.exec('ALTER TABLE messages ADD COLUMN globalMsgId TEXT');
            }

            if (!tableInfo.some(c => c.name === 'metadata')) {
                console.log('🔄 Auto-Migration: Adding metadata column for image/file data...');
                db.exec('ALTER TABLE messages ADD COLUMN metadata TEXT');
            }
        } catch (migErr) {
            console.error('⚠️ Auto-Migration failed (might be already up to date):', migErr.message);
        }

        console.log('✅ MessageDB initialized:', dbPath);
        return true;
    } catch (err) {
        console.error('❌ MessageDB init error:', err.message);
        return false;
    }
}

// ============================================
// SAVE MESSAGE
// ============================================
function saveMessage(conversationId, message) {
    if (!db) return null;
    try {
        // Serialize metadata for images and files
        let metadata = null;
        if (message.imageData || message.fileData) {
            metadata = JSON.stringify({
                type: message.type,
                imageData: message.imageData || null,
                fileData: message.fileData || null,
                imageUrl: message.imageUrl || null
            });
        }

        const stmt = db.prepare(`
      INSERT OR REPLACE INTO messages 
      (conversationId, msgId, cliMsgId, globalMsgId, senderId, receiverId, content, timestamp, isSelf, isAutoReply, attachmentType, attachmentPath, attachmentName, attachmentSize, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(
            conversationId,
            message.msgId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            message.cliMsgId || null,
            message.globalMsgId || null,
            message.senderId || '',
            message.receiverId || '',
            message.content || message.msg || '',
            message.timestamp || Date.now(),
            message.isSelf ? 1 : 0,
            message.isAutoReply ? 1 : 0,
            message.attachmentType || null,
            message.attachmentPath || null,
            message.attachmentName || null,
            message.attachmentSize || null,
            metadata
        );
        console.log(`💾 Saved message to DB: conversation=${conversationId}, msgId=${message.msgId}, content="${message.content?.substring(0, 30)}"`);
        return result.lastInsertRowid;
    } catch (err) {
        if (err.message.includes('UNIQUE constraint')) {
            console.log(`⚠️  Duplicate message skipped (UNIQUE constraint): msgId=${message.msgId}, conversation=${conversationId}`);
        } else {
            console.error('❌ Save message error:', err.message);
        }
        return null;
    }
}

// ============================================
// LOG FILE ACTIVITY (NEW)
// ============================================
function logFileActivity(senderId, fileName, fileType, action, status, details = '') {
    if (!db) return;
    try {
        const stmt = db.prepare(`
       INSERT INTO file_activity_logs (timestamp, senderId, fileName, fileType, action, status, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(Date.now(), senderId, fileName || 'unknown', fileType || 'unknown', action, status, details);
    } catch (e) {
        console.error('Log file activity error:', e);
    }
}

// ============================================
// DASHBOARD STATS (NEW)
// ============================================
function getDashboardStats() {
    if (!db) return { msgCount: 0, fileCount: 0, printSuccess: 0, printFail: 0 };
    try {
        const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
        const fileCount = db.prepare("SELECT COUNT(*) as c FROM file_activity_logs WHERE action='RECEIVED'").get().c;
        const printSuccess = db.prepare("SELECT COUNT(*) as c FROM file_activity_logs WHERE action='PRINTED' AND status='SUCCESS'").get().c;
        const printFail = db.prepare("SELECT COUNT(*) as c FROM file_activity_logs WHERE action='PRINTED' AND status='FAIL'").get().c;

        return { msgCount, fileCount, printSuccess, printFail };
    } catch (e) {
        return { msgCount: 0, fileCount: 0, printSuccess: 0, printFail: 0 };
    }
}

function getTopUsers(limit = 10) {
    if (!db) return { topMsg: [], topFiles: [] };
    try {
        const topMsg = db.prepare(`SELECT senderId, COUNT(*) as count FROM messages WHERE isSelf=0 GROUP BY senderId ORDER BY count DESC LIMIT ?`).all(limit);
        const topFiles = db.prepare(`SELECT senderId, COUNT(*) as count FROM file_activity_logs WHERE action='RECEIVED' GROUP BY senderId ORDER BY count DESC LIMIT ?`).all(limit);
        return { topMsg, topFiles };
    } catch (e) {
        return { topMsg: [], topFiles: [] };
    }
}

function getFileLogs(limit = 100) {
    if (!db) return [];
    try {
        return db.prepare('SELECT * FROM file_activity_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
    } catch (e) { return []; }
}

function deleteConversation(conversationId) {
    if (!db) return;
    try {
        db.prepare('DELETE FROM messages WHERE conversationId = ? OR senderId = ?').run(conversationId, conversationId);
        // Also delete logs for privacy if requested? Or keep logs? User asked "xóa toàn bộ đoạn hội thoại". 
        // Keeping logs might be better for "Quản lý dữ liệu".
    } catch (e) { }
}

// ============================================
// STANDARD GETTERS
// ============================================
function getMessages(conversationId, limit = 100, offset = 0) {
    if (!db) return [];
    try {
        const stmt = db.prepare(`SELECT * FROM messages WHERE conversationId = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`);
        const rows = stmt.all(conversationId, limit, offset);

        // Parse metadata and restore imageData/fileData
        return rows.map(row => {
            const message = { ...row };

            // Parse metadata if exists
            if (row.metadata) {
                try {
                    const parsed = JSON.parse(row.metadata);
                    message.type = parsed.type || message.type;
                    message.imageData = parsed.imageData;
                    message.fileData = parsed.fileData;
                    message.imageUrl = parsed.imageUrl;
                } catch (e) {
                    console.error(`Failed to parse metadata for msgId ${row.msgId}:`, e.message);
                }
            }

            return message;
        });
    } catch (err) {
        console.error('getMessages error:', err.message);
        return [];
    }
}

function getLastMessage(conversationId) {
    if (!db) return null;
    try {
        const row = db.prepare(`SELECT * FROM messages WHERE conversationId = ? ORDER BY timestamp DESC LIMIT 1`).get(conversationId);
        return row ? {
            msgId: row.msgId,
            cliMsgId: row.cliMsgId,
            globalMsgId: row.globalMsgId,
            senderId: row.senderId,
            receiverId: row.receiverId,
            content: row.content,
            timestamp: row.timestamp,
            isSelf: !!row.isSelf
        } : null;
    } catch (err) { return null; }
}

function getAllConversations() {
    if (!db) return [];
    try {
        return db.prepare(`SELECT conversationId, MAX(timestamp) as lastTimestamp, COUNT(*) as messageCount FROM messages GROUP BY conversationId ORDER BY lastTimestamp DESC`).all();
    } catch (err) { return []; }
}

// Support Legacy received_files logic if needed
function saveReceivedFile(conversationId, fileInfo) {
    if (!db) return null;
    try {
        // Also log to new table
        logFileActivity(conversationId, fileInfo.fileName, fileInfo.mimeType, 'RECEIVED', 'SUCCESS', '');

        const stmt = db.prepare(`INSERT INTO received_files (conversationId, msgId, fileName, filePath, fileSize, mimeType, senderId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        return stmt.run(conversationId, fileInfo.msgId, fileInfo.fileName, fileInfo.filePath, fileInfo.fileSize, fileInfo.mimeType, fileInfo.senderId, Date.now()).lastInsertRowid;
    } catch (err) { return null; }
}

function getReceivedFiles(conversationId, limit = 50) {
    if (!db) return [];
    try { return db.prepare(`SELECT * FROM received_files WHERE conversationId = ? ORDER BY timestamp DESC LIMIT ?`).all(conversationId, limit); } catch (e) { return []; }
}

// ============================================
// LAST MESSAGE HELPERS (For Friend List Enrichment)
// ============================================

/**
 * Get last message for a specific conversation
 * @param {string} conversationId - Conversation ID (userId)
 * @returns {object|null} Last message with content and timestamp
 */
function getLastMessageForConversation(conversationId) {
    if (!db) return null;
    try {
        const stmt = db.prepare(`
            SELECT content, timestamp, isSelf
            FROM messages 
            WHERE conversationId = ? 
            ORDER BY timestamp DESC 
            LIMIT 1
        `);
        return stmt.get(conversationId);
    } catch (e) {
        console.error(`Failed to get last message for ${conversationId}:`, e.message);
        return null;
    }
}

/**
 * Get last messages for ALL conversations (for friend list enrichment)
 * @returns {Map} Map of conversationId -> {lastMessage, timestamp, isSelf}
 */
function getAllLastMessages() {
    if (!db) return new Map();
    try {
        // Get last message per conversation using subquery
        const stmt = db.prepare(`
            SELECT conversationId, content, timestamp, isSelf
            FROM messages
            WHERE (conversationId, timestamp) IN (
                SELECT conversationId, MAX(timestamp) 
                FROM messages 
                GROUP BY conversationId
            )
        `);

        const rows = stmt.all();
        const map = new Map();

        rows.forEach(row => {
            map.set(row.conversationId, {
                lastMessage: row.content || '',
                timestamp: row.timestamp,
                isSelf: row.isSelf === 1
            });
        });

        console.log(`📊 Retrieved last messages for ${map.size} conversations`);
        return map;
    } catch (e) {
        console.error('Failed to get all last messages:', e.message);
        return new Map();
    }
}

module.exports = {
    init,
    saveMessage,
    getMessages,
    getLastMessage,
    saveReceivedFile,
    getReceivedFiles,
    getAllConversations,
    // NEW - Friend List Enrichment
    getLastMessageForConversation,
    getAllLastMessages,
    // Activity Logs
    logFileActivity,
    getDashboardStats,
    getTopUsers,
    getFileLogs,
    deleteConversation
};
