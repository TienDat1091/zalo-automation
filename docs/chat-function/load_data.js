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
        <div class="info" style="flex:1; overflow:hidden;">
          <div class="name-row" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">${escapeHtml(f.displayName || 'Người dùng Zalo')}</span>
            <button class="delete-chat-btn" onclick="event.stopPropagation(); deleteChat('${f.userId}', '${escapeJs(f.displayName || 'User')}')" title="Xóa hội thoại">🗑️</button>
          </div>
          <div class="preview-row" style="display:flex; justify-content:space-between;">
             <div class="preview" style="flex:1;">${preview}</div>
             ${timeStr ? `<div class="time-tiny" style="font-size:10px; color:#888;">${timeStr}</div>` : ''}
          </div>
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
            console.log(`⚠️ Skipping duplicate message: ${msgId} `);
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
            } catch (e) { }
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
    const msgType = msg.type || 'text';
    const isAutoReply = msg.isAutoReply || false;

    // ✅ Render attachment nếu có
    let attachmentHtml = '';

    if (msgType === 'image' && msg.imageUrl) {
      attachmentHtml = `
      <div class="message-attachment" style="margin-top:8px;">
        <img src="${escapeHtml(msg.imageUrl)}" alt="Ảnh"
          style="max-width:200px;max-height:200px;border-radius:8px;cursor:pointer;"
          onclick="window.open('${escapeHtml(msg.imageUrl)}', '_blank')"
          onerror="this.style.display='none'; this.parentElement.innerHTML='[Ảnh không tải được]';">
        </div>
    `;
    } else if (msgType === 'file' && msg.fileData) {
      const fileIcon = { pdf: '📄', word: '📝', excel: '📊', powerpoint: '📽️', archive: '📦', audio: '🎵', video: '🎬', image: '🖼️' }[msg.fileData.fileType] || '📎';
      const fileSize = msg.fileData.fileSize ? formatFileSizeLD(msg.fileData.fileSize) : '';
      // ✅ View URL (inline) và Download URL
      const viewUrl = msg.fileData.fileUrl ? `/ api / proxy - file ? url = ${encodeURIComponent(msg.fileData.fileUrl)}& name=${encodeURIComponent(msg.fileData.fileName || 'file')}& mode=view` : '#';
      const downloadUrl = msg.fileData.fileUrl ? `/ api / proxy - file ? url = ${encodeURIComponent(msg.fileData.fileUrl)}& name=${encodeURIComponent(msg.fileData.fileName || 'file')}& mode=download` : '#';

      attachmentHtml = `
      <div class="message-attachment" style="margin-top:8px;">
        <div style="display:flex;align-items:center;gap:8px;background:#f5f5f5;padding:10px 14px;border-radius:8px;">
          <span style="font-size:20px;">${fileIcon}</span>
          <span style="flex:1;color:#333;font-size:13px;">${escapeHtml(msg.fileData.fileName || 'File')}</span>
          ${fileSize ? '<span style="color:#888;font-size:11px;">(' + fileSize + ')</span>' : ''}
          <a href="${viewUrl}" target="_blank" title="Xem" style="color:#0068FF;font-size:12px;text-decoration:none;">👁️ Xem</a>
          <a href="${downloadUrl}" download="${escapeHtml(msg.fileData.fileName || 'file')}" title="Tải" style="color:#0068FF;font-size:12px;text-decoration:none;">⬇️ Tải</a>
        </div>
        </div>
      `;
    } else if (msgType === 'gif' && msg.imageUrl) {
      attachmentHtml = `
      <div class="message-attachment" style="margin-top:8px;">
        <img src="${escapeHtml(msg.imageUrl)}" alt="GIF" style="max-width:200px;border-radius:8px;">
        </div>
    `;
    } else if (msgType === 'sticker') {
      attachmentHtml = '<div style="font-size:32px;">😊</div>';
    }

    // Nội dung text (ẩn nếu có attachment và content chỉ là placeholder)
    const contentText = (msgType !== 'text' && attachmentHtml) ? '' : escapeHtml(msg.content || msg.msg || '');

    return `
      <div class="message ${isSelf ? 'self' : ''} ${isAutoReply ? 'auto-reply' : ''}">
        <img class="avatar" src="${isSelf ? document.getElementById('userAvatar').src : (selectedFriend?.avatar || 'https://via.placeholder.com/50')}" alt="Avatar">
          <div>
            <div class="bubble">
              ${contentText}
              ${attachmentHtml}
              ${isAutoReply ? '<span class="auto-reply-badge" style="display:inline-block;background:#2196f3;color:white;font-size:9px;padding:2px 6px;border-radius:10px;margin-left:5px;">🤖 Auto</span>' : ''}
            </div>
            <div class="time">${time}</div>
          </div>
        </div>`;
  }).join('');

  scrollToBottom();
}

function formatFileSizeLD(bytes) {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
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
  console.log('📤 sendMessage() được g��i');

  if (!selectedFriend) {
    console.log('⚠️ Chưa chọn người nhận');
    alert('Vui lòng chọn bạn bè trước');
    return;
  }

  const input = document.getElementById('messageInput');
  const text = input.value.trim();

  // Check for attachment from chat.js (window.currentAttachment)
  const hasAttachment = typeof window.currentAttachment !== 'undefined' && window.currentAttachment;

  if (!text && !hasAttachment) {
    console.log('⚠️ Không có text hoặc attachment');
    return;
  }

  if (hasAttachment) {
    // Send file/image
    const fileData = window.currentAttachment;
    console.log(`📎 Sending ${fileData.type}: ${fileData.name}`);

    ws.send(JSON.stringify({
      type: fileData.type === 'image' ? 'send_image' : 'send_file',
      to: String(selectedFriend.userId),
      uid: String(selectedFriend.userId),
      content: text || '',
      fileData: fileData.data,
      fileName: fileData.name,
      fileType: fileData.mimeType,
      timestamp: Date.now()
    }));

    // Clear attachment - call removeAttachment if available
    if (typeof removeAttachment === 'function') {
      removeAttachment();
    }

    input.value = '';
    input.focus();
    console.log('✅ Đã gửi file/image');
    return;
  }

  // Send text message only
  console.log('➡️ Gửi tin nhắn qua WebSocket');
  ws.send(JSON.stringify({
    type: 'send_message',
    uid: String(selectedFriend.userId),
    to: String(selectedFriend.userId),
    text: text,
    content: text
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
          .delete - conv - btn {
      background: none;
      border: none;
      font - size: 18px;
      cursor: pointer;
      padding: 8px;
      border - radius: 6px;
      transition: background 0.2s;
      margin - left: auto;
    }
    
    .delete -conv - btn:hover {
      background: #ffebee;
    }
    
    .delete -chat - btn {
      background: none;
      border: none;
      font - size: 16px;
      cursor: pointer;
      padding: 4px 8px;
      border - radius: 4px;
      transition: background 0.2s;
      opacity: 0.7;
    }
    .delete -chat - btn:hover {
      background: #ffebee;
      opacity: 1;
      color: #d32f2f;
    }
    .emoji - picker - btn {
      background: none;
      border: none;
      font - size: 18px;
      cursor: pointer;
      padding: 6px 8px;
      border - radius: 4px;
      transition: all 0.2s;
    }
    .emoji - picker - btn:hover {
      background: #e0e0e0;
    }
    `;
  document.head.appendChild(styleElement);
}

// ✅ DELETE CHAT FUNCTION
function deleteChat(uid, name) {
  if (confirm(`⚠️ Bạn có chắc muốn xóa toàn bộ lịch sử chat với "${name}" ?\nHành động này không thể hoàn tác.`)) {
    if (typeof socket !== 'undefined' && socket.readyState === 1) {
      socket.send(JSON.stringify({ type: 'delete_conversation', uid: uid }));
      if (typeof showToast === 'function') showToast('Đang xóa đoạn hội thoại...', 'info');
    }

    // Optimistic update
    if (typeof messageStore !== 'undefined') messageStore.delete(uid);

    // Clear view if active
    if (typeof selectedFriend !== 'undefined' && selectedFriend && selectedFriend.userId === uid) {
      const msgContainer = document.getElementById('messages');
      if (msgContainer) msgContainer.innerHTML = '<div class="empty-state">Đoạn hội thoại đã bị xóa</div>';
    }

    if (typeof renderFriendsVirtual === 'function') renderFriendsVirtual();
  }
}
window.deleteChat = deleteChat;