// loginZalo.js - INTEGRATED WITH AUTO REPLY + IMAGE SUPPORT
// ✅ FIX: Hỗ trợ gửi ảnh bằng imageMetadataGetter
// ✅ FIX: Xử lý nhận ảnh từ user
const { Zalo } = require('zca-js');
const { processAutoReply } = require('./autoReply');
const fs = require('fs');
const path = require('path');

// ========================================
// IMAGE METADATA GETTER (Required for sending images)
// ========================================
let sharp;
try {
  sharp = require('sharp');
  console.log('✅ Sharp loaded - Image sending enabled');
} catch (e) {
  console.warn('⚠️ Sharp not installed - Run: npm install sharp');
  console.warn('   Image sending via file path will not work!');
}

async function imageMetadataGetter(filePath) {
  if (!sharp) {
    // Fallback: Read file and guess dimensions
    try {
      const data = await fs.promises.readFile(filePath);
      return {
        width: 800,
        height: 600,
        size: data.length
      };
    } catch (e) {
      return { width: 800, height: 600, size: 0 };
    }
  }
  
  try {
    const data = await fs.promises.readFile(filePath);
    const metadata = await sharp(data).metadata();
    return {
      height: metadata.height || 600,
      width: metadata.width || 800,
      size: metadata.size || data.length
    };
  } catch (err) {
    console.error('❌ imageMetadataGetter error:', err.message);
    try {
      const stats = await fs.promises.stat(filePath);
      return { width: 800, height: 600, size: stats.size };
    } catch (e) {
      return { width: 800, height: 600, size: 0 };
    }
  }
}

// ========================================
// BROADCAST HELPER
// ========================================
function broadcast(apiState, data) {
  try {
    const json = JSON.stringify(data);
    apiState.clients.forEach(ws => {
      try {
        if (ws.readyState === 1) ws.send(json);
      } catch (e) {}
    });
  } catch (e) {
    console.error('❌ Broadcast error:', e.message);
  }
}

// ========================================
// MESSAGE LISTENER - Hỗ trợ cả text và image
// ========================================
function setupMessageListener(apiState) {
  if (!apiState.api) return;

  console.log('👂 Listener tin nhắn đang chạy...');

  apiState.api.listener.on('message', (message) => {
    try {
      if (!message || !message.data) {
        console.warn('⚠️ Received invalid message');
        return;
      }

      const senderId = message.uidFrom || message.threadId;
      const isGroup = message.type === 'Group';

      if (!senderId) {
        console.warn('⚠️ Message without senderId');
        return;
      }

      const isText = typeof message.data.content === 'string';
      
      // ========================================
      // XỬ LÝ TIN NHẮN TEXT
      // ========================================
      if (isText) {
        const msgObj = {
          msgId: message.msgId || `msg_${Date.now()}`,
          content: message.data.content,
          timestamp: message.ts || Date.now(),
          senderId,
          isSelf: message.isSelf || senderId === apiState.currentUser?.uid,
          isGroup: isGroup,
          threadId: message.threadId,
          uidFrom: message.uidFrom,
          type: 'text'
        };

        // Lưu vào memory
        if (!apiState.messageStore.has(senderId)) {
          apiState.messageStore.set(senderId, []);
        }
        apiState.messageStore.get(senderId).push(msgObj);

        // Broadcast tin nhắn mới
        broadcast(apiState, {
          type: 'new_message',
          uid: senderId,
          message: msgObj
        });

        console.log(`📨 Tin nhắn ${isGroup ? 'nhóm' : ''} từ ${senderId}: ${message.data.content.substring(0, 50)}...`);

        // Xử lý Auto Reply
        processAutoReply(apiState, message);
      } 
      // ========================================
      // XỬ LÝ TIN NHẮN ẢNH/FILE/STICKER
      // ========================================
      else {
        const content = message.data.content;
        let msgObj = {
          msgId: message.msgId || `msg_${Date.now()}`,
          timestamp: message.ts || Date.now(),
          senderId,
          isSelf: message.isSelf || senderId === apiState.currentUser?.uid,
          isGroup: isGroup,
          threadId: message.threadId,
          uidFrom: message.uidFrom
        };

        // Xác định loại message
        if (content && typeof content === 'object') {
          // Image message - check for image properties
          if (content.href || content.hdUrl || content.normalUrl || content.thumbUrl || content.oriUrl) {
            msgObj.type = 'image';
            msgObj.content = '[Hình ảnh]';
            msgObj.imageData = {
              href: content.href || null,
              hdUrl: content.hdUrl || null,
              normalUrl: content.normalUrl || null,
              thumbUrl: content.thumbUrl || null,
              oriUrl: content.oriUrl || null,
              width: content.width || null,
              height: content.height || null,
              fileSize: content.fileSize || content.totalSize || null,
              title: content.title || content.description || null
            };
            
            // Lấy URL tốt nhất (ưu tiên chất lượng cao)
            msgObj.imageUrl = content.hdUrl || content.oriUrl || content.normalUrl || content.href || content.thumbUrl;
            
            console.log(`🖼️ Ảnh từ ${senderId}:`);
            console.log(`   HD URL: ${content.hdUrl || 'N/A'}`);
            console.log(`   Original URL: ${content.oriUrl || 'N/A'}`);
            console.log(`   Normal URL: ${content.normalUrl || 'N/A'}`);
            console.log(`   Thumb URL: ${content.thumbUrl || 'N/A'}`);
            console.log(`   Best URL: ${msgObj.imageUrl}`);
          }
          // File message
          else if (content.fileUrl || content.fileName || content.url) {
            msgObj.type = 'file';
            msgObj.content = `[File: ${content.fileName || content.title || 'unknown'}]`;
            msgObj.fileData = {
              fileUrl: content.fileUrl || content.url || null,
              fileName: content.fileName || content.title || null,
              fileSize: content.fileSize || content.totalSize || null,
              fileType: content.fileType || content.type || null,
              checksum: content.checksum || null
            };
            
            console.log(`📎 File từ ${senderId}: ${content.fileName || content.title}`);
            console.log(`   URL: ${content.fileUrl || content.url || 'N/A'}`);
            console.log(`   Size: ${content.fileSize || content.totalSize || 'N/A'}`);
          }
          // Sticker message
          else if (content.id || content.type === 'sticker' || content.catId || content.stickerId) {
            msgObj.type = 'sticker';
            msgObj.content = '[Sticker]';
            msgObj.stickerData = {
              id: content.id || content.stickerId || null,
              catId: content.catId || null,
              type: content.type || null,
              spriteUrl: content.spriteUrl || null
            };
            
            console.log(`😀 Sticker từ ${senderId}: ID ${content.id || content.stickerId}`);
          }
          // GIF message
          else if (content.params && content.params.url) {
            msgObj.type = 'gif';
            msgObj.content = '[GIF]';
            msgObj.gifData = {
              url: content.params.url,
              width: content.params.width,
              height: content.params.height
            };
            msgObj.imageUrl = content.params.url;
            
            console.log(`🎞️ GIF từ ${senderId}: ${content.params.url}`);
          }
          // Other/Unknown
          else {
            msgObj.type = 'unknown';
            msgObj.content = '[Tin nhắn không xác định]';
            msgObj.rawData = content;
            
            console.log(`❓ Tin nhắn không xác định từ ${senderId}:`);
            console.log(`   Raw data:`, JSON.stringify(content).substring(0, 500));
          }
        } else {
          msgObj.type = 'unknown';
          msgObj.content = '[Tin nhắn không xác định]';
          msgObj.rawData = content;
          console.log(`❓ Content type unknown:`, typeof content);
        }

        // Lưu vào memory
        if (!apiState.messageStore.has(senderId)) {
          apiState.messageStore.set(senderId, []);
        }
        apiState.messageStore.get(senderId).push(msgObj);

        // Broadcast tin nhắn mới
        broadcast(apiState, {
          type: 'new_message',
          uid: senderId,
          message: msgObj
        });

        // Broadcast sự kiện riêng cho ảnh
        if (msgObj.type === 'image' && msgObj.imageUrl) {
          broadcast(apiState, {
            type: 'image_received',
            uid: senderId,
            imageUrl: msgObj.imageUrl,
            imageData: msgObj.imageData,
            msgId: msgObj.msgId
          });
        }
      }
      
    } catch (err) {
      console.error('❌ Listener error (recovered):', err.message);
      console.error(err.stack);
    }
  });

  // Error handler cho listener
  apiState.api.listener.on('error', (err) => {
    console.error('❌ Listener error event:', err.message);
  });

  apiState.api.listener.start();
  console.log('✅ Đã bật listener!');
}

// ========================================
// LOGIN FUNCTION - Với imageMetadataGetter
// ========================================
async function loginZalo(apiState) {
  if (apiState.isLoggedIn) return;

  try {
    console.log('🔄 Đang tạo mã QR đăng nhập...');
    
    // ✅ Khởi tạo Zalo với imageMetadataGetter để hỗ trợ gửi ảnh
    const zalo = new Zalo({
      imageMetadataGetter: imageMetadataGetter
    });

    apiState.api = await zalo.loginQR();
    
    // Xóa file QR
    try {
      fs.unlinkSync('qr.png');
    } catch (e) {}
    
    apiState.isLoggedIn = true;
    console.log('🎉 Đăng nhập thành công!');
    console.log('📷 Image sending:', sharp ? 'ENABLED (sharp loaded)' : 'LIMITED (sharp not installed)');

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
  broadcast,
  imageMetadataGetter
};