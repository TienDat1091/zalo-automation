/**
 * Unified Header Manager
 * Handles User Info, Notifications, and Navigation
 */

(function () {
    // Prevent duplicate init
    if (window.UnifiedHeader) return;

    const HEADER_HTML = `
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
                    <div class="uh-menu-divider"></div>
                    <div class="uh-menu-item logout" onclick="UnifiedHeader.logout()">
                        <span class="icon">🚪</span> Đăng xuất
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
                'delete_origin_chat_success', 'delete_origin_chat_error'
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
                alert('Mất kết nối server! Vui lòng thử lại sau.');
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
                alert('⚠️ Chưa cấu hình Bot Token! Vui lòng vào Zalo Bot Manager để cấu hình.');
                return;
            }

            // Validate WebSocket
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.error('❌ WebSocket not connected');
                alert('Mất kết nối server! Vui lòng thử lại sau.');
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
                case 'conversation_deleted': text = 'Đã xóa hội thoại'; icon = '❌'; break;
                case 'delete_origin_chat_success': text = 'Đã xóa tin nhắn gốc trên Zalo'; icon = '🗑️'; break;
                case 'delete_origin_chat_error': text = data.error || 'Lỗi xóa tin nhắn gốc'; icon = '⚠️'; break;
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
                        <div class="uh-notification-time">${n.time.toLocaleTimeString()}</div>
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
            alert('Tính năng Xem thông tin cá nhân đang được phát triển.');
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
    }

    window.UnifiedHeader = new UnifiedHeaderManager();

    // Auto init on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.UnifiedHeader.init());
    } else {
        window.UnifiedHeader.init();
    }

})();
