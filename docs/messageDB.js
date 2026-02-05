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

        // ✅ MESSAGE REACTIONS TABLE
        db.exec(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        msgId TEXT NOT NULL,
        userId TEXT NOT NULL,
        icon TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        UNIQUE(msgId, userId)
      )
    `);

        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reactions_msgId ON message_reactions(msgId);
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

            if (!tableInfo.some(c => c.name === 'localFilePath')) {
                console.log('🔄 Auto-Migration: Adding localFilePath column for downloaded files...');
                db.exec('ALTER TABLE messages ADD COLUMN localFilePath TEXT');
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
      (conversationId, msgId, cliMsgId, globalMsgId, senderId, receiverId, content, timestamp, isSelf, isAutoReply, attachmentType, attachmentPath, attachmentName, attachmentSize, localFilePath, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            message.localFilePath || null,
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
// ============================================
// DASHBOARD STATS (UPDATED)
// ============================================
// ============================================
// DASHBOARD STATS (UPDATED)
// ============================================
function getDashboardStats(userUID) {
    if (!db) return { sentMessages: 0, receivedMessages: 0, sentFiles: 0, receivedFiles: 0 };
    try {
        let sentSql = 'SELECT COUNT(*) as c FROM messages WHERE isSelf=1';
        let recvSql = 'SELECT COUNT(*) as c FROM messages WHERE isSelf=0';
        let sentFilesSql = "SELECT COUNT(*) as c FROM messages WHERE isSelf=1 AND attachmentType IN ('image', 'file', 'video', 'audio')";
        let recvFilesSql = "SELECT COUNT(*) as c FROM messages WHERE isSelf=0 AND attachmentType IN ('image', 'file', 'video', 'audio')";

        const params = [];

        // Filter by User UID if provided
        if (userUID) {
            const userFilter = " AND senderId = ?"; // For sent messages, sender is me
            const recvFilter = " AND IFNULL(receiverId, '') = ?"; // For received, receiver is me (handled carefully)

            // Actually, simplest is:
            // Sent: senderId = userUID
            // Received: We might not always have receiverId populated correctly in all versions, 
            // but usually it should be the current user.
            // Let's rely on: if isSelf=1 then senderId MUST be userUID.

            sentSql += " AND senderId = ?";
            // For received, we assume all received messages in DB *when logged in as X* belong to X.
            // But if DB is shared, we validly need to filter.
            // Since receiverId might be group ID in group chats? No, receiverId usually is ME in 1-1. 
            // In groups, receiverId is GroupID.
            // So safe bet: Filter Sent by senderId. For Received, it's harder if we don't store "AccountOwner".
            // Let's assume for now filtering Sent is most critical to check "My Sent". 
            // For received, if we can't easily filter, we might show all or try filtering by not-sender?

            // Better approach: When saving messages, we don't store "OwnerUID".
            // Let's stick to senderId for SENT.
            // For RECEIVED: we can't easily filter without a new column "ownerId". 
            // BUT, if we assume the user mainly cares about what THEY sent via this tool:

            // Let's just filter SENT stats for now if simple. 
            // Wait, user specifically asked "thông tin lưu trữ ... bị sang tài khoản mới".
            // This implies EVERYTHING.

            // IF we assume single-user DB usage pattern, we don't need this. 
            // But clearly user has data bleed.
            // Current DB `messages.db` is global.

            // Let's add simple senderId filter for isSelf=1.
        }

        // RE-WRITING QUERIES WITH OPTIONAL FILTER
        // Note: We use named parameters or simpler logic

        let sentMsgCount = 0;
        let recvMsgCount = 0;
        let sentFileCount = 0;
        let recvFileCount = 0;

        if (userUID) {
            sentMsgCount = db.prepare("SELECT COUNT(*) as c FROM messages WHERE isSelf=1 AND senderId = ?").get(userUID).c;
            // For received, we allow all for now as filtering group messages is complex without 'owner' column
            // OR we can rely on verifying senderId != userUID ?
            recvMsgCount = db.prepare("SELECT COUNT(*) as c FROM messages WHERE isSelf=0").get().c;

            sentFileCount = db.prepare("SELECT COUNT(*) as c FROM messages WHERE isSelf=1 AND attachmentType IN ('image', 'file', 'video', 'audio') AND senderId = ?").get(userUID).c;
            recvFileCount = db.prepare("SELECT COUNT(*) as c FROM messages WHERE isSelf=0 AND attachmentType IN ('image', 'file', 'video', 'audio')").get().c;
        } else {
            // Legacy/Global mode
            sentMsgCount = db.prepare("SELECT COUNT(*) as c FROM messages WHERE isSelf=1").get().c;
            recvMsgCount = db.prepare("SELECT COUNT(*) as c FROM messages WHERE isSelf=0").get().c;
            sentFileCount = db.prepare("SELECT COUNT(*) as c FROM messages WHERE isSelf=1 AND attachmentType IN ('image', 'file', 'video', 'audio')").get().c;
            recvFileCount = db.prepare("SELECT COUNT(*) as c FROM messages WHERE isSelf=0 AND attachmentType IN ('image', 'file', 'video', 'audio')").get().c;
        }

        return { sentMessages: sentMsgCount, receivedMessages: recvMsgCount, sentFiles: sentFileCount, receivedFiles: recvFileCount };
    } catch (e) {
        console.error('getDashboardStats error:', e.message);
        return { sentMessages: 0, receivedMessages: 0, sentFiles: 0, receivedFiles: 0 };
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

function getFileLogs(limit = 100, userUID = null) {
    if (!db) return [];
    try {
        // Fetch files from messages table directly (more reliable)
        // UNION SENT and RECEIVED files

        let query = `
            SELECT msgId, timestamp, senderId, receiverId, isSelf, attachmentName as fileName, attachmentType as fileType, 
            CASE WHEN isSelf=1 THEN 'SENT' ELSE 'RECEIVED' END as action
            FROM messages
            WHERE attachmentType IN ('image', 'file', 'video', 'audio')
        `;

        const params = [];

        if (userUID) {
            // Filter: 
            // 1. Sent by User (isSelf=1 AND senderId=uid)
            // 2. Received (isSelf=0) - Hard to filter strictly but we can exclude "Sent by others that is NOT this user"?
            // Actually, for file logs, we primarily want to see what THIS user interacted with.
            // If message is in DB, it's likely relevant.
            // But to fix "data bleeding", we should filter.

            // Strict filter: Show ONLY files sent by this user, OR received in conversations this user is part of?
            // SQLite doesn't know who "me" is easily for received messages in shared DB.
            // Compromise: Filter SENT messages by senderId. 
            // Show ALL received? Or filter if we can? 

            // Let's add simple senderId filter for SENT messages.
            query += " AND ( (isSelf=1 AND senderId = ?) OR (isSelf=0) )";
            params.push(userUID);
        }

        query += " ORDER BY timestamp DESC LIMIT ?";
        params.push(limit);

        return db.prepare(query).all(...params);
    } catch (e) {
        console.error('getFileLogs error:', e.message);
        return [];
    }
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

function getReceivedFiles(userUID, limit = 100) {
    if (!db) return [];
    try {
        // Query from messages table for files received by this user
        const query = `
            SELECT 
                id,
                senderId,
                msgId,
                content,
                timestamp,
                attachmentPath as fileUrl,
                attachmentName as fileName,
                attachmentSize as fileSize,
                attachmentType as fileType
            FROM messages
            WHERE isSelf = 0
                AND attachmentType IS NOT NULL
                AND attachmentType != ''
            ORDER BY timestamp DESC
            LIMIT ?
        `;

        const files = db.prepare(query).all(limit);

        return files.map(f => ({
            id: f.id,
            senderId: f.senderId,
            senderName: null, // Could fetch from friends table if available
            fileName: f.fileName || 'unknown',
            fileSize: f.fileSize || 0,
            fileType: f.fileType || 'other',
            fileUrl: f.fileUrl,
            timestamp: f.timestamp
        }));
    } catch (error) {
        console.error('❌ Get received files error:', error.message);
        return [];
    }
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

// ============================================
// REACTION MANAGEMENT
// ============================================
function saveReaction(msgId, userId, icon) {
    if (!db) return false;
    try {
        const stmt = db.prepare(`
      INSERT OR REPLACE INTO message_reactions (msgId, userId, icon, timestamp)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(msgId, userId, icon, Date.now());
        console.log(`✅ Saved reaction: ${icon} by ${userId} on message ${msgId}`);
        return true;
    } catch (e) {
        console.error('Failed to save reaction:', e.message);
        return false;
    }
}

function getReactions(msgId) {
    if (!db) return [];
    try {
        const stmt = db.prepare(`
      SELECT userId, icon, timestamp 
      FROM message_reactions 
      WHERE msgId = ?
      ORDER BY timestamp ASC
    `);
        const reactions = stmt.all(msgId);
        return reactions;
    } catch (e) {
        console.error('Failed to get reactions:', e.message);
        return [];
    }
}

function deleteReaction(msgId, userId) {
    if (!db) return false;
    try {
        const stmt = db.prepare(`
      DELETE FROM message_reactions 
      WHERE msgId = ? AND userId = ?
    `);
        const result = stmt.run(msgId, userId);
        console.log(`🗑️ Deleted reaction by ${userId} on message ${msgId}`);
        return result.changes > 0;
    } catch (e) {
        console.error('Failed to delete reaction:', e.message);
        return false;
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
    deleteConversation,
    // Reactions
    saveReaction,
    getReactions,
    deleteReaction
};
