// loginZalo.js - INTEGRATED WITH AUTO REPLY
// ✅ FIX: Xử lý lỗi tốt hơn, không để listener bị crash
const { Zalo } = require('zca-js');
const { processAutoReply } = require('./autoReply');

function broadcast(apiState, data) {
  try {
    const json = JSON.stringify(data);
    apiState.clients.forEach(ws => {
      try {
        if (ws.readyState === 1) ws.send(json);
      } catch (e) {
        // Bỏ qua lỗi client đã disconnect
      }
    });
  } catch (e) {
    console.error('❌ Broadcast error:', e.message);
  }
}

function setupMessageListener(apiState) {
  if (!apiState.api) return;

  console.log('👂 Listener tin nhắn đang chạy...');

  apiState.api.listener.on('message', (message) => {
    // ✅ Wrap toàn bộ trong try-catch để không crash listener
    try {
      // Kiểm tra message hợp lệ
      if (!message || !message.data) {
        console.warn('⚠️ Received invalid message');
        return;
      }

      const isText = typeof message.data.content === 'string';
      if (!isText) {
        console.log('📎 Received non-text message (image/file/sticker)');
        return;
      }

      const senderId = message.uidFrom || message.threadId;
      const isGroup = message.type === 'Group';

      if (!senderId) {
        console.warn('⚠️ Message without senderId');
        return;
      }

      const msgObj = {
        msgId: message.msgId || `msg_${Date.now()}`,
        content: message.data.content,
        timestamp: message.ts || Date.now(),
        senderId,
        isSelf: message.isSelf || senderId === apiState.currentUser?.uid,
        isGroup: isGroup,
        threadId: message.threadId,
        uidFrom: message.uidFrom
      };

      // Lưu vào memory
      if (!apiState.messageStore.has(senderId)) {
        apiState.messageStore.set(senderId, []);
      }
      apiState.messageStore.get(senderId).push(msgObj);

      // Broadcast tin nhắn mới đến tất cả clients (cho dashboard)
      broadcast(apiState, {
        type: 'new_message',
        uid: senderId,
        message: msgObj
      });

      console.log(`📨 Tin nhắn ${isGroup ? 'nhóm' : ''} từ ${senderId}: ${message.data.content.substring(0, 50)}...`);

      // ✅ XỬ LÝ AUTO REPLY - Gọi mà KHÔNG await
      // processAutoReply đã được sửa để tự chạy async bên trong
      processAutoReply(apiState, message);
      
    } catch (err) {
      // ✅ Catch tất cả lỗi để listener không bị crash
      console.error('❌ Listener error (recovered):', err.message);
      console.error(err.stack);
    }
  });

  // ✅ Thêm error handler cho listener
  apiState.api.listener.on('error', (err) => {
    console.error('❌ Listener error event:', err.message);
  });

  apiState.api.listener.start();
  console.log('✅ Đã bật listener!');
}

async function loginZalo(apiState) {
  if (apiState.isLoggedIn) return;

  try {
    console.log('🔄 Đang tạo mã QR đăng nhập...');
    const zalo = new Zalo();

    apiState.api = await zalo.loginQR();
    const fs = require('fs');
    fs.unlink('qr.png', () => {});
    apiState.isLoggedIn = true;

    console.log('🎉 Đăng nhập thành công!');

    const uid = apiState.api.getOwnId().toString();
    const info = await apiState.api.getUserInfo(uid);
    const profile = info.changed_profiles?.[uid] || info;

    apiState.currentUser = {
      uid,
      name: profile.displayName || profile.zaloName || "Không rõ tên",
      avatar: profile.avatar || `https://graph.zalo.me/v2.0/avatar/${uid}?size=240`
    };

    broadcast(apiState, {
      type: 'current_user',
      user: apiState.currentUser
    });

    setupMessageListener(apiState);

  } catch (err) {
    console.error('❌ Lỗi login QR:', err.message);
    setTimeout(() => loginZalo(apiState), 10000);
  }
}

module.exports = {
  loginZalo,
  setupMessageListener,
  broadcast
};