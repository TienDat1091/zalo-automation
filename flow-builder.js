// flow-builder.js - Flow Builder Logic v4.4
// Giữ nguyên chức năng cũ + thêm IF/ELSE IF/ELSE + Friend Request/Accept

const BLOCK_TYPES = [
  { type: 'send-message', name: 'Gửi tin nhắn', desc: 'Gửi text message', icon: '💬', category: 'message', defaultData: { message: '' } },
  { type: 'send-image', name: 'Gửi hình ảnh', desc: 'Gửi ảnh từ URL', icon: '🖼️', category: 'message', defaultData: { imageUrl: '', caption: '' } },
  { type: 'send-file', name: 'Gửi file', desc: 'Gửi file đính kèm', icon: '📎', category: 'message', defaultData: { fileUrl: '', fileName: '' } },
  
  // Block gửi lời mời kết bạn - api.sendFriendRequest(msg, userId)
  { type: 'send-friend-request', name: 'Gửi kết bạn', desc: 'Gửi lời mời kết bạn', icon: '👋', category: 'message', 
    defaultData: { 
      targetType: 'sender',      // 'sender', 'variable', 'manual'
      targetUserId: '',          // User ID nhập thủ công
      targetVariable: '',        // Tên biến chứa User ID
      message: 'Xin chào, hãy kết bạn với tôi!'
    } 
  },
  
  // Block chấp nhận lời mời kết bạn - api.acceptFriendRequest(userId)
  { type: 'accept-friend-request', name: 'Chấp nhận kết bạn', desc: 'Tự động chấp nhận', icon: '🤝', category: 'message',
    defaultData: { 
      autoAccept: true,
      sendWelcome: true,
      welcomeMessage: 'Cảm ơn bạn đã kết bạn!',
      runFlowAfter: null
    } 
  },
  
  { type: 'delay', name: 'Delay', desc: 'Chờ thời gian', icon: '⏱️', category: 'logic', 
    defaultData: { duration: 2000, unit: 'ms' } 
  },
  { type: 'run-block', name: 'Run Block', desc: 'Chạy flow khác', icon: '🔗', category: 'logic', defaultData: { targetTriggerId: null } },
  { type: 'condition', name: 'Điều kiện', desc: 'IF/ELSE', icon: '🔀', category: 'logic', 
    defaultData: { 
      variableName: '', 
      operator: 'equals', 
      compareValue: '',
      trueFlowId: null,  // condition1
      falseFlowId: null   // condition2
    } 
  },
  { type: 'user-input', name: 'Lắng nghe', desc: 'Chờ user nhập', icon: '👂', category: 'logic',
    defaultData: { 
      questions: [{ message: '', expectedType: 'text', maxRetries: 2, variableName: '', retryMessage: '' }],
      timeoutValue: 1,
      timeoutUnit: 'hour'
    } 
  },
  { type: 'bot-active', name: 'Điều khiển Bot', desc: 'Bật/tắt bot', icon: '🤖', category: 'logic',
    defaultData: { action: 'toggle', duration: 0, scope: 'current' } },
  { type: 'webhook', name: 'Webhook', desc: 'Gọi API', icon: '🌐', category: 'integration', defaultData: { url: '', method: 'GET', headers: '', body: '' } },
  { type: 'ai-gemini', name: 'AI Gemini', desc: 'Tích hợp AI', icon: '🧠', category: 'integration', defaultData: { prompt: '', apiKey: '', saveResponseTo: '' } },
  { type: 'set-variable', name: 'Đặt biến', desc: 'Lưu giá trị', icon: '📝', category: 'action', defaultData: { variableName: '', variableValue: '', variableType: 'text' } },
  { type: 'clear-variable', name: 'Xóa biến', desc: 'Xóa biến', icon: '🗑️', category: 'action', defaultData: { variableName: '', clearAll: false } },
  { type: 'payment-hub', name: 'Cổng thanh toán', desc: 'Tạo thanh toán', icon: '💳', category: 'action', 
    defaultData: { 
      gateId: null,
      amount: '',
      amountType: 'manual',
      amountVariable: '',
      note: '',
      saveTransactionTo: ''
    } 
  },
];

const INPUT_TYPES = [
  { value: 'none', label: 'Bất kỳ' },
  { value: 'text', label: 'Văn bản' },
  { value: 'number', label: 'Số' },
  { value: 'phone', label: 'SĐT' },
  { value: 'email', label: 'Email' },
  { value: 'picture', label: 'Hình ảnh' },
  { value: 'file', label: 'File' },
  { value: 'yesno', label: 'Có/Không' }
];

const OPERATORS = [
  { value: 'equals', label: 'Bằng (=)' },
  { value: 'notEquals', label: 'Không bằng (≠)' },
  { value: 'contains', label: 'Chứa' },
  { value: 'notContains', label: 'Không chứa' },
  { value: 'startsWith', label: 'Bắt đầu bằng' },
  { value: 'endsWith', label: 'Kết thúc bằng' },
  { value: 'greaterThan', label: 'Lớn hơn (>)' },
  { value: 'lessThan', label: 'Nhỏ hơn (<)' },
  { value: 'greaterOrEqual', label: '≥' },
  { value: 'lessOrEqual', label: '≤' },
  { value: 'isEmpty', label: 'Rỗng' },
  { value: 'isNotEmpty', label: 'Không rỗng' }
];

let ws = null, currentTriggerId = null, currentTrigger = null, currentFlow = null;
let flowBlocks = [], allTriggers = [], selectedBlockId = null;
let draggedBlockType = null, draggedFlowBlockId = null;

function connectWebSocket() {
  ws = new WebSocket('ws://' + location.hostname + ':8080');
  ws.onopen = () => {
    console.log('✅ Connected');
    if (currentTriggerId) {
      ws.send(JSON.stringify({ type: 'get_triggers' }));
      ws.send(JSON.stringify({ type: 'get_flow', triggerID: currentTriggerId }));
    }
  };
  ws.onclose = () => setTimeout(connectWebSocket, 3000);
  ws.onmessage = (e) => { try { handleMessage(JSON.parse(e.data)); } catch(err) { console.error(err); } };
}

function handleMessage(data) {
  console.log('📩', data.type);
  if (data.type === 'triggers_list') {
    allTriggers = data.triggers || [];
    currentTrigger = allTriggers.find(t => (t.triggerID || t.id) === currentTriggerId);
    if (currentTrigger) { updateTriggerInfo(); renderFlow(); }
  }
  if (data.type === 'flow_data') {
    currentFlow = data.flow;
    flowBlocks = currentFlow?.blocks || [];
    if (!currentFlow && currentTriggerId) ws.send(JSON.stringify({ type: 'create_flow', triggerID: currentTriggerId, flowName: 'Flow #' + currentTriggerId }));
    renderFlow();
  }
  if (data.type === 'flow_created') { currentFlow = data.flow; flowBlocks = data.flow.blocks || []; renderFlow(); showToast('✅ Flow tạo!', 'success'); }
  if (data.type === 'flow_updated') { if (data.flow?.triggerID === currentTriggerId) { currentFlow = data.flow; flowBlocks = data.flow.blocks || []; renderFlow(); } }
  if (data.type === 'flow_block_added') { flowBlocks.push(data.block); renderFlow(); showToast('✅ Thêm khối!', 'success'); selectBlock(data.block.blockID); }
  if (data.type === 'flow_block_updated') { const i = flowBlocks.findIndex(b => b.blockID === data.block.blockID); if (i !== -1) flowBlocks[i] = data.block; renderFlow(); showToast('✅ Đã lưu!', 'success'); }
  if (data.type === 'flow_block_deleted') { flowBlocks = flowBlocks.filter(b => b.blockID !== data.blockID); if (selectedBlockId === data.blockID) closePropertiesPanel(); renderFlow(); showToast('✅ Đã xóa!', 'success'); }
  if (data.type === 'flow_error') showToast('❌ ' + data.message, 'error');
  
  // Payment gates handling
  if (data.type === 'payment_gates_list') {
    window.paymentGates = data.gates || [];
  }
}

function updateTriggerInfo() {
  if (!currentTrigger) return;
  document.getElementById('triggerName').textContent = currentTrigger.triggerName || currentTrigger.name || 'Trigger #' + currentTriggerId;
  document.getElementById('triggerBadge').textContent = currentTrigger.enabled ? 'Active' : 'Inactive';
  document.getElementById('triggerBadge').className = 'badge ' + (currentTrigger.enabled ? 'active' : 'inactive');
}

function renderBlocksList() {
  const categories = { message: { title: '💬 TIN NHẮN', blocks: [] }, logic: { title: '🔀 LOGIC', blocks: [] }, action: { title: '⚡ HÀNH ĐỘNG', blocks: [] }, integration: { title: '🔗 TÍCH HỢP', blocks: [] } };
  BLOCK_TYPES.forEach(b => { if (categories[b.category]) categories[b.category].blocks.push(b); });
  let html = '';
  for (const [key, cat] of Object.entries(categories)) {
    if (cat.blocks.length === 0) continue;
    html += `<div class="block-category"><div class="category-title">${cat.title}</div>${cat.blocks.map(b => `
      <div class="block-item" draggable="true" data-type="${b.type}" ondragstart="onDragStartNew(event,'${b.type}')" ondragend="onDragEndNew(event)" onclick="addBlockFromClick('${b.type}')">
        <div class="block-icon ${b.category}">${b.icon}</div>
        <div class="block-info"><div class="block-name">${b.name}</div><div class="block-desc">${b.desc}</div></div>
      </div>`).join('')}</div>`;
  }
  document.getElementById('blocksList').innerHTML = html;
}

function filterBlocks() {
  const q = document.getElementById('blockSearch').value.toLowerCase();
  document.querySelectorAll('.block-item').forEach(el => {
    const name = el.querySelector('.block-name')?.textContent.toLowerCase() || '';
    el.style.display = name.includes(q) ? 'flex' : 'none';
  });
}

function renderFlow() {
  const container = document.getElementById('flowContainer');
  let keywords = currentTrigger?.triggerKey?.split(',').map(k => k.trim()).filter(k => k) || [];
  
  let html = `<div class="flow-trigger-start"><div class="trigger-start-header"><span class="trigger-start-icon">🚀</span><span class="trigger-start-title">Khi nhận tin nhắn chứa</span></div><div class="trigger-start-keywords">${keywords.length > 0 ? keywords.map(k => `<span class="trigger-keyword">${escapeHtml(k)}</span>`).join('') : '<span class="trigger-keyword">Chưa có từ khóa</span>'}</div></div><div class="flow-connector"></div>`;
  
  const mainBlocks = flowBlocks.filter(b => !b.parentBlockID).sort((a,b) => a.blockOrder - b.blockOrder);
  
  if (mainBlocks.length === 0) {
    html += `<div class="drop-zone" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDropNew(event)"><div class="drop-zone-text"><div class="drop-zone-icon">📦</div><div>Kéo thả khối vào đây</div></div></div>`;
  } else {
    mainBlocks.forEach((block, i) => { html += renderBlockElement(block, i) + '<div class="flow-connector"></div>'; });
    html += `<div class="drop-zone" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDropNew(event)"><div class="drop-zone-text"><div class="drop-zone-icon">➕</div><div>Thêm khối</div></div></div>`;
  }
  
  html += `<div class="flow-connector"></div><div class="flow-end">🏁 Kết thúc</div>`;
  container.innerHTML = html;
}

function renderBlockElement(block, index) {
  const def = BLOCK_TYPES.find(t => t.type === block.blockType) || { name: block.blockType, icon: '📦', category: 'logic' };
  const isSelected = selectedBlockId === block.blockID;
  const blockClass = { 'run-block': 'run-block', 'condition': 'condition-block', 'user-input': 'input-block', 'bot-active': 'bot-block' }[block.blockType] || '';
  
  let html = `<div class="flow-block ${isSelected ? 'selected' : ''} ${blockClass}" data-block-id="${block.blockID}" draggable="true"
    ondragstart="onDragStartBlock(event,${block.blockID})" ondragend="onDragEndBlock(event)" ondragover="onDragOverBlock(event,${block.blockID})" ondragleave="onDragLeaveBlock(event)" ondrop="onDropBlock(event,${block.blockID})" onclick="selectBlock(${block.blockID})">
    <span class="block-drag-handle">⋮⋮</span>
    <div class="block-header">
      <div class="block-header-icon block-icon ${def.category}">${def.icon}</div>
      <div class="block-header-info"><div class="block-title">${def.name}</div><div class="block-subtitle">#${index + 1}</div></div>
      <div class="block-actions"><button class="block-action-btn" onclick="event.stopPropagation();selectBlock(${block.blockID})">✏️</button><button class="block-action-btn delete" onclick="event.stopPropagation();deleteBlock(${block.blockID})">🗑️</button></div>
    </div>
    <div class="block-content">${renderBlockPreview(block)}</div>
  </div>`;
  
  if (block.blockType === 'condition') html += renderConditionConnections(block);
  return html;
}

function renderConditionConnections(block) {
  const d = block.blockData || {};
  const condition1 = d.trueFlowId || block.condition1;
  const condition2 = d.falseFlowId || block.condition2;
  
  let html = '<div class="condition-connections">';
  
  // True branch (condition1)
  if (condition1) {
    const targetFlow = allTriggers.find(f => (f.triggerID || f.id) === condition1);
    html += `
      <div class="condition-branch branch-true">
        <div class="branch-header">
          <span class="branch-icon">✅</span>
          <span>Nếu ĐÚNG → Chạy flow:</span>
        </div>
        <div class="branch-target">
          ${targetFlow ? `<span class="flow-badge">${escapeHtml(targetFlow.triggerName || targetFlow.name)}</span>` : `<span class="warning">Flow #${condition1}</span>`}
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="condition-branch branch-true">
        <div class="branch-header">
          <span class="branch-icon">✅</span>
          <span>Nếu ĐÚNG → Không có flow</span>
        </div>
        <div class="branch-hint">Chọn flow để chạy khi điều kiện đúng</div>
      </div>
    `;
  }
  
  // False branch (condition2)
  if (condition2) {
    const targetFlow = allTriggers.find(f => (f.triggerID || f.id) === condition2);
    html += `
      <div class="condition-branch branch-false">
        <div class="branch-header">
          <span class="branch-icon">❌</span>
          <span>Nếu SAI → Chạy flow:</span>
        </div>
        <div class="branch-target">
          ${targetFlow ? `<span class="flow-badge">${escapeHtml(targetFlow.triggerName || targetFlow.name)}</span>` : `<span class="warning">Flow #${condition2}</span>`}
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="condition-branch branch-false">
        <div class="branch-header">
          <span class="branch-icon">❌</span>
          <span>Nếu SAI → Không có flow</span>
        </div>
        <div class="branch-hint">Chọn flow để chạy khi điều kiện sai</div>
      </div>
    `;
  }
  
  html += `<div class="branch-footer">📌 Sau khi chạy xong flow sẽ tiếp tục flow chính</div>`;
  html += '</div>';
  return html;
}

function getOpSymbol(op) {
  const s = { 'equals': '=', 'notEquals': '≠', 'contains': '∋', 'greaterThan': '>', 'lessThan': '<', 'isEmpty': '= ∅' };
  return s[op] || op;
}

function renderBlockPreview(block) {
  const d = block.blockData || {};
  switch (block.blockType) {
    case 'send-message': return d.message ? `<div class="block-preview">${escapeHtml(d.message.substring(0,80))}${d.message.length>80?'...':''}</div>` : '<span class="warning">⚠️ Chưa có nội dung</span>';
    case 'send-image': return d.imageUrl ? `<div class="block-preview">🖼️ ${d.imageUrl.substring(0,40)}...</div>` : '<span class="warning">⚠️ Chưa có URL</span>';
    case 'send-file': return d.fileUrl ? `<div class="block-preview">📎 ${d.fileName||d.fileUrl.substring(0,40)}</div>` : '<span class="warning">⚠️ Chưa có file</span>';
    case 'delay': return `<div class="block-preview">⏱️ Chờ ${(d.duration||2000)/1000}s</div>`;
    case 'run-block': 
      if (d.targetTriggerId) { const t = allTriggers.find(x => (x.triggerID||x.id) === d.targetTriggerId); return `<div class="block-preview">🔗 ${t ? escapeHtml(t.triggerName||t.name) : 'Flow #'+d.targetTriggerId}</div>`; }
      return '<span class="warning">⚠️ Chưa chọn Flow</span>';
    case 'condition':
      const conditionText = d.variableName ? `<div class="block-preview">🔀 {${d.variableName}} ${d.operator} "${d.compareValue||''}"</div>` : '<span class="warning">⚠️ Chưa cấu hình</span>';
      const hasTrue = d.trueFlowId || block.condition1;
      const hasFalse = d.falseFlowId || block.condition2;
      return conditionText + `<div class="block-preview-small">✅ ${hasTrue ? 'Có flow True' : 'Chưa có True'} | ❌ ${hasFalse ? 'Có flow False' : 'Chưa có False'}</div>`;
    case 'user-input':
      const questions = d.questions || [];
      if (questions.length > 0) {
        return `<div class="block-preview">👂 ${questions.length} câu hỏi<br>${questions.slice(0,2).map((q,i) => `${i+1}. ${q.variableName ? '{'+q.variableName+'}' : '?'}`).join('<br>')}${questions.length > 2 ? '<br>...' : ''}</div>`;
      }
      return '<span class="warning">⚠️ Chưa có câu hỏi</span>';
    case 'bot-active':
      const actions = { on: '🟢 Bật', off: '🔴 Tắt', toggle: '🔄 Toggle' };
      return `<div class="block-preview">${actions[d.action]||'Bot'}${d.duration>0?' '+d.duration+'p':''}</div>`;
    case 'set-variable': return d.variableName ? `<div class="block-preview">📝 {${d.variableName}} = ${escapeHtml((d.variableValue||'').substring(0,20))}</div>` : '<span class="warning">⚠️ Chưa cấu hình</span>';
    case 'clear-variable': return d.clearAll ? '<div class="block-preview">🗑️ Xóa tất cả</div>' : (d.variableName ? `<div class="block-preview">🗑️ {${d.variableName}}</div>` : '<span class="warning">⚠️ Chưa chọn</span>');
    case 'webhook': return d.url ? `<div class="block-preview">${d.method||'GET'} ${d.url.substring(0,30)}...</div>` : '<span class="warning">⚠️ Chưa có URL</span>';
    case 'ai-gemini': return d.prompt ? `<div class="block-preview">🧠 ${escapeHtml(d.prompt.substring(0,40))}...</div>` : '<span class="warning">⚠️ Chưa có prompt</span>';
    default: return '<span class="warning">Click để cấu hình</span>';
  }
}

// Drag & Drop
function onDragStartNew(e, type) { draggedBlockType = type; draggedFlowBlockId = null; e.target.classList.add('dragging'); e.dataTransfer.setData('text/plain', 'new:'+type); }
function onDragEndNew(e) { e.target.classList.remove('dragging'); draggedBlockType = null; }
function onDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onDropNew(e) { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); const data = e.dataTransfer.getData('text/plain'); if (data.startsWith('new:')) addBlock(data.replace('new:','')); }
function onDragStartBlock(e, id) { e.stopPropagation(); draggedFlowBlockId = id; e.target.classList.add('dragging'); e.dataTransfer.setData('text/plain', 'reorder:'+id); }
function onDragEndBlock(e) { e.target.classList.remove('dragging'); draggedFlowBlockId = null; document.querySelectorAll('.drag-over-top,.drag-over-bottom,.drag-over').forEach(el => el.classList.remove('drag-over-top','drag-over-bottom','drag-over')); }
function onDragOverBlock(e, targetId) { e.preventDefault(); e.stopPropagation(); if (!draggedFlowBlockId || draggedFlowBlockId === targetId) return; const rect = e.currentTarget.getBoundingClientRect(); e.currentTarget.classList.remove('drag-over-top','drag-over-bottom'); e.currentTarget.classList.add(e.clientY < rect.top + rect.height/2 ? 'drag-over-top' : 'drag-over-bottom'); }
function onDragLeaveBlock(e) { e.currentTarget.classList.remove('drag-over-top','drag-over-bottom'); }
function onDropBlock(e, targetId) {
  e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-over-top','drag-over-bottom');
  const data = e.dataTransfer.getData('text/plain');
  if (data.startsWith('new:')) { const target = flowBlocks.find(b => b.blockID === targetId); if (target) addBlock(data.replace('new:',''), target.blockOrder); return; }
  if (!data.startsWith('reorder:')) return;
  const srcId = parseInt(data.replace('reorder:','')); if (srcId === targetId) return;
  const rect = e.currentTarget.getBoundingClientRect();
  reorderBlocks(srcId, targetId, e.clientY < rect.top + rect.height/2);
}

function addBlockFromClick(type) { 
  addBlock(type); 
}

function addBlock(type, order = null, parentId = null, branchType = null) {
  if (!currentFlow) { showToast('❌ Flow chưa sẵn sàng!', 'error'); return; }
  const def = BLOCK_TYPES.find(t => t.type === type);
  if (!def) { showToast('❌ Loại không hợp lệ!', 'error'); return; }
  
  // For condition block, we need to pass condition1 and condition2 as null initially
  const blockData = JSON.parse(JSON.stringify(def.defaultData || {}));
  let condition1 = null;
  let condition2 = null;
  
  console.log('📦 Adding block:', { type, order, parentId, branchType });
  ws.send(JSON.stringify({ 
    type: 'add_flow_block', 
    flowID: currentFlow.flowID, 
    blockType: type, 
    blockData: blockData, 
    blockOrder: order, 
    parentBlockID: parentId, 
    branchType: branchType,
    condition1: condition1,
    condition2: condition2
  }));
}

function reorderBlocks(srcId, targetId, insertBefore) {
  const sorted = [...flowBlocks].filter(b => !b.parentBlockID).sort((a,b) => a.blockOrder - b.blockOrder);
  const srcIdx = sorted.findIndex(b => b.blockID === srcId);
  const targetIdx = sorted.findIndex(b => b.blockID === targetId);
  if (srcIdx === -1 || targetIdx === -1) return;
  const [src] = sorted.splice(srcIdx, 1);
  let newIdx = sorted.findIndex(b => b.blockID === targetId);
  if (!insertBefore) newIdx++;
  sorted.splice(newIdx, 0, src);
  ws.send(JSON.stringify({ type: 'reorder_flow_blocks', flowID: currentFlow.flowID, blockIds: sorted.map(b => b.blockID) }));
  showToast('🔄 Đang cập nhật...', 'info');
}

function deleteBlock(id) { if (!confirm('Xóa khối này?')) return; ws.send(JSON.stringify({ type: 'delete_flow_block', blockID: id })); }

function selectBlock(id) { selectedBlockId = id; renderFlow(); openPropertiesPanel(id); }
function closePropertiesPanel() { document.getElementById('propertiesPanel').classList.add('hidden'); selectedBlockId = null; renderFlow(); }

function openPropertiesPanel(id) {
  const block = flowBlocks.find(b => b.blockID === id);
  if (!block) return;
  const def = BLOCK_TYPES.find(t => t.type === block.blockType) || { name: block.blockType };
  document.getElementById('propertiesTitle').textContent = '⚙️ ' + def.name;
  document.getElementById('propertiesContent').innerHTML = renderPropertiesForm(block);
  document.getElementById('propertiesPanel').classList.remove('hidden');
}

function renderPropertiesForm(block) {
  const d = block.blockData || {};
  let html = '';
  
  switch (block.blockType) {
    case 'send-message':
      html = `<div class="property-group"><label class="property-label">Nội dung <span class="required">*</span></label><textarea class="property-input property-textarea" id="prop_message" placeholder="Nhập nội dung...">${escapeHtml(d.message||'')}</textarea><div class="property-hint">Biến: {sender_name}, {time}, {variable}</div></div>`;
      break;
    case 'send-image':
      html = `<div class="property-group"><label class="property-label">URL ảnh <span class="required">*</span></label><input type="url" class="property-input" id="prop_imageUrl" value="${escapeHtml(d.imageUrl||'')}" placeholder="https://..."></div><div class="property-group"><label class="property-label">Caption</label><input class="property-input" id="prop_caption" value="${escapeHtml(d.caption||'')}"></div>`;
      break;
    case 'send-file':
      html = `<div class="property-group"><label class="property-label">URL file <span class="required">*</span></label><input type="url" class="property-input" id="prop_fileUrl" value="${escapeHtml(d.fileUrl||'')}" placeholder="https://..."></div><div class="property-group"><label class="property-label">Tên file</label><input class="property-input" id="prop_fileName" value="${escapeHtml(d.fileName||'')}"></div>`;
      break;
    case 'delay':
      html = `<div class="property-group"><label class="property-label">Thời gian (giây)</label><input type="number" class="property-input" id="prop_duration" value="${(d.duration||2000)/1000}" min="0" step="0.5"></div>`;
      break;
    case 'run-block':
      const others = allTriggers.filter(t => (t.triggerID||t.id) !== currentTriggerId && t.setMode === 1);
      html = `<div class="property-group"><label class="property-label">Chọn Flow <span class="required">*</span></label><select class="property-select" id="prop_targetTriggerId"><option value="">-- Chọn --</option>${others.map(t => { const tid = t.triggerID||t.id; return `<option value="${tid}" ${d.targetTriggerId===tid?'selected':''}>${escapeHtml(t.triggerName||t.name)} (ID:${tid})</option>`; }).join('')}</select></div>${others.length===0?'<div class="property-warning">⚠️ Không có Flow khác</div>':''}`;
      break;
      
    case 'condition':
      const othersForCondition = allTriggers.filter(t => (t.triggerID||t.id) !== currentTriggerId && t.setMode === 1);
      const condition1 = d.trueFlowId || block.condition1;
      const condition2 = d.falseFlowId || block.condition2;
      
      html = `
        <div class="property-group">
          <label class="property-label">Biến kiểm tra</label>
          <input class="property-input" id="prop_variableName" value="${escapeHtml(d.variableName||'')}" placeholder="Tên biến (vd: choice)">
        </div>
        <div class="property-row" style="gap:8px;">
          <select class="property-select" id="prop_operator">
            ${OPERATORS.map(op => `<option value="${op.value}" ${d.operator===op.value?'selected':''}>${op.label}</option>`).join('')}
          </select>
          <input class="property-input" id="prop_compareValue" value="${escapeHtml(d.compareValue||'')}" placeholder="Giá trị so sánh">
        </div>
        <div class="property-info" style="margin-top:12px;">
          💡 Kiểm tra giá trị: {<strong>${escapeHtml(d.variableName||'variable')}</strong>} ${d.operator||'equals'} "${escapeHtml(d.compareValue||'value')}"
        </div>
        
        <div class="property-group" style="margin-top:20px;border-top:1px solid #e0e0e0;padding-top:16px;">
          <label class="property-label">✅ Nếu ĐÚNG (condition1)</label>
          <select class="property-select" id="prop_condition1">
            <option value="">-- Không chọn --</option>
            ${othersForCondition.map(t => { 
              const tid = t.triggerID||t.id; 
              return `<option value="${tid}" ${condition1===tid?'selected':''}>${escapeHtml(t.triggerName||t.name)} (ID:${tid})</option>`;
            }).join('')}
          </select>
          <div class="property-hint">Chọn flow để chạy khi điều kiện đúng</div>
        </div>
        
        <div class="property-group">
          <label class="property-label">❌ Nếu SAI (condition2)</label>
          <select class="property-select" id="prop_condition2">
            <option value="">-- Không chọn --</option>
            ${othersForCondition.map(t => { 
              const tid = t.triggerID||t.id; 
              return `<option value="${tid}" ${condition2===tid?'selected':''}>${escapeHtml(t.triggerName||t.name)} (ID:${tid})</option>`;
            }).join('')}
          </select>
          <div class="property-hint">Chọn flow để chạy khi điều kiện sai</div>
        </div>
        
        <div class="property-info" style="margin-top:12px;background:#e8f5e9;border-left:4px solid #4caf50;padding:8px;">
          <strong>📌 Quy trình hoạt động:</strong><br>
          1. Kiểm tra điều kiện với biến<br>
          2. Nếu đúng → chạy flow trong condition1<br>
          3. Nếu sai → chạy flow trong condition2<br>
          4. Sau khi chạy xong → tiếp tục flow chính
        </div>
      `;
      break;
      
    case 'user-input':
      const questions = d.questions || [{ message: '', expectedType: 'text', maxRetries: 2, variableName: '', retryMessage: '' }];
      html = `<div id="questionsContainer">`;
      questions.forEach((q, idx) => { html += renderQuestionItem(q, idx, questions.length); });
      html += `</div>
        <button type="button" class="btn" style="width:100%;margin-top:8px;border:2px dashed #0084ff;color:#0084ff;" onclick="addQuestion()">+ Thêm câu hỏi</button>
        <div class="property-group" style="margin-top:20px;border-top:1px solid #e0e0e0;padding-top:16px;">
          <label class="property-label">Timeout nếu không trả lời</label>
          <div class="property-row">
            <input type="number" class="property-input" id="prop_timeoutValue" value="${d.timeoutValue||1}" min="1">
            <select class="property-select" id="prop_timeoutUnit">
              <option value="minute" ${d.timeoutUnit==='minute'?'selected':''}>Phút</option>
              <option value="hour" ${d.timeoutUnit==='hour'?'selected':''}>Giờ</option>
            </select>
          </div>
        </div>`;
      break;
      
    case 'bot-active':
      html = `<div class="property-group"><label class="property-label">Hành động</label><select class="property-select" id="prop_action"><option value="on" ${d.action==='on'?'selected':''}>🟢 Bật bot</option><option value="off" ${d.action==='off'?'selected':''}>🔴 Tắt bot</option><option value="toggle" ${d.action==='toggle'?'selected':''}>🔄 Toggle</option></select></div>
        <div class="property-group"><label class="property-label">Thời gian (phút)</label><input type="number" class="property-input" id="prop_duration" value="${d.duration||0}" min="0"><div class="property-hint">0 = Vĩnh viễn</div></div>
        <div class="property-group"><label class="property-label">Phạm vi</label><select class="property-select" id="prop_scope"><option value="current" ${d.scope==='current'?'selected':''}>Cuộc hội thoại này</option><option value="all" ${d.scope==='all'?'selected':''}>Tất cả</option></select></div>`;
      break;
    case 'set-variable':
      html = `<div class="property-group"><label class="property-label">Tên biến <span class="required">*</span></label><input class="property-input" id="prop_variableName" value="${escapeHtml(d.variableName||'')}" placeholder="user_name"></div>
        <div class="property-group"><label class="property-label">Giá trị</label><textarea class="property-input" id="prop_variableValue" rows="2">${escapeHtml(d.variableValue||'')}</textarea><div class="property-hint">Có thể dùng: {other_variable}</div></div>
        <div class="property-group"><label class="property-label">Kiểu</label><select class="property-select" id="prop_variableType"><option value="text" ${d.variableType==='text'?'selected':''}>Text</option><option value="number" ${d.variableType==='number'?'selected':''}>Number</option><option value="boolean" ${d.variableType==='boolean'?'selected':''}>Boolean</option></select></div>`;
      break;
    case 'clear-variable':
      html = `<div class="property-group"><label><input type="checkbox" id="prop_clearAll" ${d.clearAll?'checked':''} onchange="document.getElementById('single_var').style.display=this.checked?'none':'block'"> Xóa tất cả biến</label></div>
        <div class="property-group" id="single_var" style="${d.clearAll?'display:none':''}"><label class="property-label">Tên biến</label><input class="property-input" id="prop_variableName" value="${escapeHtml(d.variableName||'')}"></div>`;
      break;
    case 'webhook':
      html = `<div class="property-group"><label class="property-label">URL <span class="required">*</span></label><input type="url" class="property-input" id="prop_url" value="${escapeHtml(d.url||'')}"></div>
        <div class="property-group"><label class="property-label">Method</label><select class="property-select" id="prop_method"><option value="GET" ${d.method==='GET'?'selected':''}>GET</option><option value="POST" ${d.method==='POST'?'selected':''}>POST</option><option value="PUT" ${d.method==='PUT'?'selected':''}>PUT</option><option value="DELETE" ${d.method==='DELETE'?'selected':''}>DELETE</option></select></div>
        <div class="property-group"><label class="property-label">Headers (JSON)</label><textarea class="property-input" id="prop_headers" rows="2">${escapeHtml(d.headers||'')}</textarea></div>
        <div class="property-group"><label class="property-label">Body (JSON)</label><textarea class="property-input" id="prop_body" rows="2">${escapeHtml(d.body||'')}</textarea></div>`;
      break;
    case 'ai-gemini':
      html = `<div class="property-group"><label class="property-label">Prompt</label><textarea class="property-input property-textarea" id="prop_prompt">${escapeHtml(d.prompt||'')}</textarea><div class="property-hint">Biến: {message}, {sender_name}</div></div>
        <div class="property-group"><label class="property-label">API Key</label><input type="password" class="property-input" id="prop_apiKey" value="${d.apiKey||''}"></div>
        <div class="property-group"><label class="property-label">Lưu response vào</label><input class="property-input" id="prop_saveResponseTo" value="${escapeHtml(d.saveResponseTo||'')}" placeholder="ai_response"></div>`;
      break;
      
    // Block gửi lời mời kết bạn - api.sendFriendRequest(msg, userId)
    case 'send-friend-request':
      html = `
        <div class="property-group">
          <label class="property-label">Nguồn User ID <span class="required">*</span></label>
          <select class="property-select" id="prop_targetType" onchange="toggleFriendRequestTarget()">
            <option value="sender" ${d.targetType==='sender'?'selected':''}>Người gửi tin nhắn (sender_id)</option>
            <option value="variable" ${d.targetType==='variable'?'selected':''}>Từ biến</option>
            <option value="manual" ${d.targetType==='manual'?'selected':''}>Nhập thủ công</option>
          </select>
        </div>
        <div class="property-group" id="friendTargetVariable" style="${d.targetType!=='variable'?'display:none':''}">
          <label class="property-label">Tên biến chứa User ID</label>
          <input class="property-input" id="prop_targetVariable" value="${escapeHtml(d.targetVariable||'')}" placeholder="user_id">
          <div class="property-hint">Biến này chứa Zalo User ID cần gửi kết bạn</div>
        </div>
        <div class="property-group" id="friendTargetManual" style="${d.targetType!=='manual'?'display:none':''}">
          <label class="property-label">User ID</label>
          <input class="property-input" id="prop_targetUserId" value="${escapeHtml(d.targetUserId||'')}" placeholder="000000000000000001">
        </div>
        <div class="property-group">
          <label class="property-label">Tin nhắn kèm theo</label>
          <textarea class="property-input" id="prop_message" rows="3" placeholder="Xin chào, hãy kết bạn với tôi!">${escapeHtml(d.message||'')}</textarea>
          <div class="property-hint">Tin nhắn gửi kèm lời mời kết bạn</div>
        </div>
        <div class="property-info" style="margin-top:12px;background:#e3f2fd;border-left:4px solid #2196f3;padding:10px;">
          <strong>📌 API: sendFriendRequest(msg, userId)</strong><br>
          - Chỉ gửi được với người chưa là bạn bè<br>
          - Người nhận cần chấp nhận lời mời<br>
          - Có thể dùng biến {sender_id} để lấy ID người gửi
        </div>
      `;
      break;
      
    // Block chấp nhận lời mời kết bạn - api.acceptFriendRequest(userId)
    case 'accept-friend-request':
      const othersForAccept = allTriggers.filter(t => (t.triggerID||t.id) !== currentTriggerId && t.setMode === 1);
      html = `
        <div class="property-group">
          <label><input type="checkbox" id="prop_autoAccept" ${d.autoAccept!==false?'checked':''}> Tự động chấp nhận lời mời kết bạn</label>
        </div>
        <div class="property-group">
          <label><input type="checkbox" id="prop_sendWelcome" ${d.sendWelcome!==false?'checked':''}> Gửi tin nhắn chào mừng sau khi chấp nhận</label>
        </div>
        <div class="property-group" id="welcomeMessageGroup">
          <label class="property-label">Tin nhắn chào mừng</label>
          <textarea class="property-input" id="prop_welcomeMessage" rows="3">${escapeHtml(d.welcomeMessage||'Cảm ơn bạn đã kết bạn!')}</textarea>
          <div class="property-hint">Tin nhắn gửi sau khi chấp nhận kết bạn</div>
        </div>
        <div class="property-group">
          <label class="property-label">Chạy Flow sau khi chấp nhận</label>
          <select class="property-select" id="prop_runFlowAfter">
            <option value="">-- Không chọn --</option>
            ${othersForAccept.map(t => {
              const tid = t.triggerID||t.id;
              return `<option value="${tid}" ${d.runFlowAfter==tid?'selected':''}>${escapeHtml(t.triggerName||t.name)}</option>`;
            }).join('')}
          </select>
          <div class="property-hint">Flow sẽ chạy với người vừa kết bạn</div>
        </div>
        <div class="property-info" style="margin-top:12px;background:#e8f5e9;border-left:4px solid #4caf50;padding:10px;">
          <strong>📌 API: acceptFriendRequest(userId)</strong><br>
          - Block này lắng nghe sự kiện friend request<br>
          - Tự động chấp nhận khi có người gửi kết bạn<br>
          - Gửi tin nhắn chào mừng nếu được bật
        </div>
      `;
      break;
      
    case 'delay':
      html = `
        <div class="property-group">
          <label class="property-label">Thời gian chờ</label>
          <div class="property-row">
            <input type="number" class="property-input" id="prop_duration" value="${d.duration||2000}" min="0" style="flex:1">
            <select class="property-select" id="prop_unit" style="width:100px">
              <option value="ms" ${d.unit==='ms'?'selected':''}>Mili-giây</option>
              <option value="s" ${d.unit==='s'?'selected':''}>Giây</option>
              <option value="m" ${d.unit==='m'?'selected':''}>Phút</option>
              <option value="h" ${d.unit==='h'?'selected':''}>Giờ</option>
            </select>
          </div>
        </div>
        <div class="property-info" style="margin-top:12px;">
          ⏱️ Chờ một khoảng thời gian trước khi thực hiện block tiếp theo
        </div>
      `;
      break;
      
    case 'payment-hub':
      const paymentGates = window.paymentGates || [];
      html = `
        <div class="property-group">
          <label class="property-label">Cổng thanh toán <span class="required">*</span></label>
          <select class="property-select" id="prop_gateId">
            <option value="">-- Chọn cổng --</option>
            ${paymentGates.map(g => `<option value="${g.gateID}" ${d.gateId==g.gateID?'selected':''}>${escapeHtml(g.gateName)}</option>`).join('')}
          </select>
          <div class="property-hint">Chọn cổng thanh toán đã cấu hình</div>
        </div>
        <div class="property-group">
          <label class="property-label">Nguồn số tiền</label>
          <select class="property-select" id="prop_amountType" onchange="togglePaymentAmountType()">
            <option value="manual" ${d.amountType==='manual'?'selected':''}>Nhập thủ công</option>
            <option value="variable" ${d.amountType==='variable'?'selected':''}>Từ biến</option>
          </select>
        </div>
        <div class="property-group" id="paymentAmountManual" style="${d.amountType==='variable'?'display:none':''}">
          <label class="property-label">Số tiền (VND)</label>
          <input type="number" class="property-input" id="prop_amount" value="${d.amount||''}" placeholder="10000">
        </div>
        <div class="property-group" id="paymentAmountVariable" style="${d.amountType!=='variable'?'display:none':''}">
          <label class="property-label">Tên biến chứa số tiền</label>
          <input class="property-input" id="prop_amountVariable" value="${escapeHtml(d.amountVariable||'')}" placeholder="amount">
        </div>
        <div class="property-group">
          <label class="property-label">Ghi chú</label>
          <input class="property-input" id="prop_note" value="${escapeHtml(d.note||'')}" placeholder="Thanh toán đơn hàng">
        </div>
        <div class="property-group">
          <label class="property-label">Lưu mã giao dịch vào biến</label>
          <input class="property-input" id="prop_saveTransactionTo" value="${escapeHtml(d.saveTransactionTo||'')}" placeholder="transaction_code">
        </div>
        <div class="property-info" style="margin-top:12px;background:#fff3e0;border-left:4px solid #ff9800;padding:10px;">
          <strong>💳 Quy trình:</strong><br>
          1. Tạo mã giao dịch (DHSxxxxxxxx)<br>
          2. Gửi thông tin thanh toán cho user<br>
          3. Chờ thanh toán thành công
        </div>
      `;
      break;
      
    default:
      html = '<div class="property-info">Đang phát triển...</div>';
  }
  
  html += `<div class="property-group" style="margin-top:24px;"><button class="btn btn-primary" style="width:100%;" onclick="saveBlockProperties(${block.blockID})">💾 Lưu</button></div><div class="property-group"><button class="btn btn-danger" style="width:100%;" onclick="deleteBlock(${block.blockID})">🗑️ Xóa</button></div>`;
  return html;
}

// Question items
function renderQuestionItem(q, idx, total) {
  return `
    <div class="question-item" data-idx="${idx}" style="background:#f5f7fa;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-weight:600;font-size:12px;color:#666;">Câu hỏi ${idx + 1}</span>
        ${total > 1 ? `<button type="button" onclick="removeQuestion(${idx})" style="background:#ffebee;border:none;color:#f44336;width:24px;height:24px;border-radius:50%;cursor:pointer;">✕</button>` : ''}
      </div>
      <div class="property-group" style="margin-bottom:8px;">
        <textarea class="property-input q-msg" data-idx="${idx}" rows="2" placeholder="Tin nhắn...">${escapeHtml(q.message||'')}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 60px 1fr;gap:6px;margin-bottom:8px;">
        <select class="property-select q-type" data-idx="${idx}">
          ${INPUT_TYPES.map(t => `<option value="${t.value}" ${q.expectedType===t.value?'selected':''}>${t.label}</option>`).join('')}
        </select>
        <input type="number" class="property-input q-retry" data-idx="${idx}" value="${q.maxRetries||2}" min="0" max="10" title="Số lần thử">
        <input class="property-input q-var" data-idx="${idx}" value="${escapeHtml(q.variableName||'')}" placeholder="Lưu vào biến">
      </div>
      <input class="property-input q-retry-msg" data-idx="${idx}" value="${escapeHtml(q.retryMessage||'')}" placeholder="Tin nhắn khi nhập sai">
    </div>
  `;
}

function addQuestion() {
  const container = document.getElementById('questionsContainer');
  const idx = container.querySelectorAll('.question-item').length;
  const div = document.createElement('div');
  div.innerHTML = renderQuestionItem({ message: '', expectedType: 'text', maxRetries: 2, variableName: '', retryMessage: '' }, idx, idx + 1);
  container.appendChild(div.firstElementChild);
}

function removeQuestion(idx) {
  const items = document.querySelectorAll('.question-item');
  if (items.length <= 1) return;
  items[idx]?.remove();
  document.querySelectorAll('.question-item').forEach((item, i) => {
    item.dataset.idx = i;
    item.querySelector('span').textContent = `Câu hỏi ${i + 1}`;
    item.querySelectorAll('[data-idx]').forEach(el => el.dataset.idx = i);
  });
}

function getQuestionsData() {
  const questions = [];
  document.querySelectorAll('.question-item').forEach(item => {
    questions.push({
      message: item.querySelector('.q-msg')?.value || '',
      expectedType: item.querySelector('.q-type')?.value || 'text',
      maxRetries: parseInt(item.querySelector('.q-retry')?.value) || 2,
      variableName: item.querySelector('.q-var')?.value || '',
      retryMessage: item.querySelector('.q-retry-msg')?.value || ''
    });
  });
  return questions;
}

function saveBlockProperties(id) {
  const block = flowBlocks.find(b => b.blockID === id);
  if (!block) return;
  let data = {};
  let updates = { blockData: {} };
  
  switch (block.blockType) {
    case 'send-message': data = { message: document.getElementById('prop_message').value }; break;
    case 'send-image': data = { imageUrl: document.getElementById('prop_imageUrl').value, caption: document.getElementById('prop_caption').value }; break;
    case 'send-file': data = { fileUrl: document.getElementById('prop_fileUrl').value, fileName: document.getElementById('prop_fileName').value }; break;
    case 'delay': data = { duration: parseFloat(document.getElementById('prop_duration').value) * 1000 }; break;
    case 'run-block': const tid = document.getElementById('prop_targetTriggerId').value; data = { targetTriggerId: tid ? parseInt(tid) : null }; break;
    case 'condition': 
      data = { 
        variableName: document.getElementById('prop_variableName').value,
        operator: document.getElementById('prop_operator').value,
        compareValue: document.getElementById('prop_compareValue').value,
        trueFlowId: document.getElementById('prop_condition1').value ? parseInt(document.getElementById('prop_condition1').value) : null,
        falseFlowId: document.getElementById('prop_condition2').value ? parseInt(document.getElementById('prop_condition2').value) : null
      };
      
      // Also update condition1 and condition2 fields in the block
      updates.condition1 = document.getElementById('prop_condition1').value ? parseInt(document.getElementById('prop_condition1').value) : null;
      updates.condition2 = document.getElementById('prop_condition2').value ? parseInt(document.getElementById('prop_condition2').value) : null;
      break;
    case 'user-input': 
      data = { 
        questions: getQuestionsData(),
        timeoutValue: parseInt(document.getElementById('prop_timeoutValue').value) || 1,
        timeoutUnit: document.getElementById('prop_timeoutUnit').value || 'hour'
      }; 
      break;
    case 'bot-active': data = { action: document.getElementById('prop_action').value, duration: parseInt(document.getElementById('prop_duration').value)||0, scope: document.getElementById('prop_scope').value }; break;
    case 'set-variable': data = { variableName: document.getElementById('prop_variableName').value, variableValue: document.getElementById('prop_variableValue').value, variableType: document.getElementById('prop_variableType').value }; break;
    case 'clear-variable': data = { clearAll: document.getElementById('prop_clearAll').checked, variableName: document.getElementById('prop_variableName')?.value || '' }; break;
    case 'webhook': data = { url: document.getElementById('prop_url').value, method: document.getElementById('prop_method').value, headers: document.getElementById('prop_headers').value, body: document.getElementById('prop_body').value }; break;
    case 'ai-gemini': data = { prompt: document.getElementById('prop_prompt').value, apiKey: document.getElementById('prop_apiKey').value, saveResponseTo: document.getElementById('prop_saveResponseTo').value }; break;
    
    // Send Friend Request - api.sendFriendRequest(msg, userId)
    case 'send-friend-request':
      data = {
        targetType: document.getElementById('prop_targetType').value,
        targetUserId: document.getElementById('prop_targetUserId')?.value || '',
        targetVariable: document.getElementById('prop_targetVariable')?.value || '',
        message: document.getElementById('prop_message').value
      };
      break;
      
    // Accept Friend Request - api.acceptFriendRequest(userId)
    case 'accept-friend-request':
      data = {
        autoAccept: document.getElementById('prop_autoAccept').checked,
        sendWelcome: document.getElementById('prop_sendWelcome').checked,
        welcomeMessage: document.getElementById('prop_welcomeMessage').value,
        runFlowAfter: document.getElementById('prop_runFlowAfter').value ? parseInt(document.getElementById('prop_runFlowAfter').value) : null
      };
      break;
      
    case 'delay':
      data = { 
        duration: parseFloat(document.getElementById('prop_duration').value) || 2000,
        unit: document.getElementById('prop_unit').value || 'ms'
      };
      break;
      
    case 'payment-hub':
      data = {
        gateId: document.getElementById('prop_gateId').value ? parseInt(document.getElementById('prop_gateId').value) : null,
        amount: document.getElementById('prop_amount')?.value || '',
        amountType: document.getElementById('prop_amountType').value,
        amountVariable: document.getElementById('prop_amountVariable')?.value || '',
        note: document.getElementById('prop_note')?.value || '',
        saveTransactionTo: document.getElementById('prop_saveTransactionTo')?.value || ''
      };
      break;
  }
  
  updates.blockData = data;
  ws.send(JSON.stringify({ type: 'update_flow_block', blockID: id, updates: updates }));
}

// Helper functions for property toggles
function toggleFriendRequestTarget() {
  const type = document.getElementById('prop_targetType').value;
  const varGroup = document.getElementById('friendTargetVariable');
  const manualGroup = document.getElementById('friendTargetManual');
  if (varGroup) varGroup.style.display = type === 'variable' ? 'block' : 'none';
  if (manualGroup) manualGroup.style.display = type === 'manual' ? 'block' : 'none';
}

function togglePaymentAmountType() {
  const type = document.getElementById('prop_amountType').value;
  const manualGroup = document.getElementById('paymentAmountManual');
  const varGroup = document.getElementById('paymentAmountVariable');
  if (manualGroup) manualGroup.style.display = type === 'manual' ? 'block' : 'none';
  if (varGroup) varGroup.style.display = type === 'variable' ? 'block' : 'none';
}

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t||''; return d.innerHTML; }
function showToast(msg, type='info') { document.querySelectorAll('.toast').forEach(t => t.remove()); const toast = document.createElement('div'); toast.className = 'toast '+type; toast.textContent = msg; document.body.appendChild(toast); setTimeout(() => toast.remove(), 3000); }
function goBack() { window.close(); setTimeout(() => location.href = '/trigger-manager.html', 100); }

function initFlowBuilder() {
  const params = new URLSearchParams(window.location.search);
  currentTriggerId = parseInt(params.get('trigger'));
  if (!currentTriggerId) { showToast('❌ Không tìm thấy trigger!', 'error'); return; }
  renderBlocksList();
  connectWebSocket();
}

// Export to window
window.initFlowBuilder = initFlowBuilder;
window.filterBlocks = filterBlocks;
window.goBack = goBack;
window.closePropertiesPanel = closePropertiesPanel;
window.addQuestion = addQuestion;
window.removeQuestion = removeQuestion;
window.toggleFriendRequestTarget = toggleFriendRequestTarget;
window.togglePaymentAmountType = togglePaymentAmountType;
window.paymentGates = [];  // Will be populated from websocket

document.addEventListener('DOMContentLoaded', initFlowBuilder);