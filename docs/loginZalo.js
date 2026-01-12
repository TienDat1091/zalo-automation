// loginZalo.js - INTEGRATED WITH AUTO REPLY + IMAGE SUPPORT
// ✅ FIX: Hỗ trợ gửi ảnh bằng imageMetadataGetter
// ✅ FIX: Xử lý nhận ảnh từ user
const { Zalo } = require('zca-js');
const { processAutoReply } = require('./autoReply.js');
const fs = require('fs');
const path = require('path');

// ========================================
// IMAGE METADATA GETTER (Required for sending images)
// ========================================
let sharp;
try {
  sharp = require('sharp');
  console.log('✅ Sharp loaded - HD Image sending enabled');
} catch (e) {
  console.warn('⚠️ Sharp not installed - Run: npm install sharp');
  console.warn('   Image quality may be reduced!');
}

async function imageMetadataGetter(filePath) {
  const fs = require('fs');

  // Đọc file size trước
  let fileSize = 0;
  try {
    const stats = await fs.promises.stat(filePath);
    fileSize = stats.size;
  } catch (e) {
    console.error('❌ Cannot read file size:', e.message);
  }

  // Nếu có sharp, lấy metadata chính xác
  if (sharp) {
    try {
      const data = await fs.promises.readFile(filePath);
      const metadata = await sharp(data).metadata();

      const result = {
        width: metadata.width || 1920,
        height: metadata.height || 1080,
        size: fileSize || data.length
      };

      console.log(`📐 Image metadata: ${result.width}x${result.height}, ${result.size} bytes`);
      return result;
    } catch (err) {
      console.error('❌ Sharp metadata error:', err.message);
    }
  }

  // Fallback: Đọc header của file để lấy dimensions
  try {
    const data = await fs.promises.readFile(filePath);
    const dimensions = getImageDimensions(data);

    const result = {
      width: dimensions.width || 1920,
      height: dimensions.height || 1080,
      size: fileSize || data.length
    };

    console.log(`📐 Image metadata (fallback): ${result.width}x${result.height}, ${result.size} bytes`);
    return result;
  } catch (e) {
    console.error('❌ Fallback metadata error:', e.message);
    return { width: 1920, height: 1080, size: fileSize };
  }
}

// Helper: Đọc dimensions từ header của ảnh (không cần sharp)
function getImageDimensions(buffer) {
  try {
    // PNG: bytes 16-23 contain width and height
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
      };
    }

    // JPEG: Find SOF0 marker (0xFFC0)
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xFF) break;
        const marker = buffer[offset + 1];

        // SOF markers (0xC0-0xCF except 0xC4, 0xC8, 0xCC)
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7)
          };
        }

        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
    }

    // GIF: bytes 6-9 contain width and height
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return {
        width: buffer.readUInt16LE(6),
        height: buffer.readUInt16LE(8)
      };
    }

    // WebP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      // VP8
      if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x20) {
        return {
          width: (buffer[26] | (buffer[27] << 8)) & 0x3FFF,
          height: (buffer[28] | (buffer[29] << 8)) & 0x3FFF
        };
      }
      // VP8L
      if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x4C) {
        const bits = buffer[21] | (buffer[22] << 8) | (buffer[23] << 16) | (buffer[24] << 24);
        return {
          width: (bits & 0x3FFF) + 1,
          height: ((bits >> 14) & 0x3FFF) + 1
        };
      }
    }
  } catch (e) {
    console.error('getImageDimensions error:', e.message);
  }

  return { width: 0, height: 0 };
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
      } catch (e) { }
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

        // Check if sender is stranger and auto-accept is enabled
        if (!isGroup && !msgObj.isSelf && apiState.autoAcceptFriendEnabled) {
          const isFriend = apiState.friends?.some(f => f.userId === senderId);
          if (!isFriend) {
            console.log(`👥 Stranger detected: ${senderId}, attempting auto-accept...`);
            autoAcceptFriendRequest(apiState, senderId);
          }
        }

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
          // File message - Xử lý đầy đủ các loại file
          else if (content.fileUrl || content.fileName || content.url || content.href) {
            msgObj.type = 'file';

            // Xác định loại file
            const fileName = content.fileName || content.title || 'unknown';
            const fileExt = fileName.split('.').pop().toLowerCase();

            // Map extension to type
            const extTypeMap = {
              'pdf': 'pdf',
              'doc': 'word', 'docx': 'word',
              'xls': 'excel', 'xlsx': 'excel', 'csv': 'excel',
              'ppt': 'powerpoint', 'pptx': 'powerpoint',
              'zip': 'archive', 'rar': 'archive', '7z': 'archive',
              'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio',
              'mp4': 'video', 'avi': 'video', 'mkv': 'video', 'mov': 'video',
              'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image'
            };

            const fileType = extTypeMap[fileExt] || 'other';
            const fileIcon = {
              pdf: '📄', word: '📝', excel: '📊', powerpoint: '📽️',
              archive: '📦', audio: '🎵', video: '🎬', image: '🖼️', other: '📎'
            }[fileType];

            msgObj.content = `[${fileIcon} File: ${fileName}]`;
            msgObj.fileData = {
              fileUrl: content.fileUrl || content.url || content.href || null,
              fileName: fileName,
              fileSize: content.fileSize || content.totalSize || null,
              fileType: fileType,
              fileExt: fileExt,
              checksum: content.checksum || null,
              params: content.params || null
            };

            console.log(`📎 File từ ${senderId}:`);
            console.log(`   Tên: ${fileName}`);
            console.log(`   Loại: ${fileType} (${fileExt})`);
            console.log(`   URL: ${msgObj.fileData.fileUrl || 'N/A'}`);
            console.log(`   Size: ${content.fileSize || content.totalSize || 'N/A'}`);

            // Broadcast sự kiện nhận file
            broadcast(apiState, {
              type: 'file_received',
              uid: senderId,
              fileData: msgObj.fileData,
              msgId: msgObj.msgId
            });
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
// FRIEND REQUEST LISTENER
// ========================================
async function setupFriendRequestListener(apiState) {
  if (!apiState.api) return;

  console.log('👥 Setting up friend request listener...');

  // Initialize tracking set to prevent duplicate accepts
  if (!apiState.acceptedFriendRequests) {
    apiState.acceptedFriendRequests = new Set();
  }

  // Try to listen for friend_request event if available
  try {
    apiState.api.listener.on('friend_request', async (data) => {
      console.log('🔔 Friend request event received:', data);
      const userId = data?.userId || data?.uid || data?.fromUid;
      if (userId) {
        await autoAcceptFriendRequest(apiState, userId);
      }
    });
    console.log('✅ friend_request event listener registered');
  } catch (e) {
    console.log('ℹ️ friend_request event not supported, using polling fallback');
  }

  // Check for friend requests periodically (polling fallback / main method)
  const checkInterval = setInterval(async () => {
    if (!apiState.api || !apiState.currentUser) {
      clearInterval(checkInterval);
      return;
    }

    try {
      await checkAndAcceptPendingFriendRequests(apiState);
    } catch (error) {
      console.error('❌ Friend request check error:', error.message);
    }
  }, 5000); // Check every 5 seconds for faster response

  // Store interval reference
  apiState.friendRequestCheckInterval = checkInterval;

  console.log('✅ Friend request listener started (polling every 5s)');
}

// Check and auto-accept pending friend requests
async function checkAndAcceptPendingFriendRequests(apiState) {
  const triggerDB = require('./triggerDB');

  if (!apiState.currentUser?.uid) return;

  // Get auto-accept friend trigger setting
  const allTriggers = triggerDB.getTriggersByUser(apiState.currentUser.uid);
  const autoFriendTrigger = allTriggers.find(t =>
    t.triggerKey === '__builtin_auto_friend__' &&
    t.enabled === true
  );

  if (!autoFriendTrigger) {
    apiState.autoAcceptFriendEnabled = false;
    return; // Not enabled, skip
  }

  // Store auto-accept state in apiState for use in message handler
  apiState.autoAcceptFriendEnabled = true;
  apiState.autoAcceptFriendWelcome = autoFriendTrigger.triggerContent || '';

  // Check for pending friend requests if API supports it
  try {
    // Method 1: Try getPendingFriendRequests if available
    if (typeof apiState.api.getPendingFriendRequests === 'function') {
      const pendingRequests = await apiState.api.getPendingFriendRequests();
      if (pendingRequests && Array.isArray(pendingRequests) && pendingRequests.length > 0) {
        console.log(`🔔 Found ${pendingRequests.length} pending friend request(s)`);
        for (const request of pendingRequests) {
          const userId = request.userId || request.uid || request.fromUid || request.id;
          if (userId) {
            await autoAcceptFriendRequest(apiState, userId);
          }
        }
      }
    }

    // Method 2: Try getFriendRequests if available
    if (typeof apiState.api.getFriendRequests === 'function') {
      const requests = await apiState.api.getFriendRequests();
      if (requests && Array.isArray(requests) && requests.length > 0) {
        console.log(`🔔 Found ${requests.length} friend request(s)`);
        for (const request of requests) {
          const userId = request.userId || request.uid || request.fromUid || request.id;
          if (userId) {
            await autoAcceptFriendRequest(apiState, userId);
          }
        }
      }
    }
  } catch (e) {
    // API không hỗ trợ hoặc có lỗi, bỏ qua im lặng
    // Sẽ dựa vào phương thức phát hiện stranger khi nhắn tin
  }
}

// Helper function to auto-accept friend request from stranger
async function autoAcceptFriendRequest(apiState, userId) {
  const triggerDB = require('./triggerDB');

  if (!apiState.currentUser?.uid) return;
  if (!userId) return;

  // Initialize tracking set to prevent duplicate accepts
  if (!apiState.acceptedFriendRequests) {
    apiState.acceptedFriendRequests = new Set();
  }

  // Check if already accepted to avoid duplicates
  if (apiState.acceptedFriendRequests.has(userId)) {
    return; // Already processed this user
  }

  // Get auto-accept friend trigger
  const allTriggers = triggerDB.getTriggersByUser(apiState.currentUser.uid);
  const autoFriendTrigger = allTriggers.find(t =>
    t.triggerKey === '__builtin_auto_friend__' &&
    t.enabled === true
  );

  if (!autoFriendTrigger) return;

  // Mark as processed immediately to prevent duplicate attempts
  apiState.acceptedFriendRequests.add(userId);

  try {
    console.log(`👥 Auto-accepting friend request from: ${userId}`);

    // Accept friend request
    await apiState.api.acceptFriendRequest(userId);
    console.log(`✅ Accepted friend request from: ${userId}`);

    // Send welcome message if configured
    const welcomeMsg = autoFriendTrigger.triggerContent?.trim();
    if (welcomeMsg) {
      // Wait a bit for friend to be added
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Replace variables
      const friend = apiState.friends?.find(f => f.userId === userId);
      const friendName = friend?.displayName || 'bạn';
      const currentTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

      const message = welcomeMsg
        .replace(/{name}/g, friendName)
        .replace(/{time}/g, currentTime);

      try {
        // Use sendMessage with correct parameters - threadId for DM is the userId
        await apiState.api.sendMessage(message, userId);
        console.log(`📤 Sent welcome message to: ${userId}`);
      } catch (msgError) {
        console.error(`⚠️ Could not send welcome message to ${userId}:`, msgError.message);
      }
    }

    // Broadcast activity
    broadcast(apiState, {
      type: 'friend_accepted',
      userId: userId,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error(`❌ Auto-accept friend error for ${userId}:`, error.message);
  }
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
    } catch (e) { }

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
    setupFriendRequestListener(apiState);

  } catch (err) {
    console.error('❌ Lỗi login QR:', err.message);
    setTimeout(() => loginZalo(apiState), 10000);
  }
}

module.exports = {
  loginZalo,
  setupMessageListener,
  setupFriendRequestListener,
  autoAcceptFriendRequest,
  broadcast,
  imageMetadataGetter
};