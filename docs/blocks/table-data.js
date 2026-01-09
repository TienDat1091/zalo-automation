// public/blocks/table-data.js
// Block: Table Data - Thao tác với bảng dữ liệu

(function() {
    'use strict';
  
    // Hành động
    var TABLE_ACTIONS = [
      { value: 'find', label: '🔍 Tìm một hàng' },
      { value: 'add', label: '➕ Thêm một hàng' },
      { value: 'update', label: '✏️ Cập nhật một hàng' },
      { value: 'delete', label: '🗑️ Xóa một hàng' }
    ];
  
    // Toán tử
    var OPERATORS = [
      { value: 'equals', label: 'Bằng (=)' },
      { value: 'not_equals', label: 'Khác (≠)' },
      { value: 'contains', label: 'Chứa' },
      { value: 'not_contains', label: 'Không chứa' },
      { value: 'starts_with', label: 'Bắt đầu bằng' },
      { value: 'ends_with', label: 'Kết thúc bằng' },
      { value: 'is_empty', label: 'Rỗng' },
      { value: 'is_not_empty', label: 'Không rỗng' }
    ];
  
    FlowBuilder.registerBlock('table-data', {
      type: 'table-data',
      name: 'Table Data',
      desc: 'Thao tác với bảng dữ liệu',
      icon: '📊',
      category: 'data',
      color: '#3f51b5',
      
      defaultData: {
        enabled: true,
        tableID: null,
        action: 'find',
        conditions: [{ column: '', operator: 'equals', value: '' }],
        columnValues: [{ column: '', value: '' }],
        resultMappings: [{ column: '', variableName: '' }],
        resultVariable: 'table_result',
        limitResults: 1
      },
  
      renderForm: function(block, data, context) {
        var tables = window.customTables || [];
        var selectedTable = tables.find(function(t) { return t.tableID == data.tableID; });
        var columns = selectedTable ? selectedTable.columns || [] : [];
        
        // Debug log
        console.log('📊 Table Data renderForm:', {
          tableID: data.tableID,
          action: data.action,
          conditions: data.conditions,
          columnValues: data.columnValues,
          resultMappings: data.resultMappings,
          columns: columns
        });

        var html = '';
  
        // Toggle Enable
        html += '<div class="property-group" style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:#f5f7fa;border-radius:8px;">';
        html += '<span style="font-weight:600;">🔌 Kích hoạt block</span>';
        html += '<label class="toggle-switch">';
        html += '<input type="checkbox" id="prop_enabled" ' + (data.enabled !== false ? 'checked' : '') + '>';
        html += '<span class="toggle-slider"></span>';
        html += '</label>';
        html += '</div>';
  
        // Chọn bảng
        html += '<div class="property-group">';
        html += '<label class="property-label">📊 Bảng <span class="required">*</span></label>';
        html += '<select class="property-input" id="prop_tableID" onchange="FlowBuilder.onTableDataChange()">';
        html += '<option value="">-- Chọn bảng --</option>';
        tables.forEach(function(t) {
          var selected = data.tableID == t.tableID ? 'selected' : '';
          html += '<option value="' + t.tableID + '" ' + selected + '>' + FlowBuilder.escapeHtml(t.tableName) + ' (' + (t.rowCount || 0) + ' hàng)</option>';
        });
        html += '</select>';
        if (tables.length === 0) {
          html += '<div class="property-hint" style="color:#ff9800;">⚠️ Chưa có bảng. <a href="/table-manager.html" target="_blank">Tạo bảng mới</a></div>';
        }
        html += '</div>';
  
        // Chọn hành động
        html += '<div class="property-group">';
        html += '<label class="property-label">⚡ Hành động</label>';
        html += '<select class="property-input" id="prop_action" onchange="FlowBuilder.onTableActionChange()">';
        TABLE_ACTIONS.forEach(function(a) {
          var selected = data.action === a.value ? 'selected' : '';
          html += '<option value="' + a.value + '" ' + selected + '>' + a.label + '</option>';
        });
        html += '</select>';
        html += '</div>';
  
        // === SECTION: Điều kiện (find, update, delete) ===
        var showCond = ['find', 'update', 'delete'].indexOf(data.action || 'find') !== -1;
        html += '<div id="conditionsSection" style="' + (showCond ? '' : 'display:none;') + '">';
        html += '<div class="property-group">';
        html += '<label class="property-label">🔍 Điều kiện tìm kiếm</label>';
        html += '<div id="conditionsContainer">';
        
        // Đảm bảo conditions có ít nhất 1 phần tử
        var conditions = data.conditions && data.conditions.length > 0 
          ? data.conditions 
          : [{ column: '', operator: 'equals', value: '' }];
        
        conditions.forEach(function(cond, idx) {
          html += renderConditionRow(idx, cond, columns);
        });
        
        html += '</div>';
        html += '<button type="button" class="btn-small" onclick="FlowBuilder.addTableCondition()">➕ Thêm điều kiện</button>';
        html += '</div>';
        html += '</div>';
  
        // === SECTION: Giá trị cột (add, update) ===
        var showVal = ['add', 'update'].indexOf(data.action) !== -1;
        html += '<div id="valuesSection" style="' + (showVal ? '' : 'display:none;') + '">';
        html += '<div class="property-group">';
        html += '<label class="property-label">' + (data.action === 'add' ? '📝 Giá trị thêm mới' : '✏️ Giá trị cập nhật') + '</label>';
        html += '<div id="valuesContainer">';
        
        // Đảm bảo columnValues có ít nhất 1 phần tử
        var colValues = data.columnValues && data.columnValues.length > 0 
          ? data.columnValues 
          : [{ column: '', value: '' }];
        
        colValues.forEach(function(cv, idx) {
          html += renderValueRow(idx, cv, columns);
        });
        
        html += '</div>';
        html += '<button type="button" class="btn-small" onclick="FlowBuilder.addTableValue()">➕ Thêm cột</button>';
        html += '</div>';
        html += '</div>';
  
        // === SECTION: Lưu kết quả (find) - NEW UI ===
        var showResult = data.action === 'find';
        html += '<div id="resultSection" style="' + (showResult ? '' : 'display:none;') + '">';
        
        html += '<div class="property-group">';
        html += '<label class="property-label">💾 Lưu kết quả vào biến</label>';
        html += '<div id="resultMappingsContainer">';
        
        // Đảm bảo resultMappings có ít nhất 1 phần tử
        var resultMappings = data.resultMappings && data.resultMappings.length > 0 
          ? data.resultMappings 
          : [{ column: '', variableName: '' }];
        
        resultMappings.forEach(function(rm, idx) {
          html += renderResultMappingRow(idx, rm, columns);
        });
        
        html += '</div>';
        html += '<button type="button" class="btn-small" onclick="FlowBuilder.addResultMapping()">➕ Thêm biến</button>';
        html += '</div>';
        
        // Info box
        html += '<div class="property-info" style="margin-top:12px;">';
        html += '<strong>💡 Hướng dẫn:</strong><br>';
        html += '• Chọn cột cần lưu và đặt tên biến<br>';
        html += '• Sử dụng biến: <code>{tên_biến}</code><br>';
        html += '• Ví dụ: "SĐT của bạn là {phone}"';
        html += '</div>';
        
        html += '<div class="property-group" style="margin-top:12px;">';
        html += '<label class="property-label">🔢 Số kết quả tối đa</label>';
        html += '<input type="number" class="property-input" id="prop_limitResults" value="' + (data.limitResults || 1) + '" min="1" max="100">';
        html += '</div>';
        
        html += '</div>';
  
        // === WARNING: Delete ===
        html += '<div id="deleteWarning" style="' + (data.action === 'delete' ? '' : 'display:none;') + ';background:#fff3e0;border-left:4px solid #ff9800;padding:12px;margin-top:12px;border-radius:4px;">';
        html += '<strong style="color:#e65100;">⚠️ Cảnh báo</strong>';
        html += '<div style="font-size:12px;color:#666;margin-top:4px;">Hàng bị xóa không thể khôi phục!</div>';
        html += '</div>';
  
        return html;
      },
  
      saveForm: function() {
        // Get conditions
        var conditions = [];
        document.querySelectorAll('.table-cond-row').forEach(function(row) {
          var col = row.querySelector('.tc-col')?.value || '';
          var op = row.querySelector('.tc-op')?.value || 'equals';
          var val = row.querySelector('.tc-val')?.value || '';
          if (col) {
            conditions.push({ column: col, operator: op, value: val });
          }
        });
        if (conditions.length === 0) {
          conditions = [{ column: '', operator: 'equals', value: '' }];
        }
  
        // Get column values
        var columnValues = [];
        document.querySelectorAll('.table-val-row').forEach(function(row) {
          var col = row.querySelector('.tv-col')?.value || '';
          var val = row.querySelector('.tv-val')?.value || '';
          if (col) {
            columnValues.push({ column: col, value: val });
          }
        });
        if (columnValues.length === 0) {
          columnValues = [{ column: '', value: '' }];
        }
        
        // Get result mappings (NEW)
        var resultMappings = [];
        document.querySelectorAll('.result-mapping-row').forEach(function(row) {
          var col = row.querySelector('.rm-col')?.value || '';
          var varName = row.querySelector('.rm-var')?.value || '';
          if (col && varName) {
            resultMappings.push({ column: col, variableName: varName });
          }
        });
        if (resultMappings.length === 0) {
          resultMappings = [{ column: '', variableName: '' }];
        }
        
        var result = {
          blockData: {
            enabled: document.getElementById('prop_enabled')?.checked !== false,
            tableID: parseInt(document.getElementById('prop_tableID')?.value) || null,
            action: document.getElementById('prop_action')?.value || 'find',
            conditions: conditions,
            columnValues: columnValues,
            resultMappings: resultMappings,
            resultVariable: 'table_result', // Keep for backward compatibility
            limitResults: parseInt(document.getElementById('prop_limitResults')?.value) || 1
          }
        };
        
        console.log('💾 Table Data saveForm:', result);
        return result;
      },
  
      preview: function(data) {
        if (data.enabled === false) return '⏸️ Đã tắt';
        if (!data.tableID) return '⚠️ Chưa chọn bảng';
        
        var actionLabels = { find: '🔍 Tìm', add: '➕ Thêm', update: '✏️ Cập nhật', delete: '🗑️ Xóa' };
        var actionText = actionLabels[data.action] || data.action;
        
        // Show mapped variables for find action
        if (data.action === 'find' && data.resultMappings && data.resultMappings.length > 0) {
          var vars = data.resultMappings
            .filter(function(rm) { return rm.variableName; })
            .map(function(rm) { return '{' + rm.variableName + '}'; });
          if (vars.length > 0) {
            return actionText + ' → ' + vars.join(', ');
          }
        }
        
        return actionText;
      }
    });
  
    // ========================================
    // HELPER: Render condition row
    // ========================================
    function renderConditionRow(idx, cond, columns) {
      var html = '<div class="table-cond-row" data-idx="' + idx + '" style="display:flex;gap:6px;margin-bottom:8px;align-items:center;">';
      
      // Column select - sử dụng String() để so sánh (loose equality)
      html += '<select class="property-input tc-col" style="flex:1;">';
      html += '<option value="">Cột...</option>';
      columns.forEach(function(col) {
        // Convert cả 2 về string để so sánh chính xác
        var colID = String(col.columnID);
        var condCol = String(cond.column || '');
        var selected = condCol === colID ? 'selected' : '';
        html += '<option value="' + colID + '" ' + selected + '>' + FlowBuilder.escapeHtml(col.columnName) + '</option>';
      });
      html += '</select>';
      
      // Operator select
      html += '<select class="property-input tc-op" style="width:90px;">';
      OPERATORS.forEach(function(op) {
        var selected = cond.operator === op.value ? 'selected' : '';
        html += '<option value="' + op.value + '" ' + selected + '>' + op.label + '</option>';
      });
      html += '</select>';
      
      // Value input
      var hideVal = cond.operator === 'is_empty' || cond.operator === 'is_not_empty';
      html += '<input type="text" class="property-input tc-val" style="flex:1;' + (hideVal ? 'display:none;' : '') + '" value="' + FlowBuilder.escapeHtml(cond.value || '') + '" placeholder="Giá trị/{biến}">';
      
      // Delete button
      html += '<button type="button" onclick="FlowBuilder.removeTableCondition(this)" style="border:none;background:#ffebee;color:#f44336;border-radius:4px;cursor:pointer;padding:4px 8px;font-size:14px;">✕</button>';
      
      html += '</div>';
      return html;
    }
  
    // ========================================
    // HELPER: Render value row
    // ========================================
    function renderValueRow(idx, cv, columns) {
      var html = '<div class="table-val-row" data-idx="' + idx + '" style="display:flex;gap:6px;margin-bottom:8px;align-items:center;">';
      
      // Column select - sử dụng String() để so sánh (loose equality)
      html += '<select class="property-input tv-col" style="flex:1;">';
      html += '<option value="">Cột...</option>';
      columns.forEach(function(col) {
        // Convert cả 2 về string để so sánh chính xác
        var colID = String(col.columnID);
        var cvCol = String(cv.column || '');
        var selected = cvCol === colID ? 'selected' : '';
        html += '<option value="' + colID + '" ' + selected + '>' + FlowBuilder.escapeHtml(col.columnName) + '</option>';
      });
      html += '</select>';
      
      // Value input
      html += '<input type="text" class="property-input tv-val" style="flex:2;" value="' + FlowBuilder.escapeHtml(cv.value || '') + '" placeholder="Giá trị/{biến}">';
      
      // Delete button
      html += '<button type="button" onclick="FlowBuilder.removeTableValue(this)" style="border:none;background:#ffebee;color:#f44336;border-radius:4px;cursor:pointer;padding:4px 8px;font-size:14px;">✕</button>';
      
      html += '</div>';
      return html;
    }
  
    // ========================================
    // HELPER: Render result mapping row (NEW)
    // ========================================
    function renderResultMappingRow(idx, rm, columns) {
      var html = '<div class="result-mapping-row" data-idx="' + idx + '" style="display:flex;gap:6px;margin-bottom:8px;align-items:center;">';
      
      // Column select
      html += '<select class="property-input rm-col" style="flex:1;" onchange="FlowBuilder.onResultMappingColumnChange(this)">';
      html += '<option value="">Chọn cột...</option>';
      columns.forEach(function(col) {
        var colID = String(col.columnID);
        var rmCol = String(rm.column || '');
        var selected = rmCol === colID ? 'selected' : '';
        html += '<option value="' + colID + '" data-name="' + FlowBuilder.escapeHtml(col.columnName) + '" ' + selected + '>' + FlowBuilder.escapeHtml(col.columnName) + '</option>';
      });
      html += '</select>';
      
      // Arrow icon
      html += '<span style="color:#666;">→</span>';
      
      // Variable name input
      html += '<input type="text" class="property-input rm-var" style="flex:1;" value="' + FlowBuilder.escapeHtml(rm.variableName || '') + '" placeholder="Tên biến">';
      
      // Delete button
      html += '<button type="button" onclick="FlowBuilder.removeResultMapping(this)" style="border:none;background:#ffebee;color:#f44336;border-radius:4px;cursor:pointer;padding:4px 8px;font-size:14px;">✕</button>';
      
      html += '</div>';
      return html;
    }
  
    // ========================================
    // EVENT HANDLERS
    // ========================================
    
    // Khi thay đổi bảng
    FlowBuilder.onTableDataChange = function() {
      var tableID = parseInt(document.getElementById('prop_tableID')?.value) || null;
      var tables = window.customTables || [];
      var table = tables.find(function(t) { return t.tableID == tableID; });
      var columns = table ? table.columns || [] : [];
      
      console.log('📊 onTableDataChange:', { tableID, columns });
      
      // Update all column selects (conditions, values, result mappings)
      document.querySelectorAll('.tc-col, .tv-col, .rm-col').forEach(function(select) {
        var currentVal = select.value;
        var html = '<option value="">' + (select.classList.contains('rm-col') ? 'Chọn cột...' : 'Cột...') + '</option>';
        columns.forEach(function(col) {
          var colID = String(col.columnID);
          var selected = colID === currentVal ? 'selected' : '';
          html += '<option value="' + colID + '" data-name="' + FlowBuilder.escapeHtml(col.columnName) + '" ' + selected + '>' + FlowBuilder.escapeHtml(col.columnName) + '</option>';
        });
        select.innerHTML = html;
      });
    };
  
    // Khi thay đổi action
    FlowBuilder.onTableActionChange = function() {
      var action = document.getElementById('prop_action')?.value || 'find';
      
      var condSection = document.getElementById('conditionsSection');
      var valSection = document.getElementById('valuesSection');
      var resultSection = document.getElementById('resultSection');
      var deleteWarning = document.getElementById('deleteWarning');
      
      if (condSection) condSection.style.display = ['find', 'update', 'delete'].indexOf(action) !== -1 ? '' : 'none';
      if (valSection) valSection.style.display = ['add', 'update'].indexOf(action) !== -1 ? '' : 'none';
      if (resultSection) resultSection.style.display = action === 'find' ? '' : 'none';
      if (deleteWarning) deleteWarning.style.display = action === 'delete' ? '' : 'none';
    };
  
    // Thêm điều kiện
    FlowBuilder.addTableCondition = function() {
      var container = document.getElementById('conditionsContainer');
      if (!container) return;
      
      var tables = window.customTables || [];
      var tableID = parseInt(document.getElementById('prop_tableID')?.value) || null;
      var table = tables.find(function(t) { return t.tableID == tableID; });
      var columns = table ? table.columns || [] : [];
      
      var idx = container.querySelectorAll('.table-cond-row').length;
      container.insertAdjacentHTML('beforeend', renderConditionRow(idx, { column: '', operator: 'equals', value: '' }, columns));
    };
  
    // Xóa điều kiện
    FlowBuilder.removeTableCondition = function(btn) {
      var rows = document.querySelectorAll('.table-cond-row');
      if (rows.length > 1) {
        btn.closest('.table-cond-row')?.remove();
      }
    };
  
    // Thêm giá trị cột
    FlowBuilder.addTableValue = function() {
      var container = document.getElementById('valuesContainer');
      if (!container) return;
      
      var tables = window.customTables || [];
      var tableID = parseInt(document.getElementById('prop_tableID')?.value) || null;
      var table = tables.find(function(t) { return t.tableID == tableID; });
      var columns = table ? table.columns || [] : [];
      
      var idx = container.querySelectorAll('.table-val-row').length;
      container.insertAdjacentHTML('beforeend', renderValueRow(idx, { column: '', value: '' }, columns));
    };
  
    // Xóa giá trị cột
    FlowBuilder.removeTableValue = function(btn) {
      var rows = document.querySelectorAll('.table-val-row');
      if (rows.length > 1) {
        btn.closest('.table-val-row')?.remove();
      }
    };
  
    // Thêm result mapping (NEW)
    FlowBuilder.addResultMapping = function() {
      var container = document.getElementById('resultMappingsContainer');
      if (!container) return;
      
      var tables = window.customTables || [];
      var tableID = parseInt(document.getElementById('prop_tableID')?.value) || null;
      var table = tables.find(function(t) { return t.tableID == tableID; });
      var columns = table ? table.columns || [] : [];
      
      var idx = container.querySelectorAll('.result-mapping-row').length;
      container.insertAdjacentHTML('beforeend', renderResultMappingRow(idx, { column: '', variableName: '' }, columns));
    };
  
    // Xóa result mapping (NEW)
    FlowBuilder.removeResultMapping = function(btn) {
      var rows = document.querySelectorAll('.result-mapping-row');
      if (rows.length > 1) {
        btn.closest('.result-mapping-row')?.remove();
      }
    };
  
    // Auto-fill variable name khi chọn cột (NEW)
    FlowBuilder.onResultMappingColumnChange = function(select) {
      var row = select.closest('.result-mapping-row');
      if (!row) return;
      
      var varInput = row.querySelector('.rm-var');
      if (!varInput) return;
      
      // Nếu ô biến còn trống, tự động điền tên cột (lowercase, no spaces)
      if (!varInput.value.trim()) {
        var selectedOption = select.options[select.selectedIndex];
        var colName = selectedOption.dataset.name || selectedOption.text || '';
        // Chuyển thành tên biến hợp lệ: lowercase, thay space bằng _
        var varName = colName.toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, '');
        varInput.value = varName || 'var_' + select.value;
      }
    };
  
    console.log('  ✓ Block table-data registered');
  
  })();