// public/blocks/send-friend-request.js
// Block: Gửi kết bạn

(function() {
  'use strict';

  // Helper function - expose to window
  window.toggleFriendRequestTarget = function() {
    var type = document.getElementById('prop_targetType');
    if (!type) return;
    
    var varGroup = document.getElementById('friendTargetVariable');
    var manualGroup = document.getElementById('friendTargetManual');
    
    if (varGroup) varGroup.style.display = type.value === 'variable' ? 'block' : 'none';
    if (manualGroup) manualGroup.style.display = type.value === 'manual' ? 'block' : 'none';
  };

  FlowBuilder.registerBlock('send-friend-request', {
    type: 'send-friend-request',
    name: 'Gửi kết bạn',
    desc: 'Gửi lời mời kết bạn',
    icon: '👋',
    category: 'message',
    color: '#bbdefb',
    
    defaultData: {
      targetType: 'sender',
      targetUserId: '',
      targetVariable: '',
      message: 'Xin chào, hãy kết bạn với tôi!'
    },

    renderForm: function(block, data, context) {
      return `
        <div class="property-group">
          <label class="property-label">Nguồn User ID <span class="required">*</span></label>
          <select class="property-select" id="prop_targetType" onchange="toggleFriendRequestTarget()">
            <option value="sender" ${data.targetType === 'sender' ? 'selected' : ''}>Người gửi tin nhắn</option>
            <option value="variable" ${data.targetType === 'variable' ? 'selected' : ''}>Từ biến</option>
            <option value="manual" ${data.targetType === 'manual' ? 'selected' : ''}>Nhập thủ công</option>
          </select>
        </div>
        <div class="property-group" id="friendTargetVariable" style="${data.targetType !== 'variable' ? 'display:none' : ''}">
          <label class="property-label">Tên biến chứa User ID</label>
          <input class="property-input" id="prop_targetVariable" value="${FlowBuilder.escapeHtml(data.targetVariable || '')}" 
            placeholder="user_id">
        </div>
        <div class="property-group" id="friendTargetManual" style="${data.targetType !== 'manual' ? 'display:none' : ''}">
          <label class="property-label">User ID</label>
          <input class="property-input" id="prop_targetUserId" value="${FlowBuilder.escapeHtml(data.targetUserId || '')}" 
            placeholder="000000000000000001">
        </div>
        <div class="property-group">
          <label class="property-label">Tin nhắn kèm theo</label>
          <textarea class="property-input" id="prop_friendMessage" rows="3">${FlowBuilder.escapeHtml(data.message || 'Xin chào, hãy kết bạn với tôi!')}</textarea>
        </div>
        <div class="property-info" style="margin-top:12px;background:#e3f2fd;border-left:4px solid #2196f3;padding:10px;border-radius:4px;">
          <strong>📌 API: sendFriendRequest(msg, userId)</strong><br>
          Gửi lời mời kết bạn đến user được chỉ định
        </div>
      `;
    },

    saveForm: function() {
      return {
        blockData: {
          targetType: document.getElementById('prop_targetType').value,
          targetUserId: document.getElementById('prop_targetUserId') ? document.getElementById('prop_targetUserId').value : '',
          targetVariable: document.getElementById('prop_targetVariable') ? document.getElementById('prop_targetVariable').value : '',
          message: document.getElementById('prop_friendMessage').value
        }
      };
    },

    preview: function(data) {
      var target = data.targetType === 'sender' ? 'người gửi' : 
                   data.targetType === 'variable' ? '{' + data.targetVariable + '}' : 
                   data.targetUserId || '?';
      return '👋 Kết bạn → ' + target;
    }
  });

})();
