// public/blocks/user-input.js
// Block: User Input - Lắng nghe input từ user

(function() {
  'use strict';

  // Helper functions - expose to window
  window.addQuestion = function() {
    var container = document.getElementById('questionsContainer');
    if (!container) return;
    
    var items = container.querySelectorAll('.question-item');
    var newIdx = items.length;
    var INPUT_TYPES = FlowBuilder.INPUT_TYPES;
    
    var html = `
      <div class="question-item" data-idx="${newIdx}" style="background:#f5f7fa;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-weight:600;font-size:12px;color:#666;">Câu hỏi ${newIdx + 1}</span>
          <button type="button" onclick="removeQuestion(${newIdx})" style="background:#ffebee;border:none;color:#f44336;width:24px;height:24px;border-radius:50%;cursor:pointer;">✕</button>
        </div>
        <div class="property-group" style="margin-bottom:8px;">
          <textarea class="property-input q-msg" data-idx="${newIdx}" rows="2" placeholder="Tin nhắn..."></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 60px 1fr;gap:6px;margin-bottom:8px;">
          <select class="property-select q-type" data-idx="${newIdx}">
            ${INPUT_TYPES.map(function(t) { return '<option value="' + t.value + '">' + t.label + '</option>'; }).join('')}
          </select>
          <input type="number" class="property-input q-retry" data-idx="${newIdx}" value="2" min="0" max="10" title="Số lần thử">
          <input class="property-input q-var" data-idx="${newIdx}" placeholder="Lưu vào biến">
        </div>
        <input class="property-input q-retry-msg" data-idx="${newIdx}" placeholder="Tin nhắn khi nhập sai">
      </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
  };

  window.removeQuestion = function(idx) {
    var items = document.querySelectorAll('.question-item');
    if (items.length > 1 && items[idx]) {
      items[idx].remove();
      // Re-index
      document.querySelectorAll('.question-item').forEach(function(item, i) {
        item.dataset.idx = i;
        var label = item.querySelector('span');
        if (label) label.textContent = 'Câu hỏi ' + (i + 1);
      });
    }
  };

  FlowBuilder.registerBlock('user-input', {
    type: 'user-input',
    name: 'Lắng nghe',
    desc: 'Chờ user nhập',
    icon: '👂',
    category: 'logic',
    color: '#b3e5fc',
    
    defaultData: {
      questions: [{
        message: '',
        expectedType: 'text',
        maxRetries: 2,
        variableName: '',
        retryMessage: ''
      }],
      timeoutValue: 1,
      timeoutUnit: 'hour'
    },

    renderForm: function(block, data, context) {
      var INPUT_TYPES = FlowBuilder.INPUT_TYPES;
      var questions = data.questions || [{ message: '', expectedType: 'text', maxRetries: 2, variableName: '', retryMessage: '' }];
      
      var questionsHtml = questions.map(function(q, idx) {
        return `
          <div class="question-item" data-idx="${idx}" style="background:#f5f7fa;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span style="font-weight:600;font-size:12px;color:#666;">Câu hỏi ${idx + 1}</span>
              ${questions.length > 1 ? '<button type="button" onclick="removeQuestion(' + idx + ')" style="background:#ffebee;border:none;color:#f44336;width:24px;height:24px;border-radius:50%;cursor:pointer;">✕</button>' : ''}
            </div>
            <div class="property-group" style="margin-bottom:8px;">
              <textarea class="property-input q-msg" data-idx="${idx}" rows="2" placeholder="Tin nhắn...">${FlowBuilder.escapeHtml(q.message || '')}</textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 60px 1fr;gap:6px;margin-bottom:8px;">
              <select class="property-select q-type" data-idx="${idx}">
                ${INPUT_TYPES.map(function(t) { return '<option value="' + t.value + '" ' + (q.expectedType === t.value ? 'selected' : '') + '>' + t.label + '</option>'; }).join('')}
              </select>
              <input type="number" class="property-input q-retry" data-idx="${idx}" value="${q.maxRetries || 2}" min="0" max="10" title="Số lần thử">
              <input class="property-input q-var" data-idx="${idx}" value="${FlowBuilder.escapeHtml(q.variableName || '')}" placeholder="Lưu vào biến">
            </div>
            <input class="property-input q-retry-msg" data-idx="${idx}" value="${FlowBuilder.escapeHtml(q.retryMessage || '')}" placeholder="Tin nhắn khi nhập sai">
          </div>
        `;
      }).join('');
      
      return `
        <div id="questionsContainer">${questionsHtml}</div>
        <button type="button" class="btn" onclick="addQuestion()" style="width:100%;margin-bottom:16px;">➕ Thêm câu hỏi</button>
        <div class="property-group">
          <label class="property-label">Timeout</label>
          <div style="display:flex;gap:8px;">
            <input type="number" class="property-input" id="prop_timeoutValue" value="${data.timeoutValue || 1}" min="1" style="flex:1">
            <select class="property-select" id="prop_timeoutUnit" style="width:80px">
              <option value="minute" ${data.timeoutUnit === 'minute' ? 'selected' : ''}>Phút</option>
              <option value="hour" ${data.timeoutUnit === 'hour' ? 'selected' : ''}>Giờ</option>
              <option value="day" ${data.timeoutUnit === 'day' ? 'selected' : ''}>Ngày</option>
            </select>
          </div>
        </div>
      `;
    },

    saveForm: function() {
      var questions = [];
      document.querySelectorAll('.question-item').forEach(function(item) {
        questions.push({
          message: item.querySelector('.q-msg') ? item.querySelector('.q-msg').value : '',
          expectedType: item.querySelector('.q-type') ? item.querySelector('.q-type').value : 'text',
          maxRetries: item.querySelector('.q-retry') ? parseInt(item.querySelector('.q-retry').value) : 2,
          variableName: item.querySelector('.q-var') ? item.querySelector('.q-var').value : '',
          retryMessage: item.querySelector('.q-retry-msg') ? item.querySelector('.q-retry-msg').value : ''
        });
      });
      
      return {
        blockData: {
          questions: questions,
          timeoutValue: parseInt(document.getElementById('prop_timeoutValue').value) || 1,
          timeoutUnit: document.getElementById('prop_timeoutUnit').value || 'hour'
        }
      };
    },

    preview: function(data) {
      var count = (data.questions && data.questions.length) || 0;
      return '👂 ' + count + ' câu hỏi';
    }
  });

})();
