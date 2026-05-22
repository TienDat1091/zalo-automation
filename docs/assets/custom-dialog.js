(function () {
    // Prevent duplicate definition
    if (window.showAlert || window.showConfirm) return;

    // Save native alert/confirm for safe fallbacks
    const nativeAlert = window.alert;
    const nativeConfirm = window.confirm;

    let domInitialized = false;
    let overlay = null;
    let titleEl = null;
    let msgEl = null;
    let cancelBtn = null;
    let okBtn = null;

    let activeResolve = null;
    let keyHandler = null;

    function initDOM() {
        if (domInitialized) return;
        if (!document.body) return;

        // 1. Inject styles for Custom Dialog (Glassmorphism + Animations)
        const styleEl = document.createElement('style');
        styleEl.innerHTML = `
            .custom-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(15, 23, 42, 0.3);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999999;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .custom-dialog-overlay.show {
                opacity: 1;
                pointer-events: auto;
            }
            .custom-dialog-modal {
                background: rgba(255, 255, 255, 0.8);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.4);
                border-radius: 16px;
                width: 90%;
                max-width: 420px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                transform: scale(0.9) translateY(10px);
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                overflow: hidden;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                display: flex;
                flex-direction: column;
            }
            .custom-dialog-overlay.show .custom-dialog-modal {
                transform: scale(1) translateY(0);
            }

            /* Dark Mode styles */
            body.dark-mode .custom-dialog-modal,
            html.dark-mode .custom-dialog-modal {
                background: rgba(15, 23, 42, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.08);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
            }

            .custom-dialog-header {
                padding: 20px 24px 12px;
                font-size: 17px;
                font-weight: 600;
                color: #0f172a;
                display: flex;
                align-items: center;
                gap: 10px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.03);
            }
            body.dark-mode .custom-dialog-header,
            html.dark-mode .custom-dialog-header {
                color: #f8fafc;
                border-bottom: 1px solid rgba(255, 255, 255, 0.03);
            }

            .custom-dialog-body {
                padding: 16px 24px 24px;
                font-size: 14.5px;
                line-height: 1.6;
                color: #475569;
                word-break: break-word;
                max-height: 70vh;
                overflow-y: auto;
            }
            body.dark-mode .custom-dialog-body,
            html.dark-mode .custom-dialog-body {
                color: #cbd5e1;
            }

            .custom-dialog-footer {
                padding: 14px 24px;
                background: rgba(248, 250, 252, 0.4);
                border-top: 1px solid rgba(0, 0, 0, 0.05);
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }
            body.dark-mode .custom-dialog-footer,
            html.dark-mode .custom-dialog-footer {
                background: rgba(30, 41, 59, 0.4);
                border-top: 1px solid rgba(255, 255, 255, 0.05);
            }

            .custom-dialog-btn {
                padding: 9px 18px;
                font-size: 13.5px;
                font-weight: 500;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                border: none;
                outline: none;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .custom-dialog-btn.cancel {
                background: #f1f5f9;
                color: #475569;
            }
            .custom-dialog-btn.cancel:hover {
                background: #e2e8f0;
                color: #1e293b;
            }
            body.dark-mode .custom-dialog-btn.cancel,
            html.dark-mode .custom-dialog-btn.cancel {
                background: #334155;
                color: #cbd5e1;
            }
            body.dark-mode .custom-dialog-btn.cancel:hover,
            html.dark-mode .custom-dialog-btn.cancel:hover {
                background: #475569;
                color: #f8fafc;
            }

            .custom-dialog-btn.ok {
                background: #4f46e5;
                color: white;
                box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);
            }
            .custom-dialog-btn.ok:hover {
                background: #4338ca;
                box-shadow: 0 4px 6px rgba(79, 70, 229, 0.3);
            }
            body.dark-mode .custom-dialog-btn.ok,
            html.dark-mode .custom-dialog-btn.ok {
                background: #6366f1;
                box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);
            }
            body.dark-mode .custom-dialog-btn.ok:hover,
            html.dark-mode .custom-dialog-btn.ok:hover {
                background: #4f46e5;
                box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3);
            }
        `;
        document.head.appendChild(styleEl);

        // 2. Append HTML structure dynamically
        const containerDiv = document.createElement('div');
        containerDiv.innerHTML = `
            <div class="custom-dialog-overlay" id="customDialogOverlay">
                <div class="custom-dialog-modal">
                    <div class="custom-dialog-header" id="customDialogTitle">⚠️ Thông báo</div>
                    <div class="custom-dialog-body" id="customDialogMessage"></div>
                    <div class="custom-dialog-footer">
                        <button class="custom-dialog-btn cancel" id="customDialogCancelBtn">Hủy</button>
                        <button class="custom-dialog-btn ok" id="customDialogOkBtn">Xác nhận</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(containerDiv.firstElementChild);

        overlay = document.getElementById('customDialogOverlay');
        titleEl = document.getElementById('customDialogTitle');
        msgEl = document.getElementById('customDialogMessage');
        cancelBtn = document.getElementById('customDialogCancelBtn');
        okBtn = document.getElementById('customDialogOkBtn');

        // Set click handlers
        okBtn.addEventListener('click', () => handleClose(true));
        cancelBtn.addEventListener('click', () => handleClose(false));

        domInitialized = true;
    }

    // Try to init on DOMContentLoaded or immediately if body is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDOM);
    } else {
        initDOM();
    }

    function handleClose(result) {
        if (!domInitialized) return;
        overlay.classList.remove('show');
        if (keyHandler) {
            window.removeEventListener('keydown', keyHandler);
            keyHandler = null;
        }
        if (activeResolve) {
            activeResolve(result);
            activeResolve = null;
        }
    }

    function showDialog(message, title, type = 'alert') {
        // Ensure DOM is initialized (in case it was called before DOMContentLoaded completed)
        initDOM();

        if (!domInitialized) {
            // Fallback to native using saved references to avoid recursion
            if (type === 'confirm') {
                return Promise.resolve(nativeConfirm.call(window, message));
            } else {
                nativeAlert.call(window, message);
                return Promise.resolve(true);
            }
        }

        // Handle cancel logic for any currently active dialog
        if (activeResolve) {
            handleClose(false);
        }

        // Apply dynamic contents
        titleEl.textContent = title || (type === 'confirm' ? '⚠️ Xác nhận' : '⚠️ Thông báo');
        msgEl.innerHTML = String(message || '').replace(/\n/g, '<br>');

        if (type === 'confirm') {
            cancelBtn.style.display = 'block';
            okBtn.textContent = 'Đồng ý';
        } else {
            cancelBtn.style.display = 'none';
            okBtn.textContent = 'Đóng';
        }

        overlay.classList.add('show');

        // Focus the OK button by default
        setTimeout(() => {
            if (okBtn) okBtn.focus();
        }, 50);

        // Bind keyboard actions
        keyHandler = function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleClose(false);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                handleClose(true);
            }
        };
        window.addEventListener('keydown', keyHandler);

        return new Promise((resolve) => {
            activeResolve = resolve;
        });
    }

    // Expose APIs
    window.showAlert = function (message, title) {
        return showDialog(message, title, 'alert');
    };

    window.showConfirm = function (message, title) {
        return showDialog(message, title, 'confirm');
    };

    // Override native functions
    window.alert = function (message, title) {
        return showDialog(message, title, 'alert');
    };

    window.confirm = function (message, title) {
        return showDialog(message, title, 'confirm');
    };
})();
