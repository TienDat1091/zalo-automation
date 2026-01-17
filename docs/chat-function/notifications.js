// ✅ SHOW NOTIFICATION WITH FIXED CLICK
function showNewMessageNotification(senderName, messagePreview, userId, avatar) {
  console.log(`🔔 Showing notification for: ${senderName} (${userId})`);

  const notification = document.createElement('div');
  notification.className = 'notification-message';
  notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 12px;
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 300px;
        animation: slideIn 0.3s ease-out;
        cursor: pointer;
    `;

  notification.innerHTML = `
      <img src="${avatar}" alt="Avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
      <div style="flex: 1;">
        <div style="font-weight: 600; color: #333; margin-bottom: 4px;">${senderName}</div>
        <div style="color: #666; font-size: 13px;">${messagePreview.substring(0, 50)}${messagePreview.length > 50 ? '...' : ''}</div>
      </div>
    `;

  notification.onclick = (event) => {
    console.log(`✅ Notification clicked: ${senderName}`);
    event.stopPropagation();
    selectFriend(userId, senderName, avatar);
    notification.remove();
  };

  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentNode) notification.remove();
  }, 5000);
}

// notifications.js - Clean notification system
// No external dependencies
/**
 * Show a notification toast
 * @param {string} message - Message to display
 * @param {string} type - Type: 'info', 'success', 'error', 'warning'
 */
function showToast(message, type = 'info') {
  if (!message) {
    console.warn('⚠️ showNotification: message is empty');
    return;
  }

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    background: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 9999;
    max-width: 350px;
    font-family: inherit;
    font-size: 14px;
    color: #333;
    animation: slideIn 0.3s ease-out;
  `;

  // Color based on type
  const colors = {
    'info': '#3b82f6',
    'success': '#10b981',
    'error': '#ef4444',
    'warning': '#f59e0b'
  };

  const bgColor = colors[type] || colors['info'];
  notification.style.borderLeft = `4px solid ${bgColor}`;

  notification.textContent = message;
  document.body.appendChild(notification);

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }
  }, 5000);
}

/**
 * Add animation styles
 */
if (!document.getElementById('notificationStyles')) {
  const style = document.createElement('style');
  style.id = 'notificationStyles';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
    
    .notification {
      word-wrap: break-word;
      white-space: normal;
    }
  `;
  document.head.appendChild(style);
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { showNewMessageNotification, showToast };
}