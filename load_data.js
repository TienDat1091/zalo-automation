// load_data-final.js - FINAL FIXED VERSION
// - Fix: Deduplicate messages
// - Fix: RenderFriendsVirtual properly
// - Ensure proper sorting

function renderFriendsVirtual() {
  const container = document.getElementById('friendsList');
  
  // ✅ SORT: Sắp xếp theo tin nhắn cuối cùng (mới nhất trước)
  const sortedFriends = [...filteredFriends].sort((a, b) => {
    const aMsg = messageStore.get(a.userId);
    const bMsg = messageStore.get(b.userId);
    
    // Những người có tin nhắn sẽ ở trên
    if (aMsg && !bMsg) return -1;
    if (!aMsg && bMsg) return 1;
    
    // Nếu cả hai đều có tin nhắn, sắp xếp theo thời gian (mới nhất trước)
    if (aMsg && bMsg) {
      return bMsg.timestamp - aMsg.timestamp;
    }
    
    // Nếu không có tin nhắn, giữ thứ tự ban đầu
    return 0;
  });
  
  if (sortedFriends.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Chưa có bạn bè nào</div>';
    return;
  }

  const totalHeight = sortedFriends.length * ITEM_HEIGHT;
  container.innerHTML = `
    <div class="virtual-scroll-container" style="height:${totalHeight}px;position:relative;">
      <div class="virtual-scroll-content" id="virtualScrollContent" style="position:absolute;top:0;left:0;width:100%;"></div>
    </div>`;

  setTimeout(() => {
    containerHeight = container.clientHeight || 600;
    container.onscroll = () => {
      scrollTop = container.scrollTop;
      updateVisibleFriends(sortedFriends);
    };
    updateVisibleFriends(sortedFriends);
  }, 100);
}

function updateVisibleFriends(sortedFriends) {
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE);
  const endIndex = Math.min(sortedFriends.length, startIndex + Math.ceil(containerHeight / ITEM_HEIGHT) + BUFFER_SIZE * 2);
  const visibleFriends = sortedFriends.slice(startIndex, endIndex);
  const offsetY = startIndex * ITEM_HEIGHT;

  const content = document.getElementById('virtualScrollContent');
  if (!content) return;

  content.style.transform = `translateY(${offsetY}px)`;
  content.innerHTML = visibleFriends.map(f => {
    const msgInfo = messageStore.get(f.userId);
    const hasMessages = !!msgInfo;
    const preview = hasMessages 
      ? `<span class="has-message">${escapeHtml(msgInfo.lastMessage.substring(0, 30))}${msgInfo.lastMessage.length > 30 ? '...' : ''}</span>`
      : 'Nhấn để chat • UID: ' + f.userId;
    
    const timeStr = hasMessages 
      ? `<span class="message-time">${formatTime(msgInfo.timestamp)}</span>`
      : '';

    return `
      <div class="friend-item ${hasMessages ? 'has-messages' : ''} ${(selectedFriend && selectedFriend.userId === f.userId) ? 'active' : ''}" 
           onclick="selectFriend('${f.userId}', '${escapeJs(f.displayName || 'Người dùng Zalo')}', '${f.avatar || ''}')">
        <img src="${f.avatar || 'https://via.placeholder.com/50'}" 
             onerror="this.src='https://via.placeholder.com/50'" 
             alt="${f.displayName || 'User'}">
        <div class="info" style="flex:1;">
          <div class="name">
            <span>${f.displayName || 'Người dùng Zalo'}</span>
            ${timeStr}
          </div>
          <div class="preview">${preview}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ✅ Load messages from IndexedDB with deduplication
async function loadMessagesFromIndexedDB(uid) {
  if (!dbInstance) {
    console.warn('⚠️ Database not ready');
    return [];
  }

  return new Promise((resolve) => {
    try {
      const transaction = dbInstance.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('uid');
      
      const request = index.getAll(uid);
      
      request.onsuccess = () => {
        let messages = request.result;
        console.log(`📂 Loaded ${messages.length} messages from IndexedDB for ${uid}`);
        
        // ✅ FIX: Deduplicate messages
        const uniqueMessages = [];
        const seenMsgIds = new Set();
        
        for (const msg of messages) {
          const msgId = msg.msgId || msg.id;
          if (!seenMsgIds.has(msgId)) {
            uniqueMessages.push(msg);
            seenMsgIds.add(msgId);
          } else {
            console.log(`⚠️ Skipping duplicate message: ${msgId}`);
          }
        }
        
        console.log(`✅ After dedup: ${uniqueMessages.length} unique messages`);
        resolve(uniqueMessages);
      };
      
      request.onerror = () => {
        console.error('❌ Failed to load from IndexedDB:', request.error);
        resolve([]);
      };
    } catch (err) {
      console.error('❌ IndexedDB error:', err);
      resolve([]);
    }
  });
}

// ✅ Delete conversation from IndexedDB
async function deleteConversationFromIndexedDB(uid) {
  if (!dbInstance) {
    console.warn('⚠️ Database not ready');
    return false;
  }

  return new Promise((resolve) => {
    try {
      const transaction = dbInstance.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const index = store.index('uid');
      
      const request = index.openCursor(IDBKeyRange.only(uid));
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          console.log(`✅ Đã xóa lịch sử chat với ${uid} từ IndexedDB`);
          
          // ✅ FIX: Clear lastChatWith if it's the deleted conversation
          const lastChat = localStorage.getItem('lastChatWith');
          if (lastChat) {
            try {
              const { userId } = JSON.parse(lastChat);
              if (userId === uid) {
                localStorage.removeItem('lastChatWith');
                console.log('✅ Cleared lastChatWith from localStorage');
              }
            } catch (e) {}
          }
          
          resolve(true);
        }
      };
      
      request.onerror = () => {
        console.error('❌ Failed to delete from IndexedDB:', request.error);
        resolve(false);
      };
    } catch (err) {
      console.error('❌ IndexedDB error:', err);
      resolve(false);
    }
  });
}

async function selectFriend(userId, displayName, avatar) {
  selectedFriend = { userId, displayName, avatar };

  document.querySelectorAll('.friend-item').forEach(el => el.classList.remove('active'));
  
  document.getElementById('chatHeader').style.display = 'flex';
  document.getElementById('inputArea').style.display = 'flex';
  document.getElementById('chatAvatar').src = avatar || 'https://via.placeholder.com/50';
  document.getElementById('chatName').textContent = displayName || 'Người dùng Zalo';
  document.getElementById('chatUid').textContent = 'UID: ' + userId;

  // ✅ Add delete button
  const chatHeader = document.getElementById('chatHeader');
  if (!document.getElementById('deleteConvBtn')) {
    const deleteBtn = document.createElement('button');
    deleteBtn.id = 'deleteConvBtn';
    deleteBtn.className = 'delete-conv-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Xóa lịch sử chat';
    deleteBtn.onclick = () => deleteConversation(userId);
    chatHeader.appendChild(deleteBtn);
  }

  document.getElementById('messagesContainer').innerHTML = '<div class="loading-friends"><div class="spinner"></div><div>Đang tải tin nhắn...</div></div>';
  currentMessages = [];
  
  console.log(`📂 Loading from IndexedDB for ${userId}`);
  const storedMessages = await loadMessagesFromIndexedDB(userId);
  
  if (storedMessages.length > 0) {
    console.log(`✅ Found ${storedMessages.length} unique messages for ${userId}`);
    currentMessages = storedMessages.sort((a, b) => a.timestamp - b.timestamp);
    renderMessages();
  } else {
    console.log(`⏳ No stored messages, requesting from server for ${userId}`);
    ws.send(JSON.stringify({ type: 'get_messages', uid: userId }));
  }
}

// ✅ Delete conversation
async function deleteConversation(userId) {
  if (!confirm('⚠️ Bạn chắc chắn muốn xóa lịch sử chat này? Không thể hoàn tác!')) {
    return;
  }

  try {
    // Delete from IndexedDB
    await deleteConversationFromIndexedDB(userId);
    
    // Delete from server memory
    ws.send(JSON.stringify({
      type: 'delete_conversation',
      uid: userId
    }));
    
    // Clear UI
    currentMessages = [];
    renderMessages();
    messageStore.delete(userId);
    renderFriendsVirtual();
    
    // Clear chat header
    document.getElementById('chatHeader').style.display = 'none';
    document.getElementById('inputArea').style.display = 'none';
    document.getElementById('messagesContainer').innerHTML = '<div class="empty-chat"><div class="icon">💬</div><div>Chọn một cuộc trò chuyện để bắt đầu</div></div>';
    
    selectedFriend = null;
    
    showNotification('✅ Đã xóa lịch sử chat', 'success');
  } catch (err) {
    console.error('❌ Error deleting conversation:', err);
    showNotification('❌ Lỗi khi xóa lịch sử', 'error');
  }
}

function renderMessages() {
  const container = document.getElementById('messagesContainer');
  if (currentMessages.length === 0) {
    container.innerHTML = '<div class="empty-chat"><div class="icon">💬</div><div>Chưa có tin nhắn nào</div></div>';
    return;
  }

  container.innerHTML = currentMessages.map(msg => {
    const time = new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const isSelf = msg.isSelf || msg.senderId === currentUserId;
    return `
      <div class="message ${isSelf ? 'self' : ''}">
        <img class="avatar" src="${isSelf ? document.getElementById('userAvatar').src : (selectedFriend?.avatar || 'https://via.placeholder.com/50')}" alt="Avatar">
        <div>
          <div class="bubble">${escapeHtml(msg.content || msg.msg || '')}</div>
          <div class="time">${time}</div>
        </div>
      </div>`;
  }).join('');

  scrollToBottom();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeJs(str) {
  return (str || '').replace(/'/g, "\\'");
}

function sendMessage() {
  console.log('📤 sendMessage() được gọi');
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || !selectedFriend) {
    console.log('⚠️ Không có text hoặc selectedFriend');
    return;
  }

  console.log('➡️ Gửi tin nhắn qua WebSocket');
  ws.send(JSON.stringify({
    type: 'send_message',
    uid: selectedFriend.userId,
    text: text
  }));
  input.value = '';
  console.log('✅ Đã gửi tin nhắn, clear input');
  
  input.focus();
}

function scrollToBottom() {
  setTimeout(() => {
    const container = document.getElementById('messagesContainer');
    if (container) container.scrollTop = container.scrollHeight;
  }, 50);
}

document.getElementById('messageInput')?.addEventListener('keypress', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ✅ Add CSS styles 
if (!document.getElementById('loadDataStyles')) {
  const styleElement = document.createElement('style');
  styleElement.id = 'loadDataStyles';
  styleElement.textContent = `
    .delete-conv-btn {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      padding: 8px;
      border-radius: 6px;
      transition: background 0.2s;
      margin-left: auto;
    }
    
    .delete-conv-btn:hover {
      background: #ffebee;
    }
    
    .emoji-picker-btn {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      padding: 6px 8px;
      border-radius: 4px;
      transition: all 0.2s;
    }
    
    .emoji-picker-btn:hover {
      background: #e0e0e0;
    }
  `;
  document.head.appendChild(styleElement);
}