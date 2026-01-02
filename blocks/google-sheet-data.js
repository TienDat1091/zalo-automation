// public/blocks/google-sheet-data.js
// Block: Google Sheet Data - Thao tác với Google Sheets

(function() {
  'use strict';

  // Hành động
  var SHEET_ACTIONS = [
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

  FlowBuilder.registerBlock('google-sheet-data', {
    type: 'google-sheet-data',
    name: 'Google Sheet Data',
    desc: 'Thao tác với Google Sheets',
    icon: '📗',
    category: 'data',
    color: '#0f9d58',
    
    defaultData: {
      enabled: true,
      configId: null,
      action: 'find',
      conditions: [{ column: '', operator: 'equals', value: '' }],
      columnValues: [{ column: '', value: '' }],
      resultMappings: [{ column: '', variableName: '' }],
      limitResults: 1
    },

    renderForm: function(block, data, context) {
      var configs = window.googleSheetConfigs || [];
      var selectedConfig = configs.find(function(c) { return c.id == data.configId; });
      
      // Columns sẽ được load dynamic khi chọn config
      var columns = data._columns || [];
      
      // Init columns vào biến global để sử dụng
      if (typeof FlowBuilder.initGSheetColumns === 'function') {
        FlowBuilder.initGSheetColumns(columns, data.configId);
      }
      
      console.log('📗 Google Sheet Data renderForm:', {
        configId: data.configId,
        action: data.action,
        conditions: data.conditions,
        columnValues: data.columnValues,
        resultMappings: data.resultMappings,
        columns: columns,
        configs: configs
      });

      var html = '';

      // Toggle Enable
      html += '<div class="property-group" style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:#e8f5e9;border-radius:8px;">';
      html += '<span style="font-weight:600;">🔌 Kích hoạt block</span>';
      html += '<label class="toggle-switch">';
      html += '<input type="checkbox" id="prop_enabled" ' + (data.enabled !== false ? 'checked' : '') + '>';
      html += '<span class="toggle-slider"></span>';
      html += '</label>';
      html += '</div>';

      // Chọn Google Sheet Config
      html += '<div class="property-group">';
      html += '<label class="property-label">📗 Google Sheet <span class="required">*</span></label>';
      html += '<select class="property-input" id="prop_configId" onchange="FlowBuilder.onGSheetConfigChange()">';
      html += '<option value="">-- Chọn Sheet đã kết nối --</option>';
      configs.forEach(function(c) {
        var selected = data.configId == c.id ? 'selected' : '';
        html += '<option value="' + c.id + '" ' + selected + '>' + FlowBuilder.escapeHtml(c.name) + ' (' + (c.sheetName || 'Sheet1') + ')</option>';
      });
      html += '</select>';
      if (configs.length === 0) {
        html += '<div class="property-hint" style="color:#ff9800;">⚠️ Chưa có Sheet nào. <a href="/google-sheets-manager.html" target="_blank">Thêm Sheet mới</a></div>';
      }
      html += '</div>';

      // Load columns button - hiển thị trạng thái dựa trên columns đã lưu
      var columnsStatusText = '';
      var columnsStatusColor = '#666';
      if (columns.length > 0) {
        columnsStatusText = '✅ ' + columns.length + ' cột';
        columnsStatusColor = '#0f9d58';
      } else if (data.configId) {
        columnsStatusText = '⏳ Chưa tải cột';
        columnsStatusColor = '#ff9800';
      }
      
      html += '<div class="property-group" id="loadColumnsSection" style="' + (data.configId ? '' : 'display:none;') + '">';
      html += '<button type="button" class="btn-small" onclick="FlowBuilder.loadGSheetColumns()" id="btnLoadColumns">🔄 Tải lại cột</button>';
      html += '<span id="columnsStatus" style="margin-left:10px;font-size:12px;color:' + columnsStatusColor + ';">' + columnsStatusText + '</span>';
      html += '</div>';

      // Chọn hành động
      html += '<div class="property-group">';
      html += '<label class="property-label">⚡ Hành động</label>';
      html += '<select class="property-input" id="prop_action" onchange="FlowBuilder.onGSheetActionChange()">';
      SHEET_ACTIONS.forEach(function(a) {
        var selected = data.action === a.value ? 'selected' : '';
        html += '<option value="' + a.value + '" ' + selected + '>' + a.label + '</option>';
      });
      html += '</select>';
      html += '</div>';

      // === SECTION: Điều kiện (find, update, delete) ===
      var showCond = ['find', 'update', 'delete'].indexOf(data.action || 'find') !== -1;
      html += '<div id="gsConditionsSection" style="' + (showCond ? '' : 'display:none;') + '">';
      html += '<div class="property-group">';
      html += '<label class="property-label">🔍 Điều kiện tìm kiếm</label>';
      html += '<div id="gsConditionsContainer">';
      
      var conditions = data.conditions && data.conditions.length > 0 
        ? data.conditions 
        : [{ column: '', operator: 'equals', value: '' }];
      
      conditions.forEach(function(cond, idx) {
        html += renderConditionRow(idx, cond, columns);
      });
      
      html += '</div>';
      html += '<button type="button" class="btn-small" onclick="FlowBuilder.addGSheetCondition()">➕ Thêm điều kiện</button>';
      html += '</div>';
      html += '</div>';

      // === SECTION: Giá trị cột (add, update) ===
      var showVal = ['add', 'update'].indexOf(data.action) !== -1;
      html += '<div id="gsValuesSection" style="' + (showVal ? '' : 'display:none;') + '">';
      html += '<div class="property-group">';
      html += '<label class="property-label">' + (data.action === 'add' ? '📝 Giá trị thêm mới' : '✏️ Giá trị cập nhật') + '</label>';
      html += '<div id="gsValuesContainer">';
      
      var colValues = data.columnValues && data.columnValues.length > 0 
        ? data.columnValues 
        : [{ column: '', value: '' }];
      
      colValues.forEach(function(cv, idx) {
        html += renderValueRow(idx, cv, columns);
      });
      
      html += '</div>';
      html += '<button type="button" class="btn-small" onclick="FlowBuilder.addGSheetValue()">➕ Thêm cột</button>';
      html += '</div>';
      html += '</div>';

      // === SECTION: Lưu kết quả (find) ===
      var showResult = data.action === 'find';
      html += '<div id="gsResultSection" style="' + (showResult ? '' : 'display:none;') + '">';
      
      html += '<div class="property-group">';
      html += '<label class="property-label">💾 Lưu kết quả vào biến</label>';
      html += '<div id="gsResultMappingsContainer">';
      
      var resultMappings = data.resultMappings && data.resultMappings.length > 0 
        ? data.resultMappings 
        : [{ column: '', variableName: '' }];
      
      resultMappings.forEach(function(rm, idx) {
        html += renderResultMappingRow(idx, rm, columns);
      });
      
      html += '</div>';
      html += '<button type="button" class="btn-small" onclick="FlowBuilder.addGSheetResultMapping()">➕ Thêm biến</button>';
      html += '</div>';
      
      // Info box
      html += '<div class="property-info" style="margin-top:12px;background:#e8f5e9;">';
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
      html += '<div id="gsDeleteWarning" style="' + (data.action === 'delete' ? '' : 'display:none;') + ';background:#fff3e0;border-left:4px solid #ff9800;padding:12px;margin-top:12px;border-radius:4px;">';
      html += '<strong style="color:#e65100;">⚠️ Cảnh báo</strong>';
      html += '<div style="font-size:12px;color:#666;margin-top:4px;">Hàng bị xóa trên Google Sheet không thể khôi phục!</div>';
      html += '</div>';

      // Lưu columns vào hidden field
      html += '<input type="hidden" id="prop_columns" value="' + FlowBuilder.escapeHtml(JSON.stringify(columns)) + '">';

      // Auto-load columns nếu có configId nhưng chưa có columns
      if (data.configId && columns.length === 0) {
        setTimeout(function() {
          if (typeof FlowBuilder.loadGSheetColumns === 'function') {
            console.log('📗 Auto-loading columns for config:', data.configId);
            FlowBuilder.loadGSheetColumns();
          }
        }, 100);
      }

      return html;
    },

    saveForm: function() {
      // Get conditions
      var conditions = [];
      document.querySelectorAll('.gs-cond-row').forEach(function(row) {
        var col = row.querySelector('.gs-cond-col')?.value || '';
        var op = row.querySelector('.gs-cond-op')?.value || 'equals';
        var val = row.querySelector('.gs-cond-val')?.value || '';
        if (col) {
          conditions.push({ column: col, operator: op, value: val });
        }
      });
      if (conditions.length === 0) {
        conditions = [{ column: '', operator: 'equals', value: '' }];
      }

      // Get column values
      var columnValues = [];
      document.querySelectorAll('.gs-val-row').forEach(function(row) {
        var col = row.querySelector('.gs-val-col')?.value || '';
        var val = row.querySelector('.gs-val-value')?.value || '';
        if (col) {
          columnValues.push({ column: col, value: val });
        }
      });
      if (columnValues.length === 0) {
        columnValues = [{ column: '', value: '' }];
      }
      
      // Get result mappings
      var resultMappings = [];
      document.querySelectorAll('.gs-mapping-row').forEach(function(row) {
        var col = row.querySelector('.gs-map-col')?.value || '';
        var varName = row.querySelector('.gs-map-var')?.value || '';
        if (col && varName) {
          resultMappings.push({ column: col, variableName: varName });
        }
      });
      if (resultMappings.length === 0) {
        resultMappings = [{ column: '', variableName: '' }];
      }

      // Parse saved columns
      var columnsStr = document.getElementById('prop_columns')?.value || '[]';
      var columns = [];
      try { columns = JSON.parse(columnsStr); } catch(e) {}
      
      var result = {
        blockData: {
          enabled: document.getElementById('prop_enabled')?.checked !== false,
          configId: parseInt(document.getElementById('prop_configId')?.value) || null,
          action: document.getElementById('prop_action')?.value || 'find',
          conditions: conditions,
          columnValues: columnValues,
          resultMappings: resultMappings,
          limitResults: parseInt(document.getElementById('prop_limitResults')?.value) || 1,
          _columns: columns
        }
      };
      
      console.log('💾 Google Sheet Data saveForm:', result);
      return result;
    },

    preview: function(data) {
      if (data.enabled === false) return '⏸️ Đã tắt';
      if (!data.configId) return '⚠️ Chưa chọn Sheet';
      
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
    var html = '<div class="gs-cond-row" data-idx="' + idx + '" style="display:flex;gap:6px;margin-bottom:8px;align-items:center;">';
    
    // Column select
    html += '<select class="property-input gs-cond-col" style="flex:1;">';
    html += '<option value="">Chọn cột...</option>';
    
    // Nếu columns rỗng nhưng có giá trị đã lưu, thêm option placeholder
    var hasMatch = false;
    columns.forEach(function(col, colIdx) {
      var colValue = String(col.index || colIdx + 1);
      var selected = String(cond.column) === colValue ? 'selected' : '';
      if (selected) hasMatch = true;
      html += '<option value="' + colValue + '" ' + selected + '>' + FlowBuilder.escapeHtml(col.name || 'Cột ' + col.letter) + ' (' + col.letter + ')</option>';
    });
    
    // Fallback: nếu có giá trị cũ nhưng không match với columns hiện tại
    if (cond.column && !hasMatch && columns.length === 0) {
      var letter = String.fromCharCode(64 + parseInt(cond.column));
      html += '<option value="' + cond.column + '" selected>Cột ' + letter + ' (chưa tải)</option>';
    }
    
    html += '</select>';
    
    // Operator select
    html += '<select class="property-input gs-cond-op" style="width:100px;">';
    OPERATORS.forEach(function(op) {
      var selected = cond.operator === op.value ? 'selected' : '';
      html += '<option value="' + op.value + '" ' + selected + '>' + op.label + '</option>';
    });
    html += '</select>';
    
    // Value input
    var hideVal = cond.operator === 'is_empty' || cond.operator === 'is_not_empty';
    html += '<input type="text" class="property-input gs-cond-val" style="flex:1;' + (hideVal ? 'display:none;' : '') + '" value="' + FlowBuilder.escapeHtml(cond.value || '') + '" placeholder="Giá trị/{biến}">';
    
    // Delete button
    html += '<button type="button" onclick="FlowBuilder.removeGSheetCondition(this)" style="border:none;background:#ffebee;color:#f44336;border-radius:4px;cursor:pointer;padding:4px 8px;font-size:14px;">✕</button>';
    
    html += '</div>';
    return html;
  }

  // ========================================
  // HELPER: Render value row
  // ========================================
  function renderValueRow(idx, cv, columns) {
    var html = '<div class="gs-val-row" data-idx="' + idx + '" style="display:flex;gap:6px;margin-bottom:8px;align-items:center;">';
    
    // Column select
    html += '<select class="property-input gs-val-col" style="flex:1;">';
    html += '<option value="">Chọn cột...</option>';
    
    var hasMatch = false;
    columns.forEach(function(col, colIdx) {
      var colValue = String(col.index || colIdx + 1);
      var selected = String(cv.column) === colValue ? 'selected' : '';
      if (selected) hasMatch = true;
      html += '<option value="' + colValue + '" ' + selected + '>' + FlowBuilder.escapeHtml(col.name || 'Cột ' + col.letter) + ' (' + col.letter + ')</option>';
    });
    
    // Fallback
    if (cv.column && !hasMatch && columns.length === 0) {
      var letter = String.fromCharCode(64 + parseInt(cv.column));
      html += '<option value="' + cv.column + '" selected>Cột ' + letter + ' (chưa tải)</option>';
    }
    
    html += '</select>';
    
    // Value input
    html += '<input type="text" class="property-input gs-val-value" style="flex:2;" value="' + FlowBuilder.escapeHtml(cv.value || '') + '" placeholder="Giá trị/{biến}">';
    
    // Delete button
    html += '<button type="button" onclick="FlowBuilder.removeGSheetValue(this)" style="border:none;background:#ffebee;color:#f44336;border-radius:4px;cursor:pointer;padding:4px 8px;font-size:14px;">✕</button>';
    
    html += '</div>';
    return html;
  }

  // ========================================
  // HELPER: Render result mapping row
  // ========================================
  function renderResultMappingRow(idx, rm, columns) {
    var html = '<div class="gs-mapping-row" data-idx="' + idx + '" style="display:flex;gap:6px;margin-bottom:8px;align-items:center;">';
    
    // Column select
    html += '<select class="property-input gs-map-col" style="flex:1;" onchange="FlowBuilder.onGSheetMappingColChange(this)">';
    html += '<option value="">Chọn cột...</option>';
    
    var hasMatch = false;
    columns.forEach(function(col, colIdx) {
      var colValue = String(col.index || colIdx + 1);
      var selected = String(rm.column) === colValue ? 'selected' : '';
      if (selected) hasMatch = true;
      html += '<option value="' + colValue + '" data-name="' + FlowBuilder.escapeHtml(col.name || '') + '" ' + selected + '>' + FlowBuilder.escapeHtml(col.name || 'Cột ' + col.letter) + ' (' + col.letter + ')</option>';
    });
    
    // Fallback
    if (rm.column && !hasMatch && columns.length === 0) {
      var letter = String.fromCharCode(64 + parseInt(rm.column));
      html += '<option value="' + rm.column + '" selected>Cột ' + letter + ' (chưa tải)</option>';
    }
    
    html += '</select>';
    
    // Arrow
    html += '<span style="color:#666;">→</span>';
    
    // Variable name input
    html += '<input type="text" class="property-input gs-map-var" style="flex:1;" value="' + FlowBuilder.escapeHtml(rm.variableName || '') + '" placeholder="Tên biến">';
    
    // Delete button
    html += '<button type="button" onclick="FlowBuilder.removeGSheetResultMapping(this)" style="border:none;background:#ffebee;color:#f44336;border-radius:4px;cursor:pointer;padding:4px 8px;font-size:14px;">✕</button>';
    
    html += '</div>';
    return html;
  }

  // ========================================
  // EVENT HANDLERS
  // ========================================
  
  // Store loaded columns globally for current block
  var loadedColumns = [];
  var currentConfigId = null; // Track current config to avoid unnecessary reloads

  // Khi thay đổi config
  FlowBuilder.onGSheetConfigChange = function() {
    var configId = document.getElementById('prop_configId')?.value;
    var loadSection = document.getElementById('loadColumnsSection');
    
    if (configId) {
      loadSection.style.display = '';
      
      // Chỉ reset và load lại nếu config thực sự thay đổi
      if (currentConfigId !== configId) {
        currentConfigId = configId;
        // Reset columns
        loadedColumns = [];
        document.getElementById('prop_columns').value = '[]';
        document.getElementById('columnsStatus').textContent = '⏳ Đang tải cột...';
        updateAllColumnSelects([]);
        
        // AUTO-LOAD columns khi chọn config mới
        FlowBuilder.loadGSheetColumns();
      }
    } else {
      loadSection.style.display = 'none';
      currentConfigId = null;
    }
  };

  // Load columns từ Google Sheet
  FlowBuilder.loadGSheetColumns = async function() {
    var configId = document.getElementById('prop_configId')?.value;
    if (!configId) return;
    
    var configs = window.googleSheetConfigs || [];
    var config = configs.find(function(c) { return c.id == configId; });
    if (!config || !config.scriptURL) {
      var status = document.getElementById('columnsStatus');
      if (status) {
        status.textContent = '❌ Thiếu Script URL';
        status.style.color = '#ea4335';
      }
      return;
    }
    
    var btn = document.getElementById('btnLoadColumns');
    var status = document.getElementById('columnsStatus');
    
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Đang tải...';
    }
    if (status) {
      status.textContent = '⏳ Đang tải...';
      status.style.color = '#666';
    }
    
    try {
      var url = config.scriptURL + '?action=getData&sheet=' + encodeURIComponent(config.sheetName || 'Sheet1');
      var response = await fetch(url);
      var data = await response.json();
      
      if (data.success && data.headers) {
        loadedColumns = data.headers.map(function(h, idx) {
          return {
            index: idx + 1,
            name: h || '',
            letter: String.fromCharCode(65 + idx)
          };
        });
        
        // Save to hidden field
        document.getElementById('prop_columns').value = JSON.stringify(loadedColumns);
        
        // Update all selects - giữ lại giá trị đã chọn
        updateAllColumnSelects(loadedColumns);
        
        if (status) {
          status.textContent = '✅ ' + loadedColumns.length + ' cột';
          status.style.color = '#0f9d58';
        }
        
        console.log('📗 Loaded', loadedColumns.length, 'columns from Google Sheet');
      } else {
        if (status) {
          status.textContent = '❌ ' + (data.error || 'Không thể tải');
          status.style.color = '#ea4335';
        }
      }
    } catch (err) {
      if (status) {
        status.textContent = '❌ ' + err.message;
        status.style.color = '#ea4335';
      }
      console.error('📗 Load columns error:', err);
    }
    
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄 Tải lại cột';
    }
  };
  
  // Init columns khi mở block đã có dữ liệu saved
  FlowBuilder.initGSheetColumns = function(columns, configId) {
    if (columns && columns.length > 0) {
      loadedColumns = columns;
      currentConfigId = configId ? String(configId) : null;
      console.log('📗 Restored', columns.length, 'columns from saved data');
    }
  };

  // Update all column selects with new columns
  function updateAllColumnSelects(columns) {
    // Update condition selects
    document.querySelectorAll('.gs-cond-col').forEach(function(select) {
      var currentVal = select.value;
      var html = '<option value="">Chọn cột...</option>';
      columns.forEach(function(col) {
        var selected = String(col.index) === currentVal ? 'selected' : '';
        html += '<option value="' + col.index + '" ' + selected + '>' + FlowBuilder.escapeHtml(col.name || 'Cột ' + col.letter) + ' (' + col.letter + ')</option>';
      });
      select.innerHTML = html;
    });
    
    // Update value selects
    document.querySelectorAll('.gs-val-col').forEach(function(select) {
      var currentVal = select.value;
      var html = '<option value="">Chọn cột...</option>';
      columns.forEach(function(col) {
        var selected = String(col.index) === currentVal ? 'selected' : '';
        html += '<option value="' + col.index + '" ' + selected + '>' + FlowBuilder.escapeHtml(col.name || 'Cột ' + col.letter) + ' (' + col.letter + ')</option>';
      });
      select.innerHTML = html;
    });
    
    // Update mapping selects
    document.querySelectorAll('.gs-map-col').forEach(function(select) {
      var currentVal = select.value;
      var html = '<option value="">Chọn cột...</option>';
      columns.forEach(function(col) {
        var selected = String(col.index) === currentVal ? 'selected' : '';
        html += '<option value="' + col.index + '" data-name="' + FlowBuilder.escapeHtml(col.name || '') + '" ' + selected + '>' + FlowBuilder.escapeHtml(col.name || 'Cột ' + col.letter) + ' (' + col.letter + ')</option>';
      });
      select.innerHTML = html;
    });
  }

  // Khi thay đổi action
  FlowBuilder.onGSheetActionChange = function() {
    var action = document.getElementById('prop_action')?.value || 'find';
    
    var condSection = document.getElementById('gsConditionsSection');
    var valSection = document.getElementById('gsValuesSection');
    var resultSection = document.getElementById('gsResultSection');
    var deleteWarning = document.getElementById('gsDeleteWarning');
    
    if (condSection) condSection.style.display = ['find', 'update', 'delete'].indexOf(action) !== -1 ? '' : 'none';
    if (valSection) valSection.style.display = ['add', 'update'].indexOf(action) !== -1 ? '' : 'none';
    if (resultSection) resultSection.style.display = action === 'find' ? '' : 'none';
    if (deleteWarning) deleteWarning.style.display = action === 'delete' ? '' : 'none';
  };

  // Thêm điều kiện
  FlowBuilder.addGSheetCondition = function() {
    var container = document.getElementById('gsConditionsContainer');
    if (!container) return;
    
    var columnsStr = document.getElementById('prop_columns')?.value || '[]';
    var columns = [];
    try { columns = JSON.parse(columnsStr); } catch(e) {}
    
    var idx = container.querySelectorAll('.gs-cond-row').length;
    container.insertAdjacentHTML('beforeend', renderConditionRow(idx, { column: '', operator: 'equals', value: '' }, columns));
  };

  // Xóa điều kiện
  FlowBuilder.removeGSheetCondition = function(btn) {
    var rows = document.querySelectorAll('.gs-cond-row');
    if (rows.length > 1) {
      btn.closest('.gs-cond-row')?.remove();
    }
  };

  // Thêm giá trị cột
  FlowBuilder.addGSheetValue = function() {
    var container = document.getElementById('gsValuesContainer');
    if (!container) return;
    
    var columnsStr = document.getElementById('prop_columns')?.value || '[]';
    var columns = [];
    try { columns = JSON.parse(columnsStr); } catch(e) {}
    
    var idx = container.querySelectorAll('.gs-val-row').length;
    container.insertAdjacentHTML('beforeend', renderValueRow(idx, { column: '', value: '' }, columns));
  };

  // Xóa giá trị cột
  FlowBuilder.removeGSheetValue = function(btn) {
    var rows = document.querySelectorAll('.gs-val-row');
    if (rows.length > 1) {
      btn.closest('.gs-val-row')?.remove();
    }
  };

  // Thêm result mapping
  FlowBuilder.addGSheetResultMapping = function() {
    var container = document.getElementById('gsResultMappingsContainer');
    if (!container) return;
    
    var columnsStr = document.getElementById('prop_columns')?.value || '[]';
    var columns = [];
    try { columns = JSON.parse(columnsStr); } catch(e) {}
    
    var idx = container.querySelectorAll('.gs-mapping-row').length;
    container.insertAdjacentHTML('beforeend', renderResultMappingRow(idx, { column: '', variableName: '' }, columns));
  };

  // Xóa result mapping
  FlowBuilder.removeGSheetResultMapping = function(btn) {
    var rows = document.querySelectorAll('.gs-mapping-row');
    if (rows.length > 1) {
      btn.closest('.gs-mapping-row')?.remove();
    }
  };

  // Auto-fill variable name khi chọn cột
  FlowBuilder.onGSheetMappingColChange = function(select) {
    var row = select.closest('.gs-mapping-row');
    if (!row) return;
    
    var varInput = row.querySelector('.gs-map-var');
    if (!varInput || varInput.value.trim()) return;
    
    var selectedOption = select.options[select.selectedIndex];
    var colName = selectedOption.dataset.name || selectedOption.text || '';
    
    // Chuyển thành tên biến hợp lệ
    var varName = colName.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/^[^a-z]+/, '');
    
    varInput.value = varName || 'col_' + select.value;
  };

  console.log('  ✓ Block google-sheet-data registered');

})();