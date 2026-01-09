// public/blocks/ai-gemini.js
// Block: AI Gemini

(function() {
  'use strict';

  FlowBuilder.registerBlock('ai-gemini', {
    type: 'ai-gemini',
    name: 'AI Gemini',
    desc: 'Tích hợp AI',
    icon: '🧠',
    category: 'integration',
    color: '#e8f5e9',
    
    defaultData: { 
      prompt: '', 
      apiKey: '', 
      saveResponseTo: '' 
    },

    renderForm: function(block, data, context) {
      return `
        <div class="property-group">
          <label class="property-label">Prompt <span class="required">*</span></label>
          <textarea class="property-input property-textarea" id="prop_prompt" rows="4" 
            placeholder="Nhập prompt cho AI...">${FlowBuilder.escapeHtml(data.prompt || '')}</textarea>
          <div class="property-hint">Biến: {message}, {sender_name}</div>
        </div>
        <div class="property-group">
          <label class="property-label">API Key <span class="required">*</span></label>
          <input type="password" class="property-input" id="prop_apiKey" value="${data.apiKey || ''}" 
            placeholder="AIzaSy...">
        </div>
        <div class="property-group">
          <label class="property-label">Lưu response vào biến</label>
          <input class="property-input" id="prop_saveResponseTo" value="${FlowBuilder.escapeHtml(data.saveResponseTo || '')}" 
            placeholder="ai_response">
        </div>
      `;
    },

    saveForm: function() {
      return {
        blockData: {
          prompt: document.getElementById('prop_prompt').value,
          apiKey: document.getElementById('prop_apiKey').value,
          saveResponseTo: document.getElementById('prop_saveResponseTo').value
        }
      };
    },

    preview: function(data) {
      if (!data.prompt) return '⚠️ Chưa có prompt';
      return '🧠 ' + data.prompt.substring(0, 35) + '...';
    }
  });

})();
