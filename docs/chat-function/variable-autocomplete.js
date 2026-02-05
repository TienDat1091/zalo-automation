/**
 * Variable Autocomplete Component
 * 
 * How to use:
 * 1. Include this script after websocket-helper.js
 * 2. Call VarAutocomplete.init() after DOM is ready
 * 3. Add class "var-autocomplete-enabled" to any input/textarea you want to enable
 * 
 * Example:
 *   <textarea class="var-autocomplete-enabled" id="myInput"></textarea>
 *   <script>VarAutocomplete.init();</script>
 */

window.VarAutocomplete = (function () {
    'use strict';

    let variables = {}; // { key: { description, category, example } }
    let currentDropdown = null;
    let currentInput = null;
    let selectedIndex = 0;
    let filteredVars = [];
    let isLoaded = false;

    // ========================================
    // FETCH VARIABLES FROM SERVER
    // ========================================
    async function loadVariables() {
        return new Promise((resolve) => {
            if (isLoaded && Object.keys(variables).length > 0) {
                return resolve(variables);
            }

            // Try to get from existing WebSocket or create a new one
            if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                const handler = function (event) {
                    const data = JSON.parse(event.data);
                    if (data.type === 'static_variables') {
                        variables = data.variables || {};
                        isLoaded = true;
                        window.ws.removeEventListener('message', handler);
                        resolve(variables);
                    }
                };
                window.ws.addEventListener('message', handler);
                window.ws.send(JSON.stringify({ type: 'get_static_variables' }));

                // Timeout fallback
                setTimeout(() => {
                    window.ws.removeEventListener('message', handler);
                    resolve(variables);
                }, 3000);
            } else {
                // No WebSocket, use hardcoded defaults
                variables = getDefaultVariables();
                isLoaded = true;
                resolve(variables);
            }
        });
    }

    function getDefaultVariables() {
        return {
            // Static variables (brown) - giá trị không đổi sau khi tạo
            'zalo_name': { description: 'Tên Zalo của người gửi', category: 'sender', example: 'Nguyễn Văn A', type: 'static' },
            'zalo_id': { description: 'ID Zalo của người gửi', category: 'sender', example: '716585949090695726', type: 'static' },
            'zalo_phone': { description: 'Số điện thoại người gửi', category: 'sender', example: '0901234567', type: 'static' },
            'my_name': { description: 'Tên Zalo của bạn', category: 'me', example: 'Tien Dat', type: 'static' },
            'my_id': { description: 'ID Zalo của bạn', category: 'me', example: '716585949090695726', type: 'static' },
            'message': { description: 'Nội dung tin nhắn gốc', category: 'message', example: 'Xin chào!', type: 'static' },
            'trigger_name': { description: 'Tên trigger đã kích hoạt', category: 'system', example: 'Chào hỏi', type: 'static' },
            'flow_name': { description: 'Tên Flow đang chạy', category: 'system', example: 'Flow Chào Mừng', type: 'static' },

            // Dynamic variables (blue) - giá trị thay đổi theo thời gian thực
            'time': { description: 'Giờ hiện tại', category: 'datetime', example: '14:30:00', type: 'dynamic' },
            'date': { description: 'Ngày hiện tại', category: 'datetime', example: '18/01/2026', type: 'dynamic' },
            'datetime': { description: 'Ngày giờ đầy đủ', category: 'datetime', example: '18/01/2026, 14:30:00', type: 'dynamic' },
            'weekday': { description: 'Thứ trong tuần', category: 'datetime', example: 'Thứ Bảy', type: 'dynamic' }
        };
    }

    // ========================================
    // CREATE DROPDOWN UI
    // ========================================
    function createDropdown() {
        if (currentDropdown) return currentDropdown;

        const dropdown = document.createElement('div');
        dropdown.className = 'var-autocomplete-dropdown';
        dropdown.innerHTML = `
      <div class="var-autocomplete-list"></div>
    `;
        document.body.appendChild(dropdown);

        // Add styles if not already present
        if (!document.getElementById('var-autocomplete-styles')) {
            const style = document.createElement('style');
            style.id = 'var-autocomplete-styles';
            style.textContent = `
        .var-autocomplete-dropdown {
          position: fixed;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          max-height: 280px;
          overflow-y: auto;
          z-index: 10001;
          min-width: 280px;
          max-width: 400px;
          display: none;
        }
        .var-autocomplete-list {
          padding: 4px 0;
        }
        .var-autocomplete-item {
          padding: 10px 14px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 2px;
          border-bottom: 1px solid #f0f0f0;
          transition: background 0.15s;
        }
        .var-autocomplete-item:last-child {
          border-bottom: none;
        }
        .var-autocomplete-item:hover,
        .var-autocomplete-item.selected {
          background: #f0f7ff;
        }
        .var-autocomplete-item .var-name {
          font-weight: 600;
          font-size: 13px;
        }
        /* Static variables - brown */
        .var-autocomplete-item.var-type-static .var-name {
          color: #8B4513;
        }
        .var-autocomplete-item.var-type-static {
          border-left: 3px solid #8B4513;
        }
        /* Dynamic variables - blue */
        .var-autocomplete-item.var-type-dynamic .var-name {
          color: #0066cc;
        }
        .var-autocomplete-item.var-type-dynamic {
          border-left: 3px solid #0066cc;
        }
        .var-type-badge {
          display: inline-block;
          font-size: 9px;
          padding: 1px 5px;
          border-radius: 3px;
          margin-left: 6px;
          font-weight: 500;
        }
        .var-type-badge.static {
          background: #f5e6d3;
          color: #8B4513;
        }
        .var-type-badge.dynamic {
          background: #e3f2fd;
          color: #0066cc;
        }
        .var-autocomplete-item .var-desc {
          font-size: 11px;
          color: #666;
        }
        .var-autocomplete-item .var-example {
          font-size: 10px;
          color: #999;
          font-style: italic;
        }
        .var-autocomplete-category {
          padding: 6px 14px;
          background: #f5f5f5;
          font-size: 10px;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .var-autocomplete-empty {
          padding: 20px;
          text-align: center;
          color: #999;
          font-size: 13px;
        }
      `;
            document.head.appendChild(style);
        }

        currentDropdown = dropdown;
        return dropdown;
    }

    // ========================================
    // SHOW/HIDE DROPDOWN
    // ========================================
    function showDropdown(input, filter = '') {
        const dropdown = createDropdown();
        const list = dropdown.querySelector('.var-autocomplete-list');

        // Filter variables
        const lowerFilter = filter.toLowerCase();
        filteredVars = Object.entries(variables).filter(([key, val]) => {
            return key.toLowerCase().includes(lowerFilter) ||
                val.description.toLowerCase().includes(lowerFilter);
        });

        if (filteredVars.length === 0) {
            list.innerHTML = '<div class="var-autocomplete-empty">Không tìm thấy biến phù hợp</div>';
        } else {
            // Group by category
            const groups = {};
            filteredVars.forEach(([key, val]) => {
                const cat = val.category || 'other';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push([key, val]);
            });

            let html = '';
            const categoryLabels = {
                'sender': '👤 Người gửi',
                'me': '🙋 Tài khoản bạn',
                'datetime': '📅 Ngày giờ',
                'message': '💬 Tin nhắn',
                'system': '⚙️ Hệ thống',
                'other': '📋 Khác'
            };

            let itemIndex = 0;
            for (const [cat, items] of Object.entries(groups)) {
                html += `<div class="var-autocomplete-category">${categoryLabels[cat] || cat}</div>`;
                for (const [key, val] of items) {
                    const varType = val.type || 'static';
                    const typeBadge = varType === 'dynamic'
                        ? '<span class="var-type-badge dynamic">động</span>'
                        : '<span class="var-type-badge static">tĩnh</span>';
                    html += `
            <div class="var-autocomplete-item var-type-${varType} ${itemIndex === selectedIndex ? 'selected' : ''}" data-key="${key}" data-index="${itemIndex}">
              <span class="var-name">{${key}}${typeBadge}</span>
              <span class="var-desc">${val.description}</span>
              ${val.example ? `<span class="var-example">VD: ${val.example}</span>` : ''}
            </div>
          `;
                    itemIndex++;
                }
            }
            list.innerHTML = html;

            // Add click handlers
            list.querySelectorAll('.var-autocomplete-item').forEach(item => {
                item.addEventListener('click', () => {
                    insertVariable(input, item.dataset.key);
                    hideDropdown();
                });
            });
        }

        // Position dropdown near input
        const rect = input.getBoundingClientRect();
        const cursorPos = getCursorXY(input);

        dropdown.style.left = Math.min(cursorPos.x, window.innerWidth - 320) + 'px';
        dropdown.style.top = (cursorPos.y + 20) + 'px';
        dropdown.style.display = 'block';

        currentInput = input;
        selectedIndex = 0;
        updateSelection();
    }

    function hideDropdown() {
        if (currentDropdown) {
            currentDropdown.style.display = 'none';
        }
        currentInput = null;
        filteredVars = [];
        selectedIndex = 0;
    }

    function updateSelection() {
        if (!currentDropdown) return;
        const items = currentDropdown.querySelectorAll('.var-autocomplete-item');
        items.forEach((item, i) => {
            item.classList.toggle('selected', i === selectedIndex);
        });
        // Scroll into view
        const selected = items[selectedIndex];
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
    }

    // ========================================
    // CURSOR POSITION HELPERS
    // ========================================
    function getCursorXY(input) {
        const rect = input.getBoundingClientRect();
        // Simple approximation - place near input
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        return {
            x: rect.left + scrollLeft + 20,
            y: rect.bottom + scrollTop
        };
    }

    function getTextBeforeCursor(input) {
        const cursorPos = input.selectionStart;
        return input.value.substring(0, cursorPos);
    }

    function getLastOpenBrace(text) {
        // Find the last unclosed { before cursor
        const lastBrace = text.lastIndexOf('{');
        if (lastBrace === -1) return null;

        // Check if there's a } after it
        const afterBrace = text.substring(lastBrace);
        if (afterBrace.includes('}')) return null;

        return {
            position: lastBrace,
            filter: text.substring(lastBrace + 1)
        };
    }

    // ========================================
    // INSERT VARIABLE
    // ========================================
    function insertVariable(input, varKey) {
        const cursorPos = input.selectionStart;
        const textBefore = input.value.substring(0, cursorPos);
        const textAfter = input.value.substring(cursorPos);

        // Find the { to replace
        const braceInfo = getLastOpenBrace(textBefore);
        if (!braceInfo) return;

        const newTextBefore = textBefore.substring(0, braceInfo.position);
        const newValue = newTextBefore + `{${varKey}}` + textAfter;

        input.value = newValue;

        // Set cursor after the inserted variable
        const newCursorPos = braceInfo.position + varKey.length + 2;
        input.setSelectionRange(newCursorPos, newCursorPos);
        input.focus();

        // Trigger input event so other handlers can update
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================
    function handleInput(event) {
        const input = event.target;
        const textBefore = getTextBeforeCursor(input);
        const braceInfo = getLastOpenBrace(textBefore);

        if (braceInfo) {
            showDropdown(input, braceInfo.filter);
        } else {
            hideDropdown();
        }
    }

    function handleKeydown(event) {
        if (!currentDropdown || currentDropdown.style.display === 'none') return;

        const input = event.target;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, filteredVars.length - 1);
                updateSelection();
                break;

            case 'ArrowUp':
                event.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updateSelection();
                break;

            case 'Enter':
            case 'Tab':
                if (filteredVars.length > 0) {
                    event.preventDefault();
                    const selectedVar = filteredVars[selectedIndex];
                    if (selectedVar) {
                        insertVariable(input, selectedVar[0]);
                        hideDropdown();
                    }
                }
                break;

            case 'Escape':
                hideDropdown();
                break;
        }
    }

    function handleBlur(event) {
        // Delay to allow click on dropdown items
        setTimeout(() => {
            if (!currentDropdown?.contains(document.activeElement)) {
                hideDropdown();
            }
        }, 200);
    }

    // ========================================
    // INITIALIZATION
    // ========================================
    function init() {
        // Load variables first
        loadVariables().then(() => {
            console.log('✅ Variable Autocomplete loaded', Object.keys(variables).length, 'variables');
        });

        // Use event delegation for dynamic elements
        document.addEventListener('input', (e) => {
            if (e.target.matches('.var-autocomplete-enabled, [data-var-autocomplete]')) {
                handleInput(e);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.target.matches('.var-autocomplete-enabled, [data-var-autocomplete]')) {
                handleKeydown(e);
            }
        });

        document.addEventListener('blur', (e) => {
            if (e.target.matches('.var-autocomplete-enabled, [data-var-autocomplete]')) {
                handleBlur(e);
            }
        }, true);

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (currentDropdown && !currentDropdown.contains(e.target) && e.target !== currentInput) {
                hideDropdown();
            }
        });

        console.log('🎯 Variable Autocomplete initialized');
    }

    // Expose public API
    return {
        init: init,
        loadVariables: loadVariables,
        getVariables: () => variables,
        showDropdown: showDropdown,
        hideDropdown: hideDropdown
    };
})();

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VarAutocomplete.init());
} else {
    VarAutocomplete.init();
}
