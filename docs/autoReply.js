// autoReply.js - Auto Reply v4.4 - FIXED CONDITION TO RUN FLOWS
// Fix: condition chạy flow khác thay vì tìm child blocks
const triggerDB = require('./triggerDB');
const fileReader = require('./fileReader');
const printer = require('./printer');
const messageDB = require('./messageDB');

const fileBatchMap = new Map(); // senderId -> { files: [], timer: null }

const autoReplyState = {
  enabled: false,
  stats: { received: 0, replied: 0, skipped: 0, flowExecuted: 0 },
  cooldowns: new Map(),
  botActiveStates: new Map(),
  pendingInputs: new Map()
};

const flowProcessLog = [];

async function processAutoReply(apiState, message) {
  try {
    if (!autoReplyState.enabled) return;
    if (!message || !message.data) return;

    const content = message.data.content;
    // if (typeof content !== 'string' || !content.trim()) return; // OLD CHECK
    // Allow objects for file/image detection
    if (!content) return;

    const senderId = message.uidFrom || message.threadId;
    if (!senderId || message.isSelf) return;
    if (message.type === 'Group') return;

    autoReplyState.stats.received++;

    const userUID = apiState.currentUser?.uid;
    if (!userUID) return;

    // Check bot active state
    const botState = autoReplyState.botActiveStates.get(senderId);
    if (botState) {
      if (botState.expiresAt && Date.now() > botState.expiresAt) {
        autoReplyState.botActiveStates.delete(senderId);
      } else if (!botState.active) {
        autoReplyState.stats.skipped++;
        return;
      }
    }

    const isFriend = apiState.friends?.some(f => f.userId === senderId) || false;
    const logContent = typeof content === 'string' ? content.substring(0, 30) : '[File/Image]';
    console.log(`📨 Message from ${senderId}: "${logContent}..."`);

    // ========== CHECK PENDING USER INPUT (TEXT ONLY) ==========
    if (typeof content === 'string') {
      const pendingKey = `${userUID}_${senderId}`;
      let pendingInput = autoReplyState.pendingInputs.get(pendingKey);

      if (!pendingInput) {
        const dbState = triggerDB.getInputState(userUID, senderId);
        if (dbState) {
          pendingInput = dbState;
        }
      }

      if (pendingInput) {
        console.log(`👂 Has pending input state`);
        await handleUserInputResponse(apiState, senderId, content, pendingInput, userUID);
        return;
      }
    }

    // ========================================================
    // FILE / IMAGE DETECTION TRIGGER (__builtin_auto_file__)
    // ========================================================
    if (typeof content === 'object') {
      // MỚI: Kiểm tra custom trigger có loại any_file hoặc any_message
      const customTrigger = triggerDB.findMatchingTrigger(userUID, '', senderId, isFriend, true);  // hasAttachment = true
      if (customTrigger && customTrigger.triggerType !== 'keyword') {
        console.log(`🎯 Custom trigger matched (${customTrigger.triggerType}): ${customTrigger.triggerName}`);
        const setMode = customTrigger.setMode || 0;
        if (setMode === 1) {
          await executeFlow(apiState, senderId, customTrigger, content, userUID);
        } else if (customTrigger.triggerContent?.trim()) {
          await sendMessage(apiState, senderId, customTrigger.triggerContent, userUID);
        }
        return;
      }

      // Builtin Auto File Trigger (fallback)
      const allTriggers = triggerDB.getTriggersByUser(userUID);
      const autoFileTrigger = allTriggers.find(t => t.triggerKey === '__builtin_auto_file__' && t.enabled === true);

      if (autoFileTrigger) {
        console.log('📂 Checking Auto File trigger...');
        let fileType = 'unknown';
        let fileExt = '';

        // Phân tích loại file
        // Phân tích loại file
        if (message.type === 'Image' || (content.href && (content.href.indexOf('photo') > -1 || /\.(jpg|jpeg|png|gif|webp)/i.test(content.href) || content.href.includes('/jpg/') || content.href.includes('/png/')))) {
          fileType = 'image';
          fileExt = 'jpg'; // Default for images
        } else if (content.title || content.filename) {
          const name = content.title || content.filename || '';
          const parts = name.split('.');
          if (parts.length > 1) fileExt = parts.pop().toLowerCase();
          fileType = 'file';
        }

        if (fileExt || fileType === 'image') {
          // GOM BATCH
          // 1. Prepare file info
          const fInfo = {
            url: content.fileUrl || content.url || content.href,
            type: fileType,
            ext: fileExt,
            name: content.title || content.filename || 'unknown',
            triggerContent: autoFileTrigger.triggerContent || autoFileTrigger.response || '' // Keep config for later check
          };

          // 2. Add to batch
          let batch = fileBatchMap.get(senderId) || { files: [], timer: null };
          batch.files.push(fInfo);

          if (batch.timer) clearTimeout(batch.timer);
          batch.timer = setTimeout(() => {
            processFileBatch(apiState, senderId, userUID, fileBatchMap.get(senderId).files);
            fileBatchMap.delete(senderId);
          }, 3000); // Wait 3s debounce

          fileBatchMap.set(senderId, batch);
          return; // Skip immediate reply
        }
      }

      // If content is object but not handled by autoFile, return to avoid processing as text
      return;
    }

    // ========== CHECK BUILT-IN AUTO MESSAGE TRIGGER ==========
    const allTriggers = triggerDB.getTriggersByUser(userUID);
    const autoMessageTrigger = allTriggers.find(t =>
      t.triggerKey === '__builtin_auto_message__' &&
      t.enabled === true
    );

    // If auto-message is enabled, reply immediately
    if (autoMessageTrigger) {
      const cooldownKey = `${senderId}_${autoMessageTrigger.triggerID}`;
      const lastReplyTime = autoReplyState.cooldowns.get(cooldownKey);
      const now = Date.now();
      const cooldownMs = autoMessageTrigger.cooldown || 30000;
      const elapsed = lastReplyTime ? (now - lastReplyTime) : cooldownMs + 1; // First time = always pass

      console.log(`🔄 Auto-message check: lastReply=${lastReplyTime ? new Date(lastReplyTime).toLocaleTimeString() : 'never'}, elapsed=${Math.floor(elapsed / 1000)}s, cooldown=${Math.floor(cooldownMs / 1000)}s`);

      if (elapsed >= cooldownMs) {
        let replyContent = autoMessageTrigger.triggerContent || 'Xin chào!';

        // Replace variables
        const senderName = apiState.friends?.find(f => f.userId === senderId)?.displayName || 'bạn';
        const currentTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

        replyContent = replyContent
          .replace(/{name}/g, senderName)
          .replace(/{time}/g, currentTime);

        await sendMessage(apiState, senderId, replyContent, userUID);
        autoReplyState.cooldowns.set(cooldownKey, now);
        autoReplyState.stats.replied++;
        console.log(`✅ Auto-message replied! Next reply available in ${Math.floor(cooldownMs / 1000)}s`);
        return; // Exit after auto-message reply
      } else {
        const waitTime = Math.ceil((cooldownMs - elapsed) / 1000);
        console.log(`⏳ Auto-message cooldown active: wait ${waitTime}s more`);
        // Don't return here, continue to check other triggers
      }
    }

    // ========== FIND MATCHING TRIGGER ==========
    const matchedTrigger = triggerDB.findMatchingTrigger(userUID, content, senderId, isFriend);

    if (!matchedTrigger) {
      autoReplyState.stats.skipped++;
      return;
    }

    // Check cooldown
    const cooldownKey = `${senderId}_${matchedTrigger.triggerID}`;
    const lastReplyTime = autoReplyState.cooldowns.get(cooldownKey);
    const now = Date.now();

    if (lastReplyTime && (now - lastReplyTime) < matchedTrigger.cooldown) {
      autoReplyState.stats.skipped++;
      return;
    }

    const setMode = matchedTrigger.setMode || 0;

    if (setMode === 1) {
      console.log(`🔄 Flow mode: ${matchedTrigger.triggerName}`);
      await executeFlow(apiState, senderId, matchedTrigger, content, userUID);
    } else {
      const replyContent = matchedTrigger.triggerContent;
      if (!replyContent?.trim()) {
        autoReplyState.stats.skipped++;
        return;
      }
      await sendMessage(apiState, senderId, replyContent, userUID);
      autoReplyState.cooldowns.set(cooldownKey, now);
      autoReplyState.stats.replied++;
      console.log(`✅ Direct reply sent`);
    }

  } catch (error) {
    console.error('❌ Auto reply error:', error.message, error.stack);
  }
}

// ========================================
// FLOW EXECUTION - FIXED
// ========================================
async function executeFlow(apiState, senderId, trigger, originalMessage, userUID) {
  const processId = `flow_${Date.now()}`;

  try {
    const flow = triggerDB.getFlowByTrigger(trigger.triggerID);
    if (!flow || !flow.blocks?.length) {
      autoReplyState.stats.skipped++;
      return;
    }

    console.log(`🚀 [${processId}] Flow: ${flow.flowName}, ${flow.blocks.length} blocks`);

    logFlowProcess(processId, 'FLOW_START', { flowId: flow.flowID, triggerId: trigger.triggerID });

    const mainBlocks = flow.blocks.filter(b => !b.parentBlockID).sort((a, b) => a.blockOrder - b.blockOrder);

    console.log(`  🔍 Main blocks (no parent): ${mainBlocks.length}`);

    const context = {
      sender_id: senderId,
      sender_name: getSenderName(apiState, senderId),
      message: originalMessage,
      time: new Date().toLocaleTimeString('vi-VN'),
      date: new Date().toLocaleDateString('vi-VN'),
      trigger_name: trigger.triggerName,
      trigger_id: trigger.triggerID,
      flow_id: flow.flowID
    };

    // Load existing variables
    const vars = triggerDB.getAllVariables(userUID, senderId);
    vars.forEach(v => { context[v.variableName] = v.variableValue; });

    for (let i = 0; i < mainBlocks.length; i++) {
      const result = await executeBlock(apiState, senderId, mainBlocks[i], context, userUID, flow, processId, i + 1, mainBlocks.length);
      if (result === 'STOP') {
        logFlowProcess(processId, 'FLOW_PAUSED', { blockId: mainBlocks[i].blockID });
        return;
      }
    }

    autoReplyState.cooldowns.set(`${senderId}_${trigger.triggerID}`, Date.now());
    autoReplyState.stats.flowExecuted++;
    logFlowProcess(processId, 'FLOW_COMPLETE', { flowId: flow.flowID });
    console.log(`✅ [${processId}] Flow completed`);

  } catch (error) {
    console.error(`❌ [${processId}] Flow error:`, error.message);
    logFlowProcess(processId, 'FLOW_ERROR', { error: error.message });
  }
}

async function executeBlock(apiState, senderId, block, context, userUID, flow, processId, num, total) {
  const data = block.blockData || {};

  // Check if block is disabled
  if (data.enabled === false) {
    console.log(`  [${num}/${total}] ⏸️ ${block.blockType} (ID:${block.blockID}) - DISABLED`);
    return { success: true, skipped: true };
  }

  console.log(`  [${num}/${total}] ${block.blockType} (ID:${block.blockID})`);
  logFlowProcess(processId, 'BLOCK_START', { blockId: block.blockID, blockType: block.blockType });

  try {
    switch (block.blockType) {
      case 'send-message': {
        let msg = substituteVariables(data.message || '', context);
        if (msg.trim()) {
          await sendMessage(apiState, senderId, msg, userUID);
          console.log(`    💬 Sent: "${msg.substring(0, 40)}..."`);
        }
        break;
      }

      case 'send-image': {
        try {
          if (data.enabled === false) {
            console.log(`    ⏸️ Send Image block disabled`);
            break;
          }

          const sourceType = data.sourceType || 'library';
          let imageUrl = '';
          let imagePath = '';
          let imageWidth = 0;
          let imageHeight = 0;
          let imageSize = 0;
          const caption = substituteVariables(data.caption || '', context);

          console.log(`    🖼️ Send Image - sourceType: ${sourceType}, imageId: ${data.imageId}`);

          // Xác định URL/Path ảnh dựa trên sourceType
          if (sourceType === 'library' && data.imageId) {
            // Lấy ảnh từ thư viện (database)
            const image = triggerDB.getImageById(data.imageId);
            if (image) {
              imagePath = image.filePath;
              imageUrl = `http://localhost:3000/api/images/${image.imageID}`;
              imageWidth = image.width || 0;
              imageHeight = image.height || 0;
              imageSize = image.fileSize || 0;
              console.log(`    📚 Library image: ${image.name} (ID: ${image.imageID})`);
              console.log(`    📁 File path: ${imagePath}`);
              console.log(`    📐 Dimensions: ${imageWidth}x${imageHeight}, Size: ${imageSize} bytes`);
            } else {
              console.log(`    ⚠️ Image not found in library: ID ${data.imageId}`);
              break;
            }
          }
          else if (sourceType === 'url' && data.imageUrl) {
            imageUrl = substituteVariables(data.imageUrl, context);
            console.log(`    🔗 URL image: ${imageUrl}`);
          }
          else if (sourceType === 'variable' && data.imageVariable) {
            const varValue = context[data.imageVariable] || '';
            if (!varValue) {
              const dbVar = triggerDB.getVariable(userUID, senderId, data.imageVariable);
              imageUrl = dbVar?.variableValue || '';
            } else {
              imageUrl = varValue;
            }
            console.log(`    📝 Variable image: {${data.imageVariable}} = ${imageUrl}`);
          }

          if (!imageUrl && !imagePath) {
            console.log(`    ⚠️ No image source specified`);
            break;
          }

          // Gửi ảnh qua Zalo
          const { ThreadType } = require('zca-js');
          const fs = require('fs');
          const path = require('path');

          // Ưu tiên gửi bằng file path nếu có (ảnh từ thư viện)
          if (imagePath && fs.existsSync(imagePath)) {
            // ✅ Quan trọng: Dùng path.resolve() để lấy absolute path đúng format
            const resolvedPath = path.resolve(imagePath);
            console.log(`    📤 Sending HD image via resolved path: ${resolvedPath}`);

            let sent = false;

            // ✅ Cách 1: Theo đúng ví dụ zca-js - attachments với msg rỗng
            try {
              console.log(`    📤 Method 1: attachments with empty msg (zca-js style)...`);
              await apiState.api.sendMessage(
                {
                  msg: "",
                  attachments: [resolvedPath]
                },
                senderId,
                ThreadType.User
              );
              console.log(`    ✅ Image sent via method 1!`);
              sent = true;

              // Gửi caption riêng nếu có
              if (caption) {
                await sendMessage(apiState, senderId, caption, userUID);
              }
            } catch (err1) {
              console.log(`    ⚠️ Method 1 failed: ${err1.message}`);
            }

            // ✅ Cách 2: Chỉ attachments (không có msg)
            if (!sent) {
              try {
                console.log(`    📤 Method 2: attachments only...`);
                await apiState.api.sendMessage(
                  { attachments: [resolvedPath] },
                  senderId,
                  ThreadType.User
                );
                console.log(`    ✅ Image sent via method 2!`);
                sent = true;

                if (caption) {
                  await sendMessage(apiState, senderId, caption, userUID);
                }
              } catch (err2) {
                console.log(`    ⚠️ Method 2 failed: ${err2.message}`);
              }
            }

            // ✅ Cách 3: attachments với caption trong msg
            if (!sent && caption) {
              try {
                console.log(`    📤 Method 3: attachments with caption...`);
                await apiState.api.sendMessage(
                  {
                    msg: caption,
                    attachments: [resolvedPath]
                  },
                  senderId,
                  ThreadType.User
                );
                console.log(`    ✅ Image sent via method 3!`);
                sent = true;
              } catch (err3) {
                console.log(`    ⚠️ Method 3 failed: ${err3.message}`);
              }
            }

            // Fallback: Gửi URL kèm caption
            if (!sent) {
              console.log(`    📤 All file methods failed, sending URL as fallback...`);
              const msg = caption ? `${caption}\n🖼️ ${imageUrl}` : `🖼️ ${imageUrl}`;
              await sendMessage(apiState, senderId, msg, userUID);
              console.log(`    ✅ Image URL sent as fallback`);
            }
          }
          else if (imageUrl) {
            // Gửi URL ảnh
            console.log(`    📤 Sending image URL: ${imageUrl}`);
            const msg = caption ? `${caption}\n🖼️ ${imageUrl}` : `🖼️ ${imageUrl}`;
            await sendMessage(apiState, senderId, msg, userUID);
            console.log(`    ✅ Image URL sent!`);
          }

        } catch (err) {
          console.error(`    ❌ Send Image error: ${err.message}`);
        }
        break;
      }

      case 'send-file': {
        try {
          if (data.enabled === false) {
            console.log(`    ⏸️ Send File block disabled`);
            break;
          }

          const sourceType = data.sourceType || 'library';
          let fileUrl = '';
          let filePath = '';
          let fileName = data.fileName || '';
          const caption = substituteVariables(data.caption || '', context);

          console.log(`    📎 Send File - sourceType: ${sourceType}, fileId: ${data.fileId}`);

          // Xác định URL/Path file dựa trên sourceType
          if (sourceType === 'library' && data.fileId) {
            // Lấy file từ thư viện (database)
            const file = triggerDB.getFileById(data.fileId);
            if (file) {
              filePath = file.filePath;
              fileUrl = `http://localhost:3000/api/files/${file.fileID}`;
              fileName = fileName || file.fileName || file.name;
              console.log(`    📁 Library file: ${file.name} (ID: ${file.fileID})`);
              console.log(`    📂 File path: ${filePath}`);
              console.log(`    📄 File type: ${file.fileType}`);
            } else {
              console.log(`    ⚠️ File not found in library: ID ${data.fileId}`);
              break;
            }
          }
          else if (sourceType === 'url' && data.fileUrl) {
            fileUrl = substituteVariables(data.fileUrl, context);
            console.log(`    🔗 URL file: ${fileUrl}`);
          }
          else if (sourceType === 'variable' && data.fileVariable) {
            // Bước 1: Tìm trong context
            let varValue = context[data.fileVariable] || '';

            // Bước 2: Tìm trong variables table
            if (!varValue) {
              const dbVar = triggerDB.getVariable(userUID, senderId, data.fileVariable);
              varValue = dbVar?.variableValue || '';
            }

            // Bước 3: Nếu vẫn không có, thử tìm file có variableName trùng
            if (!varValue) {
              const fileByVar = triggerDB.getFileByVariable(userUID, data.fileVariable);
              if (fileByVar) {
                filePath = fileByVar.filePath;
                fileUrl = `http://localhost:3000/api/files/${fileByVar.fileID}`;
                fileName = fileName || fileByVar.fileName || fileByVar.name;
                console.log(`    📁 Found file by variableName: ${fileByVar.name} (ID: ${fileByVar.fileID})`);
                console.log(`    📂 File path: ${filePath}`);
              }
            } else {
              // varValue có thể là URL hoặc file ID
              if (varValue.startsWith('http')) {
                fileUrl = varValue;
              } else if (!isNaN(parseInt(varValue))) {
                // Có thể là file ID
                const fileById = triggerDB.getFileById(parseInt(varValue));
                if (fileById) {
                  filePath = fileById.filePath;
                  fileUrl = `http://localhost:3000/api/files/${fileById.fileID}`;
                  fileName = fileName || fileById.fileName || fileById.name;
                }
              } else {
                fileUrl = varValue;
              }
            }

            console.log(`    📝 Variable file: {${data.fileVariable}} = ${fileUrl || filePath || '(not found)'}`);
          }

          if (!fileUrl && !filePath) {
            console.log(`    ⚠️ No file source specified`);
            break;
          }

          // Gửi file qua Zalo
          const { ThreadType } = require('zca-js');
          const fs = require('fs');
          const path = require('path');

          // Ưu tiên gửi bằng file path nếu có (file từ thư viện)
          if (filePath && fs.existsSync(filePath)) {
            // ✅ Quan trọng: Dùng path.resolve() để lấy absolute path đúng format
            const resolvedPath = path.resolve(filePath);
            console.log(`    📤 Sending file via resolved path: ${resolvedPath}`);

            let sent = false;

            // ✅ Cách 1: Theo đúng ví dụ zca-js - attachments với msg rỗng
            try {
              console.log(`    📤 Method 1: attachments with empty msg (zca-js style)...`);
              await apiState.api.sendMessage(
                {
                  msg: "",
                  attachments: [resolvedPath]
                },
                senderId,
                ThreadType.User
              );
              console.log(`    ✅ File sent via method 1!`);
              sent = true;

              // Gửi caption riêng nếu có
              if (caption) {
                await sendMessage(apiState, senderId, caption, userUID);
              }
            } catch (err1) {
              console.log(`    ⚠️ Method 1 failed: ${err1.message}`);
            }

            // ✅ Cách 2: Chỉ attachments (không có msg)
            if (!sent) {
              try {
                console.log(`    📤 Method 2: attachments only...`);
                await apiState.api.sendMessage(
                  { attachments: [resolvedPath] },
                  senderId,
                  ThreadType.User
                );
                console.log(`    ✅ File sent via method 2!`);
                sent = true;

                if (caption) {
                  await sendMessage(apiState, senderId, caption, userUID);
                }
              } catch (err2) {
                console.log(`    ⚠️ Method 2 failed: ${err2.message}`);
              }
            }

            // ✅ Cách 3: attachments với caption trong msg
            if (!sent && caption) {
              try {
                console.log(`    📤 Method 3: attachments with caption...`);
                await apiState.api.sendMessage(
                  {
                    msg: caption,
                    attachments: [resolvedPath]
                  },
                  senderId,
                  ThreadType.User
                );
                console.log(`    ✅ File sent via method 3!`);
                sent = true;
              } catch (err3) {
                console.log(`    ⚠️ Method 3 failed: ${err3.message}`);
              }
            }

            // ✅ Cách 4: Thử với attachment (singular) thay vì attachments
            if (!sent) {
              try {
                console.log(`    📤 Method 4: attachment singular...`);
                await apiState.api.sendMessage(
                  {
                    msg: "",
                    attachment: [resolvedPath]
                  },
                  senderId,
                  ThreadType.User
                );
                console.log(`    ✅ File sent via method 4!`);
                sent = true;

                if (caption) {
                  await sendMessage(apiState, senderId, caption, userUID);
                }
              } catch (err4) {
                console.log(`    ⚠️ Method 4 failed: ${err4.message}`);
              }
            }

            // Fallback: Gửi URL download
            if (!sent) {
              console.log(`    📤 All methods failed, sending download URL as fallback...`);
              const downloadUrl = `http://localhost:3000/api/files/${data.fileId}/download`;
              const msg = caption
                ? `${caption}\n📎 ${fileName}: ${downloadUrl}`
                : `📎 ${fileName}: ${downloadUrl}`;
              await sendMessage(apiState, senderId, msg, userUID);
              console.log(`    ✅ File download URL sent as fallback`);
            }
          }
          else if (fileUrl) {
            // Gửi URL file
            console.log(`    📤 Sending file URL: ${fileUrl}`);
            const msg = caption
              ? `${caption}\n📎 ${fileName || 'File'}: ${fileUrl}`
              : `📎 ${fileName || 'File'}: ${fileUrl}`;
            await sendMessage(apiState, senderId, msg, userUID);
            console.log(`    ✅ File URL sent!`);
          }

        } catch (err) {
          console.error(`    ❌ Send File error: ${err.message}`);
        }
        break;
      }

      // Block gửi lời mời kết bạn - api.sendFriendRequest(msg, userId)
      case 'send-friend-request': {
        try {
          let targetUserId = '';

          // Xác định User ID cần gửi kết bạn
          if (data.targetType === 'sender') {
            // Gửi kết bạn cho người gửi tin nhắn hiện tại
            targetUserId = senderId;
          } else if (data.targetType === 'variable' && data.targetVariable) {
            // Lấy User ID từ biến
            targetUserId = context[data.targetVariable] || '';
            if (!targetUserId) {
              const varData = triggerDB.getVariable(userUID, senderId, data.targetVariable);
              targetUserId = varData?.variableValue || '';
            }
          } else if (data.targetType === 'manual' && data.targetUserId) {
            // Sử dụng User ID nhập thủ công
            targetUserId = data.targetUserId;
          }

          if (targetUserId) {
            const msg = substituteVariables(data.message || 'Xin chào, hãy kết bạn với tôi!', context);
            console.log(`    👋 Sending friend request to ${targetUserId}: "${msg.substring(0, 30)}..."`);

            if (apiState.api && apiState.api.sendFriendRequest) {
              await apiState.api.sendFriendRequest(msg, targetUserId);
              console.log(`    ✅ Friend request sent successfully`);
            } else {
              console.log(`    ⚠️ API sendFriendRequest not available`);
            }
          } else {
            console.log(`    ⚠️ No target User ID specified`);
          }
        } catch (err) {
          console.error(`    ❌ Send friend request error: ${err.message}`);
        }
        break;
      }

      // Block chấp nhận lời mời kết bạn - api.acceptFriendRequest(userId)
      case 'accept-friend-request': {
        try {
          // Block này thường được dùng khi có sự kiện friend request đến
          // Trong context có thể có requester_id
          const requesterId = context.requester_id || senderId;

          if (data.autoAccept !== false) {
            console.log(`    🤝 Accepting friend request from ${requesterId}`);

            if (apiState.api && apiState.api.acceptFriendRequest) {
              await apiState.api.acceptFriendRequest(requesterId);
              console.log(`    ✅ Friend request accepted`);

              // Gửi tin nhắn chào mừng nếu được bật
              if (data.sendWelcome !== false && data.welcomeMessage) {
                const welcomeMsg = substituteVariables(data.welcomeMessage, context);
                await sendMessage(apiState, requesterId, welcomeMsg, userUID);
                console.log(`    💬 Welcome message sent`);
              }

              // Chạy flow sau khi chấp nhận
              if (data.runFlowAfter) {
                const targetTrigger = triggerDB.getTriggerById(data.runFlowAfter);
                if (targetTrigger && targetTrigger.setMode === 1) {
                  console.log(`    🔄 Running flow after accept: ${targetTrigger.triggerName}`);
                  await executeFlow(apiState, requesterId, targetTrigger, context.message, userUID);
                }
              }
            } else {
              console.log(`    ⚠️ API acceptFriendRequest not available`);
            }
          }
        } catch (err) {
          console.error(`    ❌ Accept friend request error: ${err.message}`);
        }
        break;
      }

      case 'delay': {
        // Hỗ trợ đơn vị: ms, s, m, h
        let duration = data.duration || 2000;
        const unit = data.unit || 'ms';

        // Chuyển đổi sang milliseconds
        switch (unit) {
          case 's': duration *= 1000; break;
          case 'm': duration *= 60 * 1000; break;
          case 'h': duration *= 60 * 60 * 1000; break;
          default: break; // ms - không cần chuyển đổi
        }

        console.log(`    ⏱️ Wait ${duration}ms (${data.duration} ${unit})`);
        await sleep(duration);
        break;
      }

      case 'run-block': {
        if (data.targetTriggerId) {
          const target = triggerDB.getTriggerById(data.targetTriggerId);
          if (target?.setMode === 1) {
            console.log(`    🔄 Executing flow: ${target.triggerName}`);
            await executeFlow(apiState, senderId, target, context.message, userUID);
          } else if (target?.triggerContent) {
            await sendMessage(apiState, senderId, target.triggerContent, userUID);
          }
        }
        break;
      }

      case 'condition': {
        console.log(`    🔍 [CONDITION] Evaluating condition`);

        // NEW DESIGN: Condition có 2 target flow - trueFlow và falseFlow
        const trueFlowId = data.trueFlowId || data.trueTriggerId;
        const falseFlowId = data.falseFlowId || data.falseTriggerId;

        // Evaluate condition
        const result = evaluateCondition(data, context);
        console.log(`    🔀 Condition: {${data.variableName || 'N/A'}} ${data.operator || 'N/A'} "${data.compareValue || 'N/A'}" = ${result}`);

        if (result) {
          // Condition TRUE - chạy true flow
          if (trueFlowId) {
            console.log(`    ✅ Condition TRUE, running true flow: ${trueFlowId}`);
            const trueTrigger = triggerDB.getTriggerById(trueFlowId);
            if (trueTrigger) {
              if (trueTrigger.setMode === 1) {
                await executeFlow(apiState, senderId, trueTrigger, context.message, userUID);
              } else if (trueTrigger.triggerContent) {
                await sendMessage(apiState, senderId, trueTrigger.triggerContent, userUID);
              }
            } else {
              console.log(`    ⚠️ True flow not found: ${trueFlowId}`);
            }
          } else {
            console.log(`    ℹ️ No true flow configured, continuing...`);
          }
        } else {
          // Condition FALSE - chạy false flow
          if (falseFlowId) {
            console.log(`    ❌ Condition FALSE, running false flow: ${falseFlowId}`);
            const falseTrigger = triggerDB.getTriggerById(falseFlowId);
            if (falseTrigger) {
              if (falseTrigger.setMode === 1) {
                await executeFlow(apiState, senderId, falseTrigger, context.message, userUID);
              } else if (falseTrigger.triggerContent) {
                await sendMessage(apiState, senderId, falseTrigger.triggerContent, userUID);
              }
            } else {
              console.log(`    ⚠️ False flow not found: ${falseFlowId}`);
            }
          } else {
            console.log(`    ℹ️ No false flow configured, continuing...`);
          }
        }

        // Sau khi chạy condition flow, tiếp tục flow hiện tại
        break;
      }
      case 'switch': {
        // Switch/Case block: match context variable against cases
        const data = block.blockData || {};
        const varName = data.variableName || '';
        let varValue = context[varName];

        if (varValue === undefined) {
          // Try load from DB
          try {
            const v = triggerDB.getVariable(userUID, senderId, varName);
            if (v) varValue = v.variableValue;
          } catch (e) { }
        }

        const cases = data.cases || [];
        let matched = null;

        for (const c of cases) {
          if (String(c.value) === String(varValue)) { matched = c; break; }
        }

        if (matched) {
          const mode = matched.mode || 'reply';

          if (mode === 'flow' && matched.targetTriggerId) {
            const trg = triggerDB.getTriggerById(matched.targetTriggerId);
            if (trg && trg.setMode === 1) {
              console.log(`  🔗 Switch: Running flow ${matched.targetTriggerId}`);
              await executeFlow(apiState, senderId, trg, context.message, userUID);
            }
          } else if (mode === 'reply' && matched.replyMessage) {
            console.log(`  📝 Switch: Sending reply message`);
            await sendMessage(apiState, senderId, substituteVariables(matched.replyMessage, context), userUID);
          }
        } else {
          // default case
          const defaultMode = data.defaultMode || 'reply';

          if (defaultMode === 'flow' && data.defaultTriggerId) {
            const trg = triggerDB.getTriggerById(data.defaultTriggerId);
            if (trg && trg.setMode === 1) {
              console.log(`  🔗 Switch: Running default flow ${data.defaultTriggerId}`);
              await executeFlow(apiState, senderId, trg, context.message, userUID);
            }
          } else if (defaultMode === 'reply' && data.defaultReply) {
            console.log(`  📝 Switch: Sending default reply message`);
            await sendMessage(apiState, senderId, substituteVariables(data.defaultReply, context), userUID);
          }
        }

        break;
      }

      case 'user-input': {
        const questions = data.questions || [];
        if (questions.length === 0) {
          console.log(`    ⚠️ No questions configured`);
          break;
        }

        // Send first question
        const firstQ = questions[0];
        if (firstQ.message) {
          const msg = substituteVariables(firstQ.message, context);
          await sendMessage(apiState, senderId, msg, userUID);
        }

        // Calculate timeout
        let timeoutMinutes = 60;
        if (data.timeoutValue && data.timeoutUnit) {
          timeoutMinutes = data.timeoutUnit === 'hour' ? data.timeoutValue * 60 : data.timeoutValue;
        }

        // Store in memory
        const pendingKey = `${userUID}_${senderId}`;
        const inputState = {
          userUID,
          senderId,
          blockID: block.blockID,
          flowID: flow.flowID,
          triggerID: context.trigger_id,
          questions: questions,
          currentQuestionIndex: 0,
          retryCount: 0,
          timeoutMinutes,
          expiresAt: Date.now() + (timeoutMinutes * 60 * 1000),
          flowContext: { ...context },
          nextBlockOrder: block.blockOrder + 1
        };

        autoReplyState.pendingInputs.set(pendingKey, inputState);

        // Also save to DB for persistence
        triggerDB.setInputState(userUID, senderId, block.blockID, flow.flowID, context.trigger_id, {
          expectedType: firstQ.expectedType || 'text',
          variableName: firstQ.variableName || '',
          maxRetries: firstQ.maxRetries || 2,
          timeoutMinutes
        });

        console.log(`    👂 Waiting for input (${questions.length} questions), first var: ${firstQ.variableName}`);
        return 'STOP';
      }

      case 'bot-active': {
        const action = data.action || 'toggle';
        const duration = data.duration || 0;
        let newActive;

        const current = autoReplyState.botActiveStates.get(senderId);
        if (action === 'on') newActive = true;
        else if (action === 'off') newActive = false;
        else newActive = current ? !current.active : false;

        const expiresAt = duration > 0 ? Date.now() + duration * 60000 : null;

        if (data.scope === 'all') {
          autoReplyState.enabled = newActive;
        } else {
          autoReplyState.botActiveStates.set(senderId, { active: newActive, expiresAt });
        }
        console.log(`    🤖 Bot ${newActive ? 'ON' : 'OFF'}`);
        break;
      }

      case 'set-variable': {
        if (data.variableName) {
          let value = substituteVariables(data.variableValue || '', context);
          if (data.variableType === 'number') value = parseFloat(value) || 0;
          triggerDB.setVariable(userUID, senderId, data.variableName, String(value), data.variableType, block.blockID, flow.flowID);
          context[data.variableName] = value;
          console.log(`    📝 ${data.variableName} = ${value}`);
        }
        break;
      }

      case 'clear-variable': {
        if (data.clearAll) {
          triggerDB.clearVariables(userUID, senderId);
        } else if (data.variableName) {
          triggerDB.deleteVariable(userUID, senderId, data.variableName);
          delete context[data.variableName];
        }
        break;
      }

      case 'webhook': {
        if (data.url) {
          try {
            const fetch = require('node-fetch');
            const opts = { method: data.method || 'GET' };
            if (data.headers) try { opts.headers = JSON.parse(substituteVariables(data.headers, context)); } catch (e) { }
            if (data.body && ['POST', 'PUT'].includes(opts.method)) {
              opts.body = substituteVariables(data.body, context);
              opts.headers = opts.headers || {};
              opts.headers['Content-Type'] = 'application/json';
            }
            const res = await fetch(data.url, opts);
            context.webhook_response = await res.text();
          } catch (e) { console.error('Webhook error:', e.message); }
        }
        break;
      }

      case 'ai-gemini': {
        if (data.saveResponseTo) {
          const resp = `[AI: ${(data.prompt || '').substring(0, 20)}...]`;
          triggerDB.setVariable(userUID, senderId, data.saveResponseTo, resp, 'text', block.blockID, flow.flowID);
          context[data.saveResponseTo] = resp;
        }
        break;
      }

      case 'table-data': {
        try {
          const tableID = data.tableID;
          const action = data.action || 'find';
          const conditions = data.conditions || [];
          const columnValues = data.columnValues || [];
          const resultVariable = data.resultVariable || 'table_result';
          const limitResults = data.limitResults || 1;

          if (!tableID) {
            console.log(`    ⚠️ Table Data: No table selected`);
            break;
          }

          // Get table info
          const table = triggerDB.getUserTableById(tableID);
          if (!table) {
            console.log(`    ⚠️ Table Data: Table not found (ID: ${tableID})`);
            break;
          }

          console.log(`    📊 Table Data: ${action} on "${table.tableName}"`);

          // Helper: Check if row matches conditions
          const checkConditions = (row) => {
            if (!conditions || conditions.length === 0) return true;

            return conditions.every(cond => {
              const columnID = cond.column;
              const operator = cond.operator || 'equals';
              const compareValue = substituteVariables(cond.value || '', context);

              // Find cell value for this column
              let cellValue = '';
              if (row.cells) {
                const cell = row.cells.find(c => String(c.columnID) === String(columnID));
                cellValue = cell?.cellValue || '';
              }

              // Compare based on operator
              const rv = String(cellValue).toLowerCase();
              const cv = String(compareValue).toLowerCase();

              switch (operator) {
                case 'equals': return rv === cv;
                case 'not_equals': return rv !== cv;
                case 'contains': return rv.includes(cv);
                case 'not_contains': return !rv.includes(cv);
                case 'starts_with': return rv.startsWith(cv);
                case 'ends_with': return rv.endsWith(cv);
                case 'is_empty': return !rv.trim();
                case 'is_not_empty': return !!rv.trim();
                case 'greater': return parseFloat(cellValue) > parseFloat(compareValue);
                case 'less': return parseFloat(cellValue) < parseFloat(compareValue);
                default: return rv === cv;
              }
            });
          };

          const rows = table.rows || [];

          if (action === 'find') {
            // Find rows matching conditions
            const matchedRows = rows.filter(checkConditions).slice(0, limitResults);

            // Convert to usable format
            const results = matchedRows.map(row => {
              const rowData = { rowID: row.rowID };
              if (row.cells) {
                row.cells.forEach(cell => {
                  // Find column name
                  const col = table.columns?.find(c => c.columnID === cell.columnID);
                  if (col) {
                    rowData[col.columnName] = cell.cellValue;
                    rowData[`col_${cell.columnID}`] = cell.cellValue;
                  }
                });
              }
              return rowData;
            });

            // Save to variable
            const resultValue = limitResults === 1 ? (results[0] || null) : results;
            context[resultVariable] = resultValue;
            triggerDB.setVariable(userUID, senderId, resultVariable, JSON.stringify(resultValue), 'json', block.blockID, flow.flowID);

            console.log(`    🔍 Found ${results.length} row(s), saved to {${resultVariable}}`);
          }

          else if (action === 'add') {
            // Add new row with values
            const newRow = triggerDB.addTableRow(tableID, {});

            if (newRow && newRow.rowID) {
              // Update cells with values
              console.log(`    📋 Context keys: ${Object.keys(context).join(', ')}`);

              for (const cv of columnValues) {
                const columnID = cv.column;
                const rawValue = cv.value || '';
                const value = substituteVariables(rawValue, context);

                console.log(`    📝 Column ${columnID}: "${rawValue}" → "${value}"`);

                if (columnID) {
                  triggerDB.updateTableCell(newRow.rowID, parseInt(columnID), value);
                }
              }

              context[resultVariable] = { rowID: newRow.rowID, success: true };
              console.log(`    ➕ Added new row ID: ${newRow.rowID}`);
            } else {
              context[resultVariable] = { success: false, error: 'Failed to add row' };
              console.log(`    ❌ Failed to add row`);
            }
          }

          else if (action === 'update') {
            // Find matching rows and update
            const matchedRows = rows.filter(checkConditions);
            let updatedCount = 0;

            for (const row of matchedRows) {
              for (const cv of columnValues) {
                const columnID = cv.column;
                const value = substituteVariables(cv.value || '', context);
                if (columnID) {
                  triggerDB.updateTableCell(row.rowID, parseInt(columnID), value);
                }
              }
              updatedCount++;
            }

            context[resultVariable] = { success: true, updatedCount };
            console.log(`    ✏️ Updated ${updatedCount} row(s)`);
          }

          else if (action === 'delete') {
            // Find matching rows and delete
            const matchedRows = rows.filter(checkConditions);
            let deletedCount = 0;

            for (const row of matchedRows) {
              const success = triggerDB.deleteTableRow(tableID, row.rowID);
              if (success) deletedCount++;
            }

            context[resultVariable] = { success: true, deletedCount };
            console.log(`    🗑️ Deleted ${deletedCount} row(s)`);
          }

        } catch (err) {
          console.error(`    ❌ Table Data error: ${err.message}`);
          context[data.resultVariable || 'table_result'] = { success: false, error: err.message };
        }
        break;
      }

      case 'send-email': {
        if (data.enabled === false) {
          console.log(`    ⏸️ Send Email block disabled`);
          break;
        }

        try {
          // Get recipient email
          let recipientEmail = '';
          if (data.recipientType === 'variable') {
            recipientEmail = context[data.recipientVariable] || '';
          } else {
            recipientEmail = data.recipientFixed || '';
          }
          recipientEmail = recipientEmail.toString().trim();

          // Get sender profile
          const senderProfile = triggerDB.getEmailSenderById(data.senderProfileId);
          if (!senderProfile) {
            console.log(`    ⚠️ Send Email: Sender profile not found (ID: ${data.senderProfileId})`);
            break;
          }

          // Substitute variables in subject and body
          const subject = substituteVariables(data.subject || '', context);
          const body = substituteVariables(data.bodyContent || '', context);

          if (!recipientEmail || !subject) {
            console.log(`    ⚠️ Send Email: Missing recipient email or subject`);
            break;
          }

          console.log(`    📧 Send Email: To: ${recipientEmail}, Subject: "${subject.substring(0, 40)}..."`);

          // Log email send attempt
          const emailLog = triggerDB.createEmailLog({
            senderProfileID: data.senderProfileId,
            senderEmail: senderProfile.email,
            recipientEmail: recipientEmail,
            subject: subject,
            body: body,
            status: 'pending',
            flowID: flow?.flowID,
            triggerID: flow?.triggerID
          });

          // TODO: Actually send email using nodemailer + Gmail API
          // For now, just mark as pending (sent)
          if (emailLog) {
            triggerDB.updateEmailLogStatus(emailLog.id, 'success', null);
            console.log(`    ✅ Email logged successfully (ID: ${emailLog.id})`);

            // Send email using Gmail API asynchronously
            const googleOAuth = require('./system/google-oauth');
            googleOAuth.sendEmailViaGmail(
              senderProfile.googleAccessToken,
              senderProfile.googleRefreshToken,
              recipientEmail,
              subject,
              null,
              body
            ).then(() => {
              console.log(`    ✅ Email sent successfully to ${recipientEmail}`);
            }).catch(err => {
              console.error(`    ❌ Email send failed: ${err.message}`);
              triggerDB.updateEmailLogStatus(emailLog.id, 'failed', err.message);
            });
          }

        } catch (err) {
          console.error(`    ❌ Send Email error: ${err.message}`);
        }
        break;
      }

      default:
        console.log(`    ⚠️ Unknown block type: ${block.blockType}`);
    }

    logFlowProcess(processId, 'BLOCK_COMPLETE', { blockId: block.blockID });
    return 'OK';

  } catch (err) {
    console.error(`    ❌ Error in block ${block.blockID}: ${err.message}`);
    return 'ERROR';
  }
}

// ========================================
// USER INPUT HANDLER
// ========================================
async function handleUserInputResponse(apiState, senderId, userMessage, inputState, userUID) {
  console.log(`👂 Processing input from ${senderId}`);

  const pendingKey = `${userUID}_${senderId}`;

  // Get from memory first
  let memoryState = autoReplyState.pendingInputs.get(pendingKey);

  const questions = memoryState?.questions || [];
  const currentIndex = memoryState?.currentQuestionIndex || 0;
  const retryCount = memoryState?.retryCount || 0;
  const flowContext = memoryState?.flowContext || {};

  console.log(`  Questions: ${questions.length}, Current: ${currentIndex + 1}, Retry: ${retryCount}`);

  if (questions.length === 0) {
    console.log(`  ⚠️ No questions found in state, clearing`);
    autoReplyState.pendingInputs.delete(pendingKey);
    triggerDB.clearInputState(userUID, senderId);
    return;
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) {
    console.log(`  ⚠️ Current question not found`);
    autoReplyState.pendingInputs.delete(pendingKey);
    triggerDB.clearInputState(userUID, senderId);
    return;
  }

  const expectedType = currentQuestion.expectedType || 'text';
  const variableName = currentQuestion.variableName || '';
  const maxRetries = currentQuestion.maxRetries || 2;
  const retryMessage = currentQuestion.retryMessage || '';

  // Validate input
  const validation = validateInput(userMessage, expectedType);

  if (!validation.valid) {
    console.log(`  ❌ Invalid input (expected: ${expectedType})`);

    if (retryCount >= maxRetries) {
      console.log(`  ❌ Max retries (${maxRetries}) reached`);
      autoReplyState.pendingInputs.delete(pendingKey);
      triggerDB.clearInputState(userUID, senderId);
      return;
    }

    // Increment retry
    if (memoryState) {
      memoryState.retryCount = retryCount + 1;
      autoReplyState.pendingInputs.set(pendingKey, memoryState);
    }

    // Send retry message
    const msg = retryMessage || `Dữ liệu không hợp lệ (yêu cầu: ${getTypeLabel(expectedType)}). Vui lòng nhập lại:`;
    await sendMessage(apiState, senderId, msg, userUID);
    console.log(`  ⚠️ Retry ${retryCount + 1}/${maxRetries}`);
    return;
  }

  // Valid - save variable
  if (variableName) {
    console.log(`  📥 Saving variable: userUID=${userUID}, senderId=${senderId}, name=${variableName}, value=${validation.value}`);
    triggerDB.setVariable(userUID, senderId, variableName, validation.value, expectedType,
      inputState.blockID || memoryState?.blockID,
      inputState.flowID || memoryState?.flowID);
    console.log(`  ✅ Saved: {${variableName}} = ${validation.value}`);

    // Update context
    if (memoryState?.flowContext) {
      memoryState.flowContext[variableName] = validation.value;
    }
  }

  // Check if more questions
  const nextIndex = currentIndex + 1;

  if (nextIndex < questions.length) {
    // More questions - send next one
    const nextQ = questions[nextIndex];

    // Update state
    if (memoryState) {
      memoryState.currentQuestionIndex = nextIndex;
      memoryState.retryCount = 0;
      autoReplyState.pendingInputs.set(pendingKey, memoryState);
    }

    // Send next question message
    if (nextQ.message) {
      const ctx = { ...(memoryState?.flowContext || {}) };
      const vars = triggerDB.getAllVariables(userUID, senderId);
      vars.forEach(v => { ctx[v.variableName] = v.variableValue; });

      const msg = substituteVariables(nextQ.message, ctx);
      await sendMessage(apiState, senderId, msg, userUID);
    }

    console.log(`  ➡️ Next question ${nextIndex + 1}/${questions.length}`);
    return;
  }

  // All questions done
  console.log(`  ✅ All ${questions.length} questions answered`);

  // Clear pending state
  autoReplyState.pendingInputs.delete(pendingKey);
  triggerDB.clearInputState(userUID, senderId);

  // Resume flow
  await resumeFlow(apiState, senderId, memoryState || inputState, userUID, userMessage);
}

async function resumeFlow(apiState, senderId, inputState, userUID, lastMessage) {
  const triggerID = inputState.triggerID || inputState.trigger_id;
  const trigger = triggerDB.getTriggerById(triggerID);
  if (!trigger) {
    console.log(`  ⚠️ Trigger not found: ${triggerID}`);
    return;
  }

  const flow = triggerDB.getFlowByTrigger(triggerID);
  if (!flow) {
    console.log(`  ⚠️ Flow not found for trigger: ${triggerID}`);
    return;
  }

  const blocks = flow.blocks || [];
  const nextBlockOrder = inputState.nextBlockOrder || 0;

  // Find blocks after current
  const nextBlocks = blocks
    .filter(b => !b.parentBlockID && b.blockOrder >= nextBlockOrder)
    .sort((a, b) => a.blockOrder - b.blockOrder);

  if (nextBlocks.length === 0) {
    console.log(`  ✅ No more blocks, flow complete`);
    autoReplyState.stats.flowExecuted++;
    return;
  }

  console.log(`  ▶️ Resume from order ${nextBlockOrder}, ${nextBlocks.length} remaining`);

  // Rebuild context
  let context = inputState.flowContext || {};
  context.message = lastMessage;

  // Load all variables from DB
  console.log(`  📋 Loading variables for userUID=${userUID}, senderId=${senderId}`);
  const vars = triggerDB.getAllVariables(userUID, senderId);
  console.log(`  📋 Loaded ${vars.length} variables from DB:`);
  if (vars.length > 0) {
    vars.forEach(v => {
      context[v.variableName] = v.variableValue;
      console.log(`    ✓ {${v.variableName}} = "${v.variableValue}"`);
    });
  } else {
    console.log(`    ⚠️ No variables found in DB!`);
  }

  // Debug: Show all context keys
  console.log(`  📋 Context keys after loading: [${Object.keys(context).join(', ')}]`);

  const processId = `flow_resume_${Date.now()}`;

  for (let i = 0; i < nextBlocks.length; i++) {
    const result = await executeBlock(apiState, senderId, nextBlocks[i], context, userUID, flow, processId, i + 1, nextBlocks.length);
    if (result === 'STOP') return;
  }

  autoReplyState.stats.flowExecuted++;
  console.log(`  ✅ Flow resumed and completed`);
}

// ========================================
// HELPERS
// ========================================
function getTypeLabel(type) {
  const labels = {
    'none': 'bất kỳ',
    'text': 'văn bản',
    'number': 'số',
    'phone': 'số điện thoại',
    'email': 'email',
    'yesno': 'có/không',
    'picture': 'hình ảnh',
    'file': 'file'
  };
  return labels[type] || type;
}

function validateInput(input, expectedType) {
  const t = (input || '').trim();
  switch (expectedType) {
    case 'none': return { valid: true, value: t };
    case 'text': return { valid: t.length > 0, value: t };
    case 'number': const n = parseFloat(t); return { valid: !isNaN(n), value: n };
    case 'phone': return { valid: /^[0-9+\-\s]{9,15}$/.test(t), value: t.replace(/[\s\-]/g, '') };
    case 'email': return { valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t), value: t.toLowerCase() };
    case 'yesno':
      const l = t.toLowerCase();
      if (['yes', 'y', 'có', 'co', 'ok', '1', 'true', 'đồng ý'].includes(l)) return { valid: true, value: 'yes' };
      if (['no', 'n', 'không', 'khong', 'ko', '0', 'false', 'từ chối'].includes(l)) return { valid: true, value: 'no' };
      return { valid: false, value: null };
    default: return { valid: true, value: t };
  }
}

function evaluateCondition(data, context) {
  const op = data.operator || 'equals';
  let left = context[data.variableName] || '';
  let right = substituteVariables(data.compareValue || '', context);
  left = String(left); right = String(right);

  switch (op) {
    case 'equals': return left === right;
    case 'notEquals': return left !== right;
    case 'contains': return left.toLowerCase().includes(right.toLowerCase());
    case 'notContains': return !left.toLowerCase().includes(right.toLowerCase());
    case 'startsWith': return left.toLowerCase().startsWith(right.toLowerCase());
    case 'endsWith': return left.toLowerCase().endsWith(right.toLowerCase());
    case 'greaterThan': return parseFloat(left) > parseFloat(right);
    case 'lessThan': return parseFloat(left) < parseFloat(right);
    case 'greaterOrEqual': return parseFloat(left) >= parseFloat(right);
    case 'lessOrEqual': return parseFloat(left) <= parseFloat(right);
    case 'isEmpty': return !left.trim();
    case 'isNotEmpty': return !!left.trim();
    default: return false;
  }
}

function substituteVariables(text, context) {
  if (!text) return '';
  return text.replace(/\{(\w+)\}/g, (m, k) => context[k] !== undefined ? context[k] : m);
}

function getSenderName(apiState, senderId) {
  const f = apiState.friends?.find(x => x.userId === senderId);
  return f?.displayName || f?.name || senderId;
}

async function sendMessage(apiState, senderId, content, userUID) {
  const { ThreadType } = require('zca-js');
  await apiState.api.sendMessage({ msg: content }, senderId, ThreadType.User);

  const msg = { msgId: `auto_${Date.now()}`, content, timestamp: Date.now(), senderId: userUID, isSelf: true, isAutoReply: true };
  if (!apiState.messageStore.has(senderId)) apiState.messageStore.set(senderId, []);
  apiState.messageStore.get(senderId).push(msg);

  apiState.clients.forEach(ws => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'new_message', uid: senderId, message: msg })); } catch (e) { } });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function logFlowProcess(pid, event, data = {}) {
  flowProcessLog.push({ processId: pid, event, timestamp: Date.now(), ...data });
  if (flowProcessLog.length > 500) flowProcessLog.shift();
}

function handleAutoReplyMessage(apiState, ws, msg) {
  switch (msg.type) {
    case 'get_auto_reply_stats':
      ws.send(JSON.stringify({ type: 'auto_reply_stats', stats: autoReplyState.stats, enabled: autoReplyState.enabled }));
      return true;
    case 'reset_auto_reply_stats':
      autoReplyState.stats = { received: 0, replied: 0, skipped: 0, flowExecuted: 0 };
      ws.send(JSON.stringify({ type: 'auto_reply_stats_reset', stats: autoReplyState.stats }));
      return true;
    case 'clear_cooldowns':
      autoReplyState.cooldowns.clear();
      ws.send(JSON.stringify({ type: 'cooldowns_cleared' }));
      return true;
    case 'get_flow_process_log':
      ws.send(JSON.stringify({ type: 'flow_process_log', logs: flowProcessLog.slice(-(msg.limit || 100)) }));
      return true;
    default:
      return false;
  }
}

async function handleUserInputResponse(apiState, senderId, content, pendingInput, userUID) {
  // 1. CONFIRM PRINT SINGLE
  if (pendingInput.type === 'CONFIRM_PRINT') {
    const text = content.toLowerCase().trim();
    if (['yes', 'y', 'có', 'co', 'ok', 'in', 'đồng ý'].includes(text)) {
      await sendMessage(apiState, senderId, "✅ Đang tiến hành in...", userUID);
      try {

        const res = await printer.printFile(pendingInput.fileUrl, pendingInput.fileType);
        messageDB.logFileActivity(senderId, 'unknown', pendingInput.fileType, 'PRINTED', res.success ? 'SUCCESS' : 'FAIL', res.message);
        await sendMessage(apiState, senderId, res.message, userUID);
      } catch (e) {
        await sendMessage(apiState, senderId, "❌ Lỗi: " + e.message, userUID);
      }
    } else {
      await sendMessage(apiState, senderId, "❌ Đã hủy lệnh in.", userUID);
    }

    autoReplyState.pendingInputs.delete(`${userUID}_${senderId}`);
    if (triggerDB.deleteInputState) triggerDB.deleteInputState(userUID, senderId);
    return;
  }

  // 2. CONFIRM PRINT BATCH
  if (pendingInput.type === 'CONFIRM_PRINT_BATCH') {
    const text = content.toLowerCase().trim();
    let indicesToPrint = [];
    let isPrintCommand = false;

    // Case 1: Print All ("in", "yes", "ok"...)
    if (['yes', 'y', 'có', 'co', 'ok', 'in', 'đồng ý'].includes(text)) {
      indicesToPrint = pendingInput.files.map((_, i) => i);
      isPrintCommand = true;
    }
    // Case 2: Print specific files ("in 1", "in 1 2"...)
    else if (text.startsWith('in ')) {
      const parts = text.substring(3).trim().split(/\s+/);
      parts.forEach(p => {
        const idx = parseInt(p) - 1; // 1-based to 0-based
        if (!isNaN(idx) && idx >= 0 && idx < pendingInput.files.length) {
          indicesToPrint.push(idx);
        }
      });
      isPrintCommand = true;
    }

    if (isPrintCommand && indicesToPrint.length > 0) {
      // Remove duplicates & Sort
      indicesToPrint = [...new Set(indicesToPrint)].sort((a, b) => a - b);

      await sendMessage(apiState, senderId, `✅ Đang tiến hành in ${indicesToPrint.length} file...`, userUID);
      let success = 0, fail = 0;

      for (const i of indicesToPrint) {
        const f = pendingInput.files[i];
        try {
          const pType = (f.type === 'image' || ['jpg', 'png', 'jpeg'].includes(f.ext)) ? 'image' : f.ext;
          // Double check whitelist
          if (['pdf', 'image', 'doc', 'docx', 'xls', 'xlsx'].includes(pType)) {
            console.log(`    🖨️ Auto-printing ${pType}...`);
            const res = await printer.printFile(f.url, pType);
            messageDB.logFileActivity(senderId, f.name || 'unknown', pType, 'PRINTED', res.success ? 'SUCCESS' : 'FAIL', res.message);
            if (res.success) success++; else fail++;
          } else {
            fail++;
          }
        } catch (e) { fail++; }
      }

      if (fail === 0) await sendMessage(apiState, senderId, "✅ Đã in xong!", userUID);
      else await sendMessage(apiState, senderId, `⚠️ Đã in ${success} file. Lỗi ${fail} file.`, userUID);
    } else if (isPrintCommand && indicesToPrint.length === 0) {
      await sendMessage(apiState, senderId, "⚠️ Không tìm thấy file số bạn chọn. Vui lòng nhập đúng số thứ tự (Ví dụ: In 1).", userUID);
      return; // Keep state to retry
    } else {
      await sendMessage(apiState, senderId, "❌ Đã hủy lệnh in.", userUID);
    }

    autoReplyState.pendingInputs.delete(`${userUID}_${senderId}`);
    if (triggerDB.deleteInputState) triggerDB.deleteInputState(userUID, senderId);
    return;
  }
}

async function processFileBatch(apiState, senderId, userUID, files) {
  if (!files || files.length === 0) return;
  console.log(`📦 Processing batch of ${files.length} files from ${senderId}`);

  // Build Summary
  let summary = `Đã nhận ${files.length} file/ảnh:\n`;
  files.forEach((f, i) => {
    summary += `${i + 1}. ${f.name} (${f.ext})\n`;
  });

  // Check if any file needs confirmation
  let needConfirm = false;
  let hasPrint = false;

  for (const f of files) {
    const configLines = (f.triggerContent || '').split('\n');
    for (const line of configLines) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim().toLowerCase();
        const val = parts.slice(1).join(':');
        if ((key === f.ext || (key === 'image' && f.type === 'image') || key === 'default')) {
          if (val.includes('{confirm_print}')) needConfirm = true;
          if (val.includes('{print}')) hasPrint = true;
        }
      }
    }
  }

  if (needConfirm) {
    summary += `\n❓ Gõ "In" để in tất cả.\n👉 Gõ "In 1" hoặc "In 1 2" để in file tương ứng.`;
    const stateKey = `${userUID}_${senderId}`;
    const stateData = {
      type: 'CONFIRM_PRINT_BATCH',
      files: files,
      timestamp: Date.now()
    };
    autoReplyState.pendingInputs.set(stateKey, stateData);
    if (triggerDB.saveInputState) triggerDB.saveInputState(userUID, senderId, stateData);
  } else if (hasPrint) {
    summary += `\n✅ Đang tự động in...`;
  }

  await sendMessage(apiState, senderId, summary, userUID);

  // If hasPrint && !needConfirm => Auto print all supported
  if (!needConfirm && hasPrint) {
    for (const f of files) {
      try {
        const pType = (f.type === 'image' || ['jpg', 'png', 'jpeg'].includes(f.ext)) ? 'image' : f.ext;
        if (['pdf', 'image', 'doc', 'docx', 'xls', 'xlsx'].includes(pType)) {
          const res = await printer.printFile(f.url, pType);
          messageDB.logFileActivity(senderId, f.name, pType, 'PRINTED', res.success ? 'SUCCESS' : 'FAIL', res.message);
        }
      } catch (e) { }
    }
  }
}

module.exports = { autoReplyState, processAutoReply, handleAutoReplyMessage };