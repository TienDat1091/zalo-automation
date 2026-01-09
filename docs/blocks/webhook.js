// public/blocks/webhook.js
// Block: Webhook - Gọi API

(function() {
  'use strict';

  FlowBuilder.registerBlock('webhook', {
    type: 'webhook',
    name: 'Webhook',
    desc: 'Gọi API',
    icon: '🌐',
    category: 'integration',
    color: '#e8f5e9',
    
    defaultData: { 
      url: '', 
      method: 'GET', 
      headers: '', 
      body: '', 
      saveResponseTo: '' 
    },

    renderForm: function(block, data, context) {
      return `
        <div class="property-group">
          <label class="property-label">URL <span class="required">*</span></label>
          <input class="property-input" id="prop_url" value="${FlowBuilder.escapeHtml(data.url || '')}" 
            placeholder="https://api.example.com/webhook">
        </div>
        <div class="property-group">
          <label class="property-label">Method</label>
          <select class="property-select" id="prop_method">
            <option value="GET" ${data.method === 'GET' ? 'selected' : ''}>GET</option>
            <option value="POST" ${data.method === 'POST' ? 'selected' : ''}>POST</option>
            <option value="PUT" ${data.method === 'PUT' ? 'selected' : ''}>PUT</option>
            <option value="DELETE" ${data.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
          </select>
        </div>
        <div class="property-group">
          <label class="property-label">Headers (JSON)</label>
          <textarea class="property-input" id="prop_headers" rows="2" placeholder='{"Authorization": "Bearer xxx"}'>${FlowBuilder.escapeHtml(data.headers || '')}</textarea>
        </div>
        <div class="property-group">
          <label class="property-label">Body (JSON)</label>
          <textarea class="property-input" id="prop_body" rows="3" placeholder='{"key": "value"}'>${FlowBuilder.escapeHtml(data.body || '')}</textarea>
        </div>
        <div class="property-group">
          <label class="property-label">Lưu response vào biến</label>
          <input class="property-input" id="prop_saveResponseTo" value="${FlowBuilder.escapeHtml(data.saveResponseTo || '')}" 
            placeholder="response_data">
          <div class="property-hint">Có thể dùng {biến} trong URL và body</div>
        </div>
      `;
    },

    saveForm: function() {
      return {
        blockData: {
          url: document.getElementById('prop_url').value,
          method: document.getElementById('prop_method').value,
          headers: document.getElementById('prop_headers').value,
          body: document.getElementById('prop_body').value,
          saveResponseTo: document.getElementById('prop_saveResponseTo').value
        }
      };
    },

    preview: function(data) {
      if (!data.url) return '⚠️ Chưa có URL';
      return '🌐 ' + data.method + ' ' + data.url.substring(0, 30) + '...';
    }
  });

})();
