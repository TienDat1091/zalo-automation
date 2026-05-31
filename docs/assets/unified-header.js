/**
 * Unified Header Manager
 * Handles User Info, Notifications, and Navigation
 */

(function () {
    // 🌙 Apply dark mode immediately to prevent white flash
    try {
        if (localStorage.getItem('theme') === 'dark') {
            document.documentElement.classList.add('dark-mode');
        }
    } catch (e) {}

    // Prevent duplicate init
    if (window.UnifiedHeader) return;

    const HEADER_HTML = `
    <style>
    .uh-dropdown-section-title {
        font-size: 11px;
        font-weight: 700;
        color: #888;
        padding: 10px 16px 4px 16px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        border-top: 1px solid rgba(0,0,0,0.05);
    }
    .uh-account-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .uh-account-item:hover {
        background: #f5f7fa;
    }
    .uh-account-item.active {
        background: #eef2ff;
        font-weight: 600;
    }
    .uh-account-left {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .uh-account-avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 1px solid rgba(0,0,0,0.1);
    }
    .uh-account-name {
        font-size: 13px;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 120px;
    }
    .uh-account-active-badge {
        color: #4CAF50;
        font-size: 11px;
        font-weight: bold;
    }
    .uh-account-remove {
        font-size: 12px;
        color: #ff5252;
        cursor: pointer;
        opacity: 0.5;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s;
        margin-left: 8px;
    }
    .uh-account-remove:hover {
        opacity: 1;
        background: rgba(255, 82, 82, 0.1);
    }
    </style>
    <div class="unified-header">
        <a href="/" class="uh-brand">
            <span class="icon">🤖</span>
            <span>Zalo Automation</span>
        </a>

        <div class="uh-center" id="uh-center"></div>
        
        <div class="uh-actions">
            <a href="dashboard.html" class="uh-nav-link" id="nav-dashboard">
                <span>🏠</span> <span class="uh-nav-text">Dashboard</span>
            </a>
            <a href="storage-info.html" class="uh-nav-link" id="nav-storage">
                <span>💾</span> <span class="uh-nav-text">Lưu trữ</span>
            </a>
            <a href="trigger-manager.html" class="uh-nav-link" id="nav-triggers">
                <span>⚡</span> <span class="uh-nav-text">Kịch bản</span>
            </a>
            <a href="unified-manager.html" class="uh-nav-link" id="nav-data">
                <span>📊</span> <span class="uh-nav-text">Dữ liệu</span>
            </a>
            <button class="uh-icon-btn" id="uh-dark-toggle" onclick="UnifiedHeader.toggleDarkMode()" title="Chế độ tối" style="font-size: 16px; margin-right: 8px;">
                🌙
            </button>
            
            <button class="uh-icon-btn" onclick="UnifiedHeader.toggleNotifications()" title="Thông báo">
                🔔 <span class="uh-badge" id="uh-notif-count" style="display:none">0</span>
            </button>
            <div class="uh-dropdown-menu" id="uh-notif-dropdown">
                <div class="uh-dropdown-header">
                    <span>Thông báo mới</span>
                    <button style="border:none;background:none;color:#666;cursor:pointer;font-size:12px;" onclick="UnifiedHeader.clearNotifications()">Xóa tất cả</button>
                </div>
                <div class="uh-dropdown-body" id="uh-notif-list">
                    <div style="padding:20px;text-align:center;color:#999;">Không có thông báo mới</div>
                </div>
            </div>

            <div class="uh-user-container">
                <div class="uh-user-profile" onclick="UnifiedHeader.toggleUserMenu(event)">
                    <div style="position:relative">
                        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23ccc' d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E" class="uh-avatar" id="uh-avatar">
                        <div class="uh-status-dot" id="uh-status-dot"></div>
                    </div>
                    <div class="uh-user-info">
                        <span class="uh-user-name" id="uh-user-name">Loading...</span>
                        <span class="uh-user-uid" id="uh-user-uid">---</span>
                    </div>
                    <span class="uh-dropdown-arrow">▼</span>
                </div>
                
                <div class="uh-dropdown-menu" id="uh-user-dropdown">
                    <div class="uh-menu-item" onclick="UnifiedHeader.showProfile()">
                        <span class="icon">👤</span> Xem thông tin cá nhân
                    </div>
                    <div class="uh-menu-item" onclick="UnifiedHeader.showSettings()">
                        <span class="icon">⚙️</span> Cài đặt hệ thống
                    </div>
                    <div class="uh-dropdown-section-title">📋 QUẢN LÝ TÀI KHOẢN</div>
                    <div id="uh-accounts-list-container">
                        <div style="padding:10px 16px;font-size:12px;color:#999;">Đang tải...</div>
                    </div>
                    <div class="uh-menu-item" onclick="UnifiedHeader.addAccount()">
                        <span class="icon">➕</span> Thêm tài khoản Zalo
                    </div>
                    <div class="uh-menu-divider"></div>
                    <div class="uh-menu-item logout" onclick="UnifiedHeader.logoutAll()">
                        <span class="icon">🚪</span> Đăng xuất tất cả
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="header-spacer"></div>

    <div class="uh-confirm-overlay" id="uh-confirm-overlay">
        <div class="uh-confirm-modal">
            <div class="uh-confirm-header" id="uh-confirm-title">⚠️ Xác nhận</div>
            <div class="uh-confirm-body" id="uh-confirm-message">Bạn có chắc chắn muốn thực hiện hành động này?</div>
            <div class="uh-confirm-footer">
                <button class="uh-confirm-btn cancel" onclick="UnifiedHeader.handleConfirm(false)">Hủy</button>
                <button class="uh-confirm-btn ok" onclick="UnifiedHeader.handleConfirm(true)">Đồng ý</button>
            </div>
        </div>
    </div>
    `;

    class UnifiedHeaderManager {
        constructor() {
            this.notifications = [];
            this.unreadCount = 0;
            this.ws = null;
            this.pendingActions = null;
            this.confirmResolve = null;
        }

        init() {
            // Check if existing unified header is present, if not inject it
            if (!document.querySelector('.unified-header')) {
                const temp = document.createElement('div');
                temp.innerHTML = HEADER_HTML;

                // Header elements go to the top
                document.body.prepend(temp.querySelector('.header-spacer'));
                document.body.prepend(temp.querySelector('.unified-header'));

                // Dialogs/Overlays can go to the bottom
                const overlay = temp.querySelector('.uh-confirm-overlay');
                if (overlay) document.body.appendChild(overlay);
            }

            if (this.pendingActions) {
                this.setPageActions(this.pendingActions);
            }

            this.highlightActiveNav();
            this.connectWebSocket();

            // ✅ OPTIMIZATION: Restore cached user info immediately (no WS wait)
            try {
                const cachedUser = sessionStorage.getItem('zalo_user_cache');
                if (cachedUser) {
                    const user = JSON.parse(cachedUser);
                    this.updateUser(user, true); // true = skip re-cache
                }
            } catch (e) { /* ignore */ }

            // Load CSS if not present
            if (!document.querySelector('link[href*="unified-header.css"]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = '/assets/unified-header.css';
                document.head.appendChild(link);
            }

            // Load custom-dialog.js if not present
            if (!document.querySelector('script[src*="custom-dialog.js"]')) {
                const script = document.createElement('script');
                script.src = '/assets/custom-dialog.js';
                document.head.appendChild(script);
            }

            // 🌙 Apply dark mode to body and update toggle icon
            const savedTheme = localStorage.getItem('theme') || 'light';
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
                const toggleBtn = document.getElementById('uh-dark-toggle');
                if (toggleBtn) toggleBtn.textContent = '☀️';
            }
        }

        highlightActiveNav() {
            const loc = location.pathname;
            if (loc.includes('dashboard')) document.getElementById('nav-dashboard').classList.add('active');
            else if (loc.includes('trigger')) document.getElementById('nav-triggers').classList.add('active');
            else if (loc.includes('unified') || loc.includes('manager')) document.getElementById('nav-data').classList.add('active');
        }

        connectWebSocket() {
            // ✅ OPTIMIZATION: Try to reuse existing page WebSocket to avoid duplicate connections
            const self = this;

            // Method to hook into an existing WS
            const hookIntoWS = (existingWS) => {
                self.ws = existingWS;
                console.log('🔗 Unified Header: Reusing existing WebSocket connection');
                
                // Wrap existing onmessage to also handle header messages
                const originalOnMessage = existingWS.onmessage;
                existingWS.onmessage = (e) => {
                    // Call original handler first
                    if (originalOnMessage) originalOnMessage.call(existingWS, e);
                    // Then handle header messages
                    try {
                        const data = JSON.parse(e.data);
                        self.handleMessage(data);
                    } catch (err) { /* ignore */ }
                };

                // Update status dot
                if (existingWS.readyState === WebSocket.OPEN) {
                    document.getElementById('uh-status-dot').className = 'uh-status-dot online';
                    // Request user info if not yet received
                    if (!self.currentUser) {
                        existingWS.send(JSON.stringify({ type: 'get_current_user' }));
                        existingWS.send(JSON.stringify({ type: 'get_auto_reply_status' }));
                        existingWS.send(JSON.stringify({ type: 'get_bot_auto_reply_status' }));
                    }
                    existingWS.send(JSON.stringify({ type: 'get_accounts' }));
                    existingWS.send(JSON.stringify({ type: 'get_activity_logs', limit: 20 }));
                }

                const originalOnClose = existingWS.onclose;
                existingWS.onclose = (e) => {
                    if (originalOnClose) originalOnClose.call(existingWS, e);
                    document.getElementById('uh-status-dot').className = 'uh-status-dot';
                };
            };

            // Expose hook for pages to register their WS
            window._uhRegisterWS = (ws) => hookIntoWS(ws);

            // Check if page already has a WS (common variable names)
            const checkExistingWS = () => {
                if (window.ws && window.ws instanceof WebSocket) {
                    hookIntoWS(window.ws);
                    return true;
                }
                return false;
            };

            // Try immediately, then retry a few times (page WS may init after header)
            if (!checkExistingWS()) {
                let retries = 0;
                const retryInterval = setInterval(() => {
                    retries++;
                    if (checkExistingWS() || retries >= 10) {
                        clearInterval(retryInterval);
                        // If still no page WS found after retries, create our own lightweight one
                        if (!self.ws) {
                            console.log('🔌 Unified Header: Creating own WebSocket (no page WS found)');
                            const initOwnWS = () => {
                                self.ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host);
                                self.ws.onopen = () => {
                                    self.ws.send(JSON.stringify({ type: 'get_current_user' }));
                                    self.ws.send(JSON.stringify({ type: 'get_auto_reply_status' }));
                                    self.ws.send(JSON.stringify({ type: 'get_bot_auto_reply_status' }));
                                    self.ws.send(JSON.stringify({ type: 'get_accounts' }));
                                    self.ws.send(JSON.stringify({ type: 'get_activity_logs', limit: 20 }));
                                    document.getElementById('uh-status-dot').className = 'uh-status-dot online';
                                };
                                self.ws.onmessage = (e) => {
                                    try {
                                        const data = JSON.parse(e.data);
                                        self.handleMessage(data);
                                    } catch (err) { /* ignore */ }
                                };
                                self.ws.onclose = () => {
                                    document.getElementById('uh-status-dot').className = 'uh-status-dot';
                                    setTimeout(initOwnWS, 5000);
                                };
                            };
                            initOwnWS();
                        }
                    }
                }, 200); // Check every 200ms for up to 2 seconds
            }
        }

        handleMessage(data) {
            console.log('WS Msg:', data.type);
            if (data.type === 'current_user' && data.user) {
                this.updateUser(data.user);
            }

            if (data.type === 'accounts_list' && Array.isArray(data.accounts)) {
                this.renderAccounts(data.accounts, data.activeAccountUID);
            }

            if (data.type === 'activity_logs' && Array.isArray(data.logs)) {
                this.notifications = data.logs.map(n => {
                    let icon = '📝';
                    if (n.entityType === 'scheduled_task') icon = '📅';
                    else if (n.action?.toLowerCase().includes('delete') || n.action?.toLowerCase().includes('remove')) icon = '🗑️';
                    else if (n.action?.toLowerCase().includes('create') || n.action?.toLowerCase().includes('add')) icon = '✅';
                    else if (n.action?.toLowerCase().includes('update') || n.action?.toLowerCase().includes('edit')) icon = '✏️';
                    else if (n.entityType === 'trigger') icon = '⚡';
                    else if (n.entityType === 'friend') icon = '👥';
                    else if (n.action === 'BLOCK') icon = '🚫';
                    else if (n.action === 'UNBLOCK') icon = '👥';

                    return {
                        id: n.logID,
                        text: n.details || n.entityName || n.action,
                        icon: icon,
                        time: new Date(n.timestamp)
                    };
                });
                this.renderNotifications();
            }

            // Toggle Status Events
            if (data.type === 'auto_reply_status' || data.type === 'auto_reply_status_changed') {
                this.updateAutoReplyUI(data.enabled);
            }
            if (data.type === 'bot_auto_reply_status') {
                this.updateBotAutoReplyUI(data.enabled);
            }

            // Notification Events
            const notifyTypes = [
                'trigger_created', 'trigger_updated', 'trigger_deleted',
                'scheduled_task_created', 'scheduled_task_updated', 'scheduled_task_deleted',
                'conversation_deleted',
                'delete_origin_chat_success', 'delete_origin_chat_error',
                'builtin_trigger_updated', 'builtin_trigger_state_saved',
                'auto_reply_status_changed',
                'friend_event',
                'batch_remove_result',
                'new_activity_log'
            ];

            if (notifyTypes.includes(data.type)) {
                this.addNotification(data);
            }
        }

        updateUser(user, skipCache = false) {
            this.currentUser = user;
            document.getElementById('uh-user-name').textContent = user.name || 'User';
            document.getElementById('uh-user-uid').textContent = user.uid || '---';
            if (user.avatar) document.getElementById('uh-avatar').src = user.avatar;

            // ✅ OPTIMIZATION: Cache user info for instant header rendering
            if (!skipCache) {
                try {
                    sessionStorage.setItem('zalo_user_cache', JSON.stringify({
                        name: user.name,
                        uid: user.uid,
                        avatar: user.avatar
                    }));
                } catch (e) { /* ignore */ }
            }
        }

        // --- SHARED TOGGLE LOGIC ---

        getSharedTogglesHTML() {
            return `
            <div class="uh-toggles">
                <div class="uh-toggle-group">
                    <span class="uh-toggle-label">Cá nhân</span>
                    <label class="uh-toggle-switch">
                        <input type="checkbox" id="uh-auto-reply-toggle" onchange="UnifiedHeader.toggleAutoReply(this)">
                        <span class="uh-toggle-slider"></span>
                    </label>
                </div>
                <div class="uh-toggle-group">
                    <span class="uh-toggle-label">Bot OA</span>
                    <label class="uh-toggle-switch">
                        <input type="checkbox" id="uh-bot-auto-reply-toggle" onchange="UnifiedHeader.toggleBotAutoReply(this)">
                        <span class="uh-toggle-slider"></span>
                    </label>
            </div>
            </div>
        `;
        }

        toggleAutoReply(input) {
            console.log('🔘 Toggle Auto Reply clicked:', input.checked);
            const enabled = input.checked;

            // Validate WebSocket
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.error('❌ WebSocket not connected');
                window.showAlert && showAlert('Mất kết nối server! Vui lòng thử lại sau.') || alert('Mất kết nối server! Vui lòng thử lại sau.');
                input.checked = !enabled; // Revert UI
                return;
            }

            this.ws.send(JSON.stringify({ type: 'set_auto_reply', enabled: enabled }));
        }

        toggleBotAutoReply(input) {
            console.log('🤖 Toggle Bot Auto Reply clicked:', input.checked);
            const enabled = input.checked;
            const botToken = localStorage.getItem('zalo_bot_token');

            if (enabled && !botToken) {
                input.checked = false;
                window.showAlert && showAlert('⚠️ Chưa cấu hình Bot Token! Vui lòng vào Zalo Bot Manager để cấu hình.') || alert('⚠️ Chưa cấu hình Bot Token! Vui lòng vào Zalo Bot Manager để cấu hình.');
                return;
            }

            // Validate WebSocket
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.error('❌ WebSocket not connected');
                window.showAlert && showAlert('Mất kết nối server! Vui lòng thử lại sau.') || alert('Mất kết nối server! Vui lòng thử lại sau.');
                input.checked = !enabled;
                return;
            }

            this.ws.send(JSON.stringify({
                type: 'set_bot_auto_reply',
                enabled: enabled,
                botToken: botToken
            }));
        }

        updateAutoReplyUI(enabled) {
            const toggle = document.getElementById('uh-auto-reply-toggle');
            if (toggle) toggle.checked = enabled;
            // Also update local toggles if present on legacy pages
            const legacyToggle = document.getElementById('autoReplyToggle');
            if (legacyToggle) legacyToggle.checked = enabled;
        }

        updateBotAutoReplyUI(enabled) {
            const toggle = document.getElementById('uh-bot-auto-reply-toggle');
            if (toggle) toggle.checked = enabled;
            // Also update local toggles if present on legacy pages
            const legacyToggle = document.getElementById('botAutoReplyToggle');
            if (legacyToggle) legacyToggle.checked = enabled;
        }

        addNotification(data) {
            let text = '';
            let icon = 'ℹ️';

            switch (data.type) {
                case 'trigger_created': text = 'Đã tạo trigger mới'; icon = '✅'; break;
                case 'trigger_updated': text = 'Đã cập nhật trigger'; icon = '✏️'; break;
                case 'trigger_deleted': text = 'Đã xóa trigger'; icon = '🗑️'; break;
                case 'scheduled_task_created': text = 'Đã tạo lịch gửi mới'; icon = '📅'; break;
                case 'scheduled_task_updated': text = 'Đã cập nhật lịch gửi'; icon = '📅'; break;
                case 'scheduled_task_deleted': text = 'Đã xóa lịch gửi'; icon = '🗑️'; break;
                case 'conversation_deleted': text = 'Đã xóa hội thoại'; icon = '❌'; break;
                case 'delete_origin_chat_success': text = 'Đã xóa tin nhắn gốc trên Zalo'; icon = '🗑️'; break;
                case 'delete_origin_chat_error': text = data.error || 'Lỗi xóa tin nhắn gốc'; icon = '⚠️'; break;
                case 'builtin_trigger_updated': text = `Đã cập nhật cài đặt: ${data.triggerId || 'hệ thống'}`; icon = '⚙️'; break;
                case 'builtin_trigger_state_saved': text = `Đã lưu cấu hình: ${data.triggerKey || 'hệ thống'}`; icon = '💾'; break;
                case 'auto_reply_status_changed': text = `Auto Reply đã ${data.enabled ? 'bật' : 'tắt'}`; icon = data.enabled ? '🟢' : '🔴'; break;
                case 'friend_event': {
                    const eventLabels = { ADD: 'Thêm bạn mới', REMOVE: 'Hủy kết bạn', REQUEST: 'Lời mời kết bạn', BLOCK: 'Chặn người dùng', UNBLOCK: 'Bỏ chặn người dùng' };
                    text = eventLabels[data.eventType] || `Sự kiện bạn bè: ${data.eventType}`;
                    icon = data.eventType === 'ADD' ? '🎉' : data.eventType === 'REMOVE' ? '👋' : data.eventType === 'BLOCK' ? '🚫' : '👥';
                    break;
                }
                case 'batch_remove_result': text = `Đã hủy kết bạn: ${data.success?.length || 0} thành công`; icon = '👋'; break;
                case 'new_activity_log': text = data.log?.description || data.log?.title || 'Hoạt động mới'; icon = data.log?.type === 'error' ? '⚠️' : '📝'; break;
                default: text = 'Thông báo mới';
            }

            const notif = {
                id: Date.now(),
                text,
                icon,
                time: new Date()
            };

            this.notifications.unshift(notif);
            this.unreadCount++;
            this.renderNotifications();

            // Show toast badge
            const badge = document.getElementById('uh-notif-count');
            if (badge) {
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                badge.style.display = 'block';
            }
        }

        setPageActions(html) {
            const center = document.getElementById('uh-center');
            if (center) {
                center.innerHTML = html;
                this.pendingActions = null;
                // Request current status to sync toggles immediately
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'get_auto_reply_status' }));
                    this.ws.send(JSON.stringify({ type: 'get_bot_auto_reply_status' }));
                }
            } else {
                this.pendingActions = html;
            }
        }

        renderNotifications() {
            const container = document.getElementById('uh-notif-list');
            if (!container) return;

            if (this.notifications.length === 0) {
                container.innerHTML = '<div style="padding:20px;text-align:center;color:#999;">Không có thông báo mới</div>';
                return;
            }

            container.innerHTML = this.notifications.map(n => `
                <div class="uh-notification-item">
                    <div class="uh-notification-icon">${n.icon}</div>
                    <div class="uh-notification-content">
                        <div>${n.text}</div>
                        <div class="uh-notification-time">${n.time.toLocaleString('vi-VN')}</div>
                    </div>
                </div>
        `).join('');
        }

        toggleNotifications() {
            const dd = document.getElementById('uh-notif-dropdown');
            if (!dd) return;
            const show = dd.classList.toggle('show');
            if (show) {
                this.unreadCount = 0;
                const badge = document.getElementById('uh-notif-count');
                if (badge) badge.style.display = 'none';
            }
        }

        toggleUserMenu(e) {
            if (e) e.stopPropagation();
            const dd = document.getElementById('uh-user-dropdown');
            if (!dd) return;

            // Close notification dropdown if open
            const notifDd = document.getElementById('uh-notif-dropdown');
            if (notifDd) notifDd.classList.remove('show');

            dd.classList.toggle('show');

            // Global click to close
            const closeMenu = (e) => {
                if (!e.target.closest('.uh-user-container')) {
                    dd.classList.remove('show');
                    document.removeEventListener('click', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
        }

        showProfile() {
            window.showAlert && showAlert('Tính năng Xem thông tin cá nhân đang được phát triển.') || alert('Tính năng Xem thông tin cá nhân đang được phát triển.');
            document.getElementById('uh-user-dropdown').classList.remove('show');
        }

        showSettings() {
            window.location.href = '/system-settings.html';
            document.getElementById('uh-user-dropdown').classList.remove('show');
        }

        clearNotifications() {
            this.notifications = [];
            this.renderNotifications();
        }

        async logout() {
            document.getElementById('uh-user-dropdown').classList.remove('show');
            const confirmed = await this.askConfirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?', '🚪 Đăng xuất');
            if (confirmed) {
                console.log('🚀 Redirecting to logout...');
                // ✅ Clear all session caches on logout
                try { sessionStorage.clear(); } catch (e) { /* ignore */ }
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'logout' }));
                }
                setTimeout(() => {
                    window.location.href = '/?logout=true';
                }, 100);
            }
        }

        renderAccounts(accounts, activeAccountUID) {
            const container = document.getElementById('uh-accounts-list-container');
            if (!container) return;

            if (!accounts || accounts.length === 0) {
                container.innerHTML = '<div style="padding:10px 16px;font-size:12px;color:#999;">Không có tài khoản nào</div>';
                return;
            }

            container.innerHTML = accounts.map(acc => {
                const isActive = acc.uid === activeAccountUID;
                const statusBadge = isActive ? '<span class="uh-account-active-badge">Đang hoạt động</span>' : '';
                const activeClass = isActive ? 'active' : '';
                const avatarSrc = acc.avatar || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23ccc' d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
                
                return `
                    <div class="uh-account-item ${activeClass}" onclick="UnifiedHeader.switchAccount('${acc.uid}', event)">
                        <div class="uh-account-left">
                            <img src="${avatarSrc}" class="uh-account-avatar">
                            <div style="display:flex; flex-direction:column;">
                                <span class="uh-account-name" title="${acc.name}">${acc.name}</span>
                                ${statusBadge}
                            </div>
                        </div>
                        <span class="uh-account-remove" onclick="UnifiedHeader.removeAccount('${acc.uid}', event)" title="Đăng xuất tài khoản này">❌</span>
                    </div>
                `;
            }).join('');
        }

        async switchAccount(uid, event) {
            // If the user clicks on the delete button, prevent switching
            if (event && event.target.closest('.uh-account-remove')) {
                return;
            }
            
            console.log(`🔌 Switching to account: ${uid}`);
            
            // Check if already active
            if (this.currentUser && this.currentUser.uid === uid) {
                return;
            }

            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'switch_account', uid }));
            } else {
                // fallback to http
                try {
                    await fetch('/api/switch-account', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uid })
                    });
                } catch (e) {
                    console.error('Failed to switch account via fetch:', e);
                }
            }
            
            // Clear session storage cache to fetch new user's details on reload
            try { sessionStorage.removeItem('zalo_user_cache'); } catch (e) {}
            
            // Reload page to update all states
            setTimeout(() => {
                location.reload();
            }, 300);
        }

        addAccount() {
            document.getElementById('uh-user-dropdown').classList.remove('show');
            // Redirect to index page with query param
            window.location.href = '/?add_account=true';
        }

        async removeAccount(uid, event) {
            if (event) {
                event.stopPropagation();
            }
            
            document.getElementById('uh-user-dropdown').classList.remove('show');
            const confirmed = await this.askConfirm(`Bạn có chắc chắn muốn đăng xuất tài khoản Zalo ${uid}?`, '🚪 Đăng xuất tài khoản');
            if (confirmed) {
                console.log(`🚪 Removing account: ${uid}`);
                
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'remove_account', uid }));
                } else {
                    // fallback to http
                    try {
                        await fetch('/api/remove-account', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ uid })
                        });
                    } catch (e) {
                        console.error('Failed to remove account via fetch:', e);
                    }
                }
                
                // If it was the active account, clear session storage cache
                if (this.currentUser && this.currentUser.uid === uid) {
                    try { sessionStorage.removeItem('zalo_user_cache'); } catch (e) {}
                }
                
                setTimeout(() => {
                    window.location.href = '/';
                }, 300);
            }
        }

        async logoutAll() {
            document.getElementById('uh-user-dropdown').classList.remove('show');
            const confirmed = await this.askConfirm('Bạn có chắc chắn muốn đăng xuất tất cả các tài khoản khỏi hệ thống?', '🚪 Đăng xuất tất cả');
            if (confirmed) {
                console.log('🚀 Logging out all accounts...');
                try { sessionStorage.clear(); } catch (e) { /* ignore */ }
                
                try {
                    // Fetch accounts
                    const res = await fetch('/api/accounts');
                    const data = await res.json();
                    if (data && Array.isArray(data.accounts)) {
                        for (const acc of data.accounts) {
                            await fetch('/api/remove-account', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ uid: acc.uid })
                            });
                        }
                    }
                } catch (err) {
                    console.error('Error during logout all:', err);
                }
                
                setTimeout(() => {
                    window.location.href = '/?logout=true';
                }, 100);
            }
        }

        askConfirm(message, title = '⚠️ Xác nhận') {
            return new Promise((resolve) => {
                this.confirmResolve = resolve;
                const overlay = document.getElementById('uh-confirm-overlay');
                document.getElementById('uh-confirm-title').textContent = title;
                document.getElementById('uh-confirm-message').textContent = message;
                overlay.classList.add('show');
            });
        }

        handleConfirm(result) {
            const overlay = document.getElementById('uh-confirm-overlay');
            overlay.classList.remove('show');
            if (this.confirmResolve) {
                this.confirmResolve(result);
                this.confirmResolve = null;
            }
        }

        toggleDarkMode() {
            const isDark = document.body.classList.toggle('dark-mode');
            document.documentElement.classList.toggle('dark-mode', isDark);
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            const toggleBtn = document.getElementById('uh-dark-toggle');
            if (toggleBtn) toggleBtn.textContent = isDark ? '☀️' : '🌙';
        }
    }

    window.UnifiedHeader = new UnifiedHeaderManager();

    // Auto init on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.UnifiedHeader.init());
    } else {
        window.UnifiedHeader.init();
    }

})();
