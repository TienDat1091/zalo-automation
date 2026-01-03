// public/blocks/flow-builder-ui.js
// UI Controller cho Flow Builder - Load SAU tất cả block files

(function() {
  'use strict';

  // ========================================
  // API BASE URL - dùng port 3000 cho images
  // ========================================
  var API_BASE_URL = 'http://' + (location.hostname || 'localhost') + ':3000';

  // ========================================
  // STATE
  // ========================================
  var state = {
    triggerId: null,
    triggerData: null,
    flowData: null,
    blocks: [],
    selectedBlockId: null,
    draggedBlockType: null,
    draggedBlockId: null,
    nextBlockId: 1
  };

  // Expose to window
  window.flowBuilderState = state;
  window.allTriggers = [];
  window.currentTriggerId = null;
  window.paymentGates = [];
  window.googleSheetConfigs = []; // Google Sheet configs
  window.aiConfigs = []; // AI configs
  window.uploadedImages = []; // Uploaded images

  // ========================================
  // TOAST NOTIFICATION
  // ========================================
  window.showToast = function(message, type) {
    type = type || 'info';
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function() { toast.remove(); }, 3000);
  };

  // ========================================
  // INITIALIZATION
  // ========================================
  function init() {
    // Get trigger ID from URL
    var params = new URLSearchParams(window.location.search);
    state.triggerId = parseInt(params.get('trigger')) || null;
    window.currentTriggerId = state.triggerId;

    if (!state.triggerId) {
      showToast('❌ Không tìm thấy trigger ID', 'error');
      document.getElementById('triggerName').textContent = 'Lỗi: Không có trigger';
      return;
    }

    // Render block palette
    renderBlockPalette();

    // Setup drag & drop
    setupDragAndDrop();

    // Setup WebSocket
    setupWebSocket();

    console.log('🚀 Flow Builder UI initialized, trigger:', state.triggerId);
  }

  // ========================================
  // WEBSOCKET
  // ========================================
  
  // Cấu hình WebSocket URL
  var WS_CONFIG = {
    url: window.WS_URL || null,
    wsPort: window.WS_PORT || 8080
  };

  function getWebSocketUrl() {
    if (WS_CONFIG.url) {
      return WS_CONFIG.url;
    }
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var hostname = location.hostname || 'localhost';
    return protocol + '//' + hostname + ':' + WS_CONFIG.wsPort;
  }

  function setupWebSocket() {
    console.log('🔌 setupWebSocket called');

    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      console.log('✅ Reusing existing WebSocket');
      loadData();
      return;
    }

    var wsUrl = getWebSocketUrl();
    console.log('🔌 Connecting to:', wsUrl);

    try {
      var ws = new WebSocket(wsUrl);
      window.ws = ws;

      ws.onopen = function() {
        console.log('✅ WebSocket connected successfully!');
        loadData();
      };

      ws.onmessage = function(event) {
        try {
          var data = JSON.parse(event.data);
          console.log('📨 WS message:', data.type);
          handleWSMessage(data);
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      ws.onerror = function(err) {
        console.error('❌ WebSocket error:', err);
        showToast('❌ Không thể kết nối WebSocket (port ' + WS_CONFIG.wsPort + ')', 'error');
      };

      ws.onclose = function(event) {
        console.log('WebSocket closed, code:', event.code);
      };
    } catch (e) {
      console.error('WebSocket creation failed:', e);
      showToast('❌ Lỗi tạo WebSocket', 'error');
    }
  }

  function loadData() {
    var ws = window.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    console.log('📤 Sending requests...');
    ws.send(JSON.stringify({ type: 'get_trigger_detail', triggerId: state.triggerId }));
    ws.send(JSON.stringify({ type: 'get_triggers' }));
    ws.send(JSON.stringify({ type: 'get_payment_gates' }));
    ws.send(JSON.stringify({ type: 'get_tables' })); // Load custom tables
    ws.send(JSON.stringify({ type: 'get_google_sheet_configs' })); // Load Google Sheet configs
    ws.send(JSON.stringify({ type: 'get_ai_configs' })); // Load AI configs
    ws.send(JSON.stringify({ type: 'get_images' })); // Load uploaded images
  }

  function handleWSMessage(data) {
    switch (data.type) {
      case 'trigger_detail':
        if (data.error) {
          showToast('❌ ' + data.error, 'error');
          return;
        }
        state.triggerData = data.trigger;
        state.flowData = data.flow;
        state.blocks = data.blocks || (data.flow && data.flow.blocks) || [];
        
        // Set next block ID
        state.blocks.forEach(function(b) {
          if (b.blockID >= state.nextBlockId) state.nextBlockId = b.blockID + 1;
        });
        
        renderTriggerHeader();
        renderFlowCanvas();
        console.log('✅ Loaded trigger:', state.triggerData?.triggerName, '- Blocks:', state.blocks.length);
        break;

      case 'triggers_list':
        window.allTriggers = data.triggers || [];
        console.log('📋 Loaded', window.allTriggers.length, 'triggers');
        break;

      case 'payment_gates_list':
        window.paymentGates = data.gates || [];
        console.log('💳 Loaded', window.paymentGates.length, 'payment gates');
        break;

      case 'tables_list':
        window.customTables = data.tables || [];
        console.log('📊 Loaded', window.customTables.length, 'custom tables');
        break;

      case 'google_sheet_configs':
        // Normalize: convert configID to id for consistency
        window.googleSheetConfigs = (data.configs || []).map(function(cfg) {
          return Object.assign({}, cfg, { id: cfg.configID || cfg.id });
        });
        console.log('📗 Loaded', window.googleSheetConfigs.length, 'Google Sheet configs');
        break;

      case 'ai_configs':
        // Normalize: convert configID to id for consistency
        window.aiConfigs = (data.configs || []).map(function(cfg) {
          return Object.assign({}, cfg, { id: cfg.configID || cfg.id });
        });
        console.log('🧠 Loaded', window.aiConfigs.length, 'AI configs');
        break;

      case 'images_list':
        // Normalize: convert imageID to id và thêm URL đầy đủ
        window.uploadedImages = (data.images || []).map(function(img) {
          var id = img.imageID || img.id;
          return Object.assign({}, img, { 
            id: id,
            url: API_BASE_URL + '/api/images/' + id
          });
        });
        console.log('🖼️ Loaded', window.uploadedImages.length, 'uploaded images (API_BASE_URL:', API_BASE_URL, ')');
        break;

      case 'variables_list':
        console.log('📊 Loaded', (data.variables || []).length, 'variables');
        renderVariablesTable(data.variables || []);
        break;

      case 'variable_deleted':
        showToast('🗑️ Đã xóa biến', 'success');
        break;

      case 'variables_cleared':
        showToast('🗑️ Đã xóa tất cả biến', 'success');
        refreshVariables();
        break;

      case 'block_saved':
        showToast('✅ Đã lưu block', 'success');
        // Reload data
        loadData();
        break;

      case 'block_deleted':
        showToast('🗑️ Đã xóa block', 'success');
        break;

      case 'flow_updated':
        // Update local state
        if (data.flow) {
          state.flowData = data.flow;
          state.blocks = data.flow.blocks || [];
          renderFlowCanvas();
        }
        break;

      case 'error':
        showToast('❌ ' + (data.message || 'Lỗi'), 'error');
        break;
    }
  }

  // ========================================
  // RENDER BLOCK PALETTE
  // ========================================
  function renderBlockPalette() {
    var container = document.getElementById('blocksList');
    if (!container) return;

    var blocks = FlowBuilder.blocks;
    var categories = FlowBuilder.BLOCK_CATEGORIES;

    // Group by category
    var grouped = {};
    Object.values(blocks).forEach(function(block) {
      var cat = block.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(block);
    });

    var html = '';
    Object.keys(categories).forEach(function(catKey) {
      var catInfo = categories[catKey];
      var catBlocks = grouped[catKey];

      if (catBlocks && catBlocks.length > 0) {
        html += '<div class="block-category" data-category="' + catKey + '">';
        html += '<div class="category-title">' + catInfo.icon + ' ' + catInfo.name + '</div>';

        catBlocks.forEach(function(b) {
          html += '<div class="block-item" draggable="true" data-type="' + b.type + '">';
          html += '<div class="block-icon ' + b.category + '" style="background:' + (b.color || catInfo.color) + '">' + b.icon + '</div>';
          html += '<div class="block-info">';
          html += '<div class="block-name">' + b.name + '</div>';
          html += '<div class="block-desc">' + b.desc + '</div>';
          html += '</div></div>';
        });

        html += '</div>';
      }
    });

    container.innerHTML = html;
  }

  // Filter blocks
  window.filterBlocks = function() {
    var search = document.getElementById('blockSearch').value.toLowerCase();
    var items = document.querySelectorAll('.block-item');

    items.forEach(function(item) {
      var name = item.querySelector('.block-name').textContent.toLowerCase();
      var desc = item.querySelector('.block-desc').textContent.toLowerCase();
      var match = name.includes(search) || desc.includes(search);
      item.style.display = match ? 'flex' : 'none';
    });
  };

  // ========================================
  // RENDER TRIGGER HEADER
  // ========================================
  function renderTriggerHeader() {
    var trigger = state.triggerData;
    if (!trigger) return;

    var nameEl = document.getElementById('triggerName');
    var badgeEl = document.getElementById('triggerBadge');

    if (nameEl) nameEl.textContent = trigger.triggerName || 'Trigger';
    
    if (badgeEl) {
      // Kiểm tra isActive - có thể là 1, true, "1", "true"
      var isActive = trigger.isActive === 1 || trigger.isActive === true || 
                     trigger.isActive === '1' || trigger.isActive === 'true' ||
                     trigger.enabled === 1 || trigger.enabled === true;
      
      badgeEl.textContent = isActive ? 'Active' : 'Inactive';
      badgeEl.className = 'badge ' + (isActive ? 'active' : 'inactive');
    }
  }

  // ========================================
  // RENDER FLOW CANVAS
  // ========================================
  function renderFlowCanvas() {
    var container = document.getElementById('flowContainer');
    if (!container) return;

    var trigger = state.triggerData;
    var blocks = state.blocks.filter(function(b) { return !b.parentBlockID; })
                              .sort(function(a, b) { return a.blockOrder - b.blockOrder; });

    var html = '';

    // Trigger Start Block
    html += '<div class="flow-trigger-start">';
    html += '<div class="trigger-start-header">';
    html += '<span class="trigger-start-icon">⚡</span>';
    html += '<span class="trigger-start-title">Khi nhận tin nhắn</span>';
    html += '</div>';
    html += '<div class="trigger-start-keywords">';
    
    // Hiển thị keywords - kiểm tra nhiều field có thể chứa keywords
    var keywordsStr = '';
    if (trigger) {
      keywordsStr = trigger.triggerKeywords || trigger.triggerKey || trigger.keywords || '';
    }
    
    if (keywordsStr) {
      var keywords = keywordsStr.split(',');
      keywords.forEach(function(kw) {
        var trimmed = kw.trim();
        if (trimmed) {
          html += '<span class="trigger-keyword">' + FlowBuilder.escapeHtml(trimmed) + '</span>';
        }
      });
    } else {
      html += '<span class="trigger-keyword" style="opacity:0.6">Chưa có từ khóa</span>';
    }
    
    html += '</div></div>';

    // Connector
    html += '<div class="flow-connector"></div>';

    // Blocks
    if (blocks.length === 0) {
      html += renderDropZone(0);
    } else {
      blocks.forEach(function(block, index) {
        html += renderFlowBlock(block);
        html += '<div class="flow-connector small"></div>';
        html += renderDropZone(index + 1);
        if (index < blocks.length - 1) {
          html += '<div class="flow-connector small"></div>';
        }
      });
    }

    // Flow End
    html += '<div class="flow-connector"></div>';
    html += '<div class="flow-end">✅ Kết thúc Flow</div>';

    container.innerHTML = html;

    // Re-setup drag events for canvas
    setupCanvasDragEvents();
  }

  function renderDropZone(position) {
    return '<div class="drop-zone" data-position="' + position + '">' +
           '<div class="drop-zone-text">' +
           '<div class="drop-zone-icon">➕</div>' +
           '<div>Kéo block vào đây</div>' +
           '</div></div>';
  }

  function renderFlowBlock(block) {
    var blockConfig = FlowBuilder.blocks[block.blockType] || {};
    var icon = blockConfig.icon || '📦';
    var name = blockConfig.name || block.blockType;
    var color = blockConfig.color || '#e0e0e0';
    var data = block.blockData || {};

    // Parse blockData if string
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch(e) { data = {}; }
    }

    // Get preview
    var preview = FlowBuilder.getBlockPreview(block.blockType, data);

    // Special class for block type
    var specialClass = '';
    if (block.blockType === 'condition') specialClass = 'condition-block';
    else if (block.blockType === 'run-block') specialClass = 'run-block';
    else if (block.blockType === 'user-input') specialClass = 'input-block';
    else if (block.blockType === 'bot-active') specialClass = 'bot-block';

    var selected = state.selectedBlockId === block.blockID ? 'selected' : '';

    var html = '<div class="flow-block ' + specialClass + ' ' + selected + '" data-block-id="' + block.blockID + '" draggable="true">';
    html += '<div class="block-drag-handle">⋮⋮</div>';
    html += '<div class="block-header">';
    html += '<div class="block-header-icon" style="background:' + color + '">' + icon + '</div>';
    html += '<div class="block-header-info">';
    html += '<div class="block-title">' + name + '</div>';
    html += '<div class="block-subtitle">#' + block.blockID + '</div>';
    html += '</div>';
    html += '<div class="block-actions">';
    html += '<button class="block-action-btn" onclick="editBlock(' + block.blockID + ')" title="Chỉnh sửa">✏️</button>';
    html += '<button class="block-action-btn delete" onclick="deleteBlock(' + block.blockID + ')" title="Xóa">🗑️</button>';
    html += '</div></div>';

    // Content / Preview
    html += '<div class="block-content">';
    if (preview) {
      html += '<div class="block-preview">' + FlowBuilder.escapeHtml(preview) + '</div>';
    } else {
      html += '<div class="warning">⚠️ Chưa cấu hình</div>';
    }
    html += '</div>';

    // Condition branches
    if (block.blockType === 'condition') {
      html += renderConditionBranches(block);
    }

    html += '</div>';
    return html;
  }

  function renderConditionBranches(block) {
    var data = block.blockData || {};
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch(e) { data = {}; }
    }
    
    var html = '<div class="condition-branches">';

    // TRUE branch
    html += '<div class="branch branch-true">';
    html += '<div class="branch-header"><span class="branch-icon">✅</span> Nếu ĐÚNG</div>';
    html += '<div class="branch-content" data-branch="true" data-parent="' + block.blockID + '">';
    if (data.trueFlowId || block.condition1) {
      var flowId = data.trueFlowId || block.condition1;
      var targetTrigger = window.allTriggers.find(function(t) { return t.triggerID === flowId; });
      html += '<div style="font-size:11px;color:#666;">→ ' + (targetTrigger ? targetTrigger.triggerName : 'Flow #' + flowId) + '</div>';
    } else {
      html += '<div class="branch-placeholder">Chọn flow trong cài đặt</div>';
    }
    html += '</div></div>';

    // FALSE branch
    html += '<div class="branch branch-false">';
    html += '<div class="branch-header"><span class="branch-icon">❌</span> Nếu SAI</div>';
    html += '<div class="branch-content" data-branch="false" data-parent="' + block.blockID + '">';
    if (data.falseFlowId || block.condition2) {
      var flowId2 = data.falseFlowId || block.condition2;
      var targetTrigger2 = window.allTriggers.find(function(t) { return t.triggerID === flowId2; });
      html += '<div style="font-size:11px;color:#666;">→ ' + (targetTrigger2 ? targetTrigger2.triggerName : 'Flow #' + flowId2) + '</div>';
    } else {
      html += '<div class="branch-placeholder">Chọn flow trong cài đặt</div>';
    }
    html += '</div></div>';

    html += '</div>';
    return html;
  }

  // ========================================
  // DRAG & DROP + CLICK TO ADD
  // ========================================
  function setupDragAndDrop() {
    var blocksList = document.getElementById('blocksList');

    // Palette drag start
    blocksList.addEventListener('dragstart', function(e) {
      var item = e.target.closest('.block-item');
      if (item) {
        state.draggedBlockType = item.dataset.type;
        state.draggedBlockId = null;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'copy';
      }
    });

    blocksList.addEventListener('dragend', function(e) {
      var item = e.target.closest('.block-item');
      if (item) {
        item.classList.remove('dragging');
        state.draggedBlockType = null;
      }
    });

    // CLICK TO ADD BLOCK
    blocksList.addEventListener('click', function(e) {
      var item = e.target.closest('.block-item');
      if (item) {
        var blockType = item.dataset.type;
        // Add to end of flow
        var position = state.blocks.filter(function(b) { return !b.parentBlockID; }).length;
        addBlock(blockType, position);
      }
    });
  }

  function setupCanvasDragEvents() {
    var canvas = document.getElementById('flowContainer');

    // Flow block drag
    canvas.querySelectorAll('.flow-block').forEach(function(block) {
      block.addEventListener('dragstart', function(e) {
        state.draggedBlockId = parseInt(block.dataset.blockId);
        state.draggedBlockType = null;
        block.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      block.addEventListener('dragend', function(e) {
        block.classList.remove('dragging');
        state.draggedBlockId = null;
      });

      // Click to select
      block.addEventListener('click', function(e) {
        if (!e.target.closest('.block-action-btn')) {
          selectBlock(parseInt(block.dataset.blockId));
        }
      });
    });

    // Drop zones
    canvas.querySelectorAll('.drop-zone').forEach(function(zone) {
      zone.addEventListener('dragover', function(e) {
        e.preventDefault();
        zone.classList.add('drag-over');
      });

      zone.addEventListener('dragleave', function(e) {
        zone.classList.remove('drag-over');
      });

      zone.addEventListener('drop', function(e) {
        e.preventDefault();
        zone.classList.remove('drag-over');
        var position = parseInt(zone.dataset.position);

        if (state.draggedBlockType) {
          // New block from palette
          addBlock(state.draggedBlockType, position);
        } else if (state.draggedBlockId) {
          // Move existing block
          moveBlock(state.draggedBlockId, position);
        }
      });
    });
  }

  // ========================================
  // BLOCK OPERATIONS
  // ========================================
  function addBlock(blockType, position) {
    var blockConfig = FlowBuilder.blocks[blockType];
    if (!blockConfig) {
      showToast('❌ Block type không tồn tại', 'error');
      return;
    }

    var newBlock = {
      blockID: state.nextBlockId++,
      blockType: blockType,
      blockOrder: position,
      blockData: blockConfig.defaultData ? JSON.parse(JSON.stringify(blockConfig.defaultData)) : {},
      condition1: null,
      condition2: null
    };

    // Adjust orders
    state.blocks.forEach(function(b) {
      if (b.blockOrder >= position) {
        b.blockOrder++;
      }
    });

    state.blocks.push(newBlock);

    // Save to server
    saveBlock(newBlock);

    // Re-render
    renderFlowCanvas();

    // Select new block
    selectBlock(newBlock.blockID);

    showToast('✅ Đã thêm ' + blockConfig.name, 'success');
  }

  function moveBlock(blockId, newPosition) {
    var block = state.blocks.find(function(b) { return b.blockID === blockId; });
    if (!block) return;

    var oldPosition = block.blockOrder;
    if (oldPosition === newPosition) return;

    // Adjust orders
    state.blocks.forEach(function(b) {
      if (oldPosition < newPosition) {
        if (b.blockOrder > oldPosition && b.blockOrder <= newPosition) {
          b.blockOrder--;
        }
      } else {
        if (b.blockOrder >= newPosition && b.blockOrder < oldPosition) {
          b.blockOrder++;
        }
      }
    });

    block.blockOrder = newPosition;

    // Save orders
    saveBlockOrders();

    // Re-render
    renderFlowCanvas();
  }

  window.deleteBlock = function(blockId) {
    if (!confirm('Xóa block này?')) return;

    var index = state.blocks.findIndex(function(b) { return b.blockID === blockId; });
    if (index === -1) return;

    var block = state.blocks[index];
    var position = block.blockOrder;

    state.blocks.splice(index, 1);

    // Adjust orders
    state.blocks.forEach(function(b) {
      if (b.blockOrder > position) {
        b.blockOrder--;
      }
    });

    // Close properties if this block was selected
    if (state.selectedBlockId === blockId) {
      closePropertiesPanel();
    }

    // Delete from server
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'delete_block',
        blockId: blockId,
        flowId: state.flowData ? state.flowData.flowID : null
      }));
    }

    // Re-render
    renderFlowCanvas();
  };

  // ========================================
  // BLOCK SELECTION & PROPERTIES
  // ========================================
  function selectBlock(blockId) {
    state.selectedBlockId = blockId;

    // Update UI
    document.querySelectorAll('.flow-block').forEach(function(el) {
      el.classList.remove('selected');
    });
    var selected = document.querySelector('.flow-block[data-block-id="' + blockId + '"]');
    if (selected) selected.classList.add('selected');

    // Open properties panel
    openPropertiesPanel(blockId);
  }

  window.editBlock = function(blockId) {
    selectBlock(blockId);
  };

  function openPropertiesPanel(blockId) {
    var block = state.blocks.find(function(b) { return b.blockID === blockId; });
    if (!block) return;

    var panel = document.getElementById('propertiesPanel');
    var title = document.getElementById('propertiesTitle');
    var content = document.getElementById('propertiesContent');

    var blockConfig = FlowBuilder.blocks[block.blockType] || {};
    title.textContent = blockConfig.name || block.blockType;

    // Parse blockData if string
    var blockData = block.blockData;
    if (typeof blockData === 'string') {
      try { blockData = JSON.parse(blockData); } catch(e) { blockData = {}; }
    }
    block.blockData = blockData;

    // Render form
    var formHtml = FlowBuilder.renderPropertiesForm(block, {
      allTriggers: window.allTriggers,
      currentTriggerId: state.triggerId
    });

    // Add save button
    formHtml += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e0e0e0;">';
    formHtml += '<button class="btn btn-primary" onclick="saveCurrentBlock()" style="width:100%">💾 Lưu thay đổi</button>';
    formHtml += '</div>';

    content.innerHTML = formHtml;
    panel.classList.remove('hidden');
  }

  window.closePropertiesPanel = function() {
    var panel = document.getElementById('propertiesPanel');
    panel.classList.add('hidden');
    state.selectedBlockId = null;

    document.querySelectorAll('.flow-block').forEach(function(el) {
      el.classList.remove('selected');
    });
  };

  window.saveCurrentBlock = function() {
    if (!state.selectedBlockId) return;

    var block = state.blocks.find(function(b) { return b.blockID === state.selectedBlockId; });
    if (!block) return;

    // Get data from form
    var result = FlowBuilder.saveBlockProperties(block.blockType);

    // Update block
    block.blockData = result.blockData || {};
    if (result.condition1 !== undefined) block.condition1 = result.condition1;
    if (result.condition2 !== undefined) block.condition2 = result.condition2;

    // Save to server
    saveBlock(block);

    // Re-render
    renderFlowCanvas();

    // Re-select to refresh form
    selectBlock(block.blockID);

    showToast('✅ Đã lưu block', 'success');
  };

  // ========================================
  // SAVE TO SERVER
  // ========================================
  function saveBlock(block) {
    if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
      showToast('⚠️ Chưa kết nối server', 'error');
      return;
    }

    window.ws.send(JSON.stringify({
      type: 'save_block',
      triggerId: state.triggerId,
      flowId: state.flowData ? state.flowData.flowID : null,
      block: block
    }));
  }

  function saveBlockOrders() {
    if (!window.ws || window.ws.readyState !== WebSocket.OPEN) return;

    var orders = state.blocks.map(function(b) {
      return { blockID: b.blockID, blockOrder: b.blockOrder };
    });

    window.ws.send(JSON.stringify({
      type: 'update_block_orders',
      flowId: state.flowData ? state.flowData.flowID : null,
      orders: orders
    }));
  }

  // ========================================
  // NAVIGATION
  // ========================================
  window.goBack = function() {
    window.location.href = '/trigger-manager.html';
  };

  // ========================================
  // VARIABLES MODAL
  // ========================================
  
  window.showVariablesModal = function() {
    var modal = document.getElementById('variablesModal');
    if (modal) {
      modal.style.display = 'flex';
      refreshVariables();
    }
  };

  window.closeVariablesModal = function() {
    var modal = document.getElementById('variablesModal');
    if (modal) {
      modal.style.display = 'none';
    }
  };

  window.refreshVariables = function() {
    var content = document.getElementById('variablesContent');
    if (content) {
      content.innerHTML = '<div class="loading-spinner">Đang tải...</div>';
    }
    
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'get_all_variables' }));
    } else {
      if (content) {
        content.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>Chưa kết nối server</p></div>';
      }
    }
  };

  window.renderVariablesTable = function(variables) {
    var content = document.getElementById('variablesContent');
    if (!content) return;
    
    if (!variables || variables.length === 0) {
      content.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Chưa có biến nào được lưu</p><small>Biến sẽ được tạo khi flow chạy và thu thập dữ liệu từ người dùng</small></div>';
      return;
    }
    
    var html = '<table class="variables-table">';
    html += '<thead><tr>';
    html += '<th>Tên biến</th>';
    html += '<th>Giá trị</th>';
    html += '<th>Loại</th>';
    html += '<th>Conversation ID</th>';
    html += '<th>Cập nhật</th>';
    html += '<th>Thao tác</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    
    variables.forEach(function(v) {
      var updatedAt = v.updatedAt ? new Date(v.updatedAt).toLocaleString('vi-VN') : '-';
      var displayValue = v.variableValue || '';
      if (displayValue.length > 50) {
        displayValue = displayValue.substring(0, 50) + '...';
      }
      
      html += '<tr>';
      html += '<td><span class="var-name">{' + escapeHtml(v.variableName) + '}</span></td>';
      html += '<td class="var-value" title="' + escapeHtml(v.variableValue || '') + '">' + escapeHtml(displayValue) + '</td>';
      html += '<td><span class="var-type">' + escapeHtml(v.variableType || 'text') + '</span></td>';
      html += '<td class="var-conversation" title="' + escapeHtml(v.conversationID || '') + '">' + escapeHtml(v.conversationID || '-').substring(0, 20) + '</td>';
      html += '<td class="var-time">' + updatedAt + '</td>';
      html += '<td class="var-actions">';
      html += '<button onclick="copyVariable(\'' + escapeHtml(v.variableName) + '\')" title="Copy tên biến">📋</button>';
      html += '<button onclick="deleteVariable(\'' + escapeHtml(v.variableName) + '\', \'' + escapeHtml(v.conversationID || '') + '\')" title="Xóa">🗑️</button>';
      html += '</td>';
      html += '</tr>';
    });
    
    html += '</tbody></table>';
    html += '<div style="margin-top:12px;font-size:12px;color:#888;">Tổng: ' + variables.length + ' biến</div>';
    
    content.innerHTML = html;
  };

  window.copyVariable = function(varName) {
    var textToCopy = '{' + varName + '}';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy).then(function() {
        showToast('✅ Đã copy: ' + textToCopy, 'success');
      });
    } else {
      // Fallback
      var textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('✅ Đã copy: ' + textToCopy, 'success');
    }
  };

  window.deleteVariable = function(varName, conversationID) {
    if (!confirm('Xóa biến "' + varName + '"?')) return;
    
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ 
        type: 'delete_variable', 
        variableName: varName,
        conversationID: conversationID
      }));
      // Refresh sau 500ms
      setTimeout(refreshVariables, 500);
    }
  };

  window.clearAllVariables = function() {
    if (!confirm('⚠️ Xóa TẤT CẢ biến đã lưu?\n\nHành động này không thể hoàn tác!')) return;
    
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'clear_all_variables' }));
      // Refresh sau 500ms
      setTimeout(refreshVariables, 500);
    }
  };

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // ========================================
  // INIT ON LOAD
  // ========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();