// public/blocks/run-block.js
// Block: Run Block - Chạy flow khác

(function() {
  'use strict';

  FlowBuilder.registerBlock('run-block', {
    type: 'run-block',
    name: 'Run Block',
    desc: 'Chạy flow khác',
    icon: '🔗',
    category: 'logic',
    color: '#fff3e0',
    
    defaultData: { 
      targetTriggerId: null 
    },

    renderForm: function(block, data, context) {
      var triggers = (context && context.allTriggers) || window.allTriggers || [];
      var currentId = (context && context.currentTriggerId) || window.currentTriggerId;
      var others = triggers.filter(function(t) { return t.triggerID !== currentId; });
      
      return `
        <div class="property-group">
          <label class="property-label">Chọn Flow/Trigger cần chạy <span class="required">*</span></label>
          <select class="property-select" id="prop_targetTriggerId">
            <option value="">-- Chọn --</option>
            ${others.map(function(t) { 
              var label = FlowBuilder.escapeHtml(t.triggerName) + (t.setMode === 1 ? ' (Flow)' : '');
              return '<option value="' + t.triggerID + '" ' + (data.targetTriggerId == t.triggerID ? 'selected' : '') + '>' + label + '</option>'; 
            }).join('')}
          </select>
        </div>
        <div class="property-info">
          🔗 Thực thi flow/trigger khác và tiếp tục flow hiện tại
        </div>
      `;
    },

    saveForm: function() {
      var val = document.getElementById('prop_targetTriggerId').value;
      return {
        blockData: {
          targetTriggerId: val ? parseInt(val) : null
        }
      };
    },

    preview: function(data) {
      return data.targetTriggerId ? '🔗 Flow #' + data.targetTriggerId : '⚠️ Chưa chọn';
    }
  });

})();
