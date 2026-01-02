// public/blocks/send-image.js
// Block: Gửi hình ảnh

(function() {
  'use strict';

  FlowBuilder.registerBlock('send-image', {
    type: 'send-image',
    name: 'Gửi hình ảnh',
    desc: 'Gửi ảnh từ URL',
    icon: '🖼️',
    category: 'message',
    color: '#e3f2fd',
    
    defaultData: { 
      imageUrl: '', 
      caption: '' 
    },

    renderForm: function(block, data, context) {
      return `
        <div class="property-group">
          <label class="property-label">URL hình ảnh <span class="required">*</span></label>
          <input class="property-input" id="prop_imageUrl" value="${FlowBuilder.escapeHtml(data.imageUrl || '')}" 
            placeholder="https://example.com/image.jpg">
        </div>
        <div class="property-group">
          <label class="property-label">Caption</label>
          <input class="property-input" id="prop_caption" value="${FlowBuilder.escapeHtml(data.caption || '')}" 
            placeholder="Mô tả hình ảnh">
        </div>
      `;
    },

    saveForm: function() {
      return {
        blockData: {
          imageUrl: document.getElementById('prop_imageUrl').value,
          caption: document.getElementById('prop_caption').value
        }
      };
    },

    preview: function(data) {
      if (!data.imageUrl) return '⚠️ Chưa có URL';
      return '🖼️ ' + data.imageUrl.substring(0, 40) + '...';
    }
  });

})();
