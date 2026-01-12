// websocket-helper.js - Helper để tạo WebSocket connection đúng port
(function (window) {
  'use strict';

  /**
   * Tạo WebSocket connection tới server Node.js
   * Hoạt động với:
   * - Local development: localhost:3000
   * - Production (Render, etc): uses same host without port
   *
   * @returns {WebSocket} WebSocket instance
   */
  window.createWebSocket = function () {
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

    // Check if running on production (HTTPS) or local development
    const isProduction = location.protocol === 'https:' ||
      location.hostname.includes('render.com') ||
      location.hostname.includes('onrender.com') ||
      !['localhost', '127.0.0.1'].includes(location.hostname);

    // On production, use location.host (no port specified, uses default 443/80)
    // On local development, always use port 3000
    const wsHost = isProduction ? location.host : (location.hostname + ':3000');

    console.log('🔌 Connecting WebSocket to:', wsProtocol + '//' + wsHost);
    console.log('📍 Environment:', isProduction ? 'Production' : 'Local Development');

    return new WebSocket(wsProtocol + '//' + wsHost);
  };

})(window);

