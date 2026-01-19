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
      useConfigManager: true,
      configId: null,
      prompt: '',
      apiKey: '',
      model: 'gemini-1.5-flash',
      temperature: 0.7,
      saveResponseTo: 'ai_response'
    },

    renderForm: function(block, data, context) {
      const useConfig = data.useConfigManager !== false;
      const selectedConfigId = data.configId || '';

      // Debug logging
      console.log('🧠 AI Gemini renderForm called with:', {
        hasContext: !!context,
        aiConfigsCount: context?.aiConfigs?.length || 0,
        aiConfigs: context?.aiConfigs
      });

      // Build AI Config options from context if available
      let configOptions = '<option value="">-- Chọn AI config --</option>';
      if (context && context.aiConfigs && context.aiConfigs.length > 0) {
        configOptions += context.aiConfigs.map(cfg =>
          `<option value="${cfg.id || cfg.configID}" ${(cfg.id === selectedConfigId || cfg.configID === selectedConfigId) ? 'selected' : ''}>${FlowBuilder.escapeHtml(cfg.name)} (${cfg.model})</option>`
        ).join('');
      } else {
        configOptions += '<option value="" disabled>Chưa có AI config nào. Hãy tạo tại AI Models Manager</option>';
      }

      return `
        <div class="property-group">
          <label class="property-label">
            <input type="checkbox" id="prop_useConfigManager" ${useConfig ? 'checked' : ''}
              onchange="document.getElementById('manualConfigGroup').style.display = this.checked ? 'none' : 'block'; document.getElementById('configSelectGroup').style.display = this.checked ? 'block' : 'none';">
            Sử dụng AI Config Manager
          </label>
          <div class="property-hint">Sử dụng cấu hình AI đã lưu trong AI Models Manager</div>
        </div>

        <div id="configSelectGroup" style="display: ${useConfig ? 'block' : 'none'};">
          <div class="property-group">
            <label class="property-label">Chọn AI Config <span class="required">*</span></label>
            <select class="property-input" id="prop_configId">
              ${configOptions}
            </select>
            <div class="property-hint">Cấu hình từ AI Models Manager. <a href="/ai-manager.html" target="_blank">Quản lý AI Configs</a></div>
          </div>
        </div>

        <div id="manualConfigGroup" style="display: ${useConfig ? 'none' : 'block'};">
          <div class="property-group">
            <label class="property-label">Model</label>
            <select class="property-input" id="prop_model">
              <option value="gemini-3-flash-preview" ${data.model === 'gemini-3-flash-preview' ? 'selected' : ''}>Gemini 3 Flash Preview</option>
              <option value="gemini-3-pro-preview" ${data.model === 'gemini-3-pro-preview' ? 'selected' : ''}>Gemini 3 Pro Preview</option>
              <option value="gemini-2.0-flash-exp" ${data.model === 'gemini-2.0-flash-exp' ? 'selected' : ''}>Gemini 2.0 Flash Exp</option>
              <option value="gemini-1.5-pro" ${data.model === 'gemini-1.5-pro' ? 'selected' : ''}>Gemini 1.5 Pro</option>
              <option value="gemini-1.5-flash" ${data.model === 'gemini-1.5-flash' ? 'selected' : ''}>Gemini 1.5 Flash</option>
            </select>
          </div>
          <div class="property-group">
            <label class="property-label">API Key <span class="required">*</span></label>
            <input type="password" class="property-input" id="prop_apiKey" value="${data.apiKey || ''}"
              placeholder="AIzaSy...">
          </div>
          <div class="property-group">
            <label class="property-label">Temperature (0-1)</label>
            <input type="number" class="property-input" id="prop_temperature" value="${data.temperature || 0.7}"
              min="0" max="1" step="0.1">
            <div class="property-hint">0 = chính xác, 1 = sáng tạo</div>
          </div>
        </div>

        <div class="property-group">
          <label class="property-label">Prompt <span class="required">*</span></label>
          <textarea class="property-input property-textarea" id="prop_prompt" rows="6"
            placeholder="Nhập prompt cho AI...&#10;&#10;Có thể dùng biến: {message}, {zalo_name}, {tên_biến_khác}">${FlowBuilder.escapeHtml(data.prompt || '')}</textarea>
          <div class="property-hint">
            <strong>Biến hệ thống:</strong> {message}, {zalo_name}, {zalo_id}, {my_name}, {date}, {time}<br>
            <strong>Biến tùy chỉnh:</strong> {tên_biến}
          </div>
        </div>

        <div class="property-group">
          <label class="property-label">Lưu kết quả vào biến <span class="required">*</span></label>
          <input class="property-input" id="prop_saveResponseTo" value="${FlowBuilder.escapeHtml(data.saveResponseTo || 'ai_response')}"
            placeholder="ai_response">
          <div class="property-hint">Tên biến để lưu response từ AI (dùng trong các block sau)</div>
        </div>
      `;
    },

    saveForm: function() {
      const useConfigManager = document.getElementById('prop_useConfigManager').checked;

      const blockData = {
        useConfigManager: useConfigManager,
        prompt: document.getElementById('prop_prompt').value,
        saveResponseTo: document.getElementById('prop_saveResponseTo').value
      };

      if (useConfigManager) {
        blockData.configId = parseInt(document.getElementById('prop_configId').value) || null;
      } else {
        blockData.apiKey = document.getElementById('prop_apiKey').value;
        blockData.model = document.getElementById('prop_model').value;
        blockData.temperature = parseFloat(document.getElementById('prop_temperature').value) || 0.7;
      }

      return { blockData };
    },

    preview: function(data) {
      if (!data.prompt) return '⚠️ Chưa có prompt';
      const promptPreview = data.prompt.substring(0, 30);
      const saveVar = data.saveResponseTo || 'ai_response';
      return `🧠 ${promptPreview}... → {${saveVar}}`;
    }
  });

})();
