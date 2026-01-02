// public/blocks/clear-variable.js
// Block: Clear Variable - Xóa biến

(function() {
  'use strict';

  FlowBuilder.registerBlock('clear-variable', {
    type: 'clear-variable',
    name: 'Xóa biến',
    desc: 'Xóa biến đã lưu',
    icon: '🗑️',
    category: 'action',
    color: '#f3e5f5',
    
    defaultData: { 
      variableName: '', 
      clearAll: false 
    },

    renderForm: function(block, data, context) {
      return `
        <div class="property-group">
          <label><input type="checkbox" id="prop_clearAll" ${data.clearAll ? 'checked' : ''}> 
            Xóa tất cả biến của user</label>
        </div>
        <div class="property-group">
          <label class="property-label">Hoặc xóa biến cụ thể</label>
          <input class="property-input" id="prop_variableName" value="${FlowBuilder.escapeHtml(data.variableName || '')}" 
            placeholder="variable_name">
        </div>
      `;
    },

    saveForm: function() {
      return {
        blockData: {
          clearAll: document.getElementById('prop_clearAll').checked,
          variableName: document.getElementById('prop_variableName').value
        }
      };
    },

    preview: function(data) {
      if (data.clearAll) return '🗑️ Xóa tất cả';
      return '🗑️ Xóa {' + (data.variableName || '?') + '}';
    }
  });

})();
