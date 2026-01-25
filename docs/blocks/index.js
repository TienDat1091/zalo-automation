// public/blocks/index.js
// Block Registry for BROWSER - Load đầu tiên!

(function (global) {
  'use strict';

  // ========================================
  // FLOW BUILDER NAMESPACE
  // ========================================
  const FlowBuilder = {
    version: '5.0',
    blocks: {},      // Block registry
    initialized: false
  };

  // ========================================
  // CONSTANTS
  // ========================================
  FlowBuilder.BLOCK_CATEGORIES = {
    message: { name: 'Tin nhắn', icon: '💬', color: '#e3f2fd' },
    logic: { name: 'Logic', icon: '⚙️', color: '#fff3e0' },
    action: { name: 'Hành động', icon: '⚡', color: '#f3e5f5' },
    data: { name: 'Dữ liệu', icon: '📊', color: '#e8eaf6' },
    integration: { name: 'Tích hợp', icon: '🔌', color: '#e8f5e9' }
  };

  FlowBuilder.INPUT_TYPES = [
    { value: 'none', label: 'Bất kỳ' },
    { value: 'text', label: 'Văn bản' },
    { value: 'number', label: 'Số' },
    { value: 'phone', label: 'SĐT' },
    { value: 'email', label: 'Email' },
    { value: 'picture', label: 'Hình ảnh' },
    { value: 'file', label: 'File' },
    { value: 'yesno', label: 'Có/Không' }
  ];

  FlowBuilder.OPERATORS = [
    { value: 'equals', label: 'Bằng (=)' },
    { value: 'not_equals', label: 'Khác (≠)' },
    { value: 'contains', label: 'Chứa' },
    { value: 'not_contains', label: 'Không chứa' },
    { value: 'starts_with', label: 'Bắt đầu bằng' },
    { value: 'ends_with', label: 'Kết thúc bằng' },
    { value: 'greater_than', label: 'Lớn hơn (>)' },
    { value: 'less_than', label: 'Nhỏ hơn (<)' },
    { value: 'greater_equal', label: '≥' },
    { value: 'less_equal', label: '≤' },
    { value: 'is_empty', label: 'Rỗng' },
    { value: 'is_not_empty', label: 'Không rỗng' }
  ];

  FlowBuilder.TIME_UNITS = [
    { value: 'ms', label: 'Mili-giây' },
    { value: 's', label: 'Giây' },
    { value: 'm', label: 'Phút' },
    { value: 'h', label: 'Giờ' }
  ];

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================
  FlowBuilder.escapeHtml = function (text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  };

  // ========================================
  // BLOCK REGISTRATION
  // ========================================
  FlowBuilder.registerBlock = function (type, config) {
    if (!type || !config) {
      console.error('❌ registerBlock: type and config required');
      return;
    }

    FlowBuilder.blocks[type] = config;
    console.log('  ✓ Block registered:', type);
  };

  // ========================================
  // BLOCK METHODS
  // ========================================
  FlowBuilder.getBlockTypes = function () {
    return FlowBuilder.blocks;
  };

  FlowBuilder.getBlock = function (type) {
    return FlowBuilder.blocks[type] || null;
  };

  FlowBuilder.getBlockList = function () {
    return Object.values(FlowBuilder.blocks);
  };

  // Render properties form for a block
  FlowBuilder.renderPropertiesForm = function (block, context) {
    const config = FlowBuilder.blocks[block.blockType];
    if (!config || !config.renderForm) {
      return '<div class="property-info">⚠️ Block này chưa có form cấu hình</div>';
    }

    const data = block.blockData || {};
    let html = config.renderForm(block, data, context || {});

    // Common Note Field for ALL blocks
    html += `
      <div class="property-group" style="margin-top:20px; border-top: 1px dashed #ddd; padding-top:16px;">
        <label class="property-label">📝 Ghi chú Block</label>
        <textarea class="property-input property-textarea" id="prop_common_note" rows="3" 
          placeholder="Ghi chú chức năng của block này...">${FlowBuilder.escapeHtml(data.note || '')}</textarea>
        <div class="property-hint">Ghi chú hiển thị trên canvas giúp bạn dễ quản lý flow.</div>
      </div>
    `;

    return html;
  };

  // Save properties from form
  FlowBuilder.saveBlockProperties = function (blockType) {
    const config = FlowBuilder.blocks[blockType];
    const data = config && config.saveForm ? config.saveForm() : { blockData: {} };

    // Auto-wrap if simple object returned
    if (!data.blockData) {
      const wrapped = { blockData: data };
      data = wrapped; // This is a bit messy, but let's see how they handle it
    }

    // Capture common note
    const noteEl = document.getElementById('prop_common_note');
    if (noteEl) {
      data.blockData.note = noteEl.value;
    }

    return data;
  };

  // Get preview text for block
  FlowBuilder.getBlockPreview = function (blockType, data) {
    const config = FlowBuilder.blocks[blockType];
    if (!config || !config.preview) {
      return '';
    }
    return config.preview(data || {});
  };

  // Render block palette (danh sách blocks bên trái)
  FlowBuilder.renderBlockPalette = function (containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Group blocks by category
    const grouped = {};
    Object.values(FlowBuilder.blocks).forEach(block => {
      const cat = block.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(block);
    });

    let html = '';
    Object.entries(FlowBuilder.BLOCK_CATEGORIES).forEach(([catKey, catInfo]) => {
      const blocks = grouped[catKey];
      if (blocks && blocks.length > 0) {
        html += `
          <div class="block-category">
            <div class="category-title">${catInfo.icon} ${catInfo.name}</div>
            ${blocks.map(b => `
              <div class="block-item" draggable="true" data-type="${b.type}">
                <div class="block-icon ${b.category}" style="background:${b.color || catInfo.color}">${b.icon}</div>
                <div class="block-info">
                  <div class="block-name">${b.name}</div>
                  <div class="block-desc">${b.desc}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    });

    container.innerHTML = html;
  };

  // ========================================
  // INITIALIZATION
  // ========================================
  FlowBuilder.init = function () {
    if (FlowBuilder.initialized) return;
    FlowBuilder.initialized = true;
    console.log('✅ FlowBuilder v' + FlowBuilder.version + ' initialized');
    console.log('   Registered blocks:', Object.keys(FlowBuilder.blocks).length);
  };

  // Export to global
  global.FlowBuilder = FlowBuilder;

  console.log('📦 FlowBuilder Core loaded');

})(window);