// public/blocks/payment-hub.js
// Block: Payment Hub - Cổng thanh toán

(function() {
  'use strict';

  // Helper function
  window.togglePaymentAmountType = function() {
    var type = document.getElementById('prop_amountType');
    if (!type) return;
    
    var manualGroup = document.getElementById('paymentAmountManual');
    var varGroup = document.getElementById('paymentAmountVariable');
    
    if (manualGroup) manualGroup.style.display = type.value === 'manual' ? 'block' : 'none';
    if (varGroup) varGroup.style.display = type.value === 'variable' ? 'block' : 'none';
  };

  FlowBuilder.registerBlock('payment-hub', {
    type: 'payment-hub',
    name: 'Cổng thanh toán',
    desc: 'Tạo thanh toán',
    icon: '💳',
    category: 'action',
    color: '#fff9c4',
    
    defaultData: {
      gateId: null,
      amount: '',
      amountType: 'manual',
      amountVariable: '',
      note: '',
      saveTransactionTo: ''
    },

    renderForm: function(block, data, context) {
      var gates = window.paymentGates || [];
      
      return `
        <div class="property-group">
          <label class="property-label">Cổng thanh toán <span class="required">*</span></label>
          <select class="property-select" id="prop_gateId">
            <option value="">-- Chọn cổng --</option>
            ${gates.map(function(g) { 
              return '<option value="' + g.gateID + '" ' + (data.gateId == g.gateID ? 'selected' : '') + '>' + FlowBuilder.escapeHtml(g.gateName) + '</option>'; 
            }).join('')}
          </select>
        </div>
        <div class="property-group">
          <label class="property-label">Nguồn số tiền</label>
          <select class="property-select" id="prop_amountType" onchange="togglePaymentAmountType()">
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
          <input class="property-input" id="prop_amountVariable" value="${FlowBuilder.escapeHtml(data.amountVariable || '')}" placeholder="amount">
        </div>
        <div class="property-group">
          <label class="property-label">Ghi chú</label>
          <input class="property-input" id="prop_note" value="${FlowBuilder.escapeHtml(data.note || '')}" placeholder="Thanh toán đơn hàng">
        </div>
        <div class="property-group">
          <label class="property-label">Lưu mã giao dịch vào biến</label>
          <input class="property-input" id="prop_saveTransactionTo" value="${FlowBuilder.escapeHtml(data.saveTransactionTo || '')}" placeholder="transaction_code">
        </div>
        <div class="property-info" style="margin-top:12px;background:#fff3e0;border-left:4px solid #ff9800;padding:10px;border-radius:4px;">
          <strong>💳 Quy trình:</strong><br>
          1. Tạo mã giao dịch (DHSxxxxxxxx)<br>
          2. Gửi thông tin thanh toán cho user
        </div>
      `;
    },

    saveForm: function() {
      var gateVal = document.getElementById('prop_gateId').value;
      return {
        blockData: {
          gateId: gateVal ? parseInt(gateVal) : null,
          amount: document.getElementById('prop_amount') ? document.getElementById('prop_amount').value : '',
          amountType: document.getElementById('prop_amountType').value,
          amountVariable: document.getElementById('prop_amountVariable') ? document.getElementById('prop_amountVariable').value : '',
          note: document.getElementById('prop_note') ? document.getElementById('prop_note').value : '',
          saveTransactionTo: document.getElementById('prop_saveTransactionTo') ? document.getElementById('prop_saveTransactionTo').value : ''
        }
      };
    },

    preview: function(data) {
      return data.gateId ? '💳 Gate #' + data.gateId : '⚠️ Chưa chọn cổng';
    }
  });

})();
