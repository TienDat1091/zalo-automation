// public/blocks/accept-friend-request.js
// Block: Chấp nhận kết bạn

(function() {
  'use strict';

  FlowBuilder.registerBlock('accept-friend-request', {
    type: 'accept-friend-request',
    name: 'Chấp nhận kết bạn',
    desc: 'Tự động chấp nhận',
    icon: '🤝',
    category: 'message',
    color: '#bbdefb',
    
    defaultData: {
      autoAccept: true,
      sendWelcome: true,
      welcomeMessage: 'Cảm ơn bạn đã kết bạn!',
      runFlowAfter: null
    },

    renderForm: function(block, data, context) {
      var triggers = (context && context.allTriggers) || window.allTriggers || [];
      var currentId = (context && context.currentTriggerId) || window.currentTriggerId;
      var others = triggers.filter(function(t) { 
        return t.triggerID !== currentId && t.setMode === 1; 
      });
      
      return `
        <div class="property-group">
          <label><input type="checkbox" id="prop_autoAccept" ${data.autoAccept !== false ? 'checked' : ''}> 
            Tự động chấp nhận lời mời kết bạn</label>
        </div>
        <div class="property-group">
          <label><input type="checkbox" id="prop_sendWelcome" ${data.sendWelcome !== false ? 'checked' : ''}> 
            Gửi tin nhắn chào mừng</label>
        </div>
        <div class="property-group">
          <label class="property-label">Tin nhắn chào mừng</label>
          <textarea class="property-input" id="prop_welcomeMessage" rows="3">${FlowBuilder.escapeHtml(data.welcomeMessage || 'Cảm ơn bạn đã kết bạn!')}</textarea>
        </div>
        <div class="property-group">
          <label class="property-label">Chạy Flow sau khi chấp nhận</label>
          <select class="property-select" id="prop_runFlowAfter">
            <option value="">-- Không chọn --</option>
            ${others.map(function(t) { 
              return '<option value="' + t.triggerID + '" ' + (data.runFlowAfter == t.triggerID ? 'selected' : '') + '>' + FlowBuilder.escapeHtml(t.triggerName) + '</option>'; 
            }).join('')}
          </select>
        </div>
        <div class="property-info" style="margin-top:12px;background:#e8f5e9;border-left:4px solid #4caf50;padding:10px;border-radius:4px;">
          <strong>📌 API: acceptFriendRequest(userId)</strong><br>
          Tự động chấp nhận khi có người gửi kết bạn
        </div>
      `;
    },

    saveForm: function() {
      var runFlowVal = document.getElementById('prop_runFlowAfter').value;
      return {
        blockData: {
          autoAccept: document.getElementById('prop_autoAccept').checked,
          sendWelcome: document.getElementById('prop_sendWelcome').checked,
          welcomeMessage: document.getElementById('prop_welcomeMessage').value,
          runFlowAfter: runFlowVal ? parseInt(runFlowVal) : null
        }
      };
    },

    preview: function(data) {
      return '🤝 Auto: ' + (data.autoAccept !== false ? 'BẬT' : 'TẮT');
    }
  });

})();
