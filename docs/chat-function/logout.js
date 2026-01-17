async function logout() {
  const confirmed = await showConfirm(
    '⚠️ Bạn chắc chắn muốn đăng xuất?\n\nBạn sẽ cần quét mã QR để đăng nhập lại.',
    '🚪 Đăng xuất'
  );
  if (!confirmed) return;

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