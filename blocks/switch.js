(function() {
  'use strict';

  // Store options HTML globally for use in addCase
  window._switchOptionsHtml = '';

  window.addCase = function() {
    console.log('SwitchBlock: addCase called');
    var container = document.getElementById('switch_cases_container');
    console.log('  container found:', !!container);
    if (!container) return;
    
    var idx = container.querySelectorAll('.switch-case-row').length;
    var optionsHtml = window._switchOptionsHtml || '';
    
    var rowHtml = '<div class="switch-case-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;width:100%;flex-wrap:wrap;">'
      + '<input type="text" class="switch-case-value" placeholder="giá trị case" style="flex:1;min-width:60px;padding:10px !important;border:2px solid #0084ff !important;border-radius:6px !important;font-size:13px !important;background:white !important;color:#333 !important;cursor:text !important;pointer-events:auto !important;box-sizing:border-box;" />'
      + '<select class="switch-case-mode" onchange="updateCaseModeUI(this)" style="width:100px;padding:10px !important;border:2px solid #0084ff !important;border-radius:6px !important;font-size:13px !important;background:white !important;cursor:pointer !important;pointer-events:auto !important;box-sizing:border-box;">'
        + '<option value="reply">📝 Trả lời</option>'
        + '<option value="flow">🔗 Flow</option>'
      + '</select>'
      + '<select class="switch-case-target" style="width:150px;padding:10px !important;border:2px solid #0084ff !important;border-radius:6px !important;font-size:13px !important;background:white !important;cursor:pointer !important;pointer-events:auto !important;box-sizing:border-box;display:none;">'
        + '<option value="">-- Chọn Flow --</option>' + optionsHtml
      + '</select>'
      + '<input type="text" class="switch-case-reply" placeholder="tin nhắn trả lời" style="flex:1;min-width:100px;padding:10px !important;border:2px solid #0084ff !important;border-radius:6px !important;font-size:13px !important;background:white !important;color:#333 !important;cursor:text !important;pointer-events:auto !important;box-sizing:border-box;" />'
      + '<button type="button" class="btn btn-danger" onclick="removeCase(event)" style="min-width:60px;">Xóa</button>'
      + '</div>';
    
    container.insertAdjacentHTML('beforeend', rowHtml);
    console.log('  row added, total rows:', container.querySelectorAll('.switch-case-row').length);
  };

  window.updateCaseModeUI = function(select) {
    var row = select.closest('.switch-case-row');
    var mode = select.value;
    var targetSelect = row.querySelector('.switch-case-target');
    var replyInput = row.querySelector('.switch-case-reply');
    
    if (mode === 'flow') {
      targetSelect.style.display = '';
      replyInput.style.display = 'none';
    } else {
      targetSelect.style.display = 'none';
      replyInput.style.display = '';
    }
  };

  window.removeCase = function(e) {
    if (e && e.preventDefault) e.preventDefault();
    var btn = e.target || e;
    var row = btn.closest('.switch-case-row');
    if (row) {
      row.remove();
      console.log('SwitchBlock: case removed, remaining:', document.querySelectorAll('.switch-case-row').length);
    }
  };

  FlowBuilder.registerBlock('switch', {
    type: 'switch',
    name: 'Switch/Case',
    desc: 'Chuyển nhánh theo giá trị biến',
    icon: '🔁',
    category: 'logic',
    color: '#fff3e0',

    defaultData: {
      variableName: '',
      cases: [ { value: '', mode: 'reply', targetTriggerId: null, replyMessage: '' } ],
      defaultMode: 'reply',
      defaultTriggerId: null,
      defaultReply: ''
    },

    renderForm: function(block, data, context) {
      var triggers = (context && context.allTriggers) || window.allTriggers || [];
      var currentId = (context && context.currentTriggerId) || window.currentTriggerId;
      var others = triggers.filter(function(t) { return t.triggerID !== currentId; });

      data = data || {};
      var cases = data.cases || [];
      
      // Store options for addCase
      var optionsHtml = others.map(function(t){ return '<option value="'+t.triggerID+'">'+FlowBuilder.escapeHtml(t.triggerName)+'</option>'; }).join('');
      window._switchOptionsHtml = optionsHtml;

      var rowsHtml = cases.map(function(c, idx) {
        var mode = c.mode || 'reply';
        var showTarget = mode === 'flow' ? '' : 'none';
        var showReply = mode === 'reply' ? '' : 'none';
        return '<div class="switch-case-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;width:100%;flex-wrap:wrap;">'
          + '<input type="text" class="switch-case-value" placeholder="giá trị case" value="' + FlowBuilder.escapeHtml(c.value||'') + '" style="flex:1;min-width:60px;padding:10px !important;border:2px solid #0084ff !important;border-radius:6px !important;font-size:13px !important;background:white !important;color:#333 !important;cursor:text !important;pointer-events:auto !important;box-sizing:border-box;" />'
          + '<select class="switch-case-mode" onchange="updateCaseModeUI(this)" style="width:100px;padding:10px !important;border:2px solid #0084ff !important;border-radius:6px !important;font-size:13px !important;background:white !important;cursor:pointer !important;pointer-events:auto !important;box-sizing:border-box;">'
            + '<option value="reply" '+(mode==='reply'?'selected':'')+'>📝 Trả lời</option>'
            + '<option value="flow" '+(mode==='flow'?'selected':'')+'>🔗 Flow</option>'
          + '</select>'
          + '<select class="switch-case-target" style="width:150px;padding:10px !important;border:2px solid #0084ff !important;border-radius:6px !important;font-size:13px !important;background:white !important;cursor:pointer !important;pointer-events:auto !important;box-sizing:border-box;display:'+showTarget+';">'
            + '<option value="">-- Chọn Flow --</option>'
            + others.map(function(t){ return '<option value="'+t.triggerID+'" '+((c.targetTriggerId==t.triggerID)?'selected':'')+ '>'+FlowBuilder.escapeHtml(t.triggerName)+'</option>'; }).join('')
          + '</select>'
          + '<input type="text" class="switch-case-reply" placeholder="tin nhắn trả lời" value="' + FlowBuilder.escapeHtml(c.replyMessage||'') + '" style="flex:1;min-width:100px;padding:10px !important;border:2px solid #0084ff !important;border-radius:6px !important;font-size:13px !important;background:white !important;color:#333 !important;cursor:text !important;pointer-events:auto !important;box-sizing:border-box;display:'+showReply+';" />'
          + '<button type="button" class="btn btn-danger" onclick="removeCase(event)" style="min-width:60px;">Xóa</button>'
          + '</div>';
      }).join('');

      var html = '<div class="property-group">'
        + '<label class="property-label">Tên biến (variable) <span class="required">*</span></label>'
        + '<input type="text" class="property-input" id="switch_variableName" value="' + FlowBuilder.escapeHtml(data.variableName||'') + '" placeholder="my_var" style="padding:10px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;background:white;color:#333;cursor:text;pointer-events:auto;">'
        + '</div>'
        + '<div class="property-group">'
          + '<label class="property-label">Cases</label>'
          + '<div id="switch_cases_container" style="max-height:400px;overflow-y:auto;border:1px solid #e0e0e0;border-radius:6px;padding:8px;background:white;">' + rowsHtml + '</div>'
          + '<button type="button" class="btn btn-primary" onclick="addCase()" style="margin-top:8px;width:100%">+ Thêm case</button>'
        + '</div>'
        + '<div class="property-group">'
          + '<label class="property-label">Default Mode</label>'
          + '<select class="property-select" id="switch_defaultMode" style="padding:10px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;background:white;cursor:pointer;" onchange="updateDefaultModeUI()">'
            + '<option value="reply" '+(data.defaultMode==='reply'||!data.defaultMode?'selected':'')+'>📝 Trả lời</option>'
            + '<option value="flow" '+(data.defaultMode==='flow'?'selected':'')+'>🔗 Flow</option>'
          + '</select>'
        + '</div>'
        + '<div class="property-group" id="switch_defaultFlowGroup" style="display:'+(data.defaultMode==='flow'?'':'none')+'">'
          + '<label class="property-label">Default → Chạy Flow (tùy chọn)</label>'
          + '<select class="property-select" id="switch_defaultTriggerId" style="padding:10px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;background:white;cursor:pointer;">'
            + '<option value="">-- Không --</option>'
            + others.map(function(t){ return '<option value="'+t.triggerID+'" '+((data.defaultTriggerId==t.triggerID)?'selected':'')+'>'+FlowBuilder.escapeHtml(t.triggerName)+'</option>'; }).join('')
          + '</select>'
        + '</div>'
        + '<div class="property-group" id="switch_defaultReplyGroup" style="display:'+(data.defaultMode==='flow'?'none':'')+'">'
          + '<label class="property-label">Default reply</label>'
          + '<input type="text" class="property-input" id="switch_defaultReply" value="' + FlowBuilder.escapeHtml(data.defaultReply||'') + '" placeholder="tin nhắn mặc định" style="padding:10px 12px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;background:white;color:#333;cursor:text;pointer-events:auto;">'
        + '</div>'
        + '<script>'
          + 'window.updateDefaultModeUI = function() {'
            + 'var mode = document.getElementById("switch_defaultMode").value;'
            + 'var flowGroup = document.getElementById("switch_defaultFlowGroup");'
            + 'var replyGroup = document.getElementById("switch_defaultReplyGroup");'
            + 'if (mode === "flow") {'
              + 'flowGroup.style.display = "";'
              + 'replyGroup.style.display = "none";'
            + '} else {'
              + 'flowGroup.style.display = "none";'
              + 'replyGroup.style.display = "";'
            + '}'
          + '};'
        + '</script>';

      return html;
    },

    saveForm: function() {
      var variableName = document.getElementById('switch_variableName').value;
      var defaultMode = document.getElementById('switch_defaultMode').value;
      var defaultTriggerId = document.getElementById('switch_defaultTriggerId').value;
      var defaultReply = document.getElementById('switch_defaultReply').value;
      var container = document.getElementById('switch_cases_container');
      var rows = container ? container.querySelectorAll('.switch-case-row') : [];
      var cases = [];
      
      rows.forEach(function(r) {
        var value = r.querySelector('.switch-case-value').value;
        var mode = r.querySelector('.switch-case-mode').value;
        var targetId = r.querySelector('.switch-case-target').value;
        var reply = r.querySelector('.switch-case-reply').value;
        
        if (value && value.trim()) {
          cases.push({
            value: value,
            mode: mode || 'reply',
            targetTriggerId: targetId ? parseInt(targetId) : null,
            replyMessage: reply || ''
          });
        }
      });
      
      var result = {
        blockData: {
          variableName: variableName || '',
          cases: cases,
          defaultMode: defaultMode || 'reply',
          defaultTriggerId: defaultTriggerId ? parseInt(defaultTriggerId) : null,
          defaultReply: defaultReply || ''
        }
      };
      
      console.log('SwitchBlock: saveForm', result);
      return result;
    },

    preview: function(data) {
      if (!data || !data.variableName) return '⚠️ Chưa cấu hình';
      var count = (data.cases||[]).length;
      return '🔁 Switch {' + data.variableName + '} (' + count + ' case)';
    }
  });

})();
