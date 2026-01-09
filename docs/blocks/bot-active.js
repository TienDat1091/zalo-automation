// public/blocks/bot-active.js
// Block: Bot Active - Bật/tắt bot

(function() {
  'use strict';

  FlowBuilder.registerBlock('bot-active', {
    type: 'bot-active',
    name: 'Điều khiển Bot',
    desc: 'Bật/tắt bot',
    icon: '🤖',
    category: 'logic',
    color: '#fff3e0',
    
    defaultData: { 
      action: 'toggle', 
      duration: 0, 
      scope: 'current' 
    },

    renderForm: function(block, data, context) {
      return `
        <div class="property-group">
          <label class="property-label">Hành động</label>
          <select class="property-select" id="prop_action">
            <option value="enable" ${data.action === 'enable' ? 'selected' : ''}>Bật bot</option>
            <option value="disable" ${data.action === 'disable' ? 'selected' : ''}>Tắt bot</option>
            <option value="toggle" ${data.action === 'toggle' ? 'selected' : ''}>Đảo trạng thái</option>
          </select>
        </div>
        <div class="property-group">
          <label class="property-label">Thời gian (phút, 0 = vĩnh viễn)</label>
          <input type="number" class="property-input" id="prop_duration" value="${data.duration || 0}" min="0">
        </div>
        <div class="property-group">
          <label class="property-label">Phạm vi</label>
          <select class="property-select" id="prop_scope">
            <option value="current" ${data.scope === 'current' ? 'selected' : ''}>User hiện tại</option>
            <option value="all" ${data.scope === 'all' ? 'selected' : ''}>Tất cả</option>
          </select>
        </div>
      `;
    },

    saveForm: function() {
      return {
        blockData: {
          action: document.getElementById('prop_action').value,
          duration: parseInt(document.getElementById('prop_duration').value) || 0,
          scope: document.getElementById('prop_scope').value
        }
      };
    },

    preview: function(data) {
      var actions = { enable: 'BẬT', disable: 'TẮT', toggle: 'ĐẢO' };
      return '🤖 ' + (actions[data.action] || 'Toggle');
    }
  });

})();
