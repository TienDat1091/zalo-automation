// public/blocks/send-message.js
// Block: Gửi tin nhắn

(function () {
  'use strict';

  FlowBuilder.registerBlock('send-message', {
    type: 'send-message',
    name: 'Gửi tin nhắn',
    desc: 'Gửi text message',
    icon: '💬',
    category: 'message',
    color: '#e3f2fd',

    defaultData: {
      message: ''
    },

    renderForm: function (block, data, context) {
      return `
        <div class="property-group">
          <label class="property-label">Nội dung tin nhắn <span class="required">*</span></label>
          <textarea class="property-input property-textarea var-autocomplete-enabled" id="prop_message" rows="5" 
            placeholder="Nhập nội dung... (gõ { để chèn biến)">${FlowBuilder.escapeHtml(data.message || '')}</textarea>
          <div class="property-hint">Gõ { để hiện gợi ý biến: {zalo_name}, {date}, {message}...</div>
        </div>
      `;
    },

    saveForm: function () {
      return {
        blockData: {
          message: document.getElementById('prop_message').value
        }
      };
    },

    preview: function (data) {
      if (!data.message) return '⚠️ Chưa có nội dung';
      return '💬 ' + data.message.substring(0, 50) + (data.message.length > 50 ? '...' : '');
    }
  });

})();
