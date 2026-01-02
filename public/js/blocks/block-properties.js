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
