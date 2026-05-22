// public/blocks/payment-hub.js
// Block: Payment Hub - Cổng thanh toán với auto-transaction creation
// Enhanced version with validation, timeout, and statistics

(function () {
  'use strict';

  // Helper functions
  window.togglePaymentAmountSource = function () {
    var type = document.getElementById('prop_amountSource');
    if (!type) return;

    var varGroup = document.getElementById('amountVariableGroup');

    if (varGroup) varGroup.style.display = type.value === 'variable' ? 'block' : 'none';
  };

  window.togglePaymentNoteSource = function () {
    var type = document.getElementById('prop_noteSource');
    if (!type) return;

    var textGroup = document.getElementById('noteTextGroup');
    var varGroup = document.getElementById('noteVariableGroup');

    if (textGroup) textGroup.style.display = type.value === 'text' ? 'block' : 'none';
    if (varGroup) varGroup.style.display = type.value === 'variable' ? 'block' : 'none';
  };

  window.togglePaymentSuccessType = function () {
    var type = document.getElementById('prop_successType');
    if (!type) return;

    var textGroup = document.getElementById('successTextGroup');
    var varGroup = document.getElementById('successVarGroup');
    var flowGroup = document.getElementById('successFlowGroup');

    if (textGroup) textGroup.style.display = type.value === 'text' ? 'block' : 'none';
    if (varGroup) varGroup.style.display = type.value === 'variable' ? 'block' : 'none';
    if (flowGroup) flowGroup.style.display = type.value === 'flow' ? 'block' : 'none';
  };

  window.togglePaymentFailureType = function () {
    var type = document.getElementById('prop_failureType');
    if (!type) return;

    var textGroup = document.getElementById('failureTextGroup');
    var varGroup = document.getElementById('failureVarGroup');
    var flowGroup = document.getElementById('failureFlowGroup');

    if (textGroup) textGroup.style.display = type.value === 'text' ? 'block' : 'none';
    if (varGroup) varGroup.style.display = type.value === 'variable' ? 'block' : 'none';
    if (flowGroup) flowGroup.style.display = type.value === 'flow' ? 'block' : 'none';
  };

  window.refreshPaymentGates = function () {
    console.log('🔄 Refreshing payment gates...');
    if (window.FlowBuilder && window.FlowBuilder.loadPaymentGates) {
      window.FlowBuilder.loadPaymentGates().then(function () {
        var currentBlock = window.FlowBuilder.selectedBlock;
        if (currentBlock && currentBlock.type === 'payment-hub') {
          window.FlowBuilder.showBlockProperties(currentBlock);
        }
        showAlert('✅ Đã tải lại danh sách cổng thanh toán!');
      });
    } else {
      showAlert('⚠️ Không thể tải lại. Vui lòng refresh trang.');
    }
  };

  FlowBuilder.registerBlock('payment-hub', {
    type: 'payment-hub',
    name: 'Cổng thanh toán',
    desc: 'Tạo thanh toán tự động với theo dõi & timeout',
    icon: '💳',
    category: 'action',
    color: '#fff9c4',

    defaultData: {
      useDefaultGate: true,
      gateID: null,
      amountSource: 'variable',
      amountVariable: 'amount',
      noteSource: 'text',
      noteText: 'Thanh toán đơn hàng',
      noteVariable: '',
      saveTransactionTo: 'transaction_code',
      timeoutMinutes: 10,
      successType: 'text',
      successText: '✅ Thanh toán thành công! Cảm ơn bạn đã thanh toán {amount} VNĐ.',
      successVariable: '',
      successFlow: null,
      failureType: 'text',
      failureText: '❌ Thanh toán thất bại hoặc hết hạn. Vui lòng thử lại.',
      failureVariable: '',
      failureFlow: null,
      stopOnFailure: false
    },

    renderForm: function (block, data, context) {
      var gates = window.paymentGates || [];
      var flows = window.allFlows || [];

      var html = '';

      // Payment Gate Selection
      html += '<div class="property-group">';
      html += '<label class="property-label">Cổng thanh toán <span class="required">*</span></label>';
      html += '<div style="margin-bottom:8px;">';
      html += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">';
      html += '<input type="checkbox" id="prop_useDefaultGate" ' + (data.useDefaultGate !== false ? 'checked' : '') + '>';
      html += '<span style="font-size:14px;">Dùng cổng mặc định (được đánh dấu ⭐ trong Bank Manager)</span>';
      html += '</label>';
      html += '</div>';
      html += '<div style="display:flex;gap:8px;">';
      html += '<select class="property-select" id="prop_gateID" style="flex:1" ' + (data.useDefaultGate !== false ? 'disabled' : '') + '>';
      html += '<option value="">-- Chọn cổng --</option>';
      gates.forEach(function (g) {
        var selected = data.gateID == g.gateID ? 'selected' : '';
        var isDefault = g.isDefault ? ' ⭐' : '';
        html += '<option value="' + g.gateID + '" ' + selected + '>' + FlowBuilder.escapeHtml(g.gateName) + isDefault + '</option>';
      });
      html += '</select>';
      html += '<button type="button" onclick="refreshPaymentGates()" class="btn-icon" style="padding:8px 12px;background:#1976d2;color:white;border:none;border-radius:6px;cursor:pointer;" title="Tải lại">🔄</button>';
      html += '</div>';
      html += '<div class="property-hint">💡 Nếu bỏ tick "Dùng cổng mặc định", hãy chọn cổng cụ thể bên dưới</div>';
      html += '</div>';

      // Amount (MUST be from variable)
      html += '<div class="property-group" style="background:#fff3e0;padding:16px;border-radius:8px;border-left:4px solid #ff9800;">';
      html += '<label class="property-label">💰 Số tiền (VNĐ) <span class="required">*</span></label>';
      html += '<div style="margin-bottom:8px;font-size:13px;color:#666;">⚠️ Bắt buộc nhập từ biến. Hệ thống sẽ validate giá trị.</div>';
      html += '<input class="property-input" id="prop_amountVariable" value="' + FlowBuilder.escapeHtml(data.amountVariable || 'amount') + '" placeholder="amount">';
      html += '<div class="property-hint">Ví dụ: <code>amount</code>, <code>total_price</code>. Biến phải chứa số nguyên dương.</div>';
      html += '</div>';

      // Customer Info (Auto from context)
      html += '<div class="property-group" style="background:#e3f2fd;padding:12px;border-radius:8px;">';
      html += '<div style="font-weight:600;margin-bottom:8px;">👤 Thông tin khách hàng</div>';
      html += '<div style="font-size:12px;color:#666;">';
      html += '🔹 <strong>User ID:</strong> Tự động lấy từ <code>sender_id</code> (Zalo/Bot)<br>';
      html += '🔹 <strong>Tên KH:</strong> Tự động lấy từ <code>zalo_name</code> hoặc <code>sender_name</code>';
      html += '</div>';
      html += '</div>';

      // Payment Note/Content
      html += '<div class="property-group">';
      html += '<label class="property-label">📝 Nội dung thanh toán</label>';
      html += '<select class="property-select" id="prop_noteSource" onchange="togglePaymentNoteSource()">';
      html += '<option value="text" ' + (data.noteSource === 'text' || !data.noteSource ? 'selected' : '') + '>Văn bản cố định</option>';
      html += '<option value="variable" ' + (data.noteSource === 'variable' ? 'selected' : '') + '>Từ biến</option>';
      html += '</select>';
      html += '</div>';

      html += '<div class="property-group" id="noteTextGroup" style="' + (data.noteSource === 'variable' ? 'display:none;' : '') + '">';
      html += '<textarea class="property-input" id="prop_noteText" rows="2" placeholder="Thanh toán đơn hàng...">' + FlowBuilder.escapeHtml(data.noteText || '') + '</textarea>';
      html += '</div>';

      html += '<div class="property-group" id="noteVariableGroup" style="' + (data.noteSource !== 'variable' ? 'display:none;' : '') + '">';
      html += '<input class="property-input" id="prop_noteVariable" value="' + FlowBuilder.escapeHtml(data.noteVariable || '') + '" placeholder="note_text">';
      html += '</div>';

      // Timeout
      html += '<div class="property-group">';
      html += '<label class="property-label">⏱️ Thời gian chờ thanh toán (phút)</label>';
      html += '<input type="number" class="property-input" id="prop_timeoutMinutes" value="' + (data.timeoutMinutes || 10) + '" min="1" max="60">';
      html += '<div class="property-hint">Tự động hủy giao dịch và chạy nhánh thất bại nếu không thanh toán trong thời gian này</div>';
      html += '</div>';

      // Save Transaction Code
      html += '<div class="property-group">';
      html += '<label class="property-label">💾 Lưu mã giao dịch vào biến</label>';
      html += '<input class="property-input" id="prop_saveTransactionTo" value="' + FlowBuilder.escapeHtml(data.saveTransactionTo || 'transaction_code') + '" placeholder="transaction_code">';
      html += '<div class="property-hint">Mã giao dịch dạng: TXN1737567890ABC12</div>';
      html += '</div>';

      // Success Handler
      html += '<div class="property-group" style="background:#e8f5e9;padding:16px;border-radius:8px;border-left:4px solid #4caf50;">';
      html += '<div style="font-weight:600;margin-bottom:12px;color:#2e7d32;">✅ Khi thanh toán THÀNH CÔNG:</div>';
      html += '<div style="font-size:12px;color:#666;margin-bottom:12px;">Khách chuyển đúng số tiền + Nội dung khớp</div>';

      html += '<label class="property-label">Loại phản hồi</label>';
      html += '<select class="property-select" id="prop_successType" onchange="togglePaymentSuccessType()" style="margin-bottom:12px;">';
      html += '<option value="text" ' + (data.successType === 'text' ? 'selected' : '') + '>📝 Tin nhắn text</option>';
      html += '<option value="variable" ' + (data.successType === 'variable' ? 'selected' : '') + '>🔤 Từ biến</option>';
      html += '<option value="flow" ' + (data.successType === 'flow' ? 'selected' : '') + '>🔄 Chạy flow khác</option>';
      html += '</select>';

      html += '<div id="successTextGroup" style="' + (data.successType !== 'text' ? 'display:none;' : '') + '">';
      html += '<textarea class="property-input" id="prop_successText" rows="2" placeholder="Thanh toán thành công!">' + FlowBuilder.escapeHtml(data.successText || '') + '</textarea>';
      html += '<div class="property-hint" style="font-size:11px;">Biến: <code>{amount}</code>, <code>{customer_name}</code>, <code>{transaction_code}</code></div>';
      html += '</div>';

      html += '<div id="successVarGroup" style="' + (data.successType !== 'variable' ? 'display:none;' : '') + '">';
      html += '<input class="property-input" id="prop_successVariable" value="' + FlowBuilder.escapeHtml(data.successVariable || '') + '" placeholder="success_message">';
      html += '</div>';

      html += '<div id="successFlowGroup" style="' + (data.successType !== 'flow' ? 'display:none;' : '') + '">';
      html += '<select class="property-select" id="prop_successFlow">';
      html += '<option value="">-- Chọn flow --</option>';
      flows.forEach(function (f) {
        var selected = data.successFlow == f.id ? 'selected' : '';
        html += '<option value="' + f.id + '" ' + selected + '>' + FlowBuilder.escapeHtml(f.name) + '</option>';
      });
      html += '</select>';
      html += '</div>';

      html += '</div>';

      // Failure Handler
      html += '<div class="property-group" style="background:#ffebee;padding:16px;border-radius:8px;border-left:4px solid #f44336;">';
      html += '<div style="font-weight:600;margin-bottom:12px;color:#c62828;">❌ Khi thanh toán THẤT BẠI:</div>';
      html += '<div style="font-size:12px;color:#666;margin-bottom:12px;">Hết thời gian chờ / Số tiền không đủ / Nội dung sai</div>';

      html += '<label class="property-label">Loại phản hồi</label>';
      html += '<select class="property-select" id="prop_failureType" onchange="togglePaymentFailureType()" style="margin-bottom:12px;">';
      html += '<option value="text" ' + (data.failureType === 'text' ? 'selected' : '') + '>📝 Tin nhắn text</option>';
      html += '<option value="variable" ' + (data.failureType === 'variable' ? 'selected' : '') + '>🔤 Từ biến</option>';
      html += '<option value="flow" ' + (data.failureType === 'flow' ? 'selected' : '') + '>🔄 Chạy flow khác</option>';
      html += '</select>';

      html += '<div id="failureTextGroup" style="' + (data.failureType !== 'text' ? 'display:none;' : '') + '">';
      html += '<textarea class="property-input" id="prop_failureText" rows="2" placeholder="Thanh toán thất bại.">' + FlowBuilder.escapeHtml(data.failureText || '') + '</textarea>';
      html += '</div>';

      html += '<div id="failureVarGroup" style="' + (data.failureType !== 'variable' ? 'display:none;' : '') + '">';
      html += '<input class="property-input" id="prop_failureVariable" value="' + FlowBuilder.escapeHtml(data.failureVariable || '') + '" placeholder="failure_message">';
      html += '</div>';

      html += '<div id="failureFlowGroup" style="' + (data.failureType !== 'flow' ? 'display:none;' : '') + '">';
      html += '<select class="property-select" id="prop_failureFlow">';
      html += '<option value="">-- Chọn flow --</option>';
      flows.forEach(function (f) {
        var selected = data.failureFlow == f.id ? 'selected' : '';
        html += '<option value="' + f.id + '" ' + selected + '>' + FlowBuilder.escapeHtml(f.name) + '</option>';
      });
      html += '</select>';
      html += '</div>';

      html += '<label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer;">';
      html += '<input type="checkbox" id="prop_stopOnFailure" ' + (data.stopOnFailure ? 'checked' : '') + '>';
      html += '<span style="font-size:14px;">🛑 Dừng flow nếu thất bại</span>';
      html += '</label>';

      html += '</div>';

      // Info Box
      html += '<div class="property-info" style="margin-top:12px;background:#e1f5fe;border-left:4px solid #03a9f4;padding:12px;border-radius:4px;font-size:12px;">';
      html += '<strong>💳 Quy trình tự động:</strong><br>';
      html += '1️⃣ Tạo transaction với status = WAITING<br>';
      html += '2️⃣ Lấy thông tin khách (User ID, Tên từ <code>zalo_name</code>)<br>';
      html += '3️⃣ Validate số tiền từ biến (phải là số > 0)<br>';
      html += '4️⃣ Gửi thông tin thanh toán cho khách<br>';
      html += '5️⃣ Chờ webhook SEPAY (max ' + (data.timeoutMinutes || 10) + ' phút)<br>';
      html += '6️⃣ Validate: Số tiền đủ + Nội dung khớp<br>';
      html += '7️⃣ Chạy Success/Failure handler<br>';
      html += '8️⃣ Ghi lịch sử & thống kê khách hàng';
      html += '</div>';

      return html;
    },

    saveForm: function () {
      var gateVal = document.getElementById('prop_gateID').value;
      var successFlowVal = document.getElementById('prop_successFlow')?.value;
      var failureFlowVal = document.getElementById('prop_failureFlow')?.value;

      return {
        blockData: {
          useDefaultGate: document.getElementById('prop_useDefaultGate')?.checked || false,
          gateID: gateVal ? parseInt(gateVal) : null,
          amountSource: 'variable',
          amountVariable: document.getElementById('prop_amountVariable')?.value || 'amount',
          noteSource: document.getElementById('prop_noteSource').value,
          noteText: document.getElementById('prop_noteText')?.value || '',
          noteVariable: document.getElementById('prop_noteVariable')?.value || '',
          saveTransactionTo: document.getElementById('prop_saveTransactionTo')?.value || 'transaction_code',
          timeoutMinutes: parseInt(document.getElementById('prop_timeoutMinutes')?.value) || 10,
          successType: document.getElementById('prop_successType').value,
          successText: document.getElementById('prop_successText')?.value || '',
          successVariable: document.getElementById('prop_successVariable')?.value || '',
          successFlow: successFlowVal ? parseInt(successFlowVal) : null,
          failureType: document.getElementById('prop_failureType').value,
          failureText: document.getElementById('prop_failureText')?.value || '',
          failureVariable: document.getElementById('prop_failureVariable')?.value || '',
          failureFlow: failureFlowVal ? parseInt(failureFlowVal) : null,
          stopOnFailure: document.getElementById('prop_stopOnFailure')?.checked || false
        }
      };
    },

    preview: function (data) {
      var preview = '💳 ';

      if (data.useDefaultGate) {
        preview += 'Cổng mặc định';
      } else if (data.gateID) {
        var gates = window.paymentGates || [];
        var gate = gates.find(function (g) { return g.gateID == data.gateID; });
        preview += gate ? gate.gateName : 'Gate #' + data.gateID;
      } else {
        preview += '⚠️ Chưa chọn cổng';
      }

      preview += ' • ' + (data.timeoutMinutes || 10) + 'min';

      return preview;
    }
  });

  console.log('  ✓ Block payment-hub registered (Full Auto v3.0)');

})();
