// websocket-helper.js - Helper để tạo WebSocket connection đúng port
(function(window) {
  'use strict';

  /**
   * Tạo WebSocket connection tới server Node.js (port 3000)
   * Hoạt động cả khi truy cập qua Browser-Sync (port 3001)
   *
   * @returns {WebSocket} WebSocket instance
   */
  window.createWebSocket = function() {
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

    // Luôn connect tới port 3000 (Node.js server)
    // Không dùng location.host vì nó có thể là port 3001 (Browser-Sync)
    const wsHost = location.hostname + ':3000';

    console.log('🔌 Connecting WebSocket to:', wsProtocol + '//' + wsHost);

    return new WebSocket(wsProtocol + '//' + wsHost);
  };

})(window);
