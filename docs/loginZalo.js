// loginZalo.js - INTEGRATED WITH AUTO REPLY + IMAGE SUPPORT
// ✅ FIX: Hỗ trợ gửi ảnh bằng imageMetadataGetter
// ✅ FIX: Xử lý nhận ảnh từ user
const { Zalo } = require('zca-js');
const { processAutoReply } = require('./autoReply.js');
const messageDB = require('./messageDB'); // SQLite message storage
const triggerDB = require('./triggerDB');
const { fetchAndBroadcastStrangerInfo } = require('./strangerInfoFetcher'); // Fetch stranger info
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

function logIncomingMessageActivity(apiState, senderId, msgObj, isGroup) {
  if (msgObj.isSelf) return; // Do not log self messages
  
  const userUID = apiState.currentUser?.uid || 'system';
  const friend = apiState.friendsMap?.get(senderId) || apiState.friends?.find(f => f.userId === senderId);
  const senderName = friend ? (friend.displayName || friend.name) : (isGroup ? 'Nhóm Zalo' : `Người dùng Zalo (${senderId})`);
  
  const action = 'RECEIVE_MESSAGE';
  const entityType = 'message';
  const entityID = null;
  const entityName = senderName;
  const details = msgObj.content || (msgObj.type === 'image' ? '[Hình ảnh]' : '[Media]');
  
  // Save to database
  triggerDB.logActivity(userUID, action, entityType, entityID, entityName, details);
  
  // Broadcast live new_activity_log to unified-header
  broadcast(apiState, {
    type: 'new_activity_log',
    log: {
      title: isGroup ? `💬 Tin nhắn nhóm mới` : `💬 Tin nhắn mới`,
      description: `Từ ${senderName}: ${details.substring(0, 100)}`,
      type: 'info'
    }
  });
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

      // 🔍 DEBUG: Check Mobile vs PC Self-Message structure
      const currentUid = apiState.currentUser?.uid;
      const calculatedIsSelf = message.isSelf || (currentUid && message.uidFrom === currentUid);

      console.log(`🔍 RECV RAW: Type=${message.type}, isSelf=${message.isSelf}, uidFrom=${message.uidFrom}, ThreadId=${message.threadId}`);
      if (currentUid && message.uidFrom === currentUid) {
        console.log('🔍 DETECTED SELF MESSAGE (Local Check)');
      }

      // 🔍 DEBUG: Log full data for deep inspection
      try {
        console.log('📦 MSG DATA:', JSON.stringify(message.data, null, 2));
      } catch (e) { }


      const isText = typeof message.data.content === 'string';

      // ========================================
      // XỬ LÝ TIN NHẮN TEXT
      // ========================================
      if (isText) {
        const msgObj = {
          msgId: message.data.msgId || message.msgId || `msg_${Date.now()}`,
          cliMsgId: message.data.cliMsgId || null,
          globalMsgId: message.data.globalMsgId || null,
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

        // ✅ Lưu vào SQLite
        messageDB.saveMessage(senderId, msgObj);

        // Broadcast tin nhắn mới
        broadcast(apiState, {
          type: 'new_message',
          uid: senderId,
          message: msgObj
        });

        // ✅ Ghi log tin nhắn đến và broadcast activity_log
        logIncomingMessageActivity(apiState, senderId, msgObj, isGroup);

        // ✅ Broadcast conversation update to sync multi-device ordering
        broadcast(apiState, {
          type: 'conversation_updated',
          uid: senderId,
          timestamp: msgObj.timestamp,
          lastMessage: msgObj.content.substring(0, 100)
        });

        console.log(`📨 Tin nhắn ${isGroup ? 'nhóm' : ''} từ ${senderId}: ${message.data.content.substring(0, 50)}...`);

        // ✅ Check if sender is stranger and fetch user info immediately
        if (!isGroup && !msgObj.isSelf) {
          const isFriend = apiState.friends?.some(f => f.userId === senderId);
          if (!isFriend) {
            console.log(`👥 Stranger detected: ${senderId}, fetching user info...`);

            // ✅ ALWAYS fetch user info for strangers (independent of trigger)
            fetchAndBroadcastStrangerInfo(apiState, senderId, message.data, broadcast);

            // Also trigger Smart Friend Handler if trigger is enabled
            handleSmartFriendRequest(apiState, senderId);
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
          msgId: message.data.msgId || message.msgId || `msg_${Date.now()}`,
          cliMsgId: message.data.cliMsgId || null,
          globalMsgId: message.data.globalMsgId || null,
          timestamp: message.ts || Date.now(),
          senderId,
          isSelf: message.isSelf || senderId === apiState.currentUser?.uid,
          isGroup: isGroup,
          threadId: message.threadId,
          uidFrom: message.uidFrom
        };

        // Xác định loại message
        if (content && typeof content === 'object') {
          // 🔍 DEBUG: Log raw content để xem cấu trúc message
          console.log('📋 RAW CONTENT:', JSON.stringify(content, null, 2).substring(0, 1000));

          // ✅ Parse params nếu là JSON string
          let parsedParams = {};
          if (content.params && typeof content.params === 'string') {
            try {
              parsedParams = JSON.parse(content.params);
            } catch (e) { }
          }

          // ✅ FILE detection - check title có extension hoặc params có fileExt
          const hasFileExt = parsedParams.fileExt && !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(parsedParams.fileExt.toLowerCase());
          const titleHasExt = content.title && /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|mp3|wav|mp4|avi|txt|csv)$/i.test(content.title);

          if (hasFileExt || titleHasExt || content.fileName || content.fileUrl) {
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
              fileSize: parsedParams.fileSize || content.fileSize || content.totalSize || null,
              fileType: fileType,
              fileExt: parsedParams.fileExt || fileExt,
              checksum: parsedParams.checksum || content.checksum || null,
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
          // ✅ IMAGE message - check for image properties (không có fileName)
          else if (content.href || content.hdUrl || content.normalUrl || content.thumbUrl || content.oriUrl) {
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
            console.log(`   Thumb URL: ${content.thumbUrl || 'N/A'}`);
            console.log(`   Best URL: ${msgObj.imageUrl}`);

            // Log Activity
            messageDB.logFileActivity(senderId, 'image.jpg', 'image', 'RECEIVED', 'SUCCESS', msgObj.imageUrl);
          }
          // File message - FALLBACK (nếu có url hoặc href nhưng không có các thuộc tính image)
          else if (content.url || content.href) {
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
            console.log(`   URL: ${msgObj.fileData.fileUrl || 'N/A'}`);
            console.log(`   Size: ${content.fileSize || content.totalSize || 'N/A'}`);

            // Log Activity
            messageDB.logFileActivity(senderId, fileName, fileExt, 'RECEIVED', 'SUCCESS', msgObj.fileData.fileUrl);

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

        // ✅ Lưu vào SQLite (bao gồm cả ảnh/file)
        messageDB.saveMessage(senderId, {
          ...msgObj,
          attachmentType: msgObj.type,
          attachmentPath: msgObj.imageUrl || msgObj.fileData?.fileUrl || null,
          attachmentName: msgObj.fileData?.fileName || null,
          attachmentSize: msgObj.fileData?.fileSize || msgObj.imageData?.fileSize || null
        });

        // Broadcast tin nhắn mới
        broadcast(apiState, {
          type: 'new_message',
          uid: senderId,
          message: msgObj
        });

        // ✅ Ghi log tin nhắn đến và broadcast activity_log
        logIncomingMessageActivity(apiState, senderId, msgObj, isGroup);

        // ✅ Broadcast conversation update to sync multi-device ordering
        broadcast(apiState, {
          type: 'conversation_updated',
          uid: senderId,
          timestamp: msgObj.timestamp,
          lastMessage: msgObj.content || '[Media]'
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

        // Check if sender is stranger and auto-accept/add is enabled
        if (!isGroup && !msgObj.isSelf) {
          const isFriend = apiState.friends?.some(f => f.userId === senderId);
          if (!isFriend) {
            console.log(`👥 Stranger detected (Media/File): ${senderId}, triggering Smart Friend Handler...`);

            // ✅ ALWAYS fetch user info for strangers (independent of trigger)
            fetchAndBroadcastStrangerInfo(apiState, senderId, message.data, broadcast);

            handleSmartFriendRequest(apiState, senderId);
          }
        }

        // AUTO REPLY FOR FILES/IMAGES
        processAutoReply(apiState, message);
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
        await handleSmartFriendRequest(apiState, userId);
      }
    });
    console.log('✅ friend_request event listener registered');
  } catch (e) {
    console.log('ℹ️ friend_request event not supported, using polling fallback');
  }

  // ========================================
  // TYPING EVENT LISTENER
  // ========================================
  try {
    apiState.api.listener.on('typing', (event) => {
      // event matches the Typing type provided: { type, data, threadId, isSelf }
      // data: { uid, ts, isPC, gid }
      console.log(`✍️ Typing event from ${event.threadId} (isPC: ${event.data.isPC})`);

      broadcast(apiState, {
        type: 'typing',
        threadId: event.threadId,
        uid: event.data.uid,
        isGroup: event.type === 1, // ThreadType.Group = 1
        isPC: event.data.isPC
      });
    });
    console.log('✅ typing event listener registered');
  } catch (e) {
    console.log('ℹ️ typing listener error:', e.message);
  }

  // ========================================
  // FRIEND EVENT LISTENER - All friend event types
  // ========================================
  try {
    apiState.api.listener.on('friend_event', async (event) => {
      console.log('👥 Friend event received:', event);
      const triggerDB = require('./triggerDB');

      // Import FriendEventType enum if available
      const FriendEventType = {
        ADD: 0,
        REMOVE: 1,
        REQUEST: 2,
        UNDO_REQUEST: 3,
        REJECT_REQUEST: 4,
        SEEN_FRIEND_REQUEST: 5,
        BLOCK: 6,
        UNBLOCK: 7,
        BLOCK_CALL: 8,
        UNBLOCK_CALL: 9,
        PIN_UNPIN: 10,
        PIN_CREATE: 11,
        UNKNOWN: 12
      };

      const eventTypeNames = {
        0: 'ADD',
        1: 'REMOVE',
        2: 'REQUEST',
        3: 'UNDO_REQUEST',
        4: 'REJECT_REQUEST',
        5: 'SEEN_FRIEND_REQUEST',
        6: 'BLOCK',
        7: 'UNBLOCK',
        8: 'BLOCK_CALL',
        9: 'UNBLOCK_CALL',
        10: 'PIN_UNPIN',
        11: 'PIN_CREATE',
        12: 'UNKNOWN'
      };

      const eventTypeName = eventTypeNames[event.type] || 'UNKNOWN';
      console.log(`   Type: ${eventTypeName}`);
      console.log(`   Data:`, event.data);

      // Broadcast event to all connected clients
      // Variables to be broadcasted
      const broadcastData = {
        type: 'friend_event',
        eventType: eventTypeName,
        eventTypeId: event.type,
        data: event.data,
        threadId: event.threadId,
        isSelf: event.isSelf,
        timestamp: Date.now()
      };

      // Handle specific events BEFORE broadcasting to ensure cache is up-to-date
      switch (event.type) {
        case FriendEventType.ADD:
          console.log(`🎉 New friend added: ${event.data}`);
          if (apiState.currentUser?.uid) {
            triggerDB.logActivity(apiState.currentUser.uid, 'friend_added', 'user', event.data, 'Người dùng', `Đã thêm bạn mới: ${event.data}`);
          }

          // ✅ OPTIMIZED: Update cache manually instead of fetching full list (slow/stale)
          if (apiState.friends) {
            try {
              // Fetch info for new friend
              const info = await apiState.api.getUserInfo(event.data);
              console.log('📋 getUserInfo response:', JSON.stringify(info, null, 2));

              // ✅ FIX: Check changed_profiles (not changed) - this is where Zalo API puts the data
              let userData = info[event.data]
                || info.changed_profiles?.[event.data]
                || info.changed?.[event.data]
                || null;

              // If still not found, try to extract from any nested structure
              if (!userData && typeof info === 'object') {
                // Check if info itself has displayName/zaloName
                if (info.displayName || info.zaloName) {
                  userData = info;
                } else {
                  // Try first key in changed_profiles or info
                  const profiles = info.changed_profiles || info;
                  const firstKey = Object.keys(profiles)[0];
                  if (firstKey && profiles[firstKey]?.displayName) {
                    userData = profiles[firstKey];
                  }
                }
              }

              const newFriend = {
                userId: String(event.data),
                displayName: userData?.displayName || userData?.zaloName || userData?.name || "Người dùng Zalo",
                avatar: userData?.avatar || userData?.avatarUrl || `https://graph.zalo.me/v2.0/avatar?user_id=${event.data}&width=120&height=120`,
                zaloName: userData?.zaloName || ""
              };

              console.log('✅ Parsed new friend:', newFriend);

              // Add to cache if not exists
              if (!apiState.friends.find(f => String(f.userId) === String(event.data))) {
                apiState.friends.push(newFriend);
                if (apiState.friendsMap) {
                  apiState.friendsMap.set(String(event.data), newFriend);
                }
                console.log(`✅ Added ${newFriend.displayName} (${event.data}) to local friend cache`);

                // Removed redundant independent auto-delete logic 
                // Auto-delete is now managed exclusively via handleSmartFriendRequest
              }
            } catch (e) {
              console.warn("⚠️ Failed to fetch new friend info, adding placeholder:", e.message);
              // Fallback placeholder with better avatar
              const placeholderFriend = {
                userId: String(event.data),
                displayName: "Người dùng mới",
                avatar: `https://graph.zalo.me/v2.0/avatar?user_id=${event.data}&width=120&height=120`
              };
              apiState.friends.push(placeholderFriend);
              if (apiState.friendsMap) {
                apiState.friendsMap.set(String(event.data), placeholderFriend);
              }
            }
          }
          break;

        case FriendEventType.REMOVE:
          console.log(`👋 Friend removed: ${event.data}`);
          const removedFriendId = String(event.data);
          if (apiState.currentUser?.uid) {
            triggerDB.logActivity(apiState.currentUser.uid, 'friend_removed', 'user', removedFriendId, 'Người dùng', `Đã hủy kết bạn với: ${removedFriendId}`);
          }
          // Remove from cached list
          if (apiState.friends) {
            apiState.friends = apiState.friends.filter(f => String(f.userId) !== removedFriendId);
            console.log(`✅ Removed ${removedFriendId} from local friend cache`);
          }
          if (apiState.friendsMap) {
            apiState.friendsMap.delete(removedFriendId);
          }
          // Also broadcast friend_removed event to update all frontend sessions
          broadcast(apiState, {
            type: 'friend_removed',
            friendId: removedFriendId
          });
          break;

        case FriendEventType.REQUEST:
          console.log(`📨 New friend request from: ${event.data?.fromUid}`);
          if (apiState.currentUser?.uid && event.data?.fromUid) {
            triggerDB.logActivity(apiState.currentUser.uid, 'friend_request', 'user', event.data.fromUid, 'Người dùng', `Lời mời kết bạn từ: ${event.data.fromUid}`);
          }
          if (event.data?.fromUid) {
            await handleSmartFriendRequest(apiState, event.data.fromUid);
          }
          break;

        case FriendEventType.UNDO_REQUEST:
          console.log(`↩️ Friend request undone: ${event.data?.toUid}`);
          break;

        case FriendEventType.REJECT_REQUEST:
          console.log(`❌ Friend request rejected: ${event.data?.toUid}`);
          break;

        case FriendEventType.BLOCK:
          console.log(`🚫 User blocked: ${event.data}`);
          break;

        case FriendEventType.UNBLOCK:
          console.log(`✅ User unblocked: ${event.data}`);
          break;

        default:
          console.log(`ℹ️ Unhandled friend event type: ${eventTypeName}`);
      }

      // ✅ Broadcast AFTER cache update to ensure client gets fresh data
      broadcast(apiState, broadcastData);
    });
    console.log('✅ friend_event listener registered');
  } catch (e) {
    console.log('ℹ️ friend_event listener not supported:', e.message);
  }

  // ========================================
  //?REACTION EVENT LISTENER
  // =========================================
  try {
    apiState.api.listener.on('reaction', (event) => {
      console.log('😊 Reaction event received:', event);

      // Broadcast reaction to all connected clients
      broadcast(apiState, {
        type: 'reaction_received',
        msgId: event.msgId || event.globalMsgId,
        threadId: event.threadId,
        userId: event.userId,
        icon: event.icon,
        timestamp: Date.now()
      });

      console.log(`✅ Broadcasted reaction: ${event.icon} on message ${event.msgId}`);
    });
    console.log('✅ reaction event listener registered');
  } catch (e) {
    console.log('ℹ️ reaction listener not supported:', e.message);
  }

  // Check for friend requests periodically (polling fallback / main method)
  // Check for friend requests periodically (polling fallback / main method)
  const checkInterval = setInterval(async () => {
    let triggerDB;
    try { triggerDB = require('./triggerDB'); } catch (e) { }

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
            await handleSmartFriendRequest(apiState, userId);
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
            await handleSmartFriendRequest(apiState, userId);
          }
        }
      }
    }
  } catch (e) {
    // API không hỗ trợ hoặc có lỗi, bỏ qua im lặng
    // Sẽ dựa vào phương thức phát hiện stranger khi nhắn tin
  }
}

// Helper function to implementation Smart Friend Request (Accept or Add)
async function handleSmartFriendRequest(apiState, userId) {
  const triggerDB = require('./triggerDB');

  if (!apiState.currentUser?.uid) return;
  if (!userId) return;

  // Initialize tracking
  if (!apiState.processedSmartFriend) {
    apiState.processedSmartFriend = new Set();
  }

  // Debug Log
  console.log(`🔍 Smart Friend: Handling ${userId}`);

  // ✅ Get auto-friend settings from builtin_triggers_state table (system-settings.html)
  const autoFriendSettings = triggerDB.getBuiltInTriggerState(apiState.currentUser.uid, 'builtin_auto_friend');

  if (!autoFriendSettings || !autoFriendSettings.enabled) {
    console.log('ℹ️ Smart Friend: Trigger disabled or not found');
    return;
  }

  // Mark processed - WAIT, only mark if ACTION taken?
  // apiState.processedSmartFriend.add(userId);

  try {
    let pendingRequest = false;
    let alreadySent = false;

    console.log('🔍 Check Pending Requests...');

    // 1. Check if they sent us a request
    try {
      if (typeof apiState.api.getPendingFriendRequests === 'function') {
        const pending = await apiState.api.getPendingFriendRequests();
        console.log(`   Pending List: ${pending?.length}`);
        if (pending && Array.isArray(pending)) {
          pendingRequest = pending.some(r => (r.userId || r.fromUid || r.id) === userId);
        }
      }
      // Fallback or double check with getFriendRequests
      if (!pendingRequest && typeof apiState.api.getFriendRequests === 'function') {
        const reqs = await apiState.api.getFriendRequests();
        console.log(`   Req List: ${reqs?.length}`);
        if (reqs && Array.isArray(reqs)) {
          pendingRequest = reqs.some(r => (r.userId || r.fromUid || r.id) === userId);
        }
      }
    } catch (e) {
      console.warn('⚠️ Check pending requests failed:', e.message);
    }

    if (pendingRequest) {
      // ACCEPT
      console.log(`✅ Found pending request from ${userId}. Accepting...`);
      await apiState.api.acceptFriendRequest(userId);
      apiState.processedSmartFriend.add(userId);

      // Broadcast
      broadcast(apiState, { type: 'friend_accepted', userId: userId, timestamp: Date.now() });

      // ✅ AUTO DELETE IF ENABLED - Read from builtin_triggers_state
      const autoDeleteSettings = triggerDB.getBuiltInTriggerState(apiState.currentUser.uid, 'builtin_auto_delete_messages');
      if (autoDeleteSettings && autoDeleteSettings.enabled && apiState.api.updateAutoDeleteChat) {
        // Check if user is in the selected users list
        const selectedUsers = autoDeleteSettings.selectedUsers || [];
        const shouldApplyAutoDelete = selectedUsers.length === 0 || selectedUsers.includes(userId);
        
        if (shouldApplyAutoDelete) {
          let ttl = parseInt(autoDeleteSettings.response) || 86400000;
          if (ttl > 0) {
            console.log(`🗑️ Auto-Delete: Enabling ${ttl}ms timer for ${userId}`);
            try { await apiState.api.updateAutoDeleteChat(ttl, userId); } catch (e) { }
          }
        } else {
          console.log(`ℹ️ Auto-Delete: User ${userId} not in selected list, skipping`);
        }
      }

      // Send Welcome Message - Use user's custom message if set
      const welcomeMsg = autoFriendSettings.welcomeMessage?.trim();
      if (welcomeMsg) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const friend = apiState.friends?.find(f => f.userId === userId);
        const friendName = friend?.displayName || 'bạn';
        const currentTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const msg = welcomeMsg.replace(/{name}/g, friendName).replace(/{time}/g, currentTime);
        try {
          await apiState.api.sendMessage(msg, userId);
          console.log(`✅ Welcome message sent to ${userId}: ${msg}`);
        } catch (e) {
          console.warn(`⚠️ Failed to send welcome message: ${e.message}`);
        }
      }
      return;
    } else {
      console.log('   No pending request found.');
    }

    // 2. Check if we ALREADY sent a request
    try {
      if (typeof apiState.api.getSentFriendRequest === 'function') {
        const sent = await apiState.api.getSentFriendRequest();
        // sent is expected to be object { [uid]: info } or array
        if (sent) {
          if (sent[userId]) alreadySent = true;
          else if (Array.isArray(sent) && sent.some(s => s.userId === userId)) alreadySent = true;
        }
      }
    } catch (e) {
      console.warn('⚠️ Check sent requests failed:', e.message);
    }

    if (alreadySent) {
      console.log(`ℹ️ Request already sent to ${userId}. Skipping.`);
      return;
    }

    // 3. SEND REQUEST
    console.log(`➕ Sending friend request to ${userId}...`);

    let success = false;
    // For friend request message, use simple message (not welcome message - that's for after accept)
    const friendRequestMsg = "Chào bạn, mình kết bạn nhé!";

    // Define potential methods - THỨ TỰ ĐÚNG: (msg, userId) như trong autoReply.js
    const strategies = [
      { name: 'acceptFriend(uid)', fn: 'acceptFriend', args: [userId] },
      { name: 'acceptFriendRequest(uid)', fn: 'acceptFriendRequest', args: [userId] },
      { name: 'sendFriendRequest(msg, uid)', fn: 'sendFriendRequest', args: [friendRequestMsg, userId] },
      { name: 'addFriend(msg, uid)', fn: 'addFriend', args: [friendRequestMsg, userId] },
      { name: 'sendFriendRequest(uid, msg)', fn: 'sendFriendRequest', args: [userId, friendRequestMsg] },
      { name: 'addFriend(uid, msg)', fn: 'addFriend', args: [userId, friendRequestMsg] }
    ];

    for (const strategy of strategies) {
      const fn = apiState.api[strategy.fn];
      if (typeof fn === 'function') {
        try {
          console.log(`   Trying ${strategy.name}...`);
          await fn.apply(apiState.api, strategy.args);
          console.log(`✅ Friend request sent success!`);
          apiState.processedSmartFriend.add(userId);
          success = true;

          // ✅ AUTO DELETE IF ENABLED - Read from builtin_triggers_state
          const autoDeleteSettings = triggerDB.getBuiltInTriggerState(apiState.currentUser.uid, 'builtin_auto_delete_messages');
          if (autoDeleteSettings && autoDeleteSettings.enabled && apiState.api.updateAutoDeleteChat) {
            let ttl = parseInt(autoDeleteSettings.response) || 86400000;
            if (ttl > 0) {
              console.log(`🗑️ Auto-Delete: Enabling ${ttl}ms timer for ${userId}`);
              try { await apiState.api.updateAutoDeleteChat(ttl, userId); } catch (e) { }
            }
          }

          break;
        } catch (e) {
          console.warn(`   ⚠️ Method ${strategy.name} failed: ${e.message}`);
        }
      }
    }

    // NOTE: Welcome message only sent after ACCEPT, not on sending friend request
    // This is by user request - welcome message is set in "tin nhắn chào mừng"

    if (!success) {
      console.error('❌ All friend request methods failed. Please check zca-js version or API support.');
    }

  } catch (error) {
    console.error(`❌ Smart Friend Handler error for ${userId}:`, error.message);
  }
}

// ========================================
// LOGIN FUNCTION - Với imageMetadataGetter
// ========================================

// Main login function
async function loginZalo(apiState) {
  const targetState = apiState; // Use global state directly

  console.log('🚀 Starting Zalo Login (Single-User Mode)');

  // Check if already logged in or login in progress
  if (targetState.api) {
    console.log('✅ Already logged in!');
    return targetState.api;
  }
  if (targetState.loginInProgress) {
    console.log('⏳ Login process is already in progress, ignoring duplicate trigger.');
    return;
  }

  targetState.loginInProgress = true;

  try {

    // ✅ Khởi tạo Zalo với imageMetadataGetter để hỗ trợ gửi ảnh
    const zalo = new Zalo({
      imageMetadataGetter: imageMetadataGetter
    });

    const CREDENTIALS_PATH = path.join(__dirname, 'data', 'credentials.json');
    let loggedIn = false;

    // Thử đăng nhập bằng credentials lưu từ trước
    if (fs.existsSync(CREDENTIALS_PATH)) {
      try {
        console.log('🔑 Tìm thấy thông tin đăng nhập đã lưu, đang khôi phục phiên...');
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        
        targetState.api = await zalo.login(credentials);
        console.log('✅ Đăng nhập bằng phiên đã lưu thành công!');
        loggedIn = true;
      } catch (err) {
        console.warn('⚠️ Phiên đăng nhập đã lưu không hợp lệ hoặc hết hạn:', err.message);
        try {
          fs.unlinkSync(CREDENTIALS_PATH);
          console.log('🗑️ Đã xóa file credentials cũ.');
        } catch (unlinkErr) {}
      }
    }

    if (!loggedIn) {
      console.log('🔄 Đang tạo mã QR đăng nhập...');
      
      // Login QR không callback để giữ hành vi mặc định (tự lưu QR, tự retry khi hết hạn)
      targetState.api = await zalo.loginQR();
    }

    // Xóa file QR nếu có
    try {
      fs.unlinkSync('qr.png');
    } catch (e) { }

    // ✅ Patch Zalo API functions for BigInt parameter compatibility
    if (targetState.api) {
      patchZaloApi(targetState.api);
    }

    // ✅ Lưu credentials sau khi đăng nhập thành công (cả QR và credentials login)
    try {
      const ctx = targetState.api.getContext();
      if (ctx && ctx.imei && ctx.cookie) {
        const credentials = {
          imei: ctx.imei,
          cookie: ctx.cookie.toJSON().cookies,
          userAgent: ctx.userAgent,
          language: ctx.language || 'vi'
        };
        const dataDir = path.dirname(CREDENTIALS_PATH);
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), 'utf8');
        console.log('✅ Đã lưu thông tin phiên đăng nhập vào data/credentials.json');
      }
    } catch (saveErr) {
      console.warn('⚠️ Không thể lưu credentials:', saveErr.message);
    }

    // ✅ Multi-device support enabled - no IP locking or force logout
    // All connected clients will receive the current_user broadcast

    targetState.isLoggedIn = true;

    console.log('🎉 Đăng nhập thành công! Session ready.');
    console.log('📷 Image sending:', sharp ? 'ENABLED (sharp loaded)' : 'LIMITED (sharp not installed)');

    const uid = targetState.api.getOwnId().toString();
    const info = await targetState.api.getUserInfo(uid);
    const profile = info.changed_profiles?.[uid] || info;

    targetState.currentUser = {
      uid,
      name: profile.displayName || profile.zaloName || "Không rõ tên",
      avatar: profile.avatar || `https://graph.zalo.me/v2.0/avatar/${uid}?size=240`
    };

    // ✅ Initialize Message Database for this user
    try {
      messageDB.init(uid);
      console.log('✅ MessageDB initialized for user:', uid);
    } catch (dbErr) {
      console.error('❌ Failed to initialize MessageDB for user:', uid, dbErr.message);
    }

    // ✅ Ensure built-in triggers exist for this user
    try {
      const triggerDB = require('./triggerDB');
      triggerDB.ensureUserTriggers(uid);
      console.log('✅ Checked/Initialized triggers for user:', uid);

      // 🔄 RESTORE AUTO-REPLY STATE FROM DB
      const autoReplyModule = require('./autoReply');

      // 1. Personal Auto-Reply
      const savedPersonal = triggerDB.getBuiltInTriggerState(uid, 'global_auto_reply_personal');
      if (savedPersonal && savedPersonal.enabled !== undefined) {
        autoReplyModule.autoReplyState.enabled = savedPersonal.enabled;
        console.log(`🔄 Restored Personal Auto-Reply State: ${savedPersonal.enabled ? 'ON' : 'OFF'}`);
      }

      // 2. Bot OA Auto-Reply
      const savedBot = triggerDB.getBuiltInTriggerState(uid, 'global_auto_reply_bot');
      if (savedBot) {
        targetState.botAutoReplyEnabled = savedBot.enabled;
        if (savedBot.botToken) targetState.botToken = savedBot.botToken;
        console.log(`🔄 Restored Bot OA Auto-Reply State: ${savedBot.enabled ? 'ON' : 'OFF'}`);

        // Note: Polling will be started by WebSocket 'get_bot_auto_reply_status' 
        // or we need to expose startBotPolling here.
        // For now, trusting the UI to trigger the check.
      }

    } catch (e) {
      console.warn('⚠️ Init triggers/restore state failed:', e.message);
    }

    // Load friends list for Smart Features
    try {
      console.log('👥 Loading friends list...');
      const friendsFn = targetState.api.getFriends;
      if (typeof friendsFn === 'function') {
        targetState.friends = await friendsFn();
        console.log(`✅ Loaded ${targetState.friends?.length || 0} friends.`);
      }
    } catch (e) { console.warn('⚠️ Could not load friends:', e.message); }

    // Setup listeners (Auto reply, etc.)
    // Note: Single-user mode - listeners attached to global apiState

    // Broadcast user info to all connected clients
    if (targetState.clients) {
      const json = JSON.stringify({
        type: 'current_user',
        user: targetState.currentUser
      });
      targetState.clients.forEach(ws => {
        if (ws.readyState === 1) ws.send(json);
      });
    }

    // Setup listeners (Auto reply, etc.)
    setupMessageListener(targetState);
    setupFriendRequestListener(targetState);

    targetState.loginInProgress = false;

  } catch (error) {
    targetState.loginInProgress = false;
    console.error('❌ Login failed:', error);
    throw error;
  }
  // finally block removed - no sessionManager to unlock
}

// ✅ Helper to patch API functions to format ID parameters without quotes (BigInt compatibility)
function patchZaloApi(api) {
  if (!api) return;
  try {
    const ctx = api.getContext();
    const utils = require('zca-js/dist/cjs/utils.cjs');

    // Override removeFriend
    api.removeFriend = async function (friendId) {
      const cleanId = friendId.toString().split('_')[0].replace(/\D/g, '');
      const serviceURL = utils.makeURL(ctx, `${api.zpwServiceMap.friend[0]}/api/friend/remove`);
      const payloadStr = `{"fid":${cleanId},"imei":${JSON.stringify(ctx.imei)}}`;
      const encryptedParams = utils.encodeAES(ctx.secretKey, payloadStr);
      if (!encryptedParams) throw new Error("Failed to encrypt params");
      const response = await utils.request(ctx, serviceURL, {
        method: "POST",
        body: new URLSearchParams({
          params: encryptedParams,
        }),
      });
      return utils.resolveResponse(ctx, response);
    };

    // Override blockUser
    api.blockUser = async function (userId) {
      const cleanId = userId.toString().split('_')[0].replace(/\D/g, '');
      const serviceURL = utils.makeURL(ctx, `${api.zpwServiceMap.friend[0]}/api/friend/block`);
      const payloadStr = `{"fid":${cleanId},"imei":${JSON.stringify(ctx.imei)}}`;
      const encryptedParams = utils.encodeAES(ctx.secretKey, payloadStr);
      if (!encryptedParams) throw new Error("Failed to encrypt params");
      const response = await utils.request(ctx, serviceURL, {
        method: "POST",
        body: new URLSearchParams({
          params: encryptedParams,
        }),
      });
      return utils.resolveResponse(ctx, response);
    };

    // Override unblockUser
    api.unblockUser = async function (userId) {
      const cleanId = userId.toString().split('_')[0].replace(/\D/g, '');
      const serviceURL = utils.makeURL(ctx, `${api.zpwServiceMap.friend[0]}/api/friend/unblock`);
      const payloadStr = `{"fid":${cleanId},"imei":${JSON.stringify(ctx.imei)}}`;
      const encryptedParams = utils.encodeAES(ctx.secretKey, payloadStr);
      if (!encryptedParams) throw new Error("Failed to encrypt params");
      const response = await utils.request(ctx, serviceURL, {
        method: "POST",
        body: new URLSearchParams({
          params: encryptedParams,
        }),
      });
      return utils.resolveResponse(ctx, response);
    };

    // Override undoFriendRequest
    api.undoFriendRequest = async function (friendId) {
      const cleanId = friendId.toString().split('_')[0].replace(/\D/g, '');
      const serviceURL = utils.makeURL(ctx, `${api.zpwServiceMap.friend[0]}/api/friend/undo`);
      const payloadStr = `{"fid":${cleanId}}`;
      const encryptedParams = utils.encodeAES(ctx.secretKey, payloadStr);
      if (!encryptedParams) throw new Error("Failed to encrypt params");
      const response = await utils.request(ctx, serviceURL, {
        method: "POST",
        body: new URLSearchParams({
          params: encryptedParams,
        }),
      });
      return utils.resolveResponse(ctx, response);
    };

    console.log("🛠️ Zalo API methods successfully patched for BigInt compatibility.");
  } catch (err) {
    console.error("❌ Failed to patch Zalo API methods:", err.message);
  }
}

module.exports = {
  loginZalo,
  setupMessageListener,
  setupFriendRequestListener,
  handleSmartFriendRequest,
  broadcast,
  imageMetadataGetter
};