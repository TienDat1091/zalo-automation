// public/blocks/set-variable.js
// Block: Set Variable - Đặt biến

(function() {
  'use strict';

  FlowBuilder.registerBlock('set-variable', {
    type: 'set-variable',
    name: 'Đặt biến',
    desc: 'Lưu giá trị',
    icon: '📝',
    category: 'action',
    color: '#f3e5f5',
    
    defaultData: { 
      variableName: '', 
      variableValue: '', 
      variableType: 'text' 
    },

    renderForm: function(block, data, context) {
      return `
        <div class="property-group">
          <label class="property-label">Tên biến <span class="required">*</span></label>
          <input class="property-input" id="prop_variableName" value="${FlowBuilder.escapeHtml(data.variableName || '')}" 
            placeholder="my_variable">
        </div>
        <div class="property-group">
          <label class="property-label">Giá trị</label>
          <input class="property-input" id="prop_variableValue" value="${FlowBuilder.escapeHtml(data.variableValue || '')}" 
            placeholder="Giá trị hoặc {biến}">
          <div class="property-hint">Có thể dùng {biến} để tham chiếu biến khác</div>
        </div>
        <div class="property-group">
          <label class="property-label">Kiểu dữ liệu</label>
          <select class="property-select" id="prop_variableType">
            <option value="text" ${data.variableType === 'text' ? 'selected' : ''}>Văn bản</option>
            <option value="number" ${data.variableType === 'number' ? 'selected' : ''}>Số</option>
            <option value="boolean" ${data.variableType === 'boolean' ? 'selected' : ''}>Boolean</option>
          </select>
        </div>
      `;
    },

    saveForm: function() {
      return {
        blockData: {
          variableName: document.getElementById('prop_variableName').value,
          variableValue: document.getElementById('prop_variableValue').value,
          variableType: document.getElementById('prop_variableType').value
        }
      };
    },

    preview: function(data) {
      if (!data.variableName) return '⚠️ Chưa có tên biến';
      var val = (data.variableValue || '').substring(0, 20);
      return '📝 ' + data.variableName + ' = "' + val + '"';
    }
  });

})();
