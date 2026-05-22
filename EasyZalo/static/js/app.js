// app.js - Easy Zalo Frontend Logic
// Handles: Socket.IO, friends list, chat, messages, auto-reply

const socket = io();

// ============================================
// THEME MANAGEMENT
// ============================================
function initializeTheme() {
  // Get saved theme from localStorage or use system preference
  let savedTheme = localStorage.getItem('easyZaloTheme');
  
  if (!savedTheme) {
    // Check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    savedTheme = prefersDark ? 'dark' : 'light';
  }
  
  applyTheme(savedTheme);
  updateThemeButton(savedTheme);
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('easyZaloTheme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('easyZaloTheme', 'light');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  updateThemeButton(newTheme);
  
  // Broadcast theme change to all tabs/windows via Socket.IO
  socket.emit('theme_changed', { theme: newTheme });
}

function updateThemeButton(theme) {
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

// Listen for theme changes from other tabs
socket.on('theme_changed', (data) => {
  if (data && data.theme) {
    applyTheme(data.theme);
    updateThemeButton(data.theme);
  }
});

// Initialize theme on page load
window.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
});

// Also initialize immediately in case DOM is ready
if (document.readyState !== 'loading') {
  initializeTheme();
}

// ============================================
// APP STATE
// ============================================
const AppState = {
  currentUser: null,
  friends: [],
  groups: [],
  currentChat: null,    // { uid, name, avatar, type }
  messages: {},         // uid -> [messages]
  blacklist: [],        // UIDs with auto-reply disabled
  activeTab: 'friends',
  wsConnected: false
};

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================
socket.on('connect', () => {
  console.log('✅ Connected to Easy Zalo server');
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected');
  updateConnectionStatus(false);
});

socket.on('ws_status', (data) => {
  AppState.wsConnected = data.connected;
  updateConnectionStatus(data.connected);
});

socket.on('current_user', (data) => {
  const user = data.user || data;
  if (user && user.uid) {
    AppState.currentUser = user;
    updateUserUI(user);
    // Request initial data
    socket.emit('request_friends');
    socket.emit('request_groups');
    socket.emit('request_blacklist');
  }
});

socket.on('session_info', (data) => {
  if (!data.isLoggedIn) {
    window.location.href = '/';
  }
});

socket.on('friends_list', (data) => {
  AppState.friends = data.friends || [];
  renderFriendsList(AppState.friends);
});

socket.on('groups_list', (data) => {
  AppState.groups = data.groups || [];
  renderGroupsList(AppState.groups);
});

socket.on('message_history', (data) => {
  if (data.uid && data.messages) {
    AppState.messages[data.uid] = data.messages;
    if (AppState.currentChat && AppState.currentChat.uid === data.uid) {
      renderMessages(data.messages);
    }
  }
});

socket.on('new_message', (data) => {
  const uid = data.uid;
  const msg = data.message;
  if (!uid || !msg) return;

  // Store message
  if (!AppState.messages[uid]) AppState.messages[uid] = [];
  // Avoid duplicates
  if (!AppState.messages[uid].some(m => m.msgId === msg.msgId)) {
    AppState.messages[uid].push(msg);
  }

  // If this is the current chat, render it
  if (AppState.currentChat && AppState.currentChat.uid === uid) {
    appendMessage(msg);
    scrollToBottom();
  }

  // Update friend list (move to top, update last message)
  updateFriendListItem(uid, msg.content, msg.timestamp);
});

socket.on('conversation_updated', (data) => {
  if (data.uid) {
    updateFriendListItem(data.uid, data.lastMessage, data.timestamp);
  }
});

socket.on('typing', (data) => {
  if (AppState.currentChat && data.threadId === AppState.currentChat.uid) {
    showTypingIndicator();
  }
});

socket.on('auto_reply_blacklist', (data) => {
  AppState.blacklist = data.blacklist || [];
});

socket.on('send_message_result', (data) => {
  if (data.error) {
    console.error('Send failed:', data.error);
  }
});

// ============================================
// UI UPDATE FUNCTIONS
// ============================================
function updateConnectionStatus(connected) {
  const dot = document.getElementById('headerDot');
  const text = document.getElementById('headerStatusText');
  if (connected) {
    dot.className = 'dot connected';
    text.textContent = 'Đã kết nối';
  } else {
    dot.className = 'dot disconnected';
    text.textContent = 'Mất kết nối';
  }
}

function updateUserUI(user) {
  const el = document.getElementById('headerUser');
  el.style.display = 'flex';
  document.getElementById('headerName').textContent = user.name || user.displayName || 'User';
  document.getElementById('headerUid').textContent = user.uid || '';
  const avatar = document.getElementById('headerAvatar');
  avatar.src = user.avatar || '';
  avatar.onerror = () => { avatar.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23667eea" width="100" height="100"/><text x="50" y="65" text-anchor="middle" fill="white" font-size="40">👤</text></svg>'; };
}

// ============================================
// FRIENDS LIST
// ============================================
function renderFriendsList(friends) {
  const container = document.getElementById('friendsList');

  if (!friends || friends.length === 0) {
    container.innerHTML = '<div class="sidebar-loading"><span>Chưa có bạn bè</span></div>';
    return;
  }

  // Sort by last message timestamp (most recent first)
  friends.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));

  container.innerHTML = friends.map(f => {
    const uid = f.userId || f.uid;
    const name = f.displayName || f.zaloName || f.name || 'Unknown';
    const avatar = f.avatar || '';
    const lastMsg = f.lastMessage || 'Nhấn để chat';
    const lastTime = f.lastTimestamp ? formatTimeShort(f.lastTimestamp) : '';
    const isAutoReplyOn = !AppState.blacklist.includes(uid);
    const isActive = AppState.currentChat && AppState.currentChat.uid === uid;

    return `
      <div class="friend-item ${isActive ? 'active' : ''}" data-uid="${uid}" onclick="openChat('${uid}', '${escapeHtml(name)}', '${escapeHtml(avatar)}', 'user')">
        <img class="avatar" src="${avatar}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23667eea%22 width=%22100%22 height=%22100%22 rx=%2250%22/><text x=%2250%22 y=%2265%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2236%22>${name.charAt(0)}</text></svg>'">
        <div class="info">
          <div class="name">${escapeHtml(name)}</div>
          <div class="last-msg">${escapeHtml(truncate(lastMsg, 35))}</div>
        </div>
        <div class="time">${lastTime}</div>
        ${isAutoReplyOn ? '<div class="ar-badge" title="Auto Reply ON"></div>' : ''}
      </div>
    `;
  }).join('');
}

function renderGroupsList(groups) {
  const container = document.getElementById('groupsList');

  if (!groups || groups.length === 0) {
    container.innerHTML = '<div class="sidebar-loading"><span>Chưa có nhóm</span></div>';
    return;
  }

  container.innerHTML = groups.map(g => {
    const id = g.groupId || g.threadId || g.id;
    const name = g.name || g.groupName || 'Nhóm';
    const avatar = g.avatar || g.avt || '';
    const memberCount = g.memberCount || g.totalMember || '';

    return `
      <div class="friend-item" data-uid="${id}" onclick="openChat('${id}', '${escapeHtml(name)}', '${escapeHtml(avatar)}', 'group')">
        <img class="avatar" src="${avatar}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%234CAF50%22 width=%22100%22 height=%22100%22 rx=%2250%22/><text x=%2250%22 y=%2265%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2236%22>👪</text></svg>'">
        <div class="info">
          <div class="name">${escapeHtml(name)}</div>
          <div class="last-msg">${memberCount ? memberCount + ' thành viên' : 'Nhấn để chat'}</div>
        </div>
      </div>
    `;
  }).join('');
}

function filterFriends(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderFriendsList(AppState.friends);
    return;
  }
  const filtered = AppState.friends.filter(f => {
    const name = (f.displayName || f.name || '').toLowerCase();
    const uid = (f.userId || '').toLowerCase();
    return name.includes(q) || uid.includes(q);
  });
  renderFriendsList(filtered);
}

function switchTab(tab) {
  AppState.activeTab = tab;
  document.getElementById('tabFriends').classList.toggle('active', tab === 'friends');
  document.getElementById('tabGroups').classList.toggle('active', tab === 'groups');
  document.getElementById('friendsList').style.display = tab === 'friends' ? '' : 'none';
  document.getElementById('groupsList').style.display = tab === 'groups' ? '' : 'none';

  const searchInput = document.getElementById('searchInput');
  searchInput.placeholder = tab === 'friends' ? '🔍 Tìm bạn bè hoặc nhập SĐT...' : '🔍 Tìm nhóm...';
}

function updateFriendListItem(uid, lastMessage, timestamp) {
  // Update in data
  const friend = AppState.friends.find(f => (f.userId || f.uid) === uid);
  if (friend) {
    friend.lastMessage = lastMessage;
    friend.lastTimestamp = timestamp;
  }
  // Re-render to reorder
  if (AppState.activeTab === 'friends') {
    renderFriendsList(AppState.friends);
  }
}

// ============================================
// CHAT FUNCTIONS
// ============================================
function openChat(uid, name, avatar, type) {
  AppState.currentChat = { uid, name, avatar, type };

  // Update UI
  document.getElementById('chatEmpty').style.display = 'none';
  document.getElementById('chatHeader').style.display = 'flex';
  document.getElementById('messagesContainer').style.display = 'flex';
  document.getElementById('inputArea').style.display = 'flex';

  document.getElementById('chatName').textContent = name;
  document.getElementById('chatUid').textContent = 'UID: ' + uid;
  const chatAvatar = document.getElementById('chatAvatar');
  chatAvatar.src = avatar;
  chatAvatar.onerror = () => { chatAvatar.src = ''; };

  // Update auto-reply toggle
  const arToggle = document.getElementById('arToggle');
  arToggle.checked = !AppState.blacklist.includes(uid);

  // Mark active in sidebar
  document.querySelectorAll('.friend-item').forEach(el => {
    el.classList.toggle('active', el.dataset.uid === uid);
  });

  // Load messages from cache or request from DB
  if (AppState.messages[uid] && AppState.messages[uid].length > 0) {
    renderMessages(AppState.messages[uid]);
  } else {
    document.getElementById('messagesContainer').innerHTML = '<div class="sidebar-loading"><div class="spinner"></div><span>Đang tải tin nhắn...</span></div>';
    socket.emit('request_messages', { uid });
  }

  // Focus input
  document.getElementById('messageInput').focus();
}

function renderMessages(messages) {
  const container = document.getElementById('messagesContainer');
  if (!messages || messages.length === 0) {
    container.innerHTML = '<div class="chat-empty"><p>Chưa có tin nhắn</p></div>';
    return;
  }

  let html = '';
  let lastDate = '';

  messages.forEach(msg => {
    // Date divider
    const msgDate = new Date(msg.timestamp).toLocaleDateString('vi-VN');
    if (msgDate !== lastDate) {
      html += `<div class="date-divider">${msgDate}</div>`;
      lastDate = msgDate;
    }

    html += renderMessageBubble(msg);
  });

  container.innerHTML = html;
  scrollToBottom();
}

function renderMessageBubble(msg) {
  const isSelf = msg.isSelf || msg.isSelf === 1;
  const isAutoReply = msg.isAutoReply || msg.isAutoReply === 1;
  const time = formatTime(msg.timestamp);
  const content = msg.content || '';

  let className = isSelf ? 'message self' : 'message other';
  if (isAutoReply) className = 'message self auto-reply';

  let bubbleContent = escapeHtml(content);

  // Handle image messages
  if (msg.type === 'image' || msg.attachmentType === 'image') {
    const imgUrl = msg.imageUrl || msg.attachmentPath || '';
    if (imgUrl) {
      const proxyUrl = `/api/proxy-file?url=${encodeURIComponent(imgUrl)}&mode=view`;
      bubbleContent += `<img class="msg-image" src="${proxyUrl}" alt="Ảnh" onclick="window.open('${proxyUrl}', '_blank')" onerror="this.style.display='none'">`;
    }
  }

  // Handle file messages
  if (msg.type === 'file' || (msg.attachmentType === 'file' && msg.fileData)) {
    const fileData = msg.fileData || {};
    const fileName = fileData.fileName || msg.attachmentName || 'File';
    const fileUrl = fileData.fileUrl || msg.attachmentPath || '';
    const fileIcon = getFileIcon(fileName);
    if (fileUrl) {
      const downloadUrl = `/api/proxy-file?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(fileName)}`;
      bubbleContent += `
        <a class="file-attachment" href="${downloadUrl}" target="_blank">
          <span class="file-icon">${fileIcon}</span>
          <div>
            <div class="file-name">${escapeHtml(fileName)}</div>
            <div class="file-size">${fileData.fileSize ? formatSize(fileData.fileSize) : ''}</div>
          </div>
        </a>`;
    }
  }

  const autoReplyBadge = isAutoReply ? '<span class="auto-reply-badge">🤖 Auto</span>' : '';

  return `
    <div class="${className}">
      <div class="bubble">
        ${bubbleContent}${autoReplyBadge}
        <div class="time">${time}</div>
      </div>
    </div>
  `;
}

function appendMessage(msg) {
  const container = document.getElementById('messagesContainer');

  // Remove empty state if present
  const empty = container.querySelector('.chat-empty');
  if (empty) empty.remove();

  const html = renderMessageBubble(msg);
  container.insertAdjacentHTML('beforeend', html);
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || !AppState.currentChat) return;

  const uid = AppState.currentChat.uid;
  const threadType = AppState.currentChat.type === 'group' ? 1 : 0;

  // Send via socket
  socket.emit('send_message', { uid, message: text, threadType });

  // Optimistic UI update
  const msg = {
    msgId: 'local_' + Date.now(),
    content: text,
    timestamp: Date.now(),
    senderId: AppState.currentUser?.uid || '',
    isSelf: true,
    isAutoReply: false,
    type: 'text'
  };

  if (!AppState.messages[uid]) AppState.messages[uid] = [];
  AppState.messages[uid].push(msg);
  appendMessage(msg);
  scrollToBottom();

  // Clear input
  input.value = '';
  input.focus();

  // Update friend list
  updateFriendListItem(uid, text, msg.timestamp);
}

function toggleAutoReply(enabled) {
  if (!AppState.currentChat) return;
  socket.emit('toggle_auto_reply', {
    targetId: AppState.currentChat.uid,
    enabled
  });

  // Update local state
  if (enabled) {
    AppState.blacklist = AppState.blacklist.filter(id => id !== AppState.currentChat.uid);
  } else {
    if (!AppState.blacklist.includes(AppState.currentChat.uid)) {
      AppState.blacklist.push(AppState.currentChat.uid);
    }
  }
}

// ============================================
// TYPING INDICATOR
// ============================================
let typingTimeout;
function showTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  el.classList.add('visible');
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    el.classList.remove('visible');
  }, 3000);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatTimeShort(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'Vừa xong';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' p';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' h';
  if (diff < 604800000) return Math.floor(diff / 86400000) + ' ngày';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function getFileIcon(fileName) {
  if (!fileName) return '📎';
  const ext = fileName.split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄', doc: '📝', docx: '📝',
    xls: '📊', xlsx: '📊', csv: '📊',
    ppt: '📽️', pptx: '📽️',
    zip: '📦', rar: '📦', '7z': '📦',
    mp3: '🎵', wav: '🎵', ogg: '🎵',
    mp4: '🎬', avi: '🎬', mkv: '🎬',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
    txt: '📄', json: '📄', xml: '📄'
  };
  return icons[ext] || '📎';
}

// ============================================
// INITIALIZATION
// ============================================
// Check session on page load
fetch('/api/session-status')
  .then(r => r.json())
  .then(data => {
    if (!data.isLoggedIn && !data.wsConnected) {
      // Not logged in, go to login
      // But wait a moment for WS to connect
      setTimeout(() => {
        fetch('/api/session-status')
          .then(r => r.json())
          .then(d => {
            if (!d.isLoggedIn) {
              window.location.href = '/';
            }
          });
      }, 3000);
    }
  });

console.log('🚀 Easy Zalo Dashboard loaded');
