// public/blocks/delay.js
// Block: Delay

(function() {
  'use strict';

  FlowBuilder.registerBlock('delay', {
    type: 'delay',
    name: 'Delay',
    desc: 'Chờ thời gian',
    icon: '⏱️',
    category: 'logic',
    color: '#fff3e0',
    
    defaultData: { 
      duration: 2000, 
      unit: 'ms' 
    },

    renderForm: function(block, data, context) {
      var TIME_UNITS = FlowBuilder.TIME_UNITS;
      
      return `
        <div class="property-group">
          <label class="property-label">Thời gian chờ</label>
          <div style="display:flex;gap:8px;">
            <input type="number" class="property-input" id="prop_duration" value="${data.duration || 2000}" min="0" style="flex:1">
            <select class="property-select" id="prop_unit" style="width:100px">
              ${TIME_UNITS.map(function(u) { 
                return '<option value="' + u.value + '" ' + (data.unit === u.value ? 'selected' : '') + '>' + u.label + '</option>'; 
              }).join('')}
            </select>
          </div>
        </div>
        <div class="property-info" style="margin-top:12px;">
          ⏱️ Chờ trước khi thực hiện block tiếp theo
        </div>
      `;
    },

    saveForm: function() {
      return {
        blockData: {
          duration: parseFloat(document.getElementById('prop_duration').value) || 2000,
          unit: document.getElementById('prop_unit').value || 'ms'
        }
      };
    },

    preview: function(data) {
      var units = { ms: 'ms', s: 'giây', m: 'phút', h: 'giờ' };
      return '⏱️ Chờ ' + (data.duration || 2000) + ' ' + (units[data.unit] || 'ms');
    }
  });

})();
