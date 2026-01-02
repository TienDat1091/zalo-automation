// public/blocks/send-file.js
// Block: Gửi file

(function() {
  'use strict';

  FlowBuilder.registerBlock('send-file', {
    type: 'send-file',
    name: 'Gửi file',
    desc: 'Gửi file đính kèm',
    icon: '📎',
    category: 'message',
    color: '#e3f2fd',
    
    defaultData: { 
      fileUrl: '', 
      fileName: '' 
    },

    renderForm: function(block, data, context) {
      return `
        <div class="property-group">
          <label class="property-label">URL file <span class="required">*</span></label>
          <input class="property-input" id="prop_fileUrl" value="${FlowBuilder.escapeHtml(data.fileUrl || '')}" 
            placeholder="https://example.com/file.pdf">
        </div>
        <div class="property-group">
          <label class="property-label">Tên file</label>
          <input class="property-input" id="prop_fileName" value="${FlowBuilder.escapeHtml(data.fileName || '')}" 
            placeholder="document.pdf">
        </div>
      `;
    },

    saveForm: function() {
      return {
        blockData: {
          fileUrl: document.getElementById('prop_fileUrl').value,
          fileName: document.getElementById('prop_fileName').value
        }
      };
    },

    preview: function(data) {
      if (!data.fileUrl) return '⚠️ Chưa có file';
      return '📎 ' + (data.fileName || 'File');
    }
  });

})();
