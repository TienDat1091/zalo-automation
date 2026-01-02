function logout() {
    if (!confirm('⚠️ Bạn chắc chắn muốn đăng xuất?')) return;
    
    try {
      ws.send(JSON.stringify({ type: 'logout' }));
      setTimeout(() => handleLogoutComplete(), 1000);
    } catch (err) {
      handleLogoutComplete();
    }
  }
  
  function handleLogoutComplete() {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/index.html';
    } catch (err) {
      window.location.href = '/index.html';
    }
  }