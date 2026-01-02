function formatTime(timestamp) {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return 'Vừa xong';
      if (minutes < 60) return `${minutes}p`;
      if (hours < 24) return `${hours}h`;
      if (days < 7) return `${days}d`;
      
      const date = new Date(timestamp);
      return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    }