// sync_client.js - Client-side sync functionality
// Thêm vào dashboard.html

// ========== AUTO SYNC CONFIG ==========
const SYNC_INTERVAL = 5000; // Sync mỗi 5 giây
let syncTimer = null;
let isSyncing = false;

// ========== SYNC FUNCTIONS ==========

/**
 * Sync tất cả conversation
 */
function syncAllMessages() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('⚠️ WebSocket chưa sẵn sàng');
    return;
  }

  if (isSyncing) {
    console.log('⏳ Đang sync...');
    return;
  }

  isSyncing = true;
  console.log('🔄 Bắt đầu sync tin nhắn...');

  ws.send(JSON.stringify({ type: 'sync_messages' }));

  // Reset flag sau 10 giây (timeout)
  setTimeout(() => {
    isSyncing = false;
  }, 10000);
}

/**
 * Sync conversation hiện tại
 */
function syncCurrentConversation() {
  if (!selectedFriend || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  console.log(`🔄 Sync conversation: ${selectedFriend.userId}`);
  ws.send(JSON.stringify({
    type: 'sync_conversation',
    uid: selectedFriend.userId,
    isGroup: false
  }));
}

/**
 * Bắt đầu auto sync
 */
function startAutoSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
  }

  console.log(`✅ Bật auto sync (mỗi ${SYNC_INTERVAL / 1000}s)`);

  // Sync ngay lập tức
  syncAllMessages();

  // Sync định kỳ
  syncTimer = setInterval(() => {
    syncAllMessages();
  }, SYNC_INTERVAL);
}

/**
 * Dừng auto sync
 */
function stopAutoSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('⏹️ Đã tắt auto sync');
  }
}

// ========== ENHANCED WEBSOCKET HANDLER ==========

/**
 * Xử lý message từ server (thêm vào ws.onmessage)
 */
function handleSyncMessages(data) {
  // Xử lý sync complete
  if (data.type === 'sync_complete') {
    isSyncing = false;
    console.log('✅ Sync hoàn tất');
  }

  // Xử lý sync error
  if (data.type === 'sync_error') {
    isSyncing = false;
    console.error('❌ Sync lỗi:', data.error);
  }
}

// ========== UI COMPONENTS ==========

/**
 * Thêm nút sync vào UI
 */
function addSyncButton() {
  const userInfo = document.getElementById('userInfo');
  if (!userInfo) return;

  // Kiểm tra nếu đã có nút
  if (document.getElementById('syncBtn')) return;

  const syncBtn = document.createElement('button');
  syncBtn.id = 'syncBtn';
  syncBtn.className = 'sync-button';
  syncBtn.innerHTML = '🔄 Sync';
  syncBtn.title = 'Đồng bộ tin nhắn mới';
  syncBtn.onclick = () => {
    syncBtn.innerHTML = '⏳ Đang sync...';
    syncBtn.disabled = true;

    syncAllMessages();

    setTimeout(() => {
      syncBtn.innerHTML = '🔄 Sync';
      syncBtn.disabled = false;
    }, 3000);
  };

  // Thêm CSS
  const style = document.createElement('style');
  style.textContent = `
    .sync-button {
      background: linear-gradient(135deg, #00a884, #008f6f);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
      margin-top: 8px;
    }
    
    .sync-button:hover {
      background: linear-gradient(135deg, #008f6f, #007a5e);
      transform: translateY(-1px);
    }
    
    .sync-button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    
    .sync-indicator {
      position: fixed;
      top: 10px;
      right: 10px;
      background: #00a884;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      z-index: 9999;
      animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .auto-sync-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      font-size: 12px;
      color: #666;
    }
    
    .auto-sync-toggle input[type="checkbox"] {
      width: 16px;
      height: 16px;
    }
  `;
  document.head.appendChild(style);

  // Thêm toggle auto sync
  const autoSyncDiv = document.createElement('div');
  autoSyncDiv.className = 'auto-sync-toggle';
  autoSyncDiv.innerHTML = `
    <input type="checkbox" id="autoSyncToggle" checked>
    <label for="autoSyncToggle">Tự động đồng bộ</label>
  `;

  const buttonGroup = userInfo.querySelector('.button-group');
  if (buttonGroup) {
    buttonGroup.appendChild(syncBtn);
    buttonGroup.appendChild(autoSyncDiv);
  } else {
    userInfo.appendChild(syncBtn);
    userInfo.appendChild(autoSyncDiv);
  }

  // Event listener cho toggle
  document.getElementById('autoSyncToggle').addEventListener('change', (e) => {
    if (e.target.checked) {
      startAutoSync();
    } else {
      stopAutoSync();
    }
  });
}

// ========== NOTIFICATION FOR NEW MESSAGES ==========

/**
 * Hiển thị notification khi có tin nhắn mới
 */
function showNewMessageIndicator(uid, content) {
  // ✅ Add to global unread Map (survives virtual scroll re-renders)
  if (!window.unreadConversations) {
    window.unreadConversations = new Map();
  }

  // Only add if not currently viewing this conversation
  const isCurrentlyViewing = typeof selectedFriend !== 'undefined' && selectedFriend && selectedFriend.userId === uid;
  if (!isCurrentlyViewing) {
    // Increment unread count for this conversation
    const currentCount = window.unreadConversations.get(uid) || 0;
    window.unreadConversations.set(uid, currentCount + 1);
    console.log(`📩 New unread message from: ${uid} (total: ${currentCount + 1})`);

    // Trigger re-render of friend list to show badge
    if (typeof renderFriendsVirtual === 'function') {
      renderFriendsVirtual();
    }
  }

  // Also update DOM badge for backwards compatibility
  const friendItem = document.querySelector(`.friend-item[data-userid="${uid}"]`);
  if (friendItem) {
    // Update or create the count badge
    let badge = friendItem.querySelector('.unread-count-badge');
    const count = window.unreadConversations.get(uid) || 1;
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'unread-count-badge';
      badge.style.cssText = 'background:#0068FF; color:white; font-size:11px; font-weight:600; padding:2px 7px; border-radius:10px; margin-left:6px; min-width:18px; text-align:center;';
      const nameRow = friendItem.querySelector('.name-row');
      if (nameRow) nameRow.insertBefore(badge, nameRow.querySelector('.delete-chat-btn'));
    }
    badge.textContent = count > 99 ? '99+' : count;

    // Add highlight styling
    friendItem.style.background = 'linear-gradient(90deg, rgba(0,104,255,0.1) 0%, transparent 100%)';
    friendItem.style.borderLeft = '3px solid #0068FF';
  }
}

// ========== INIT ==========

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Thêm nút sync sau 2 giây (đợi WebSocket kết nối)
  setTimeout(() => {
    addSyncButton();

    // Bật auto sync mặc định
    startAutoSync();
  }, 2000);
});

// Cleanup khi đóng trang
window.addEventListener('beforeunload', () => {
  stopAutoSync();
});

// Export functions để sử dụng
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    syncAllMessages,
    syncCurrentConversation,
    startAutoSync,
    stopAutoSync,
    handleSyncMessages
  };
}