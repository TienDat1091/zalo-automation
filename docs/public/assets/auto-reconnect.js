// auto-reconnect.js - Auto reconnect WebSocket when server restarts
(function() {
  if (typeof window.ws === 'undefined') return;

  const originalWs = window.ws;
  let reconnectInterval;
  let isReconnecting = false;

  // Override WebSocket close handler
  const originalOnClose = originalWs.onclose;

  originalWs.onclose = function(event) {
    console.log('🔌 WebSocket closed, attempting to reconnect...');

    if (originalOnClose) {
      originalOnClose.call(this, event);
    }

    if (!isReconnecting) {
      isReconnecting = true;
      attemptReconnect();
    }
  };

  function attemptReconnect() {
    reconnectInterval = setInterval(() => {
      console.log('🔄 Trying to reconnect WebSocket...');

      // Check if server is back online
      fetch('/api/health')
        .then(response => {
          if (response.ok) {
            console.log('✅ Server is back online, reloading page...');
            clearInterval(reconnectInterval);
            isReconnecting = false;
            location.reload();
          }
        })
        .catch(() => {
          console.log('⏳ Server not ready yet...');
        });
    }, 2000); // Try every 2 seconds
  }
})();
