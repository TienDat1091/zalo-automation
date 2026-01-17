// public/blocks/find-user.js
// Block: Find User - Tìm kiếm người dùng Zalo qua SĐT hoặc biến

(function () {
    'use strict';

    FlowBuilder.registerBlock('find-user', {
        type: 'find-user',
        name: 'Tìm User',
        desc: 'Tìm người dùng Zalo',
        icon: '🔍',
        category: 'action',
        color: '#e3f2fd',

        defaultData: {
            searchType: 'variable',     // 'variable' hoặc 'manual'
            phoneVariable: '',          // Biến chứa số điện thoại 
            manualPhone: '',            // Số điện thoại nhập thủ công
            saveToVariables: true,      // Lưu kết quả vào biến
            resultVariables: {
                uid: 'found_user_id',
                displayName: 'found_user_name',
                avatar: 'found_user_avatar',
                gender: 'found_user_gender'
            },
            onNotFound: 'continue'      // 'continue' hoặc 'stop'
        },

        renderForm: function (block, data, context) {
            var searchType = data.searchType || 'variable';
            var resultVars = data.resultVariables || {
                uid: 'found_user_id',
                displayName: 'found_user_name',
                avatar: 'found_user_avatar',
                gender: 'found_user_gender'
            };

            return `
        <div class="property-group">
          <label class="property-label">📱 Nguồn số điện thoại</label>
          <select class="property-select" id="prop_searchType" onchange="toggleFindUserInputType()">
            <option value="variable" ${searchType === 'variable' ? 'selected' : ''}>Từ biến</option>
            <option value="manual" ${searchType === 'manual' ? 'selected' : ''}>Nhập thủ công</option>
          </select>
        </div>

        <div class="property-group" id="findUserVariableGroup" style="${searchType === 'variable' ? '' : 'display:none'}">
          <label class="property-label">Tên biến chứa SĐT</label>
          <input class="property-input" id="prop_phoneVariable" value="${FlowBuilder.escapeHtml(data.phoneVariable || '')}" placeholder="VD: user_phone">
          <div style="font-size:11px;color:#888;margin-top:4px;">Sử dụng {tên_biến} từ block trước</div>
        </div>

        <div class="property-group" id="findUserManualGroup" style="${searchType === 'manual' ? '' : 'display:none'}">
          <label class="property-label">Số điện thoại</label>
          <input class="property-input" id="prop_manualPhone" value="${FlowBuilder.escapeHtml(data.manualPhone || '')}" placeholder="VD: 0901234567">
        </div>

        <div class="property-group">
          <label class="property-label" style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="prop_saveToVariables" ${data.saveToVariables !== false ? 'checked' : ''}>
            💾 Lưu kết quả vào biến
          </label>
        </div>

        <div id="resultVariablesGroup" style="background:#f5f7fa;padding:12px;border-radius:8px;margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;color:#666;margin-bottom:10px;">📝 Tên biến lưu kết quả:</div>
          <div style="display:grid;gap:8px;">
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="min-width:80px;font-size:12px;color:#888;">User ID:</span>
              <input class="property-input" id="prop_var_uid" value="${FlowBuilder.escapeHtml(resultVars.uid || 'found_user_id')}" placeholder="found_user_id">
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="min-width:80px;font-size:12px;color:#888;">Tên:</span>
              <input class="property-input" id="prop_var_displayName" value="${FlowBuilder.escapeHtml(resultVars.displayName || 'found_user_name')}" placeholder="found_user_name">
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="min-width:80px;font-size:12px;color:#888;">Avatar:</span>
              <input class="property-input" id="prop_var_avatar" value="${FlowBuilder.escapeHtml(resultVars.avatar || 'found_user_avatar')}" placeholder="found_user_avatar">
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="min-width:80px;font-size:12px;color:#888;">Giới tính:</span>
              <input class="property-input" id="prop_var_gender" value="${FlowBuilder.escapeHtml(resultVars.gender || 'found_user_gender')}" placeholder="found_user_gender">
            </div>
          </div>
        </div>

        <div class="property-group">
          <label class="property-label">Khi không tìm thấy</label>
          <select class="property-select" id="prop_onNotFound">
            <option value="continue" ${data.onNotFound === 'continue' ? 'selected' : ''}>Tiếp tục flow</option>
            <option value="stop" ${data.onNotFound === 'stop' ? 'selected' : ''}>Dừng flow</option>
          </select>
        </div>
      `;
        },

        saveForm: function () {
            return {
                blockData: {
                    searchType: document.getElementById('prop_searchType').value,
                    phoneVariable: document.getElementById('prop_phoneVariable').value.trim(),
                    manualPhone: document.getElementById('prop_manualPhone').value.trim(),
                    saveToVariables: document.getElementById('prop_saveToVariables').checked,
                    resultVariables: {
                        uid: document.getElementById('prop_var_uid').value.trim() || 'found_user_id',
                        displayName: document.getElementById('prop_var_displayName').value.trim() || 'found_user_name',
                        avatar: document.getElementById('prop_var_avatar').value.trim() || 'found_user_avatar',
                        gender: document.getElementById('prop_var_gender').value.trim() || 'found_user_gender'
                    },
                    onNotFound: document.getElementById('prop_onNotFound').value
                }
            };
        },

        preview: function (data) {
            var source = data.searchType === 'manual' ? data.manualPhone : '{' + (data.phoneVariable || '?') + '}';
            return '🔍 Tìm: ' + (source || '...');
        }
    });

    // Toggle input type helper
    window.toggleFindUserInputType = function () {
        var val = document.getElementById('prop_searchType').value;
        document.getElementById('findUserVariableGroup').style.display = val === 'variable' ? '' : 'none';
        document.getElementById('findUserManualGroup').style.display = val === 'manual' ? '' : 'none';
    };

})();
