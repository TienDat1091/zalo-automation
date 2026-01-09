(function() {
  'use strict';

  // Global function to load email senders
  window.loadEmailSendersDropdown = function(selectId, currentValue) {
    const select = document.getElementById(selectId);
    if (!select) {
      console.warn('❌ Select element not found:', selectId);
      return;
    }

    console.log('🔄 Loading email senders for:', selectId, 'current value:', currentValue);
    select.innerHTML = '<option value="">⏳ Đang tải...</option>';

    fetch('http://localhost:3000/api/email/senders', { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(data => {
        console.log('✅ Senders loaded:', data);
        select.innerHTML = '<option value="">-- Chọn tài khoản --</option>';

        if (data.senders && data.senders.length > 0) {
          data.senders.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.email + (s.displayName ? ' (' + s.displayName + ')' : '');
            if (s.id == currentValue || s.id === parseInt(currentValue)) {
              opt.selected = true;
            }
            select.appendChild(opt);
          });
          console.log('✅ Added ' + data.senders.length + ' senders');
        } else {
          select.innerHTML += '<option disabled style="color:#999;">Chưa có tài khoản</option>';
        }
      })
      .catch(e => {
        console.error('❌ Error loading senders:', e);
        select.innerHTML = '<option disabled>❌ Lỗi: ' + e.message + '</option>';
      });
  };

  FlowBuilder.registerBlock('send-email', {
    type: 'send-email',
    name: 'Gửi Email',
    desc: 'Gửi email đến địa chỉ được chỉ định',
    icon: '📧',
    category: 'message',
    color: '#e3f2fd',

    defaultData: {
      senderProfileId: null,
      recipientType: 'fixed',
      recipientFixed: '',
      recipientVariable: '',
      subject: '',
      bodyType: 'text',
      bodyContent: '',
      enabled: true
    },

    renderForm: function(block, data, context) {
      data = data || {};
      const blockId = block?.id || 'block_' + Date.now();

      var html = '';

      // Sender Profile selection
      html += '<div class="property-group">';
      html += '<label class="property-label">Tài khoản gửi <span class="required">*</span></label>';
      html += '<div style="display:flex;gap:8px;">';
      html += '<select class="property-select" id="sender_' + blockId + '" data-block-id="' + blockId + '" style="flex:1;padding:10px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;background:white;cursor:pointer;">';
      html += '<option value="">-- Chọn tài khoản --</option>';
      html += '</select>';
      html += '<button type="button" class="property-btn" style="padding:10px 12px;background:#667eea;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap;" onclick="window.loadEmailSendersDropdown(\'sender_' + blockId + '\', ' + JSON.stringify(data.senderProfileId) + ')">🔄 Reload</button>';
      html += '</div>';
      html += '<small style="color:#666;display:block;margin-top:4px;">⚙️ <a href="../public/email-manager.html" target="_blank" style="color:#0084ff;text-decoration:none;">Quản lý tài khoản email</a></small>';
      html += '</div>';

      // Auto-load senders on render
      html += '<script>setTimeout(() => { window.loadEmailSendersDropdown("sender_' + blockId + '", ' + JSON.stringify(data.senderProfileId) + '); }, 50);</script>';

      // Recipient type toggle
      html += '<div class="property-group">';
      html += '<label class="property-label">Người nhận</label>';
      html += '<div style="display:flex;gap:8px;margin-bottom:8px;">';
      html += '<button type="button" class="property-tab-btn" onclick="window.switchEmailRecipientType(\'fixed\', \'' + blockId + '\')" style="padding:8px 12px;border:1px solid #0084ff;background:#0084ff;color:white;border-radius:4px;cursor:pointer;font-size:12px;">Nhập trực tiếp</button>';
      html += '<button type="button" class="property-tab-btn" onclick="window.switchEmailRecipientType(\'variable\', \'' + blockId + '\')" style="padding:8px 12px;border:1px solid #e0e0e0;background:white;color:#333;border-radius:4px;cursor:pointer;font-size:12px;">Từ biến</button>';
      html += '</div>';

      var showFixed = data.recipientType !== 'variable' ? '' : 'none';
      var showVariable = data.recipientType === 'variable' ? '' : 'none';

      html += '<input type="text" class="property-input" id="recipient_fixed_' + blockId + '" data-block-id="' + blockId + '" placeholder="email@example.com" value="' + FlowBuilder.escapeHtml(data.recipientFixed || '') + '" style="display:' + showFixed + ';padding:10px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;background:white;color:#333;width:100%;" />';
      html += '<input type="text" class="property-input" id="recipient_var_' + blockId + '" data-block-id="' + blockId + '" placeholder="tên_biến_email" value="' + FlowBuilder.escapeHtml(data.recipientVariable || '') + '" style="display:' + showVariable + ';padding:10px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;background:white;color:#333;width:100%;" />';
      html += '</div>';

      // Subject
      html += '<div class="property-group">';
      html += '<label class="property-label">Chủ đề email <span class="required">*</span></label>';
      html += '<input type="text" class="property-input" id="email_subject_' + blockId + '" data-block-id="' + blockId + '" value="' + FlowBuilder.escapeHtml(data.subject || '') + '" placeholder="Chủ đề email..." style="padding:10px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;background:white;color:#333;" />';
      html += '<small style="color:#666;display:block;margin-top:4px;">💡 Hỗ trợ biến: {sender_name}, {recipient_email}, v.v...</small>';
      html += '</div>';

      // Email body
      html += '<div class="property-group">';
      html += '<label class="property-label">Nội dung email</label>';
      html += '<div style="display:flex;gap:8px;margin-bottom:8px;">';
      html += '<button type="button" class="property-tab-btn" onclick="window.switchEmailBodyType(\'text\', \'' + blockId + '\')" style="padding:8px 12px;border:1px solid #0084ff;background:#0084ff;color:white;border-radius:4px;cursor:pointer;font-size:12px;">Văn bản</button>';
      html += '<button type="button" class="property-tab-btn" onclick="window.switchEmailBodyType(\'template\', \'' + blockId + '\')" style="padding:8px 12px;border:1px solid #e0e0e0;background:white;color:#333;border-radius:4px;cursor:pointer;font-size:12px;">Mẫu HTML</button>';
      html += '</div>';

      var showText = data.bodyType !== 'template' ? '' : 'none';
      var showTemplate = data.bodyType === 'template' ? '' : 'none';

      html += '<textarea class="property-input" id="email_body_text_' + blockId + '" data-block-id="' + blockId + '" placeholder="Nội dung email..." style="display:' + showText + ';padding:10px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;background:white;color:#333;width:100%;height:120px;font-family:monospace;resize:vertical;">' + FlowBuilder.escapeHtml(data.bodyContent || '') + '</textarea>';
      html += '<textarea class="property-input" id="email_body_template_' + blockId + '" data-block-id="' + blockId + '" placeholder="HTML template..." style="display:' + showTemplate + ';padding:10px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;background:white;color:#333;width:100%;height:120px;font-family:monospace;resize:vertical;">' + (data.bodyType === 'template' ? FlowBuilder.escapeHtml(data.bodyContent || '') : '') + '</textarea>';
      html += '<small style="color:#666;display:block;margin-top:4px;">💡 Hỗ trợ HTML tags và biến</small>';
      html += '</div>';

      // Hidden input to store blockId
      html += '<input type="hidden" id="block_id_' + blockId + '" value="' + blockId + '" />';

      // Global functions for toggling
      html += '<script>';
      html += 'window.switchEmailRecipientType = function(type, blockId) {';
      html += '  const fixed = document.getElementById("recipient_fixed_" + blockId);';
      html += '  const variable = document.getElementById("recipient_var_" + blockId);';
      html += '  if (fixed) fixed.style.display = type === "fixed" ? "" : "none";';
      html += '  if (variable) variable.style.display = type === "variable" ? "" : "none";';
      html += '};';
      html += 'window.switchEmailBodyType = function(type, blockId) {';
      html += '  const text = document.getElementById("email_body_text_" + blockId);';
      html += '  const template = document.getElementById("email_body_template_" + blockId);';
      html += '  if (text) text.style.display = type === "text" ? "" : "none";';
      html += '  if (template) template.style.display = type === "template" ? "" : "none";';
      html += '  document.getElementById("email_body_template_" + blockId).style.display = type === "template" ? "" : "none";';
      html += '};';
      html += '</script>';

      return html;
    },

    saveForm: function() {
      try {
        // Find blockId from all input elements with data-block-id attribute
        const allElements = document.querySelectorAll('[data-block-id]');
        let blockId = null;
        
        if (allElements.length > 0) {
          // Get the last one (most recently rendered)
          blockId = allElements[allElements.length - 1].getAttribute('data-block-id');
        }

        if (!blockId) {
          console.warn('⚠️ Cannot find blockId from data-block-id, trying alternative method');
          // Alternative: try to find from sender select with id pattern
          const senderSelects = document.querySelectorAll('select[id^="sender_"]');
          if (senderSelects.length > 0) {
            const senderId = senderSelects[senderSelects.length - 1].id; // "sender_block_xxx"
            blockId = senderId.replace('sender_', ''); // "block_xxx"
          }
        }

        if (!blockId) {
          console.error('❌ Cannot find blockId at all');
          return null;
        }

        console.log('📧 Saving block with blockId:', blockId);

        var senderSelect = document.getElementById('sender_' + blockId);
        var senderProfileIdStr = senderSelect?.value;
        var senderProfileId = senderProfileIdStr ? parseInt(senderProfileIdStr) : null;

        var recipientFixed = document.getElementById('recipient_fixed_' + blockId)?.value || '';
        var recipientVariable = document.getElementById('recipient_var_' + blockId)?.value || '';
        var subject = document.getElementById('email_subject_' + blockId)?.value || '';

        var propRecipientFixed = document.getElementById('recipient_fixed_' + blockId);
        var propBodyText = document.getElementById('email_body_text_' + blockId);
        var propBodyTemplate = document.getElementById('email_body_template_' + blockId);

        // Determine recipient type
        var recipientType = (propRecipientFixed && propRecipientFixed.style.display === 'none') ? 'variable' : 'fixed';
        // Determine body type
        var bodyType = (propBodyTemplate && propBodyTemplate.style.display === 'none') ? 'text' : 'template';

        var bodyContent = '';
        if (bodyType === 'text' && propBodyText) {
          bodyContent = propBodyText.value || '';
        } else if (bodyType === 'template' && propBodyTemplate) {
          bodyContent = propBodyTemplate.value || '';
        }

        console.log('📧 Save Email Block:', {
          blockId: blockId,
          senderProfileId: senderProfileId,
          senderEmail: senderSelect?.options[senderSelect?.selectedIndex]?.text,
          recipientType: recipientType,
          recipientFixed: recipientFixed,
          recipientVariable: recipientVariable,
          subject: subject,
          bodyType: bodyType
        });

        return {
          blockData: {
            senderProfileId: senderProfileId,
            recipientType: recipientType,
            recipientFixed: recipientFixed,
            recipientVariable: recipientVariable,
            subject: subject,
            bodyType: bodyType,
            bodyContent: bodyContent,
            enabled: true
          }
        };
      } catch (error) {
        console.error('❌ Error saving email block:', error);
        return null;
      }
    },

    preview: function(data) {
      if (!data || !data.senderProfileId || !data.subject) return '⚠️ Chưa cấu hình';
      var recipientLabel = data.recipientType === 'variable'
        ? ('{' + data.recipientVariable + '}')
        : data.recipientFixed.substring(0, 20);
      return '📧 To: ' + recipientLabel + ' | Subj: ' + data.subject.substring(0, 20) + '...';
    }
  });

})();
