// syncMessages.js - Sync tin nhắn real-time từ Zalo
const { ThreadType } = require('zca-js');

let syncInterval = null;
let lastSyncTimestamps = new Map(); // Lưu timestamp cuối cùng của mỗi conversation

/**
 * Lấy tin nhắn mới từ một conversation
 */
async function fetchNewMessages(apiState, threadId, isGroup = false) {
  if (!apiState.api || !apiState.isLoggedIn) return [];

  try {
    const threadType = isGroup ? ThreadType.Group : ThreadType.User;
    const lastTimestamp = lastSyncTimestamps.get(threadId) || 0;
    
    // Gọi API lấy tin nhắn
    const result = await apiState.api.getMessages(threadId, threadType, 20);
    
    if (!result || !Array.isArray(result)) return [];

    // Lọc tin nhắn mới (sau timestamp cuối cùng)
    const newMessages = result.filter(msg => {
      const msgTimestamp = msg.ts || msg.timestamp || 0;
      return msgTimestamp > lastTimestamp;
    });

    // Cập nhật timestamp mới nhất
    if (newMessages.length > 0) {
      const maxTimestamp = Math.max(...newMessages.map(m => m.ts || m.timestamp || 0));
      lastSyncTimestamps.set(threadId, maxTimestamp);
    }

    return newMessages;
  } catch (err) {
    // Bỏ qua lỗi rate limit
    if (!err.message?.includes('429')) {
      console.error(`❌ Lỗi fetch messages từ ${threadId}:`, err.message);
    }
    return [];
  }
}

/**
 * Broadcast tin nhắn mới đến tất cả clients
 */
function broadcastMessage(apiState, threadId, message) {
  const msgObj = {
    msgId: message.msgId || message.id || Date.now().toString(),
    content: message.data?.content || message.content || message.msg || '',
    timestamp: message.ts || message.timestamp || Date.now(),
    senderId: message.uidFrom || message.senderId,
    isSelf: (message.uidFrom || message.senderId) === apiState.currentUser?.uid,
    isGroup: message.type === 'Group',
    threadId: threadId
  };

  // Lưu vào memory
  if (!apiState.messageStore.has(threadId)) {
    apiState.messageStore.set(threadId, []);
  }
  
  // Kiểm tra duplicate
  const existing = apiState.messageStore.get(threadId);
  const isDuplicate = existing.some(m => m.msgId === msgObj.msgId);
  
  if (!isDuplicate) {
    existing.push(msgObj);
    
    // Broadcast đến tất cả clients
    const json = JSON.stringify({
      type: 'new_message',
      uid: threadId,
      message: msgObj
    });
    
    apiState.clients.forEach(ws => {
      if (ws.readyState === 1) ws.send(json);
    });
    
    console.log(`📨 Sync tin nhắn mới từ ${threadId}: ${msgObj.content.substring(0, 30)}...`);
  }
}

/**
 * Sync tin nhắn từ các conversation gần đây
 */
async function syncRecentConversations(apiState) {
  if (!apiState.api || !apiState.isLoggedIn) return;

  try {
    // Lấy danh sách conversation gần đây
    const recentThreads = await apiState.api.getRecentChats?.() || [];
    
    for (const thread of recentThreads.slice(0, 10)) { // Chỉ sync 10 conversation gần nhất
      const threadId = thread.threadId || thread.uid || thread.id;
      if (!threadId) continue;

      const newMessages = await fetchNewMessages(apiState, threadId, thread.type === 'Group');
      
      for (const msg of newMessages) {
        broadcastMessage(apiState, threadId, msg);
      }
      
      // Delay nhỏ để tránh rate limit
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (err) {
    if (!err.message?.includes('429')) {
      console.error('❌ Lỗi sync conversations:', err.message);
    }
  }
}

/**
 * Bắt đầu sync định kỳ
 */
function startMessageSync(apiState, intervalMs = 5000) {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  console.log(`🔄 Bắt đầu sync tin nhắn mỗi ${intervalMs/1000}s`);
  
  // Sync ngay lập tức
  syncRecentConversations(apiState);
  
  // Sync định kỳ
  syncInterval = setInterval(() => {
    syncRecentConversations(apiState);
  }, intervalMs);
}

/**
 * Dừng sync
 */
function stopMessageSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('⏹️ Đã dừng sync tin nhắn');
  }
}

/**
 * Reset state khi logout
 */
function resetSyncState() {
  stopMessageSync();
  lastSyncTimestamps.clear();
}

module.exports = {
  startMessageSync,
  stopMessageSync,
  resetSyncState,
  fetchNewMessages,
  syncRecentConversations
};