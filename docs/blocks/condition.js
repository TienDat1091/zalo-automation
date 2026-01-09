// public/blocks/condition.js
// Block: Condition - IF/ELSE

(function() {
  'use strict';

  FlowBuilder.registerBlock('condition', {
    type: 'condition',
    name: 'Điều kiện',
    desc: 'IF/ELSE',
    icon: '🔀',
    category: 'logic',
    color: '#ffe0b2',
    
    defaultData: {
      variableName: '',
      operator: 'equals',
      compareValue: '',
      trueFlowId: null,
      falseFlowId: null
    },

    renderForm: function(block, data, context) {
      var OPERATORS = FlowBuilder.OPERATORS;
      var triggers = (context && context.allTriggers) || window.allTriggers || [];
      var currentId = (context && context.currentTriggerId) || window.currentTriggerId;
      var others = triggers.filter(function(t) { return t.triggerID !== currentId && t.setMode === 1; });
      
      return `
        <div class="property-group">
          <label class="property-label">Tên biến <span class="required">*</span></label>
          <input class="property-input" id="prop_variableName" value="${FlowBuilder.escapeHtml(data.variableName || '')}" 
            placeholder="my_variable">
        </div>
        <div class="property-group">
          <label class="property-label">Toán tử</label>
          <select class="property-select" id="prop_operator">
            ${OPERATORS.map(function(op) { 
              return '<option value="' + op.value + '" ' + (data.operator === op.value ? 'selected' : '') + '>' + op.label + '</option>'; 
            }).join('')}
          </select>
        </div>
        <div class="property-group">
          <label class="property-label">Giá trị so sánh</label>
          <input class="property-input" id="prop_compareValue" value="${FlowBuilder.escapeHtml(data.compareValue || '')}" 
            placeholder="value">
        </div>
        <div class="property-group">
          <label class="property-label">✅ Nếu ĐÚNG → chạy Flow</label>
          <select class="property-select" id="prop_condition1">
            <option value="">-- Không chọn --</option>
            ${others.map(function(t) { 
              var selected = (data.trueFlowId || block.condition1) == t.triggerID ? 'selected' : '';
              return '<option value="' + t.triggerID + '" ' + selected + '>' + FlowBuilder.escapeHtml(t.triggerName) + '</option>'; 
            }).join('')}
          </select>
        </div>
        <div class="property-group">
          <label class="property-label">❌ Nếu SAI → chạy Flow</label>
          <select class="property-select" id="prop_condition2">
            <option value="">-- Không chọn --</option>
            ${others.map(function(t) { 
              var selected = (data.falseFlowId || block.condition2) == t.triggerID ? 'selected' : '';
              return '<option value="' + t.triggerID + '" ' + selected + '>' + FlowBuilder.escapeHtml(t.triggerName) + '</option>'; 
            }).join('')}
          </select>
        </div>
      `;
    },

    saveForm: function() {
      var c1 = document.getElementById('prop_condition1').value;
      var c2 = document.getElementById('prop_condition2').value;
      
      return {
        blockData: {
          variableName: document.getElementById('prop_variableName').value,
          operator: document.getElementById('prop_operator').value,
          compareValue: document.getElementById('prop_compareValue').value,
          trueFlowId: c1 ? parseInt(c1) : null,
          falseFlowId: c2 ? parseInt(c2) : null
        },
        condition1: c1 ? parseInt(c1) : null,
        condition2: c2 ? parseInt(c2) : null
      };
    },

    preview: function(data) {
      if (!data.variableName) return '⚠️ Chưa cấu hình';
      return '🔀 IF {' + data.variableName + '} ' + (data.operator || 'equals') + '...';
    }
  });

})();
