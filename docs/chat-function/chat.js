function renderFriendsVirtual() {
  const friendsListEl = document.getElementById('friendsList');
  if (!friendsListEl || filteredFriends.length === 0) {
    console.warn('⚠️ friendsList element not found or empty');
    return;
  }

  let html = '';
  for (const friend of filteredFriends) {
    const isSelected = selectedFriend && selectedFriend.userId === friend.userId;
    const msgData = messageStore.get(friend.userId);
    const lastMsg = msgData?.lastMessage || 'Nhắn tin...';

    html += `
          <div class="friend-item ${isSelected ? 'selected' : ''}" onclick="selectFriend('${friend.userId}', '${friend.displayName}', '${friend.avatar}')">
            <img src="${friend.avatar}" alt="Avatar">
            <div class="friend-info">
              <div class="friend-name">${friend.displayName}</div>
              <div class="friend-message">${lastMsg.substring(0, 30)}...</div>
            </div>
          </div>
        `;
  }

  friendsListEl.innerHTML = html;
  console.log(`✅ Rendered ${filteredFriends.length} friends`);
}

// ========== Friend TAB + ==========
function FriendTab(tab) {
  console.log(`🔄 Switching to ${tab} search`);
  currentSearchTab = tab;
  document.querySelectorAll('.search-tab').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');
  document.querySelectorAll('.search-content').forEach(el => el.classList.remove('active'));
  document.getElementById(tab === 'friends' ? 'friendsSearch' : 'messagesSearch').classList.add('active');
  document.getElementById('friendsSearchInput').value = '';
  document.getElementById('friendsResults').innerHTML = '';
}

function searchFriends(query) {
  console.log(`🔍 Searching friends: "${query}"`);
  const resultsDiv = document.getElementById('friendsResults');
  if (!query || query.trim() === '') {
    resultsDiv.innerHTML = '';
    return;
  }

  const lowerQuery = query.toLowerCase();
  const results = allFriends.filter(f =>
    f.displayName.toLowerCase().includes(lowerQuery) ||
    f.userId.includes(query)
  );

  console.log(`✅ Found ${results.length} friends`);

  if (results.length === 0) {
    resultsDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Không tìm thấy bạn bè</div>';
    return;
  }

  let html = '';
  for (const friend of results) {
    html += `
        <div class="search-result-item" onclick="selectFriend('${friend.userId}', '${friend.displayName}', '${friend.avatar}')">
          <div class="result-friend">
            <img src="${friend.avatar}" alt="Avatar">
            <div class="result-friend-info">
              <div class="result-friend-name">${friend.displayName}</div>
              <div class="result-friend-uid">UID: ${friend.userID}</div>
            </div>
          </div>
        </div>
      `;
  }
  resultsDiv.innerHTML = html;
}

// ========== MOVE TO TOP FUNCTION ==========
function moveConversationToTop(userId) {
  console.log(`⬆️ Moving conversation to top: ${userId}`);

  filteredFriends = filteredFriends.filter(f => f.userId !== userId);

  const friend = friends.find(f => f.userId === userId);
  if (friend) {
    filteredFriends.unshift(friend);
    console.log(`✅ Moved to top. Top: ${filteredFriends[0]?.displayName}`);
  }
  renderFriendsVirtual();
}

// ========== WEBSOCKET ==========
const ws = new WebSocket('ws://' + location.hostname + ':8080');

ws.onopen = () => {
  console.log('✅ WebSocket connected');
  ws.send(JSON.stringify({ type: 'get_friends' }));
};

ws.onerror = (error) => {
  console.error('❌ WebSocket error:', error);
};

ws.onmessage = e => {
  try {
    const data = JSON.parse(e.data);

    if (data.type === 'current_user') {
      currentUserId = data.user.uid;
      document.getElementById('userName').textContent = data.user.name || "User";
      document.getElementById('userAvatar').src = data.user.avatar || "https://via.placeholder.com/50";
      document.getElementById('userUid').textContent = 'UID: ' + data.user.uid;
      document.getElementById('userInfo').style.display = 'flex';

      initIndexedDB(data.user.uid).catch(err => {
        console.error('❌ Failed to init DB:', err);
      });

      // ✅ FIX: Tự động request danh sách bạn bè sau khi đăng nhập
      console.log('🔄 Auto-requesting friends list after login...');
      ws.send(JSON.stringify({ type: 'get_friends' }));
    }

    if (data.type === 'friends_list') {
      console.log('👥 Friends:', data.friends?.length);
      friends = data.friends || [];
      allFriends = [...friends];
      filteredFriends = [...friends];

      // ✅ FIX: Render ngay lập tức, không đợi messageStore
      console.log('✅ Rendering friends list immediately...');
      friendsRendered = true;
      renderFriendsVirtual();

      // ✅ Sau đó sort lại khi messageStore đã load xong (từ IndexedDB)
      setTimeout(() => {
        if (messageStore.size > 0) {
          console.log('🔄 Re-sorting with messageStore data...');
          sortFriendsAfterLoad();
        }
      }, 300);
    }

    if (data.type === 'messages_history') {
      if (selectedFriend && data.uid === selectedFriend.userId) {
        console.log(`📨 Received ${data.messages?.length} messages`);

        const uniqueMessages = [];
        const seenMsgIds = new Set();

        for (const msg of (data.messages || [])) {
          const msgId = msg.msgId || msg.id;
          if (!seenMsgIds.has(msgId)) {
            uniqueMessages.push(msg);
            seenMsgIds.add(msgId);
          }
        }

        currentMessages = uniqueMessages.sort((a, b) => a.timestamp - b.timestamp);
        renderMessages();
      }
    }

    if (data.type === 'sent_ok') {
      console.log('✅ sent_ok');
      currentMessages.push(data.message);
      renderMessages();
      autoSaveToIndexedDB(selectedFriend.userId, data.message);

      const content = data.message.content || data.message.msg || '';
      messageStore.set(selectedFriend.userId, {
        lastMessage: content,
        timestamp: data.message.timestamp || Date.now()
      });

      localStorage.setItem('lastChatWith', JSON.stringify({
        userId: selectedFriend.userId,
        timestamp: data.message.timestamp || Date.now()
      }));

      moveConversationToTop(selectedFriend.userId);

      document.getElementById('messageInput').value = '';
      scrollToBottom();
    }

    if (data.type === 'new_message') {
      console.log('📨 new_message from:', data.uid);

      const content = data.message.content || data.message.msg || '';
      messageStore.set(data.uid, {
        lastMessage: content,
        timestamp: data.message.timestamp || Date.now()
      });

      const sender = friends.find(f => f.userId === data.uid);
      const senderName = sender?.displayName || 'Unknown';
      const senderAvatar = sender?.avatar || '';

      if (selectedFriend && data.uid === selectedFriend.userId) {
        currentMessages.push({ ...data.message, isSelf: false });
        renderMessages();
        autoSaveToIndexedDB(data.uid, data.message);
        scrollToBottom();
        moveConversationToTop(data.uid);
      } else {
        console.log(`🔔 Showing notification from ${senderName}`);
        showNotification(senderName, content.substring(0, 30), data.uid, senderAvatar);

        autoSaveToIndexedDB(data.uid, data.message);
        moveConversationToTop(data.uid);
      }
    }

    if (data.type === 'logged_out') {
      console.log('✅ Logout successful');
      handleLogoutComplete();
    }
  } catch (err) {
    console.error('❌ Error:', err);
  }
};

// ========== CHAT FUNCTIONS ==========
function selectFriend(userId, displayName, avatar) {
  console.log(`💬 Selecting friend: ${displayName} (${userId})`);

  selectedFriend = { userId, displayName, avatar };

  document.getElementById('chatHeader').style.display = 'flex';
  document.getElementById('chatAvatar').src = avatar;
  document.getElementById('chatName').textContent = displayName;
  document.getElementById('chatUid').textContent = 'UID: ' + userId;
  document.getElementById('inputArea').style.display = 'flex';

  currentMessages = [];
  document.getElementById('messagesContainer').innerHTML = '<div class="loading-chat"><div class="spinner"></div></div>';

  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log(`📤 Requesting message history for: ${userId}`);
    ws.send(JSON.stringify({ type: 'get_messages', uid: userId }));
  } else {
    console.warn('⚠️ WebSocket not ready');
  }
}

function renderMessages() {
  const container = document.getElementById('messagesContainer');
  if (!container) return;

  if (currentMessages.length === 0) {
    container.innerHTML = '<div class="empty-chat"><div class="icon">💬</div><div>Không có tin nhắn</div></div>';
    return;
  }

  let html = '';
  for (const msg of currentMessages) {
    const isSelf = msg.isSelf || msg.senderId === currentUserId;
    const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('vi-VN') : '';
    const content = msg.content || msg.msg || '';

    html += `
        <div class="message ${isSelf ? 'self' : 'other'}">
          <div class="message-content">
            ${content}
            <span class="message-time">${timestamp}</span>
          </div>
        </div>
      `;
  }

  container.innerHTML = html;
  scrollToBottom();
}

function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  if (container) {
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
      console.log(`⬇️ Scrolled to bottom`);
    }, 100);
  }
}

function sendMessage() {
  if (!selectedFriend) {
    alert('Vui lòng chọn bạn bè trước');
    return;
  }

  const input = document.getElementById('messageInput');
  const text = input.value.trim();

  // Check for attachment
  const attachmentPreview = document.getElementById('attachmentPreview');
  const hasAttachment = attachmentPreview && attachmentPreview.style.display !== 'none';

  if (!text && !hasAttachment) return;

  if (ws && ws.readyState === WebSocket.OPEN) {
    if (hasAttachment) {
      // Send file/image
      const fileData = window.currentAttachment;
      if (fileData) {
        console.log(`📤 Sending ${fileData.type}: "${fileData.name}"`);
        ws.send(JSON.stringify({
          type: fileData.type === 'image' ? 'send_image' : 'send_file',
          to: selectedFriend.userId,
          content: text || '',
          fileData: fileData.data,
          fileName: fileData.name,
          fileType: fileData.mimeType,
          timestamp: Date.now()
        }));

        // Clear attachment
        removeAttachment();
      }
    } else {
      // Send text message
      console.log(`📤 Sending message: "${text}"`);
      ws.send(JSON.stringify({
        type: 'send_message',
        to: selectedFriend.userId,
        content: text,
        timestamp: Date.now()
      }));
    }

    input.value = '';
  }
}

// ========== FILE & IMAGE HANDLING ==========

let currentAttachment = null;

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  console.log(`📎 File selected: ${file.name} (${file.type})`);

  const isImage = file.type.startsWith('image/');
  const maxSize = isImage ? 10 * 1024 * 1024 : 5 * 1024 * 1024; // 10MB for images, 5MB for files

  if (file.size > maxSize) {
    alert(`❌ File quá lớn! Giới hạn: ${isImage ? '10MB' : '5MB'}`);
    event.target.value = '';
    return;
  }

  const reader = new FileReader();

  reader.onload = (e) => {
    const preview = document.getElementById('attachmentPreview');
    const previewImage = document.getElementById('previewImage');
    const previewFile = document.getElementById('previewFile');

    if (isImage) {
      // Show image preview
      previewImage.src = e.target.result;
      previewImage.style.display = 'block';
      previewFile.style.display = 'none';

      // Store base64 data
      window.currentAttachment = {
        type: 'image',
        name: file.name,
        mimeType: file.type,
        data: e.target.result
      };
    } else {
      // Show file preview
      previewFile.querySelector('.file-name').textContent = file.name;
      previewFile.style.display = 'flex';
      previewImage.style.display = 'none';

      // Store base64 data
      window.currentAttachment = {
        type: 'file',
        name: file.name,
        mimeType: file.type,
        data: e.target.result
      };
    }

    preview.style.display = 'block';
    console.log('✅ Attachment preview shown');
  };

  reader.onerror = () => {
    console.error('❌ Failed to read file');
    alert('❌ Không thể đọc file');
  };

  reader.readAsDataURL(file);

  // Reset input
  event.target.value = '';
}

function removeAttachment() {
  const preview = document.getElementById('attachmentPreview');
  const previewImage = document.getElementById('previewImage');
  const previewFile = document.getElementById('previewFile');

  preview.style.display = 'none';
  previewImage.src = '';
  previewImage.style.display = 'none';
  previewFile.style.display = 'none';

  window.currentAttachment = null;

  console.log('✅ Attachment removed');
}

function renderFriendsVirtual() {
  const friendsListEl = document.getElementById('friendsList');
  if (!friendsListEl || filteredFriends.length === 0) {
    console.warn('⚠️ friendsList element not found or empty');
    return;
  }

  let html = '';
  for (const friend of filteredFriends) {
    const isSelected = selectedFriend && selectedFriend.userId === friend.userId;
    const msgData = messageStore.get(friend.userId);
    const lastMsg = msgData?.lastMessage || 'Nhắn tin...';

    html += `
        <div class="friend-item ${isSelected ? 'selected' : ''}" onclick="selectFriend('${friend.userId}', '${friend.displayName}', '${friend.avatar}')">
          <img src="${friend.avatar}" alt="Avatar">
          <div class="friend-info">
            <div class="friend-name">${friend.displayName}</div>
            <div class="friend-message">${lastMsg.substring(0, 30)}...</div>
          </div>
        </div>
      `;
  }

  friendsListEl.innerHTML = html;
  console.log(`✅ Rendered ${filteredFriends.length} friends`);
}



