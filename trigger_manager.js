// ================================================
// TRIGGER MANAGER - MAIN JAVASCRIPT
// ================================================

// STATE
let ws = null;
let triggers = [];
let currentTriggerId = null;
let editingTriggerId = null;
let unreadNotifications = 0;

// ================================================
// WEBSOCKET CONNECTION
// ================================================
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  
  const wsUrl = 'ws://' + location.hostname + ':8080';
  console.log('🔌 Connecting to WebSocket:', wsUrl);
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('✅ WebSocket connected');
    
    // Request data
    ws.send(JSON.stringify({ type: 'get_auto_reply_status' }));
    ws.send(JSON.stringify({ type: 'get_triggers' }));
  };
  
  ws.onclose = () => {
    console.log('❌ WebSocket disconnected');
    updateAutoReplyStatus('off', 'Offline');
    document.getElementById('autoReplyToggle').disabled = true;
    
    // Reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };
  
  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    } catch (e) {
      console.error('❌ Failed to parse message:', e);
    }
  };
}

// ================================================
// HANDLE WEBSOCKET MESSAGES
// ================================================
function handleWebSocketMessage(data) {
  console.log('📩 Received:', data.type);
  
  // Auto reply status
  if (data.type === 'auto_reply_status') {
    const toggle = document.getElementById('autoReplyToggle');
    toggle.checked = data.enabled || false;
    toggle.disabled = false;
    updateAutoReplyStatus(
      data.enabled ? 'on' : 'off',
      data.enabled ? 'ON' : 'OFF'
    );
    
    if (data.stats) {
      const container = document.getElementById('autoReplyToggleContainer');
      container.title = `Replied: ${data.stats.replied || 0} | Skipped: ${data.stats.skipped || 0}`;
    }
    
    // Load triggers from scenarios
    if (data.scenarios) {
      loadTriggersFromScenarios(data.scenarios);
    }
  }
  
  // Status changed
  if (data.type === 'auto_reply_status_changed') {
    const toggle = document.getElementById('autoReplyToggle');
    toggle.checked = data.enabled;
    updateAutoReplyStatus(
      data.enabled ? 'on' : 'off',
      data.enabled ? 'ON' : 'OFF'
    );
  }
  
  // Triggers list
  if (data.type === 'triggers_list') {
    triggers = data.triggers || [];
    renderTriggerList();
  }
  
  // Trigger created
  if (data.type === 'trigger_created') {
    console.log('✅ Trigger created:', data.trigger);
    triggers.push(data.trigger);
    renderTriggerList();
    showToast('✅ Đã tạo trigger mới!', 'success');
  }
  
  // Trigger updated
  if (data.type === 'trigger_updated') {
    console.log('✅ Trigger updated:', data.trigger);
    const index = triggers.findIndex(t => t.id === data.trigger.id);
    if (index !== -1) {
      triggers[index] = data.trigger;
      renderTriggerList();
      if (currentTriggerId === data.trigger.id) {
        displayTrigger(data.trigger);
      }
    }
    showToast('✅ Đã cập nhật trigger!', 'success');
  }
  
  // Trigger deleted
  if (data.type === 'trigger_deleted') {
    console.log('✅ Trigger deleted:', data.id);
    triggers = triggers.filter(t => t.id !== data.id);
    renderTriggerList();
    if (currentTriggerId === data.id) {
      showEmptyState();
    }
    showToast('✅ Đã xóa trigger!', 'success');
  }
  
  // New message notification
  if (data.type === 'new_message' || data.type === 'auto_reply_new_message') {
    unreadNotifications++;
    updateNotificationBadge();
    
    // Show desktop notification if permission granted
    if (Notification.permission === 'granted') {
      new Notification('📩 Tin nhắn mới từ Zalo', {
        body: (data.senderName || 'Người dùng') + ': ' + (data.content || '').substring(0, 50),
        icon: '/images/zalo-icon.png'
      });
    }
  }
  
  // Stats updated
  if (data.type === 'stats_updated' && data.stats) {
    const container = document.getElementById('autoReplyToggleContainer');
    container.title = `Replied: ${data.stats.replied || 0} | Skipped: ${data.stats.skipped || 0}`;
  }
}

// ================================================
// LOAD TRIGGERS FROM AUTO REPLY SCENARIOS
// ================================================
function loadTriggersFromScenarios(scenarios) {
  triggers = scenarios.map(s => ({
    id: s.id,
    name: s.keywords[0] || 'Trigger #' + s.id,
    description: 'Từ khóa: ' + s.keywords.join(', '),
    icon: '🔑',
    keywords: s.keywords,
    response: s.response,
    enabled: s.enabled,
    type: 'keyword',
    stats: {
      triggered: 0,
      lastTriggered: null
    }
  }));
  
  renderTriggerList();
}

// ================================================
// AUTO REPLY FUNCTIONS
// ================================================
function updateAutoReplyStatus(state, text) {
  const status = document.getElementById('autoReplyStatus');
  if (!status) return;
  status.className = 'toggle-status ' + state;
  status.textContent = text;
}

function toggleAutoReply() {
  const toggle = document.getElementById('autoReplyToggle');
  if (!toggle || !ws) return;
  
  const enabled = toggle.checked;
  updateAutoReplyStatus('loading', '...');
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'set_auto_reply',
      enabled: enabled
    }));
    console.log('📤 Auto Reply:', enabled ? 'ON' : 'OFF');
  }
}

// ================================================
// NOTIFICATION FUNCTIONS
// ================================================
function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  if (unreadNotifications > 0) {
    badge.textContent = unreadNotifications > 99 ? '99+' : unreadNotifications;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

function openNotificationWindow() {
  const width = 600;
  const height = 800;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  
  window.open(
    '/trigger-notifications-window.html',
    'notifications',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
}

function logTriggerActivity(action, triggerData) {
  // Broadcast activity to notification window
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'log_activity',
      activity: {
        id: Date.now(),
        type: 'crud',
        action: action,
        timestamp: Date.now(),
        data: triggerData
      }
    }));
  }
}

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ================================================
// RENDER TRIGGER LIST
// ================================================
function renderTriggerList() {
  const listContainer = document.getElementById('triggerList');
  
  if (triggers.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:#999;">
        <div style="font-size:48px; margin-bottom:12px;">📋</div>
        <div style="font-size:13px; margin-bottom:12px;">Chưa có trigger nào</div>
        <button class="btn btn-primary btn-sm" onclick="showNewTriggerModal()">
          <span>➕</span>
          <span>Tạo trigger đầu tiên</span>
        </button>
      </div>
    `;
    document.getElementById('triggerCount').textContent = '0';
    return;
  }
  
  // Group triggers
  const activeTrigs = triggers.filter(t => t.enabled);
  const inactiveTrigs = triggers.filter(t => !t.enabled);
  
  let html = '';
  
  // Active triggers
  if (activeTrigs.length > 0) {
    html += `
      <div class="trigger-group">
        <div class="trigger-group-title">
          <span class="icon">✅</span>
          <span>Đang hoạt động (${activeTrigs.length})</span>
        </div>
        ${activeTrigs.map(t => renderTriggerItem(t)).join('')}
      </div>
    `;
  }
  
  // Inactive triggers
  if (inactiveTrigs.length > 0) {
    html += `
      <div class="trigger-group">
        <div class="trigger-group-title">
          <span class="icon">⏸️</span>
          <span>Tạm dừng (${inactiveTrigs.length})</span>
        </div>
        ${inactiveTrigs.map(t => renderTriggerItem(t)).join('')}
      </div>
    `;
  }
  
  // Add new button
  html += `
    <button class="new-trigger-btn" onclick="showNewTriggerModal()">
      <span>➕</span>
      <span>Tạo trigger mới</span>
    </button>
  `;
  
  listContainer.innerHTML = html;
  document.getElementById('triggerCount').textContent = triggers.length;
}

function renderTriggerItem(trigger) {
  const isActive = currentTriggerId === trigger.id;
  const keywords = trigger.keywords ? trigger.keywords.slice(0, 3).join(', ') : (trigger.description || '');
  
  return `
    <div class="trigger-item-compact ${isActive ? 'active' : ''}" 
         data-trigger-id="${trigger.id}">
      <div class="trigger-header-row" onclick="selectTrigger(${trigger.id})">
        <div class="trigger-main-info">
          <div class="trigger-icon-small ${trigger.enabled ? 'general' : 'keyword'}">
            ${trigger.icon || '🔑'}
          </div>
          <div style="flex:1; min-width:0;">
            <div class="trigger-name-small">${escapeHtml(trigger.name)}</div>
            <div class="trigger-keywords-preview">${escapeHtml(keywords)}</div>
          </div>
        </div>
        
        <div class="trigger-actions" onclick="event.stopPropagation();">
          <button class="action-icon edit" onclick="editTrigger(${trigger.id})" title="Chỉnh sửa">
            ✏️
          </button>
          <button class="action-icon delete" onclick="deleteTrigger(${trigger.id})" title="Xóa">
            🗑️
          </button>
        </div>
        
        <div class="trigger-status ${trigger.enabled ? 'active' : ''}" 
             onclick="event.stopPropagation(); toggleTriggerStatus(${trigger.id})">
        </div>
      </div>
    </div>
  `;
}

// ================================================
// TRIGGER CRUD FUNCTIONS
// ================================================
function selectTrigger(id) {
  const trigger = triggers.find(t => t.id === id);
  if (!trigger) return;
  
  currentTriggerId = id;
  
  // Update UI
  document.querySelectorAll('.trigger-item-compact').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-trigger-id="${id}"]`).classList.add('active');
  
  // Display trigger details
  displayTrigger(trigger);
}

function displayTrigger(trigger) {
  const canvas = document.getElementById('canvasContent');
  const title = document.getElementById('canvasTitle');
  const badge = document.getElementById('canvasBadge');
  const actions = document.getElementById('canvasActions');
  
  title.textContent = trigger.name;
  badge.textContent = trigger.enabled ? 'Đang hoạt động' : 'Tạm dừng';
  badge.className = 'badge ' + (trigger.enabled ? 'active' : 'inactive');
  badge.style.display = 'inline-block';
  actions.style.display = 'flex';
  
  canvas.innerHTML = `
    <div class="trigger-card">
      <div class="trigger-card-header">
        <div class="trigger-card-icon general">${trigger.icon || '🔑'}</div>
        <div class="trigger-card-info">
          <h3>${escapeHtml(trigger.name)}</h3>
          <p>${escapeHtml(trigger.description || 'Không có mô tả')}</p>
        </div>
      </div>
      
      ${trigger.keywords && trigger.keywords.length > 0 ? `
      <div class="trigger-section">
        <div class="section-label">
          <span>🔑</span>
          <span>Từ khóa kích hoạt</span>
        </div>
        <div class="keyword-list">
          ${trigger.keywords.map(k => `<span class="keyword-chip">${escapeHtml(k)}</span>`).join('')}
        </div>
      </div>
      ` : ''}
      
      <div class="trigger-section">
        <div class="section-label">
          <span>💬</span>
          <span>Nội dung trả lời</span>
        </div>
        <div class="response-box">${escapeHtml(trigger.response || 'Chưa có nội dung')}</div>
      </div>
      
      <div class="trigger-section">
        <div class="section-label">
          <span>ℹ️</span>
          <span>Thông tin</span>
        </div>
        <div class="info-item">
          <span class="info-label">Trạng thái:</span>
          <span class="info-value">${trigger.enabled ? '✅ Đang hoạt động' : '⏸️ Tạm dừng'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Loại:</span>
          <span class="info-value">${trigger.type === 'keyword' ? '🔑 Keyword Match' : '⚙️ Custom'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Số lần kích hoạt:</span>
          <span class="info-value">${trigger.stats?.triggered || 0} lần</span>
        </div>
      </div>
    </div>
  `;
}

function showEmptyState() {
  const canvas = document.getElementById('canvasContent');
  const title = document.getElementById('canvasTitle');
  const badge = document.getElementById('canvasBadge');
  const actions = document.getElementById('canvasActions');
  
  title.textContent = 'Chọn một trigger';
  badge.style.display = 'none';
  actions.style.display = 'none';
  currentTriggerId = null;
  
  canvas.innerHTML = `
    <div class="empty-state">
      <div class="icon">🎯</div>
      <h3>Chọn một trigger để xem chi tiết</h3>
      <p>Hoặc tạo trigger mới để bắt đầu</p>
      <button class="btn btn-primary" onclick="showNewTriggerModal()">
        <span>➕</span>
        <span>Tạo trigger mới</span>
      </button>
    </div>
  `;
}

function showNewTriggerModal() {
  editingTriggerId = null;
  document.getElementById('modalTitle').textContent = 'Tạo Trigger Mới';
  document.getElementById('triggerName').value = '';
  document.getElementById('triggerDesc').value = '';
  document.getElementById('triggerIcon').value = '🔑';
  document.getElementById('triggerKeywords').value = '';
  document.getElementById('triggerResponse').value = '';
  document.getElementById('triggerEnabled').checked = true;
  document.getElementById('saveBtn').innerHTML = '<span>💾</span><span>Lưu trigger</span>';
  document.getElementById('triggerModal').classList.add('show');
}

function editTrigger(id) {
  const trigger = triggers.find(t => t.id === id);
  if (!trigger) return;
  
  editingTriggerId = id;
  document.getElementById('modalTitle').textContent = 'Chỉnh sửa Trigger';
  document.getElementById('triggerName').value = trigger.name;
  document.getElementById('triggerDesc').value = trigger.description || '';
  document.getElementById('triggerIcon').value = trigger.icon || '🔑';
  document.getElementById('triggerKeywords').value = trigger.keywords ? trigger.keywords.join(', ') : '';
  document.getElementById('triggerResponse').value = trigger.response || '';
  document.getElementById('triggerEnabled').checked = trigger.enabled;
  
  // Load schedule
  if (trigger.schedule) {
    document.getElementById('triggerStartTime').value = trigger.schedule.startTime || '00:00';
    document.getElementById('triggerEndTime').value = trigger.schedule.endTime || '23:59';
  }
  
  // Load targeting
  if (trigger.targeting) {
    document.getElementById('triggerTarget').value = trigger.targeting.type || 'all';
    if (trigger.targeting.type === 'specific' && trigger.targeting.userIds) {
      document.getElementById('triggerSpecificUsers').value = trigger.targeting.userIds.join(', ');
      document.getElementById('specificUsersGroup').style.display = 'block';
    }
  }
  
  // Load cooldown
  if (trigger.cooldown) {
    document.getElementById('triggerCooldown').value = Math.floor(trigger.cooldown / 1000);
  }
  
  document.getElementById('saveBtn').innerHTML = '<span>💾</span><span>Cập nhật trigger</span>';
  document.getElementById('triggerModal').classList.add('show');
}

function editCurrentTrigger() {
  if (currentTriggerId) {
    editTrigger(currentTriggerId);
  }
}

function hideTriggerModal() {
  document.getElementById('triggerModal').classList.remove('show');
  editingTriggerId = null;
}

function saveTrigger() {
  const name = document.getElementById('triggerName').value.trim();
  const desc = document.getElementById('triggerDesc').value.trim();
  const icon = document.getElementById('triggerIcon').value.trim();
  const keywordsStr = document.getElementById('triggerKeywords').value.trim();
  const response = document.getElementById('triggerResponse').value.trim();
  const enabled = document.getElementById('triggerEnabled').checked;
  
  // NEW: Schedule & Targeting
  const startTime = document.getElementById('triggerStartTime').value;
  const endTime = document.getElementById('triggerEndTime').value;
  const target = document.getElementById('triggerTarget').value;
  const specificUsers = document.getElementById('triggerSpecificUsers').value.trim();
  const cooldown = parseInt(document.getElementById('triggerCooldown').value) || 30;
  
  if (!name) {
    showToast('❌ Vui lòng nhập tên trigger!', 'error');
    return;
  }
  
  if (!response) {
    showToast('❌ Vui lòng nhập nội dung trả lời!', 'error');
    return;
  }
  
  const keywords = keywordsStr.split(',')
    .map(k => k.trim().toLowerCase())
    .filter(k => k);
  
  const triggerData = {
    name,
    description: desc,
    icon: icon || '🔑',
    keywords,
    response,
    enabled,
    type: 'keyword',
    schedule: {
      startTime: startTime || '00:00',
      endTime: endTime || '23:59'
    },
    targeting: {
      type: target,
      userIds: target === 'specific' ? specificUsers.split(',').map(u => u.trim()).filter(u => u) : []
    },
    cooldown: cooldown * 1000, // Convert to milliseconds
    createdAt: editingTriggerId ? triggers.find(t => t.id === editingTriggerId)?.createdAt : Date.now(),
    updatedAt: Date.now()
  };
  
  if (editingTriggerId) {
    // Update existing
    triggerData.id = editingTriggerId;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'update_trigger',
        trigger: triggerData
      }));
      
      // Log activity
      logTriggerActivity('update', triggerData);
    } else {
      // Fallback for old auto reply system
      ws.send(JSON.stringify({
        type: 'update_scenario',
        id: editingTriggerId,
        keywords,
        response,
        enabled
      }));
    }
  } else {
    // Create new
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'create_trigger',
        trigger: triggerData
      }));
      
      // Log activity
      logTriggerActivity('create', triggerData);
    } else {
      // Fallback for old auto reply system
      ws.send(JSON.stringify({
        type: 'add_scenario',
        keywords,
        response
      }));
    }
  }
  
  hideTriggerModal();
}

function deleteTrigger(id) {
  const trigger = triggers.find(t => t.id === id);
  if (!trigger) return;
  
  if (!confirm(`Bạn có chắc muốn xóa trigger "${trigger.name}"?`)) {
    return;
  }
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'delete_trigger',
      id: id
    }));
  } else {
    // Fallback
    ws.send(JSON.stringify({
      type: 'delete_scenario',
      id: id
    }));
  }
}

function deleteCurrentTrigger() {
  if (currentTriggerId) {
    deleteTrigger(currentTriggerId);
  }
}

function duplicateCurrentTrigger() {
  if (!currentTriggerId) return;
  
  const trigger = triggers.find(t => t.id === currentTriggerId);
  if (!trigger) return;
  
  editingTriggerId = null;
  document.getElementById('modalTitle').textContent = 'Nhân bản Trigger';
  document.getElementById('triggerName').value = trigger.name + ' (Copy)';
  document.getElementById('triggerDesc').value = trigger.description || '';
  document.getElementById('triggerIcon').value = trigger.icon || '🔑';
  document.getElementById('triggerKeywords').value = trigger.keywords ? trigger.keywords.join(', ') : '';
  document.getElementById('triggerResponse').value = trigger.response || '';
  document.getElementById('triggerEnabled').checked = false;
  document.getElementById('saveBtn').innerHTML = '<span>💾</span><span>Tạo bản sao</span>';
  document.getElementById('triggerModal').classList.add('show');
}

function toggleTriggerStatus(id) {
  const trigger = triggers.find(t => t.id === id);
  if (!trigger) return;
  
  trigger.enabled = !trigger.enabled;
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'toggle_trigger',
      id: id
    }));
  } else {
    // Fallback
    ws.send(JSON.stringify({
      type: 'toggle_scenario',
      id: id
    }));
  }
  
  renderTriggerList();
  if (currentTriggerId === id) {
    displayTrigger(trigger);
  }
}

function openTriggerBuilder() {
  if (!currentTriggerId) return;
  const url = `/trigger-builder.html?trigger=${currentTriggerId}`;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ================================================
// SEARCH FUNCTION
// ================================================
function searchTriggers() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  document.querySelectorAll('.trigger-item-compact').forEach(item => {
    const name = item.querySelector('.trigger-name-small').textContent.toLowerCase();
    const keywords = item.querySelector('.trigger-keywords-preview').textContent.toLowerCase();
    if (name.includes(query) || keywords.includes(query)) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}

// ================================================
// UTILITY FUNCTIONS
// ================================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  // Simple toast notification
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideInRight 0.3s;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('triggerModal').addEventListener('click', (e) => {
    if (e.target.id === 'triggerModal') {
      hideTriggerModal();
    }
  });
});

// ================================================
// INITIALIZE
// ================================================
connectWebSocket();