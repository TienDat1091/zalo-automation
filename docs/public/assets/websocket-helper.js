// websocket-helper.js - Helper để tạo WebSocket connection đúng port
(function(window) {
  'use strict';

  /**
   * Tạo WebSocket connection tới server Node.js (port 3000)
   * Hoạt động với:
   * - Direct access: localhost:3000
   * - Live Server: localhost:5500 (proxy to 3000)
   * - Browser-Sync: localhost:3001 (proxy to 3000)
   *
   * @returns {WebSocket} WebSocket instance
   */
  window.createWebSocket = function() {
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

    // Luôn connect tới port 3000 (Node.js server)
    // Không dùng location.host vì có thể là Live Server (5500) hoặc Browser-Sync (3001)
    const wsHost = location.hostname + ':3000';

    console.log('🔌 Connecting WebSocket to:', wsProtocol + '//' + wsHost);

    return new WebSocket(wsProtocol + '//' + wsHost);
  };

})(window);
