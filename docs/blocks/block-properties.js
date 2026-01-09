// public/js/blocks/block-properties.js
// Render property forms cho từng block type

const BlockProperties = {
  // Common helper
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  },

  // Toggle helpers
  toggleFriendTarget() {
    const type = document.getElementById('prop_targetType')?.value;
    const varGroup = document.getElementById('friendTargetVariable');
    const manualGroup = document.getElementById('friendTargetManual');
    if (varGroup) varGroup.style.display = type === 'variable' ? 'block' : 'none';
    if (manualGroup) manualGroup.style.display = type === 'manual' ? 'block' : 'none';
  },

  togglePaymentAmount() {
    const type = document.getElementById('prop_amountType')?.value;
    const manualGroup = document.getElementById('paymentAmountManual');
    const varGroup = document.getElementById('paymentAmountVariable');
    if (manualGroup) manualGroup.style.display = type === 'manual' ? 'block' : 'none';
    if (varGroup) varGroup.style.display = type === 'variable' ? 'block' : 'none';
  },

  // ========== BLOCK RENDERERS ==========
  renderers: {
    // SEND MESSAGE
    'send-message': {
      render(block, data, context) {
        return `
          <div class="property-group">
            <label class="property-label">Nội dung tin nhắn <span class="required">*</span></label>
            <textarea class="property-input property-textarea" id="prop_message" rows="5" 
              placeholder="Nhập nội dung...">${BlockProperties.escapeHtml(data.message || '')}</textarea>
            <div class="property-hint">Biến: {sender_name}, {sender_id}, {message}</div>
          </div>
        `;
      },
      save() {
        return { message: document.getElementById('prop_message').value };
      },
      preview(data) {
        return data.message ? `💬 ${data.message.substring(0, 40)}...` : '⚠️ Chưa có nội dung';
      }
    },

    // SEND IMAGE
    'send-image': {
      render(block, data, context) {
        return `
          <div class="property-group">
            <label class="property-label">URL hình ảnh <span class="required">*</span></label>
            <input class="property-input" id="prop_imageUrl" value="${BlockProperties.escapeHtml(data.imageUrl || '')}" 
              placeholder="https://example.com/image.jpg">
          </div>
          <div class="property-group">
            <label class="property-label">Caption</label>
            <input class="property-input" id="prop_caption" value="${BlockProperties.escapeHtml(data.caption || '')}" 
              placeholder="Mô tả hình ảnh">
          </div>
        `;
      },
      save() {
        return {
          imageUrl: document.getElementById('prop_imageUrl').value,
          caption: document.getElementById('prop_caption').value
        };
      },
      preview(data) {
        return data.imageUrl ? `🖼️ ${data.imageUrl.substring(0, 30)}...` : '⚠️ Chưa có URL';
      }
    },

    // SEND FILE
    'send-file': {
      render(block, data, context) {
        return `
          <div class="property-group">
            <label class="property-label">URL file <span class="required">*</span></label>
            <input class="property-input" id="prop_fileUrl" value="${BlockProperties.escapeHtml(data.fileUrl || '')}" 
              placeholder="https://example.com/file.pdf">
          </div>
          <div class="property-group">
            <label class="property-label">Tên file</label>
            <input class="property-input" id="prop_fileName" value="${BlockProperties.escapeHtml(data.fileName || '')}" 
              placeholder="document.pdf">
          </div>
        `;
      },
      save() {
        return {
          fileUrl: document.getElementById('prop_fileUrl').value,
          fileName: document.getElementById('prop_fileName').value
        };
      },
      preview(data) {
        return data.fileUrl ? `📎 ${data.fileName || 'File'}` : '⚠️ Chưa có file';
      }
    },

    // SEND FRIEND REQUEST
    'send-friend-request': {
      render(block, data, context) {
        return `
          <div class="property-group">
            <label class="property-label">Nguồn User ID <span class="required">*</span></label>
            <select class="property-select" id="prop_targetType" onchange="BlockProperties.toggleFriendTarget()">
              <option value="sender" ${data.targetType === 'sender' ? 'selected' : ''}>Người gửi tin nhắn</option>
              <option value="variable" ${data.targetType === 'variable' ? 'selected' : ''}>Từ biến</option>
              <option value="manual" ${data.targetType === 'manual' ? 'selected' : ''}>Nhập thủ công</option>
            </select>
          </div>
          <div class="property-group" id="friendTargetVariable" style="${data.targetType !== 'variable' ? 'display:none' : ''}">
            <label class="property-label">Tên biến chứa User ID</label>
            <input class="property-input" id="prop_targetVariable" value="${BlockProperties.escapeHtml(data.targetVariable || '')}" 
              placeholder="user_id">
          </div>
          <div class="property-group" id="friendTargetManual" style="${data.targetType !== 'manual' ? 'display:none' : ''}">
            <label class="property-label">User ID</label>
            <input class="property-input" id="prop_targetUserId" value="${BlockProperties.escapeHtml(data.targetUserId || '')}" 
              placeholder="000000000000000001">
          </div>
          <div class="property-group">
            <label class="property-label">Tin nhắn kèm theo</label>
            <textarea class="property-input" id="prop_message" rows="3">${BlockProperties.escapeHtml(data.message || 'Xin chào, hãy kết bạn với tôi!')}</textarea>
          </div>
          <div class="property-info" style="margin-top:12px;background:#e3f2fd;border-left:4px solid #2196f3;padding:10px;">
            <strong>📌 API: sendFriendRequest(msg, userId)</strong><br>
            Gửi lời mời kết bạn đến user được chỉ định
          </div>
        `;
      },
      save() {
        return {
          targetType: document.getElementById('prop_targetType').value,
          targetUserId: document.getElementById('prop_targetUserId')?.value || '',
          targetVariable: document.getElementById('prop_targetVariable')?.value || '',
          message: document.getElementById('prop_message').value
        };
      },
      preview(data) {
        const target = data.targetType === 'sender' ? 'người gửi' : 
                       data.targetType === 'variable' ? `{${data.targetVariable}}` : data.targetUserId;
        return `👋 Gửi kết bạn → ${target || '?'}`;
      }
    },

    // ACCEPT FRIEND REQUEST
    'accept-friend-request': {
      render(block, data, context) {
        const triggers = context.allTriggers || [];
        const others = triggers.filter(t => t.triggerID !== context.currentTriggerId && t.setMode === 1);
        
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
            <textarea class="property-input" id="prop_welcomeMessage" rows="3">${BlockProperties.escapeHtml(data.welcomeMessage || 'Cảm ơn bạn đã kết bạn!')}</textarea>
          </div>
          <div class="property-group">
            <label class="property-label">Chạy Flow sau khi chấp nhận</label>
            <select class="property-select" id="prop_runFlowAfter">
              <option value="">-- Không chọn --</option>
              ${others.map(t => `<option value="${t.triggerID}" ${data.runFlowAfter == t.triggerID ? 'selected' : ''}>${BlockProperties.escapeHtml(t.triggerName)}</option>`).join('')}
            </select>
          </div>
          <div class="property-info" style="margin-top:12px;background:#e8f5e9;border-left:4px solid #4caf50;padding:10px;">
            <strong>📌 API: acceptFriendRequest(userId)</strong><br>
            Tự động chấp nhận khi có người gửi kết bạn
          </div>
        `;
      },
      save() {
        return {
          autoAccept: document.getElementById('prop_autoAccept').checked,
          sendWelcome: document.getElementById('prop_sendWelcome').checked,
          welcomeMessage: document.getElementById('prop_welcomeMessage').value,
          runFlowAfter: document.getElementById('prop_runFlowAfter').value ? parseInt(document.getElementById('prop_runFlowAfter').value) : null
        };
      },
      preview(data) {
        return `🤝 Auto accept: ${data.autoAccept !== false ? 'BẬT' : 'TẮT'}`;
      }
    },

    // DELAY
    'delay': {
      render(block, data, context) {
        const units = window.TIME_UNITS || [
          { value: 'ms', label: 'Mili-giây' },
          { value: 's', label: 'Giây' },
          { value: 'm', label: 'Phút' },
          { value: 'h', label: 'Giờ' }
        ];
        
        return `
          <div class="property-group">
            <label class="property-label">Thời gian chờ</label>
            <div class="property-row">
              <input type="number" class="property-input" id="prop_duration" value="${data.duration || 2000}" min="0" style="flex:1">
              <select class="property-select" id="prop_unit" style="width:100px">
                ${units.map(u => `<option value="${u.value}" ${data.unit === u.value ? 'selected' : ''}>${u.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="property-info" style="margin-top:12px;">
            ⏱️ Chờ trước khi thực hiện block tiếp theo
          </div>
        `;
      },
      save() {
        return {
          duration: parseFloat(document.getElementById('prop_duration').value) || 2000,
          unit: document.getElementById('prop_unit').value || 'ms'
        };
      },
      preview(data) {
        const units = { ms: 'ms', s: 'giây', m: 'phút', h: 'giờ' };
        return `⏱️ Chờ ${data.duration || 2000} ${units[data.unit] || 'ms'}`;
      }
    },

    // RUN BLOCK
    'run-block': {
      render(block, data, context) {
        const triggers = context.allTriggers || [];
        const others = triggers.filter(t => t.triggerID !== context.currentTriggerId);
        
        return `
          <div class="property-group">
            <label class="property-label">Chọn Flow/Trigger cần chạy <span class="required">*</span></label>
            <select class="property-select" id="prop_targetTriggerId">
              <option value="">-- Chọn --</option>
              ${others.map(t => `<option value="${t.triggerID}" ${data.targetTriggerId == t.triggerID ? 'selected' : ''}>${BlockProperties.escapeHtml(t.triggerName)} ${t.setMode === 1 ? '(Flow)' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="property-info">
            🔗 Thực thi flow/trigger khác và tiếp tục flow hiện tại
          </div>
        `;
      },
      save() {
        const val = document.getElementById('prop_targetTriggerId').value;
        return { targetTriggerId: val ? parseInt(val) : null };
      },
      preview(data) {
        return data.targetTriggerId ? `🔗 Flow #${data.targetTriggerId}` : '⚠️ Chưa chọn flow';
      }
    },

    // CONDITION
    'condition': {
      render(block, data, context) {
        const triggers = context.allTriggers || [];
        const others = triggers.filter(t => t.triggerID !== context.currentTriggerId && t.setMode === 1);
        const operators = window.OPERATORS || [
          { value: 'equals', label: 'Bằng (=)' },
          { value: 'not_equals', label: 'Khác (≠)' },
          { value: 'contains', label: 'Chứa' },
          { value: 'not_contains', label: 'Không chứa' },
          { value: 'greater_than', label: 'Lớn hơn (>)' },
          { value: 'less_than', label: 'Nhỏ hơn (<)' },
          { value: 'is_empty', label: 'Rỗng' },
          { value: 'is_not_empty', label: 'Không rỗng' }
        ];
        
        return `
          <div class="property-group">
            <label class="property-label">Tên biến <span class="required">*</span></label>
            <input class="property-input" id="prop_variableName" value="${BlockProperties.escapeHtml(data.variableName || '')}" 
              placeholder="my_variable">
          </div>
          <div class="property-group">
            <label class="property-label">Toán tử</label>
            <select class="property-select" id="prop_operator">
              ${operators.map(op => `<option value="${op.value}" ${data.operator === op.value ? 'selected' : ''}>${op.label}</option>`).join('')}
            </select>
          </div>
          <div class="property-group">
            <label class="property-label">Giá trị so sánh</label>
            <input class="property-input" id="prop_compareValue" value="${BlockProperties.escapeHtml(data.compareValue || '')}" 
              placeholder="value">
          </div>
          <div class="property-group">
            <label class="property-label">✅ Nếu ĐÚNG → chạy Flow</label>
            <select class="property-select" id="prop_condition1">
              <option value="">-- Không chọn --</option>
              ${others.map(t => `<option value="${t.triggerID}" ${(data.trueFlowId || block.condition1) == t.triggerID ? 'selected' : ''}>${BlockProperties.escapeHtml(t.triggerName)}</option>`).join('')}
            </select>
          </div>
          <div class="property-group">
            <label class="property-label">❌ Nếu SAI → chạy Flow</label>
            <select class="property-select" id="prop_condition2">
              <option value="">-- Không chọn --</option>
              ${others.map(t => `<option value="${t.triggerID}" ${(data.falseFlowId || block.condition2) == t.triggerID ? 'selected' : ''}>${BlockProperties.escapeHtml(t.triggerName)}</option>`).join('')}
            </select>
          </div>
        `;
      },
      save() {
        return {
          variableName: document.getElementById('prop_variableName').value,
          operator: document.getElementById('prop_operator').value,
          compareValue: document.getElementById('prop_compareValue').value,
          trueFlowId: document.getElementById('prop_condition1').value ? parseInt(document.getElementById('prop_condition1').value) : null,
          falseFlowId: document.getElementById('prop_condition2').value ? parseInt(document.getElementById('prop_condition2').value) : null
        };
      },
      saveExtra() {
        return {
          condition1: document.getElementById('prop_condition1').value ? parseInt(document.getElementById('prop_condition1').value) : null,
          condition2: document.getElementById('prop_condition2').value ? parseInt(document.getElementById('prop_condition2').value) : null
        };
      },
      preview(data) {
        return data.variableName ? `🔀 IF {${data.variableName}} ${data.operator}...` : '⚠️ Chưa cấu hình';
      }
    },

    // USER INPUT
    'user-input': {
      render(block, data, context) {
        const questions = data.questions || [{ message: '', expectedType: 'text', maxRetries: 2, variableName: '', retryMessage: '' }];
        const inputTypes = window.INPUT_TYPES || [
          { value: 'none', label: 'Bất kỳ' },
          { value: 'text', label: 'Văn bản' },
          { value: 'number', label: 'Số' },
          { value: 'phone', label: 'SĐT' },
          { value: 'email', label: 'Email' }
        ];
        
        let questionsHtml = questions.map((q, idx) => `
          <div class="question-item" data-idx="${idx}" style="background:#f5f7fa;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span style="font-weight:600;font-size:12px;color:#666;">Câu hỏi ${idx + 1}</span>
              ${questions.length > 1 ? `<button type="button" onclick="BlockProperties.removeQuestion(${idx})" style="background:#ffebee;border:none;color:#f44336;width:24px;height:24px;border-radius:50%;cursor:pointer;">✕</button>` : ''}
            </div>
            <div class="property-group" style="margin-bottom:8px;">
              <textarea class="property-input q-msg" data-idx="${idx}" rows="2" placeholder="Tin nhắn...">${BlockProperties.escapeHtml(q.message || '')}</textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 60px 1fr;gap:6px;margin-bottom:8px;">
              <select class="property-select q-type" data-idx="${idx}">
                ${inputTypes.map(t => `<option value="${t.value}" ${q.expectedType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
              <input type="number" class="property-input q-retry" data-idx="${idx}" value="${q.maxRetries || 2}" min="0" max="10" title="Số lần thử">
              <input class="property-input q-var" data-idx="${idx}" value="${BlockProperties.escapeHtml(q.variableName || '')}" placeholder="Lưu vào biến">
            </div>
            <input class="property-input q-retry-msg" data-idx="${idx}" value="${BlockProperties.escapeHtml(q.retryMessage || '')}" placeholder="Tin nhắn khi nhập sai">
          </div>
        `).join('');
        
        return `
          <div id="questionsContainer">${questionsHtml}</div>
          <button type="button" class="btn" onclick="BlockProperties.addQuestion()" style="width:100%;margin-bottom:16px;">➕ Thêm câu hỏi</button>
          <div class="property-group">
            <label class="property-label">Timeout</label>
            <div class="property-row">
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
      save() {
        const questions = [];
        document.querySelectorAll('.question-item').forEach(item => {
          questions.push({
            message: item.querySelector('.q-msg')?.value || '',
            expectedType: item.querySelector('.q-type')?.value || 'text',
            maxRetries: parseInt(item.querySelector('.q-retry')?.value) || 2,
            variableName: item.querySelector('.q-var')?.value || '',
            retryMessage: item.querySelector('.q-retry-msg')?.value || ''
          });
        });
        return {
          questions,
          timeoutValue: parseInt(document.getElementById('prop_timeoutValue').value) || 1,
          timeoutUnit: document.getElementById('prop_timeoutUnit').value || 'hour'
        };
      },
      preview(data) {
        const count = data.questions?.length || 0;
        return `👂 ${count} câu hỏi`;
      }
    },

    // BOT ACTIVE
    'bot-active': {
      render(block, data, context) {
        return `
          <div class="property-group">
            <label class="property-label">Hành động</label>
            <select class="property-select" id="prop_action">
              <option value="enable" ${data.action === 'enable' ? 'selected' : ''}>Bật bot</option>
              <option value="disable" ${data.action === 'disable' ? 'selected' : ''}>Tắt bot</option>
              <option value="toggle" ${data.action === 'toggle' ? 'selected' : ''}>Đảo trạng thái</option>
            </select>
          </div>
          <div class="property-group">
            <label class="property-label">Thời gian (phút, 0 = vĩnh viễn)</label>
            <input type="number" class="property-input" id="prop_duration" value="${data.duration || 0}" min="0">
          </div>
          <div class="property-group">
            <label class="property-label">Phạm vi</label>
            <select class="property-select" id="prop_scope">
              <option value="current" ${data.scope === 'current' ? 'selected' : ''}>User hiện tại</option>
              <option value="all" ${data.scope === 'all' ? 'selected' : ''}>Tất cả</option>
            </select>
          </div>
        `;
      },
      save() {
        return {
          action: document.getElementById('prop_action').value,
          duration: parseInt(document.getElementById('prop_duration').value) || 0,
          scope: document.getElementById('prop_scope').value
        };
      },
      preview(data) {
        const actions = { enable: 'BẬT', disable: 'TẮT', toggle: 'ĐẢO' };
        return `🤖 ${actions[data.action] || 'Toggle'}`;
      }
    },

    // SET VARIABLE
    'set-variable': {
      render(block, data, context) {
        return `
          <div class="property-group">
            <label class="property-label">Tên biến <span class="required">*</span></label>
            <input class="property-input" id="prop_variableName" value="${BlockProperties.escapeHtml(data.variableName || '')}" 
              placeholder="my_variable">
          </div>
          <div class="property-group">
            <label class="property-label">Giá trị</label>
            <input class="property-input" id="prop_variableValue" value="${BlockProperties.escapeHtml(data.variableValue || '')}" 
              placeholder="Giá trị hoặc {biến}">
            <div class="property-hint">Có thể dùng {biến} để tham chiếu biến khác</div>
          </div>
          <div class="property-group">
            <label class="property-label">Kiểu dữ liệu</label>
            <select class="property-select" id="prop_variableType">
              <option value="text" ${data.variableType === 'text' ? 'selected' : ''}>Văn bản</option>
              <option value="number" ${data.variableType === 'number' ? 'selected' : ''}>Số</option>
              <option value="boolean" ${data.variableType === 'boolean' ? 'selected' : ''}>Boolean</option>
            </select>
          </div>
        `;
      },
      save() {
        return {
          variableName: document.getElementById('prop_variableName').value,
          variableValue: document.getElementById('prop_variableValue').value,
          variableType: document.getElementById('prop_variableType').value
        };
      },
      preview(data) {
        return data.variableName ? `📝 ${data.variableName} = "${(data.variableValue || '').substring(0, 20)}"` : '⚠️ Chưa có tên biến';
      }
    },

    // CLEAR VARIABLE
    'clear-variable': {
      render(block, data, context) {
        return `
          <div class="property-group">
            <label><input type="checkbox" id="prop_clearAll" ${data.clearAll ? 'checked' : ''}> 
              Xóa tất cả biến của user</label>
          </div>
          <div class="property-group">
            <label class="property-label">Hoặc xóa biến cụ thể</label>
            <input class="property-input" id="prop_variableName" value="${BlockProperties.escapeHtml(data.variableName || '')}" 
              placeholder="variable_name">
          </div>
        `;
      },
      save() {
        return {
          clearAll: document.getElementById('prop_clearAll').checked,
          variableName: document.getElementById('prop_variableName')?.value || ''
        };
      },
      preview(data) {
        return data.clearAll ? '🗑️ Xóa tất cả' : `🗑️ Xóa {${data.variableName || '?'}}`;
      }
    },

    // WEBHOOK
    'webhook': {
      render(block, data, context) {
        return `
          <div class="property-group">
            <label class="property-label">URL <span class="required">*</span></label>
            <input class="property-input" id="prop_url" value="${BlockProperties.escapeHtml(data.url || '')}" 
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
            <textarea class="property-input" id="prop_headers" rows="2" placeholder='{"Authorization": "Bearer xxx"}'>${BlockProperties.escapeHtml(data.headers || '')}</textarea>
          </div>
          <div class="property-group">
            <label class="property-label">Body (JSON)</label>
            <textarea class="property-input" id="prop_body" rows="3" placeholder='{"key": "value"}'>${BlockProperties.escapeHtml(data.body || '')}</textarea>
            <div class="property-hint">Có thể dùng {biến} trong URL và body</div>
          </div>
        `;
      },
      save() {
        return {
          url: document.getElementById('prop_url').value,
          method: document.getElementById('prop_method').value,
          headers: document.getElementById('prop_headers').value,
          body: document.getElementById('prop_body').value
        };
      },
      preview(data) {
        return data.url ? `🌐 ${data.method} ${data.url.substring(0, 25)}...` : '⚠️ Chưa có URL';
      }
    },

    // AI GEMINI
    'ai-gemini': {
      render(block, data, context) {
        return `
          <div class="property-group">
            <label class="property-label">Prompt <span class="required">*</span></label>
            <textarea class="property-input property-textarea" id="prop_prompt" rows="4" 
              placeholder="Nhập prompt cho AI...">${BlockProperties.escapeHtml(data.prompt || '')}</textarea>
            <div class="property-hint">Biến: {message}, {sender_name}</div>
          </div>
          <div class="property-group">
            <label class="property-label">API Key <span class="required">*</span></label>
            <input type="password" class="property-input" id="prop_apiKey" value="${data.apiKey || ''}" 
              placeholder="AIzaSy...">
          </div>
          <div class="property-group">
            <label class="property-label">Lưu response vào biến</label>
            <input class="property-input" id="prop_saveResponseTo" value="${BlockProperties.escapeHtml(data.saveResponseTo || '')}" 
              placeholder="ai_response">
          </div>
        `;
      },
      save() {
        return {
          prompt: document.getElementById('prop_prompt').value,
          apiKey: document.getElementById('prop_apiKey').value,
          saveResponseTo: document.getElementById('prop_saveResponseTo').value
        };
      },
      preview(data) {
        return data.prompt ? `🧠 ${data.prompt.substring(0, 30)}...` : '⚠️ Chưa có prompt';
      }
    },

    // PAYMENT HUB
    'payment-hub': {
      render(block, data, context) {
        const gates = window.paymentGates || [];
        
        return `
          <div class="property-group">
            <label class="property-label">Cổng thanh toán <span class="required">*</span></label>
            <select class="property-select" id="prop_gateId">
              <option value="">-- Chọn cổng --</option>
              ${gates.map(g => `<option value="${g.gateID}" ${data.gateId == g.gateID ? 'selected' : ''}>${BlockProperties.escapeHtml(g.gateName)}</option>`).join('')}
            </select>
          </div>
          <div class="property-group">
            <label class="property-label">Nguồn số tiền</label>
            <select class="property-select" id="prop_amountType" onchange="BlockProperties.togglePaymentAmount()">
              <option value="manual" ${data.amountType === 'manual' ? 'selected' : ''}>Nhập thủ công</option>
              <option value="variable" ${data.amountType === 'variable' ? 'selected' : ''}>Từ biến</option>
            </select>
          </div>
          <div class="property-group" id="paymentAmountManual" style="${data.amountType === 'variable' ? 'display:none' : ''}">
            <label class="property-label">Số tiền (VND)</label>
            <input type="number" class="property-input" id="prop_amount" value="${data.amount || ''}" placeholder="10000">
          </div>
          <div class="property-group" id="paymentAmountVariable" style="${data.amountType !== 'variable' ? 'display:none' : ''}">
            <label class="property-label">Tên biến chứa số tiền</label>
            <input class="property-input" id="prop_amountVariable" value="${BlockProperties.escapeHtml(data.amountVariable || '')}" placeholder="amount">
          </div>
          <div class="property-group">
            <label class="property-label">Ghi chú</label>
            <input class="property-input" id="prop_note" value="${BlockProperties.escapeHtml(data.note || '')}" placeholder="Thanh toán đơn hàng">
          </div>
          <div class="property-group">
            <label class="property-label">Lưu mã giao dịch vào biến</label>
            <input class="property-input" id="prop_saveTransactionTo" value="${BlockProperties.escapeHtml(data.saveTransactionTo || '')}" placeholder="transaction_code">
          </div>
          <div class="property-info" style="margin-top:12px;background:#fff3e0;border-left:4px solid #ff9800;padding:10px;">
            <strong>💳 Quy trình:</strong><br>
            1. Tạo mã giao dịch (DHSxxxxxxxx)<br>
            2. Gửi thông tin thanh toán cho user
          </div>
        `;
      },
      save() {
        return {
          gateId: document.getElementById('prop_gateId').value ? parseInt(document.getElementById('prop_gateId').value) : null,
          amount: document.getElementById('prop_amount')?.value || '',
          amountType: document.getElementById('prop_amountType').value,
          amountVariable: document.getElementById('prop_amountVariable')?.value || '',
          note: document.getElementById('prop_note')?.value || '',
          saveTransactionTo: document.getElementById('prop_saveTransactionTo')?.value || ''
        };
      },
      preview(data) {
        return data.gateId ? `💳 Gate #${data.gateId}` : '⚠️ Chưa chọn cổng';
      }
    },

    // TABLE DATA
    'table-data': {
      _tables: [],
      _columns: [],
      _savedData: null,
      
      render(block, data, context) {
        const self = BlockProperties.renderers['table-data'];
        
        console.log('🎨 table-data render():', {
          blockID: block?.blockID,
          tableID: data?.tableID,
          action: data?.action,
          conditions: data?.conditions?.length || 0,
          columnValues: data?.columnValues?.length || 0
        });
        
        // Log chi tiết columnValues
        if (data?.columnValues && data.columnValues.length > 0) {
          console.log('  📋 columnValues detail:');
          data.columnValues.forEach((v, i) => {
            console.log(`    [${i}] column=${v.column}, value=${v.value}`);
          });
        }
        
        self._savedData = data; // Lưu data để dùng sau khi load tables
        
        // Load tables on render
        setTimeout(() => self.loadTables(data.tableID), 100);
        
        const actionOptions = [
          { value: 'find', label: '🔍 Tìm kiếm dữ liệu' },
          { value: 'add', label: '➕ Thêm hàng mới' },
          { value: 'update', label: '✏️ Cập nhật dữ liệu' },
          { value: 'delete', label: '🗑️ Xóa dữ liệu' }
        ];

        // Pre-render conditions với placeholder
        let conditionsHtml = '<div class="text-muted" style="color:#999;font-size:12px;">Chưa có điều kiện.</div>';
        if (data.conditions && data.conditions.length > 0) {
          conditionsHtml = data.conditions.map((c, i) => self.renderConditionRowPlaceholder(c, i)).join('');
        }

        // Pre-render column values với placeholder
        let valuesHtml = '<div class="text-muted" style="color:#999;font-size:12px;">Chưa có giá trị.</div>';
        if (data.columnValues && data.columnValues.length > 0) {
          valuesHtml = data.columnValues.map((v, i) => self.renderValueRowPlaceholder(v, i)).join('');
        }

        return `
          <div class="property-group">
            <label class="property-label">📊 Bảng *</label>
            <select class="property-select" id="prop_tableID" onchange="BlockProperties.renderers['table-data'].onTableChange()">
              <option value="">-- Đang tải... --</option>
            </select>
          </div>

          <div class="property-group">
            <label class="property-label">⚡ Hành động</label>
            <select class="property-select" id="prop_action" onchange="BlockProperties.renderers['table-data'].onActionChange()">
              ${actionOptions.map(o => `<option value="${o.value}" ${data.action === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>

          <div id="columnsInfoPanel" style="display:none;background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:12px;margin:12px 0;">
            <label class="property-label" style="margin-bottom:8px;display:block;">📋 Các cột trong bảng:</label>
            <div id="columnsList" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
          </div>

          <div id="conditionsSection" style="display:${['find', 'update', 'delete'].includes(data.action) ? 'block' : 'none'};background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin:12px 0;">
            <label class="property-label">🔎 Điều kiện lọc</label>
            <div id="conditionsContainer">${conditionsHtml}</div>
            <button type="button" class="btn-add-item" onclick="BlockProperties.renderers['table-data'].addCondition()" style="margin-top:8px;padding:6px 12px;background:#e3f2fd;border:1px solid #90caf9;border-radius:4px;cursor:pointer;font-size:12px;">
              ➕ Thêm điều kiện
            </button>
          </div>

          <div id="valuesSection" style="display:${['add', 'update'].includes(data.action) ? 'block' : 'none'};background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin:12px 0;">
            <label class="property-label">📝 Giá trị thêm mới</label>
            <div class="property-hint" style="margin-bottom:10px;color:#666;font-size:12px;">
              💡 Dùng <code style="background:#e3f2fd;padding:2px 6px;border-radius:4px;">{tên_biến}</code> để chèn giá trị biến. VD: <code style="background:#e3f2fd;padding:2px 6px;border-radius:4px;">{phone}</code>, <code style="background:#e3f2fd;padding:2px 6px;border-radius:4px;">{sender_name}</code>
            </div>
            <div id="valuesContainer">${valuesHtml}</div>
            <button type="button" class="btn-add-item" onclick="BlockProperties.renderers['table-data'].addColumnValue()" style="margin-top:8px;padding:6px 12px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:4px;cursor:pointer;font-size:12px;">
              ➕ Thêm cột
            </button>
          </div>

          <div id="resultSection" style="display:${data.action === 'find' ? 'block' : 'none'};">
            <div class="property-group">
              <label class="property-label">💾 Lưu kết quả vào biến</label>
              <input type="text" class="property-input" id="prop_resultVariable" value="${data.resultVariable || 'table_result'}" placeholder="table_result">
            </div>
            <div class="property-group">
              <label class="property-label">🔢 Số kết quả tối đa</label>
              <input type="number" class="property-input" id="prop_limitResults" value="${data.limitResults || 1}" min="1" max="100">
            </div>
          </div>
        `;
      },

      // Render condition row với placeholder (chưa có columns)
      renderConditionRowPlaceholder(cond, idx) {
        const operators = [
          { value: 'equals', label: '= Bằng' },
          { value: 'not_equals', label: '≠ Khác' },
          { value: 'contains', label: '∋ Chứa' },
          { value: 'not_contains', label: '∌ Không chứa' },
          { value: 'is_empty', label: '∅ Rỗng' },
          { value: 'is_not_empty', label: '≠∅ Không rỗng' },
          { value: 'greater', label: '> Lớn hơn' },
          { value: 'less', label: '< Nhỏ hơn' }
        ];
        
        const escapedValue = BlockProperties.escapeHtml(cond?.value || '');
        const columnVal = cond?.column || '';
        console.log(`  🔧 renderConditionRowPlaceholder[${idx}]: column=${columnVal}, value=${cond?.value}`);
        
        return `
          <div class="condition-row" data-idx="${idx}" data-saved-column="${columnVal}" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;padding:8px;background:#fff;border-radius:6px;border:1px solid #e0e0e0;flex-wrap:wrap;">
            <select class="property-select cond-column" data-idx="${idx}" style="flex:2;min-width:120px;">
              <option value="${columnVal}">-- Đang tải... --</option>
            </select>
            <select class="property-select cond-operator" data-idx="${idx}" style="flex:1;min-width:100px;">
              ${operators.map(o => `<option value="${o.value}" ${cond?.operator === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
            <input type="text" class="property-input cond-value" data-idx="${idx}" value="${escapedValue}" placeholder="Giá trị/{biến}" style="flex:2;min-width:100px;">
            <button type="button" onclick="BlockProperties.renderers['table-data'].removeCondition(${idx})" style="background:#ffebee;border:none;color:#f44336;border-radius:4px;padding:4px 8px;cursor:pointer;flex-shrink:0;">✕</button>
          </div>
        `;
      },

      // Render value row với placeholder (chưa có columns)
      renderValueRowPlaceholder(val, idx) {
        const escapedValue = BlockProperties.escapeHtml(val?.value || '');
        const columnVal = val?.column || '';
        console.log(`  🔧 renderValueRowPlaceholder[${idx}]: column=${columnVal}, value=${val?.value}`);
        return `
          <div class="value-row" data-idx="${idx}" data-saved-column="${columnVal}" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;padding:8px;background:#fff;border-radius:6px;border:1px solid #e0e0e0;flex-wrap:wrap;">
            <select class="property-select val-column" data-idx="${idx}" style="flex:1;min-width:120px;">
              <option value="${columnVal}">-- Đang tải... --</option>
            </select>
            <input type="text" class="property-input val-value" data-idx="${idx}" value="${escapedValue}" placeholder="Giá trị/{biến}" style="flex:2;min-width:150px;">
            <button type="button" onclick="BlockProperties.renderers['table-data'].removeColumnValue(${idx})" style="background:#ffebee;border:none;color:#f44336;border-radius:4px;padding:4px 8px;cursor:pointer;flex-shrink:0;">✕</button>
          </div>
        `;
      },

      getColumnOptions(selectedColumnID) {
        if (!this._columns || this._columns.length === 0) {
          return '<option value="">-- Chưa có cột --</option>';
        }
        return '<option value="">-- Chọn cột --</option>' + 
          this._columns.map(c => 
            `<option value="${c.columnID}" ${String(selectedColumnID) === String(c.columnID) ? 'selected' : ''}>${c.columnName}</option>`
          ).join('');
      },

      renderConditionRow(cond, idx) {
        const operators = [
          { value: 'equals', label: '= Bằng' },
          { value: 'not_equals', label: '≠ Khác' },
          { value: 'contains', label: '∋ Chứa' },
          { value: 'not_contains', label: '∌ Không chứa' },
          { value: 'is_empty', label: '∅ Rỗng' },
          { value: 'is_not_empty', label: '≠∅ Không rỗng' },
          { value: 'greater', label: '> Lớn hơn' },
          { value: 'less', label: '< Nhỏ hơn' }
        ];
        
        return `
          <div class="condition-row" data-idx="${idx}" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;padding:8px;background:#fff;border-radius:6px;border:1px solid #e0e0e0;flex-wrap:wrap;">
            <select class="property-select cond-column" data-idx="${idx}" style="flex:2;min-width:120px;">
              ${this.getColumnOptions(cond?.column)}
            </select>
            <select class="property-select cond-operator" data-idx="${idx}" style="flex:1;min-width:100px;">
              ${operators.map(o => `<option value="${o.value}" ${cond?.operator === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
            <input type="text" class="property-input cond-value" data-idx="${idx}" value="${BlockProperties.escapeHtml(cond?.value || '')}" placeholder="Giá trị/{biến}" style="flex:2;min-width:100px;">
            <button type="button" onclick="BlockProperties.renderers['table-data'].removeCondition(${idx})" style="background:#ffebee;border:none;color:#f44336;border-radius:4px;padding:4px 8px;cursor:pointer;flex-shrink:0;">✕</button>
          </div>
        `;
      },

      renderValueRow(val, idx) {
        return `
          <div class="value-row" data-idx="${idx}" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;padding:8px;background:#fff;border-radius:6px;border:1px solid #e0e0e0;flex-wrap:wrap;">
            <select class="property-select val-column" data-idx="${idx}" style="flex:1;min-width:120px;">
              ${this.getColumnOptions(val?.column)}
            </select>
            <input type="text" class="property-input val-value" data-idx="${idx}" value="${BlockProperties.escapeHtml(val?.value || '')}" placeholder="Giá trị/{biến}" style="flex:2;min-width:150px;">
            <button type="button" onclick="BlockProperties.renderers['table-data'].removeColumnValue(${idx})" style="background:#ffebee;border:none;color:#f44336;border-radius:4px;padding:4px 8px;cursor:pointer;flex-shrink:0;">✕</button>
          </div>
        `;
      },

      loadTables(selectedTableID) {
        const self = this;
        console.log('🔄 loadTables called, selectedTableID:', selectedTableID);
        console.log('  _savedData:', this._savedData);
        
        if (window.ws && ws.readyState === WebSocket.OPEN) {
          const handler = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'tables_list') {
                ws.removeEventListener('message', handler);
                self._tables = data.tables || [];
                console.log('📊 Tables loaded:', self._tables.length);
                self.populateTableSelect(selectedTableID);
              }
            } catch (e) {
              console.error('Load tables error:', e);
            }
          };
          ws.addEventListener('message', handler);
          ws.send(JSON.stringify({ type: 'get_tables' }));
        } else {
          console.warn('⚠️ WebSocket not ready');
        }
      },

      populateTableSelect(selectedTableID) {
        const select = document.getElementById('prop_tableID');
        if (!select) return;
        
        console.log('📋 populateTableSelect:', selectedTableID);
        
        select.innerHTML = '<option value="">-- Chọn bảng --</option>' + 
          this._tables.map(t => 
            `<option value="${t.tableID}" ${String(t.tableID) === String(selectedTableID) ? 'selected' : ''}>
              ${t.tableName} (${t.rows?.length || 0} hàng)
            </option>`
          ).join('');

        // Nếu đã có bảng được chọn, load columns và render lại conditions/values
        if (selectedTableID) {
          const table = this._tables.find(t => String(t.tableID) === String(selectedTableID));
          if (table) {
            this._columns = table.columns || [];
            this.updateColumnsInfo();
            this.renderExistingData();
          }
        }
      },

      // Update dropdowns sau khi có columns - KHÔNG xóa dữ liệu đã nhập
      renderExistingData() {
        const data = this._savedData;
        console.log('📋 renderExistingData - Updating dropdowns only');
        
        // Chỉ update các dropdown columns, không render lại toàn bộ
        this.updateColumnDropdowns();
      },

      onTableChange() {
        const select = document.getElementById('prop_tableID');
        const tableID = select?.value;
        const table = this._tables.find(t => String(t.tableID) === String(tableID));
        
        if (table) {
          this._columns = table.columns || [];
        } else {
          this._columns = [];
        }
        
        this.updateColumnsInfo();
        this.updateColumnDropdowns();
      },

      onActionChange() {
        const action = document.getElementById('prop_action')?.value;
        document.getElementById('conditionsSection').style.display = ['find', 'update', 'delete'].includes(action) ? 'block' : 'none';
        document.getElementById('valuesSection').style.display = ['add', 'update'].includes(action) ? 'block' : 'none';
        document.getElementById('resultSection').style.display = action === 'find' ? 'block' : 'none';
      },

      updateColumnsInfo() {
        const panel = document.getElementById('columnsInfoPanel');
        const list = document.getElementById('columnsList');
        
        if (this._columns.length > 0) {
          panel.style.display = 'block';
          list.innerHTML = this._columns.map(c => `
            <span style="background:#fff;border:1px solid #90caf9;border-radius:16px;padding:4px 12px;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
              📌 ${c.columnName} <span style="background:#e0e0e0;border-radius:4px;padding:1px 6px;font-size:10px;color:#666;">${c.columnType || 'text'}</span>
            </span>
          `).join('');
        } else {
          panel.style.display = 'none';
        }
      },

      updateColumnDropdowns() {
        console.log('🔄 updateColumnDropdowns called, columns:', this._columns?.length || 0);
        
        // Update condition dropdowns - giữ lại giá trị đã lưu
        document.querySelectorAll('.cond-column').forEach((select, i) => {
          const row = select.closest('.condition-row');
          const savedColumn = row?.dataset?.savedColumn;
          const currentVal = select.value || savedColumn || '';
          console.log(`  Condition ${i}: savedColumn=${savedColumn}, currentVal=${currentVal}`);
          select.innerHTML = this.getColumnOptions(currentVal);
        });
        
        // Update value dropdowns - giữ lại giá trị đã lưu  
        document.querySelectorAll('.val-column').forEach((select, i) => {
          const row = select.closest('.value-row');
          const savedColumn = row?.dataset?.savedColumn;
          const currentVal = select.value || savedColumn || '';
          console.log(`  Value ${i}: savedColumn=${savedColumn}, currentVal=${currentVal}, rowDataset=${JSON.stringify(row?.dataset)}`);
          select.innerHTML = this.getColumnOptions(currentVal);
        });
      },

      addCondition() {
        // Kiểm tra đã chọn bảng chưa
        if (!this._columns || this._columns.length === 0) {
          this.showNotice('⚠️ Vui lòng chọn bảng trước khi thêm điều kiện!', 'warning');
          return;
        }
        
        const container = document.getElementById('conditionsContainer');
        if (!container) return;
        
        // Remove empty message
        const emptyMsg = container.querySelector('.text-muted');
        if (emptyMsg) emptyMsg.remove();
        
        const idx = container.querySelectorAll('.condition-row').length;
        container.insertAdjacentHTML('beforeend', this.renderConditionRow({}, idx));
      },

      removeCondition(idx) {
        const self = this;
        this.showConfirm('🗑️ Xóa điều kiện', 'Bạn có chắc muốn xóa điều kiện này?', () => {
          const container = document.getElementById('conditionsContainer');
          if (!container) return;
          
          const row = container.querySelector(`.condition-row[data-idx="${idx}"]`);
          if (row) row.remove();
          
          // Re-index
          container.querySelectorAll('.condition-row').forEach((r, i) => {
            r.dataset.idx = i;
            r.querySelectorAll('[data-idx]').forEach(el => el.dataset.idx = i);
          });
          
          if (container.querySelectorAll('.condition-row').length === 0) {
            container.innerHTML = '<div class="text-muted" style="color:#999;font-size:12px;">Chưa có điều kiện.</div>';
          }
        });
      },

      addColumnValue() {
        // Kiểm tra đã chọn bảng chưa
        if (!this._columns || this._columns.length === 0) {
          this.showNotice('⚠️ Vui lòng chọn bảng trước khi thêm giá trị cột!', 'warning');
          return;
        }
        
        const container = document.getElementById('valuesContainer');
        if (!container) return;
        
        // Remove empty message
        const emptyMsg = container.querySelector('.text-muted');
        if (emptyMsg) emptyMsg.remove();
        
        const idx = container.querySelectorAll('.value-row').length;
        container.insertAdjacentHTML('beforeend', this.renderValueRow({}, idx));
      },

      removeColumnValue(idx) {
        const self = this;
        this.showConfirm('🗑️ Xóa giá trị', 'Bạn có chắc muốn xóa giá trị cột này?', () => {
          const container = document.getElementById('valuesContainer');
          if (!container) return;
          
          const row = container.querySelector(`.value-row[data-idx="${idx}"]`);
          if (row) row.remove();
          
          // Re-index
          container.querySelectorAll('.value-row').forEach((r, i) => {
            r.dataset.idx = i;
            r.querySelectorAll('[data-idx]').forEach(el => el.dataset.idx = i);
          });
          
          if (container.querySelectorAll('.value-row').length === 0) {
            container.innerHTML = '<div class="text-muted" style="color:#999;font-size:12px;">Chưa có giá trị.</div>';
          }
        });
      },

      // Helper: Show notice
      showNotice(message, type = 'info') {
        const colors = {
          info: { bg: '#e3f2fd', border: '#90caf9', text: '#1976d2' },
          warning: { bg: '#fff3e0', border: '#ffb74d', text: '#f57c00' },
          error: { bg: '#ffebee', border: '#ef9a9a', text: '#d32f2f' },
          success: { bg: '#e8f5e9', border: '#a5d6a7', text: '#388e3c' }
        };
        const color = colors[type] || colors.info;
        
        // Remove existing notice
        const existing = document.getElementById('tableDataNotice');
        if (existing) existing.remove();
        
        const notice = document.createElement('div');
        notice.id = 'tableDataNotice';
        notice.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: ${color.bg};
          border: 1px solid ${color.border};
          color: ${color.text};
          padding: 12px 20px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 10000;
          font-size: 14px;
          animation: slideIn 0.3s ease;
        `;
        notice.innerHTML = message;
        document.body.appendChild(notice);
        
        setTimeout(() => {
          notice.style.animation = 'slideOut 0.3s ease';
          setTimeout(() => notice.remove(), 300);
        }, 3000);
      },

      // Helper: Show confirm modal
      showConfirm(title, message, onConfirm) {
        // Remove existing modal
        const existing = document.getElementById('tableDataConfirmModal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'tableDataConfirmModal';
        modal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10001;
          animation: fadeIn 0.2s ease;
        `;
        
        modal.innerHTML = `
          <div style="
            background: white;
            border-radius: 12px;
            padding: 24px;
            min-width: 320px;
            max-width: 400px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            animation: scaleIn 0.2s ease;
          ">
            <h3 style="margin: 0 0 12px 0; font-size: 18px; color: #333;">${title}</h3>
            <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">${message}</p>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
              <button id="confirmCancel" style="
                padding: 10px 20px;
                border: 1px solid #e0e0e0;
                background: white;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                color: #666;
              ">Hủy</button>
              <button id="confirmOk" style="
                padding: 10px 20px;
                border: none;
                background: #f44336;
                color: white;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
              ">Xóa</button>
            </div>
          </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add CSS animations if not exists
        if (!document.getElementById('tableDataModalStyles')) {
          const style = document.createElement('style');
          style.id = 'tableDataModalStyles';
          style.textContent = `
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100px); opacity: 0; } }
          `;
          document.head.appendChild(style);
        }
        
        // Event handlers
        document.getElementById('confirmCancel').onclick = () => modal.remove();
        document.getElementById('confirmOk').onclick = () => {
          modal.remove();
          if (onConfirm) onConfirm();
        };
        modal.onclick = (e) => {
          if (e.target === modal) modal.remove();
        };
      },

      save() {
        const tableSelect = document.getElementById('prop_tableID');
        const selectedTableID = tableSelect?.value;
        const table = this._tables.find(t => String(t.tableID) === String(selectedTableID));
        
        // Collect conditions - lưu tất cả dòng có column hoặc value
        const conditions = [];
        document.querySelectorAll('#conditionsContainer .condition-row').forEach((row, i) => {
          const column = row.querySelector('.cond-column')?.value || '';
          const operator = row.querySelector('.cond-operator')?.value || 'equals';
          const value = row.querySelector('.cond-value')?.value || '';
          console.log(`  💾 Condition ${i}: column=${column}, operator=${operator}, value=${value}`);
          // Lưu nếu có column HOẶC có value
          if (column || value) {
            conditions.push({ column, operator, value });
          }
        });

        // Collect column values - lưu tất cả dòng có column hoặc value
        const columnValues = [];
        document.querySelectorAll('#valuesContainer .value-row').forEach((row, i) => {
          const column = row.querySelector('.val-column')?.value || '';
          const value = row.querySelector('.val-value')?.value || '';
          console.log(`  💾 Value ${i}: column=${column}, value=${value}`);
          // Lưu nếu có column HOẶC có value
          if (column || value) {
            columnValues.push({ column, value });
          }
        });

        console.log('💾 Saving table-data:', { tableID: selectedTableID, conditions: conditions.length, columnValues: columnValues.length });
        console.log('  columnValues detail:', JSON.stringify(columnValues));

        return {
          tableID: selectedTableID ? parseInt(selectedTableID) : null,
          tableName: table?.tableName || '',
          action: document.getElementById('prop_action')?.value || 'find',
          conditions,
          columnValues,
          resultVariable: document.getElementById('prop_resultVariable')?.value || 'table_result',
          limitResults: parseInt(document.getElementById('prop_limitResults')?.value) || 1
        };
      },

      preview(data) {
        const actions = { find: '🔍 Tìm', add: '➕ Thêm', update: '✏️ Sửa', delete: '🗑️ Xóa' };
        const tableName = data?.tableName || 'Chưa chọn bảng';
        return `${actions[data?.action] || '📊'} ${tableName}`;
      }
    }
  },

  // Question helpers for user-input
  addQuestion() {
    const container = document.getElementById('questionsContainer');
    const items = container.querySelectorAll('.question-item');
    const newIdx = items.length;
    const inputTypes = window.INPUT_TYPES || [
      { value: 'none', label: 'Bất kỳ' },
      { value: 'text', label: 'Văn bản' },
      { value: 'number', label: 'Số' },
      { value: 'phone', label: 'SĐT' },
      { value: 'email', label: 'Email' }
    ];
    
    const html = `
      <div class="question-item" data-idx="${newIdx}" style="background:#f5f7fa;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-weight:600;font-size:12px;color:#666;">Câu hỏi ${newIdx + 1}</span>
          <button type="button" onclick="BlockProperties.removeQuestion(${newIdx})" style="background:#ffebee;border:none;color:#f44336;width:24px;height:24px;border-radius:50%;cursor:pointer;">✕</button>
        </div>
        <div class="property-group" style="margin-bottom:8px;">
          <textarea class="property-input q-msg" data-idx="${newIdx}" rows="2" placeholder="Tin nhắn..."></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 60px 1fr;gap:6px;margin-bottom:8px;">
          <select class="property-select q-type" data-idx="${newIdx}">
            ${inputTypes.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
          <input type="number" class="property-input q-retry" data-idx="${newIdx}" value="2" min="0" max="10" title="Số lần thử">
          <input class="property-input q-var" data-idx="${newIdx}" placeholder="Lưu vào biến">
        </div>
        <input class="property-input q-retry-msg" data-idx="${newIdx}" placeholder="Tin nhắn khi nhập sai">
      </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
  },

  removeQuestion(idx) {
    const items = document.querySelectorAll('.question-item');
    if (items.length > 1 && items[idx]) {
      items[idx].remove();
      // Re-index
      document.querySelectorAll('.question-item').forEach((item, i) => {
        item.dataset.idx = i;
        item.querySelector('span').textContent = `Câu hỏi ${i + 1}`;
      });
    }
  },

  // Get renderer for block type
  getRenderer(blockType) {
    return this.renderers[blockType] || null;
  },

  // Render properties form
  renderForm(block, context) {
    const renderer = this.getRenderer(block.blockType);
    if (!renderer) {
      return '<div class="property-info">Đang phát triển...</div>';
    }
    return renderer.render(block, block.blockData || {}, context);
  },

  // Save properties
  saveForm(blockType) {
    const renderer = this.getRenderer(blockType);
    if (!renderer) return {};
    
    const data = renderer.save();
    const extra = renderer.saveExtra ? renderer.saveExtra() : {};
    
    return { blockData: data, ...extra };
  },

  // Get preview text
  getPreview(blockType, data) {
    const renderer = this.getRenderer(blockType);
    if (!renderer || !renderer.preview) {
      return '';
    }
    return renderer.preview(data);
  }
};

// Export
if (typeof window !== 'undefined') {
  window.BlockProperties = BlockProperties;
}