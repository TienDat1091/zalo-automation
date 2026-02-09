// websocket.js - WebSocket server với SQLite TriggerDB
const WebSocket = require('ws');
const { handleAutoReplyMessage } = require('../autoReply.js');
const { loadFriends, loadGroups } = require('../chat-function/friends');
const { ThreadType, Reactions } = require('zca-js');
const triggerDB = require('../triggerDB');
const messageDB = require('../messageDB'); // SQLite message storage
const backup = require('./backup');
const fs = require('fs');
const path = require('path');

const sessionManager = null; // SessionManager removed

// ============================================
// FILE TYPE HELPER FUNCTIONS
// ============================================

// ============================================
// FILE TYPE HELPER FUNCTIONS
// ============================================

/**
 * Get file extension from MIME type
 * @param {string} mimeType - MIME type (e.g., 'image/png')
 * @returns {string} File extension with dot (e.g., '.png')
 */
function getExtFromMime(mimeType) {
  const mimeToExt = {
    // Images
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
    // Documents
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    // Text
    'text/plain': '.txt',
    'text/csv': '.csv',
    'text/html': '.html',
    'application/json': '.json',
    'application/xml': '.xml',
    // Archives
    'application/zip': '.zip',
    'application/x-rar-compressed': '.rar',
    'application/x-7z-compressed': '.7z',
    // Audio
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    // Video
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/avi': '.avi'
  };
  return mimeToExt[mimeType] || '.bin';
}

/**
 * Get file type category from MIME type
 * @param {string} mimeType - MIME type (e.g., 'image/png')
 * @returns {string} File type category (e.g., 'image', 'document', 'video')
 */
function getFileTypeFromMime(mimeType) {
  if (!mimeType) return 'other';

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/')) return 'text';

  // Document types
  if (mimeType.includes('pdf') ||
    mimeType.includes('word') ||
    mimeType.includes('excel') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('powerpoint') ||
    mimeType.includes('presentation')) {
    return 'document';
  }

  // Archive types
  if (mimeType.includes('zip') ||
    mimeType.includes('rar') ||
    mimeType.includes('7z') ||
    mimeType.includes('tar') ||
    mimeType.includes('gzip')) {
    return 'archive';
  }

  return 'other';
}


// ============================================
// INIT BACKUP SYSTEM (Before database init)
// ============================================
backup.initBackup();

// ============================================
// INIT TRIGGER DATABASE
// ============================================
triggerDB.init();

// ============================================
// INIT MESSAGE DATABASE
// ============================================
messageDB.init();


/**
 * Broadcast message to all connected clients
 * @param {object} apiState - App state containing clients
 * @param {object} data - Data to send
 * @param {WebSocket} excludeWs - Optional socket to exclude from broadcast
 */
function broadcast(apiState, data, excludeWs = null) {
  try {
    const json = JSON.stringify(data);
    apiState.clients.forEach(ws => {
      if (excludeWs && ws === excludeWs) return; // Skip excluded client
      try {
        if (ws.readyState === 1) ws.send(json);
      } catch (e) {
        // Ignore disconnected clients
      }
    });
  } catch (e) {
    console.error('❌ Broadcast error:', e.message);
  }
}

/**
 * Resolve display name from UID/ThreadID
 * @param {string} id - UID or ThreadID
 * @param {object} apiState - App state
 * @returns {Promise<string>} - Resolved name
 */
async function resolveDisplayName(id, apiState) {
  if (!id) return 'Unknown';
  if (id === apiState.currentUser?.uid) return apiState.currentUser.name || 'Me';

  // 1. Check Friends Cache
  if (apiState.friendsMap && apiState.friendsMap.has(id)) {
    return apiState.friendsMap.get(id).displayName;
  }

  // 2. Check Groups Cache
  if (apiState.groupsMap && apiState.groupsMap.has(id)) {
    return apiState.groupsMap.get(id).name;
  }

  // 3. Check Stranger Cache (in-memory)
  if (!apiState.strangerCache) apiState.strangerCache = new Map();
  if (apiState.strangerCache.has(id)) {
    return apiState.strangerCache.get(id);
  }

  // 4. Fetch from Zalo API if logged in
  if (apiState.api && apiState.isLoggedIn) {
    try {
      // Try to get user info for UIDs (strangers)
      if (id.length > 10 && /^\d+$/.test(id)) {
        const info = await apiState.api.getUserInfo(id);
        if (info && (info.displayName || info.name)) {
          const name = info.displayName || info.name;
          apiState.strangerCache.set(id, name);
          return name;
        }
      }
    } catch (e) {
      // Silent failure for strangers
    }
  }

  return id; // Fallback to ID
}

// ============================================
// PRINT AGENT MANAGEMENT
// ============================================
const printAgents = new Set(); // Lưu các print agent đã kết nối

/**
 * Gửi lệnh in đến print agent
 * @param {object} printRequest - { fileUrl, fileName, senderId }
 * @returns {boolean} - true nếu có print agent nhận lệnh
 */
function sendToPrintAgent(printRequest) {
  const hasAgent = printAgents.size > 0;

  if (!hasAgent) {
    console.log('⚠️ No print agent connected');
    return false;
  }

  const requestId = `print_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const message = JSON.stringify({
    type: 'print_request',
    requestId,
    ...printRequest
  });

  let sent = false;
  printAgents.forEach(agent => {
    try {
      if (agent.readyState === 1) {
        agent.send(message);
        sent = true;
        console.log(`🖨️ Print request sent to agent: ${printRequest.fileName}`);
      }
    } catch (e) {
      console.error('❌ Failed to send to print agent:', e.message);
    }
  });

  return sent;
}

/**
 * Kiểm tra có print agent kết nối không
 * @returns {boolean}
 */
function hasPrintAgent() {
  return printAgents.size > 0;
}

// ============================================
// AUTO-CREATE BUILT-IN TRIGGERS
// ============================================
function ensureBuiltInTriggers(userUID) {
  if (!userUID) return;

  const allTriggers = triggerDB.getTriggersByUser(userUID);

  // Check if built-in triggers exist
  const hasAutoMessage = allTriggers.some(t => t.triggerKey === '__builtin_auto_message__');
  const hasAutoFriend = allTriggers.some(t => t.triggerKey === '__builtin_auto_friend__');

  // Create Auto Message trigger if not exists
  if (!hasAutoMessage) {
    console.log('📌 Creating built-in trigger: Auto Message');
    triggerDB.createTrigger({
      triggerName: 'Tự động gửi tin nhắn',
      triggerKey: '__builtin_auto_message__',
      triggerContent: 'Xin chào! Tôi sẽ phản hồi bạn sớm nhất có thể.',
      triggerUserID: userUID,
      enabled: false,
      scope: 0,
      cooldown: 30000,
      timeStartActive: '00:00',
      timeEndActive: '23:59',
      setMode: 0
    });
  }

  // Create Auto Accept Friend trigger if not exists
  if (!hasAutoFriend) {
    console.log('📌 Creating built-in trigger: Auto Accept Friend');
    triggerDB.createTrigger({
      triggerName: 'Chấp nhận kết bạn',
      triggerKey: '__builtin_auto_friend__',
      triggerContent: 'Chào bạn! Cảm ơn bạn đã kết bạn với mình.',
      triggerUserID: userUID,
      enabled: false,
      scope: 0,
      cooldown: 30000,
      timeStartActive: '00:00',
      timeEndActive: '23:59',
      setMode: 0
    });
  }


}

// ============================================
// FILE CONTENT READER - Đọc nội dung file để preview
// ============================================
// Initialize WebSocket Server

function readFileContentForPreview(filePath, mimeType, fileType) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  const ext = path.extname(filePath).toLowerCase();

  // Text files - đọc trực tiếp
  if (['.txt', '.csv', '.json', '.html', '.xml', '.md', '.js', '.css', '.log'].includes(ext)) {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      return null;
    }
  }

  // Word document (.docx)
  if (ext === '.docx') {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      const docXml = zip.readAsText('word/document.xml');

      // Extract text từ XML
      const textContent = docXml
        .replace(/<w:p[^>]*>/g, '\n')
        .replace(/<w:tab[^>]*>/g, '\t')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/\n\s*\n/g, '\n')
        .trim();

      return textContent || '[Không có nội dung văn bản]';
    } catch (e) {
      return '[Không thể đọc file Word: ' + e.message + ']';
    }
  }

  // Excel (.xlsx)
  if (ext === '.xlsx' || ext === '.xls') {
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      let content = '';

      workbook.SheetNames.forEach((sheetName, idx) => {
        if (idx > 0) content += '\n\n';
        content += '=== Sheet: ' + sheetName + ' ===\n';
        const sheet = workbook.Sheets[sheetName];
        content += XLSX.utils.sheet_to_csv(sheet);
      });

      return content || '[Không có dữ liệu]';
    } catch (e) {
      return '[Không thể đọc file Excel: ' + e.message + ']';
    }
  }

  // PDF
  if (ext === '.pdf') {
    return '[File PDF - Vui lòng tải xuống để xem nội dung]';
  }

  // Image files
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(ext)) {
    return '[File hình ảnh - Vui lòng tải xuống để xem]';
  }

  // Archive files
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
    return '[File nén - Vui lòng tải xuống để xem nội dung]';
  }

  // Other binary files
  return '[File nhị phân - Vui lòng tải xuống để xem]';
}

// ============================================
// AI TEST CONNECTION
// ============================================
async function testAIConnection(ws, params) {
  const { provider, model, apiKey, endpoint, prompt, systemPrompt, temperature, maxTokens, configId, isPlaygroundTest } = params;
  const startTime = Date.now();

  console.log(`🧠 Testing AI: ${provider} / ${model}`);

  try {
    let response, tokens;

    switch (provider) {
      case 'gemini':
        response = await testGemini(apiKey, model, prompt, systemPrompt, temperature, maxTokens);
        break;
      case 'openai':
        response = await testOpenAI(apiKey, model, prompt, systemPrompt, temperature, maxTokens);
        break;
      case 'claude':
        response = await testClaude(apiKey, model, prompt, systemPrompt, temperature, maxTokens);
        break;
      case 'custom':
        response = await testCustomAPI(apiKey, model, endpoint, prompt, systemPrompt, temperature, maxTokens);
        break;
      default:
        throw new Error('Unknown provider: ' + provider);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ AI test success (${duration}ms)`);

    // Update config status if configId provided
    if (configId) {
      triggerDB.updateAIConfigStatus(configId, 'connected');
    }

    ws.send(JSON.stringify({
      type: 'ai_test_result',
      success: true,
      response: response.text,
      tokens: response.tokens,
      duration: duration,
      configId: configId,
      isPlaygroundTest: isPlaygroundTest
    }));

  } catch (error) {
    console.error(`❌ AI test failed: ${error.message}`);

    // Update config status if configId provided
    if (configId) {
      triggerDB.updateAIConfigStatus(configId, 'error');
    }

    ws.send(JSON.stringify({
      type: 'ai_test_result',
      success: false,
      error: error.message,
      configId: configId,
      isPlaygroundTest: isPlaygroundTest
    }));
  }
}

// Test Google Gemini
async function testGemini(apiKey, model, prompt, systemPrompt, temperature, maxTokens) {
  const fetch = require('node-fetch');

  const modelName = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: temperature || 0.7,
      maxOutputTokens: maxTokens || 1024
    }
  };

  // Add system instruction if provided
  if (systemPrompt) {
    requestBody.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Gemini API error');
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokens = data.usageMetadata?.totalTokenCount || null;

  return { text, tokens };
}

// Test OpenAI
async function testOpenAI(apiKey, model, prompt, systemPrompt, temperature, maxTokens) {
  const fetch = require('node-fetch');

  const modelName = model || 'gpt-3.5-turbo';
  const url = 'https://api.openai.com/v1/chat/completions';

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      temperature: temperature || 0.7,
      max_tokens: maxTokens || 1024
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'OpenAI API error');
  }

  const text = data.choices?.[0]?.message?.content || '';
  const tokens = data.usage?.total_tokens || null;

  return { text, tokens };
}

// Test Anthropic Claude
async function testClaude(apiKey, model, prompt, systemPrompt, temperature, maxTokens) {
  const fetch = require('node-fetch');

  const modelName = model || 'claude-3-haiku-20240307';
  const url = 'https://api.anthropic.com/v1/messages';

  const requestBody = {
    model: modelName,
    max_tokens: maxTokens || 1024,
    messages: [{ role: 'user', content: prompt }]
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  if (temperature !== undefined) {
    requestBody.temperature = temperature;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Claude API error');
  }

  const text = data.content?.[0]?.text || '';
  const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  return { text, tokens: tokens || null };
}

// Test Custom API (OpenAI-compatible)
async function testCustomAPI(apiKey, model, endpoint, prompt, systemPrompt, temperature, maxTokens) {
  const fetch = require('node-fetch');

  if (!endpoint) {
    throw new Error('Custom endpoint is required');
  }

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'default',
      messages: messages,
      temperature: temperature || 0.7,
      max_tokens: maxTokens || 1024
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'API error');
  }

  // Try to parse response in OpenAI format
  const text = data.choices?.[0]?.message?.content || data.response || data.text || JSON.stringify(data);
  const tokens = data.usage?.total_tokens || null;

  return { text, tokens };
}

// ============================================
// MIGRATE OLD JSON DATA (nếu có)
// ============================================
function migrateOldData(userUID) {
  const oldFilePath = path.join(__dirname, '..', 'data', 'triggers', `triggers_${userUID}.json`);
  if (fs.existsSync(oldFilePath)) {
    console.log('🔄 Found old JSON data, migrating to SQLite...');
    triggerDB.migrateFromJSON(oldFilePath, userUID);
  }
}

// ============================================
// WEBSOCKET SERVER
// ============================================
function startWebSocketServer(apiState, httpServer) {
  // If httpServer is provided, attach to it. Otherwise create on port 8080 (fallback)
  const wss = httpServer
    ? new WebSocket.Server({ server: httpServer, maxPayload: 200 * 1024 * 1024 })
    : new WebSocket.Server({ port: 8080, maxPayload: 200 * 1024 * 1024 });

  if (httpServer) {
    console.log('🔌 WebSocket server started (sharing HTTP server port)');
  } else {
    console.log('🔌 WebSocket server started on port 8080');
  }

  wss.on('connection', (ws, req) => {
    // Extract Client IP
    let clientIP = req.socket.remoteAddress;
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) clientIP = forwarded.split(',')[0].trim();
    ws.clientIP = clientIP; // Store for logging

    console.log(`✅ New WebSocket connection from: ${clientIP}`);
    apiState.clients.add(ws);

    // Send current user info to ALL clients (no IP gating)
    if (apiState.currentUser) {
      ws.send(JSON.stringify({
        type: 'current_user',
        user: apiState.currentUser
      }));

      // Migrate old data if needed
      migrateOldData(apiState.currentUser.uid);
    } else {
      // 🔄 No current user - start login process if not already running
      if (!apiState.isLoggedIn && !apiState.loginInProgress) {
        console.log('📱 No user logged in, starting login process...');
        apiState.loginInProgress = true;

        const { loginZalo } = require('../loginZalo');
        loginZalo(apiState)
          .then(() => {
            apiState.loginInProgress = false;
          })
          .catch(err => {
            console.error('❌ Auto-login failed:', err.message);
            apiState.loginInProgress = false;
          });
      }

      // Tell client there's no user yet
      ws.send(JSON.stringify({ type: 'session_info', isLoggedIn: false, waitingForQR: true }));
    }

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw);
        // console.log('📨 WebSocket message:', msg.type); // Optional log

        // ============================================
        // TAKEOVER LOGIN REQUEST - Generate new QR for session takeover
        // ============================================
        if (msg.type === 'request_takeover_login') {
          console.log('🔄 Takeover login request received - starting new QR...');

          // Import loginZalo dynamically
          const { loginZalo } = require('../loginZalo');

          // Start new login (old session still running, will switch on success)
          loginZalo(apiState).catch(err => {
            console.error('❌ Takeover login failed:', err.message);
            ws.send(JSON.stringify({
              type: 'login_error',
              message: 'Không thể tạo QR mới: ' + err.message
            }));
          });

          ws.send(JSON.stringify({ type: 'takeover_login_started' }));
          return;
        }

        // ============================================
        // TOGGLE AUTO REPLY PER USER
        // ============================================
        if (msg.type === 'toggle_user_auto_reply') {
          const { targetId, enabled } = msg;
          const userUID = apiState.currentUser?.uid;
          if (userUID && targetId) {
            triggerDB.setUserSetting(userUID, targetId, 'auto_reply_enabled', enabled);
            console.log(`🔄 Updated auto-reply setting for ${targetId}: ${enabled}`);
          }
          return;
        }

        if (msg.type === 'get_auto_reply_blacklist') {
          const userUID = apiState.currentUser?.uid;
          if (userUID) {
            const blacklist = triggerDB.getAutoReplyBlacklist(userUID);
            ws.send(JSON.stringify({
              type: 'auto_reply_blacklist',
              blacklist: blacklist
            }));
          }
          return;
        }

        // ============================================
        // ADD REACTION TO MESSAGE
        // ============================================
        if (msg.type === 'add_reaction') {
          if (!apiState.api || !apiState.isLoggedIn) {
            ws.send(JSON.stringify({
              type: 'reaction_error',
              error: 'Chưa đăng nhập Zalo!'
            }));
            return;
          }

          const { icon, msgId, cliMsgId, threadId, threadType } = msg;

          if (!msgId || !threadId) {
            ws.send(JSON.stringify({
              type: 'reaction_error',
              error: 'Thiếu thông tin tin nhắn!'
            }));
            return;
          }

          try {
            console.log(`😊 Adding reaction: ${icon} to message ${msgId} in thread ${threadId}`);

            const destination = {
              data: { msgId: msgId.toString(), cliMsgId: (cliMsgId || msgId).toString() },
              threadId: threadId.toString(),
              type: threadType === 1 ? ThreadType.Group : ThreadType.User
            };

            const result = await apiState.api.addReaction(icon, destination);
            console.log('✅ Reaction added:', result);

            ws.send(JSON.stringify({
              type: 'reaction_added',
              msgId,
              icon,
              result
            }));
          } catch (err) {
            console.error('❌ Add reaction error:', err.message);
            ws.send(JSON.stringify({
              type: 'reaction_error',
              error: err.message || 'Không thể thả cảm xúc'
            }));
          }
          return;
        }

        // ============================================
        // GET BUILT-IN TRIGGERS
        // ============================================
        if (msg.type === 'get_builtin_triggers') {
          const userUID = apiState.currentUser?.uid;
          console.log(`🔍 get_builtin_triggers request from user: ${userUID}`);
          if (userUID) {
            const triggers = {};
            const builtInIDs = [
              'builtin_auto_reply_user',
              'builtin_auto_reply_group',
              'builtin_auto_friend',
              'builtin_auto_unread',
              'builtin_auto_delete_messages',
              'builtin_self_trigger',
              'builtin_ai_conversation',
              'builtin_auto_file',
              'builtin_auto_reaction'
            ];

            builtInIDs.forEach(id => {
              const state = triggerDB.getBuiltInTriggerState(userUID, id);

              // Map ID to frontend key
              let key = '';
              if (id === 'builtin_auto_reply_user') key = 'autoReplyUser';
              else if (id === 'builtin_auto_reply_group') key = 'autoReplyGroup';
              else if (id === 'builtin_auto_friend') key = 'autoAcceptFriend';
              else if (id === 'builtin_auto_unread') key = 'autoUnread';
              else if (id === 'builtin_auto_delete_messages') key = 'autoDelete';
              else if (id === 'builtin_self_trigger') key = 'selfTrigger';
              else if (id === 'builtin_ai_conversation') key = 'aiConversation';
              else if (id === 'builtin_auto_file') key = 'autoFile';
              else if (id === 'builtin_auto_reaction') key = 'autoReaction';

              if (state) {
                console.log(`  ✅ ${id} -> ${key}:`, state.enabled ? 'ENABLED' : 'disabled');
                triggers[key] = state;
              } else {
                console.log(`  ❌ ${id} -> ${key}: NOT FOUND in database for user ${userUID}`);
              }
            });

            ws.send(JSON.stringify({
              type: 'builtin_triggers',
              triggers
            }));
          }
          return;
        }

        // ============================================
        // UPDATE BUILT-IN TRIGGER
        // ============================================
        if (msg.type === 'update_builtin_trigger') {
          const userUID = apiState.currentUser?.uid;
          if (userUID && msg.triggerId && msg.data) {
            const updated = triggerDB.saveBuiltInTriggerState(userUID, msg.triggerId, msg.data);

            if (updated) {
              ws.send(JSON.stringify({
                type: 'builtin_trigger_updated',
                triggerId: msg.triggerId
              }));

              // Broadcast update to other tabs
              broadcast(apiState, {
                type: 'builtin_triggers',
                triggers: { [getFrontendKey(msg.triggerId)]: updated }
              });
            }
          }
          return;
        }

        // Helper for frontend key mapping
        function getFrontendKey(id) {
          if (id === 'builtin_auto_reply_user') return 'autoReplyUser';
          if (id === 'builtin_auto_reply_group') return 'autoReplyGroup';
          if (id === 'builtin_auto_friend') return 'autoAcceptFriend';
          if (id === 'builtin_auto_unread') return 'autoUnread';
          if (id === 'builtin_auto_delete_messages') return 'autoDelete';
          if (id === 'builtin_self_trigger') return 'selfTrigger';
          if (id === 'builtin_ai_conversation') return 'aiConversation';
          if (id === 'builtin_auto_file') return 'autoFile';
          if (id === 'builtin_auto_reaction') return 'autoReaction';
          return id;
        }

        // ============================================
        // GET FILE LIST
        // ============================================
        if (msg.type === 'get_file_list') {
          const userUID = msg.userUID || apiState.currentUser?.uid;

          if (!userUID) {
            ws.send(JSON.stringify({
              type: 'file_list',
              files: [],
              error: 'No user UID'
            }));
            return;
          }

          try {
            // Query messageDB for received files
            const files = messageDB.getReceivedFiles(userUID, 100); // Get last 100 files

            ws.send(JSON.stringify({
              type: 'file_list',
              files: files
            }));

            console.log(`📂 Sent ${files.length} files to client for user ${userUID}`);
          } catch (error) {
            console.error('Error fetching file list:', error);
            ws.send(JSON.stringify({
              type: 'file_list',
              files: [],
              error: error.message
            }));
          }
          return;
        }

        // ============================================
        // UPDATE AUTO DELETE CHAT (New Feature)
        // ============================================
        if (msg.type === 'update_auto_delete_chat') {
          if (!apiState.api || !apiState.isLoggedIn) {
            ws.send(JSON.stringify({
              type: 'auto_delete_chat_error',
              error: 'Chưa đăng nhập Zalo!'
            }));
            return;
          }

          const { ttl, threadId, threadType } = msg;

          // Validate TTL - accept any non-negative number (custom values allowed)
          if (typeof ttl !== 'number' || ttl < 0) {
            ws.send(JSON.stringify({
              type: 'auto_delete_chat_error',
              error: `TTL không hợp lệ. Phải là số >= 0 (đơn vị: milliseconds)`
            }));
            return;
          }

          if (!threadId) {
            ws.send(JSON.stringify({
              type: 'auto_delete_chat_error',
              error: 'Thiếu threadId!'
            }));
            return;
          }

          try {
            console.log(`🗑️ Setting auto-delete chat: TTL=${ttl}, ThreadID=${threadId}`);
            await apiState.api.updateAutoDeleteChat(ttl, threadId, threadType || ThreadType.User);

            const ttlLabels = {
              0: 'Không tự xóa',
              86400000: '1 ngày',
              604800000: '7 ngày',
              1209600000: '14 ngày'
            };

            ws.send(JSON.stringify({
              type: 'auto_delete_chat_updated',
              threadId,
              ttl,
              ttlLabel: ttlLabels[ttl] || 'Không rõ',
              message: `✅ Đã cài đặt tự xóa tin nhắn sau ${ttlLabels[ttl] || ttl + 'ms'}`
            }));
            console.log(`✅ Auto-delete chat updated for ${threadId}: ${ttlLabels[ttl]}`);
          } catch (error) {
            console.error('❌ Update auto-delete chat error:', error.message);
            ws.send(JSON.stringify({
              type: 'auto_delete_chat_error',
              error: `Lỗi: ${error.message}`
            }));
          }
          return;
        }


        // ============================================
        // GET DASHBOARD STATS
        // ============================================
        if (msg.type === 'get_dashboard_stats') {
          (async () => {
            const userUID = msg.userUID || (apiState.currentUser ? apiState.currentUser.uid : null);
            const stats = messageDB.getDashboardStats(userUID);
            const topUsers = messageDB.getTopUsers(10); // Limit 10

            // Enrich topUsers with Display Names
            const enrichedTopMsg = await Promise.all((topUsers.topMsg || []).map(async u => ({
              ...u,
              senderName: await resolveDisplayName(u.senderId, apiState)
            })));

            const enrichedTopFiles = await Promise.all((topUsers.topFiles || []).map(async f => ({
              ...f,
              senderName: await resolveDisplayName(f.senderId, apiState)
            })));

            const enrichedTopImages = await Promise.all((topUsers.topImages || []).map(async i => ({
              ...i,
              senderName: await resolveDisplayName(i.senderId, apiState)
            })));

            ws.send(JSON.stringify({
              type: 'dashboard_stats',
              data: {
                ...stats,
                topUsers: {
                  topMsg: enrichedTopMsg,
                  topFiles: enrichedTopFiles,
                  topImages: enrichedTopImages
                }
              }
            }));
          })();
        }

        // ============================================
        // GET FILE LOGS
        // ============================================
        if (msg.type === 'get_file_logs') {
          (async () => {
            const userUID = msg.userUID || (apiState.currentUser ? apiState.currentUser.uid : null);
            const limit = msg.limit || 100;
            const logs = messageDB.getFileLogs(limit, userUID);

            // Enrich logs with display names
            const enrichedLogs = await Promise.all(logs.map(async l => ({
              ...l,
              senderName: await resolveDisplayName(l.senderId, apiState),
              receiverName: await resolveDisplayName(l.receiverId, apiState)
            })));

            ws.send(JSON.stringify({
              type: 'file_logs',
              data: enrichedLogs
            }));
          })();
        }

        // ============================================
        // USER INFO
        // ============================================
        if (msg.type === 'get_current_user') {
          // No IP gating - allow all clients
          if (apiState.currentUser) {
            // Ensure built-in triggers exist for this user
            ensureBuiltInTriggers(apiState.currentUser.uid);

            ws.send(JSON.stringify({
              type: 'current_user',
              user: apiState.currentUser
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'current_user',
              user: null
            }));
          }
        }

        // ============================================
        // GET/LOAD FRIENDS
        // ============================================
        else if (msg.type === 'load_friends' || msg.type === 'get_friends') {
          const force = msg.force === true;
          console.log(`👥 Loading friends list... (Force: ${force})`);
          loadFriends(apiState, ws, force);

          // ✅ Also send all last messages for enrichment
          const lastMessages = messageDB.getAllLastMessages();
          const lastMessagesObj = {};
          lastMessages.forEach((val, key) => { lastMessagesObj[key] = val; });
          ws.send(JSON.stringify({
            type: 'all_last_messages',
            data: lastMessagesObj
          }));
        }

        // ============================================
        // GET/LOAD GROUPS (Nhóm chat)
        // ============================================
        else if (msg.type === 'load_groups' || msg.type === 'get_groups') {
          const force = msg.force === true;
          console.log(`👥 Loading groups list... (Force: ${force})`);
          loadGroups(apiState, ws, force);

          // ✅ Also send all last messages for enrichment
          const lastMessages = messageDB.getAllLastMessages();
          const lastMessagesObj = {};
          lastMessages.forEach((val, key) => { lastMessagesObj[key] = val; });
          ws.send(JSON.stringify({
            type: 'all_last_messages',
            data: lastMessagesObj
          }));
        }

        // ============================================
        // AUTO REPLY STATUS (với SQLite triggers)
        // ============================================
        else if (msg.type === 'get_auto_reply_status') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({
              type: 'auto_reply_status',
              enabled: false,
              scenarios: [],
              error: 'Not logged in'
            }));
            return;
          }

          // Check if state needs to be restored
          const autoReplyModule = require('../autoReply');

          // Restore from DB if this is a fresh start (or simply sync)
          // We can check if it matches DB to be safe, or just trust memory if established.
          // Better: On get_status, we ensure memory matches DB if memory is 'default false' maybe?
          // Actually, let's restore ONCE per session or just check DB here.

          const savedPersonal = triggerDB.getBuiltInTriggerState(apiState.currentUser.uid, 'global_auto_reply_personal');
          if (savedPersonal && savedPersonal.enabled !== undefined) {
            // Sync memory to DB
            autoReplyModule.autoReplyState.enabled = savedPersonal.enabled;
          }

          // Load user triggers từ SQLite
          const userTriggers = triggerDB.getTriggersByUser(apiState.currentUser.uid);

          ws.send(JSON.stringify({
            type: 'auto_reply_status',
            enabled: autoReplyModule.autoReplyState.enabled,
            scenarios: userTriggers,
            stats: autoReplyModule.autoReplyState.stats || { received: 0, replied: 0, skipped: 0 }
          }));
        }

        // ============================================
        // GET TRIGGERS (dedicated endpoint)
        // ============================================
        else if (msg.type === 'get_triggers') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({
              type: 'triggers_list',
              triggers: [],
              error: 'Not logged in'
            }));
            return;
          }

          const userTriggers = triggerDB.getTriggersByUser(apiState.currentUser.uid);
          const stats = triggerDB.getStats(apiState.currentUser.uid);

          ws.send(JSON.stringify({
            type: 'triggers_list',
            triggers: userTriggers,
            stats: stats
          }));
        }

        // ============================================
        // SET AUTO REPLY ON/OFF
        // ============================================
        else if (msg.type === 'set_auto_reply') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({
              type: 'trigger_error',
              message: 'Please login first'
            }));
            return;
          }

          // Save state to DB
          triggerDB.saveBuiltInTriggerState(apiState.currentUser.uid, 'global_auto_reply_personal', { enabled: msg.enabled });

          require('../autoReply').autoReplyState.enabled = msg.enabled;

          broadcast(apiState, {
            type: 'auto_reply_status_changed',
            enabled: msg.enabled
          });

          console.log('🤖 Auto Reply:', msg.enabled ? 'BẬT' : 'TẮT');
        }

        // ============================================
        // BOT AUTO REPLY (Independent from Personal)
        // ============================================
        else if (msg.type === 'get_bot_auto_reply_status') {
          // Auto-load if not set (first time check)
          if (apiState.currentUser && apiState.botAutoReplyEnabled === undefined) {
            const savedState = triggerDB.getBuiltInTriggerState(apiState.currentUser.uid, 'global_auto_reply_bot');
            if (savedState) {
              apiState.botAutoReplyEnabled = savedState.enabled;
              if (savedState.botToken) apiState.botToken = savedState.botToken;
              // If enabled, start polling
              if (savedState.enabled && savedState.botToken && !apiState.zaloBotPolling) {
                console.log('🤖 Restoring Bot Auto Reply (Enabled)...');
                startBotPolling(savedState.botToken, apiState);
              }
            }
          }

          ws.send(JSON.stringify({
            type: 'bot_auto_reply_status',
            enabled: apiState.botAutoReplyEnabled || false
          }));
        }

        else if (msg.type === 'set_bot_auto_reply') {
          apiState.botAutoReplyEnabled = msg.enabled;

          if (apiState.currentUser) {
            triggerDB.saveBuiltInTriggerState(apiState.currentUser.uid, 'global_auto_reply_bot', {
              enabled: msg.enabled,
              botToken: msg.botToken || apiState.botToken
            });
          }

          // Store bot token and start/stop polling
          if (msg.enabled && msg.botToken) {
            apiState.botToken = msg.botToken;

            // Start polling directly (not via message)
            if (!apiState.zaloBotPolling) {
              console.log('🤖 Bot Auto Reply enabled, starting polling...');
              startBotPolling(msg.botToken, apiState);
            }
          } else if (!msg.enabled) {
            // Stop polling when disabled
            if (apiState.zaloBotPolling) {
              console.log('🤖 Bot Auto Reply disabled, stopping polling...');
              apiState.zaloBotPolling = false;
            }
          }

          broadcast(apiState, {
            type: 'bot_auto_reply_status',
            enabled: msg.enabled
          });


          console.log('🤖 Bot Auto Reply:', msg.enabled ? 'BẬT' : 'TẮT');
        }

        // ============================================
        // GET CONVERSATION HISTORY FROM DATABASE
        // ============================================
        else if (msg.type === 'get_conversation_history') {
          const { threadId, limit } = msg;

          if (!threadId) {
            ws.send(JSON.stringify({
              type: 'conversation_history_error',
              error: 'Missing threadId'
            }));
            return;
          }

          try {
            // Query messageDB for historical messages
            const messages = messageDB.getMessages(threadId, limit || 100);

            console.log(`📜 Loaded ${messages.length} historical messages for thread ${threadId}`);

            ws.send(JSON.stringify({
              type: 'conversation_history',
              threadId,
              messages,
              count: messages.length
            }));
          } catch (error) {
            console.error('❌ Get conversation history error:', error.message);
            ws.send(JSON.stringify({
              type: 'conversation_history_error',
              error: error.message
            }));
          }
        }

        // ============================================
        // CREATE TRIGGER (SQLite)
        // ============================================
        else if (msg.type === 'add_scenario' || msg.type === 'create_trigger') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({
              type: 'trigger_error',
              message: 'Please login first'
            }));
            return;
          }

          const triggerData = msg.trigger || {
            triggerName: msg.name || msg.triggerName || msg.keywords?.[0] || 'New Trigger',
            triggerKey: msg.triggerKey || msg.keywords?.join(',') || '',
            triggerContent: msg.content || msg.triggerContent || msg.response || '',
            enabled: msg.enabled !== undefined ? msg.enabled : true,
            cooldown: msg.cooldown || 2000,
            startTime: msg.startTime,
            endTime: msg.endTime,
            dateStart: msg.dateStart,
            dateEnd: msg.dateEnd,
            setMode: msg.setMode || 0
          };

          // Thêm userUID
          triggerData.triggerUserID = apiState.currentUser.uid;

          const newTrigger = triggerDB.createTrigger(triggerData);

          if (newTrigger) {
            console.log('➕ Created trigger:', newTrigger.triggerID);

            // Trigger backup after create
            setTimeout(() => backup.backupNow(), 2000);

            // Broadcast to ALL clients (for notifications)
            broadcast(apiState, {
              type: 'trigger_created',
              trigger: newTrigger
            });

            // Legacy support (optional, can keep if needed for specific logic)
            ws.send(JSON.stringify({
              type: 'scenario_added',
              scenario: newTrigger
            }));

            // Refresh triggers list for everyone
            setTimeout(() => {
              const allTriggers = triggerDB.getTriggersByUser(apiState.currentUser.uid);
              broadcast(apiState, {
                type: 'auto_reply_status',
                enabled: require('../autoReply').autoReplyState.enabled,
                scenarios: allTriggers,
                stats: require('../autoReply').autoReplyState.stats
              });
            }, 100);
          } else {
            ws.send(JSON.stringify({
              type: 'trigger_error',
              message: 'Failed to create trigger'
            }));
          }
        }

        // ============================================
        // UPDATE TRIGGER (SQLite)
        // ============================================
        else if (msg.type === 'update_scenario' || msg.type === 'update_trigger') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({
              type: 'trigger_error',
              message: 'Please login first'
            }));
            return;
          }

          const triggerID = msg.id || msg.trigger?.id || msg.trigger?.triggerID;
          const updates = msg.updates || msg.trigger || {
            triggerName: msg.keywords?.[0],
            triggerKey: msg.keywords?.join(','),
            triggerContent: msg.response,
            enabled: msg.enabled
          };

          const updatedTrigger = triggerDB.updateTrigger(triggerID, updates);

          if (updatedTrigger) {
            console.log('✏️ Updated trigger:', triggerID);

            // Trigger backup after update
            setTimeout(() => backup.backupNow(), 2000);

            // Broadcast to ALL clients
            broadcast(apiState, {
              type: 'trigger_updated',
              trigger: updatedTrigger
            });

            ws.send(JSON.stringify({
              type: 'scenario_updated',
              scenario: updatedTrigger
            }));

            // Refresh triggers list for everyone
            setTimeout(() => {
              const allTriggers = triggerDB.getTriggersByUser(apiState.currentUser.uid);
              broadcast(apiState, {
                type: 'auto_reply_status',
                enabled: require('../autoReply').autoReplyState.enabled,
                scenarios: allTriggers,
                stats: require('../autoReply').autoReplyState.stats
              });
            }, 100);
          } else {
            ws.send(JSON.stringify({
              type: 'trigger_error',
              message: 'Failed to update trigger'
            }));
          }
        }

        // ============================================
        // DELETE TRIGGER (SQLite)
        // ============================================
        else if (msg.type === 'delete_scenario' || msg.type === 'delete_trigger') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({
              type: 'trigger_error',
              message: 'Please login first'
            }));
            return;
          }

          const triggerID = msg.id || msg.triggerID;
          const deleted = triggerDB.deleteTrigger(triggerID);

          if (deleted) {
            console.log('🗑️ Deleted trigger:', triggerID);

            // Trigger backup after delete
            setTimeout(() => backup.backupNow(), 2000);

            // Broadcast delete notification
            broadcast(apiState, {
              type: 'trigger_deleted',
              id: triggerID
            });

            ws.send(JSON.stringify({
              type: 'scenario_deleted',
              id: triggerID
            }));

            // Refresh triggers list for everyone
            setTimeout(() => {
              const allTriggers = triggerDB.getTriggersByUser(apiState.currentUser.uid);
              broadcast(apiState, {
                type: 'auto_reply_status',
                enabled: require('../autoReply').autoReplyState.enabled,
                scenarios: allTriggers,
                stats: require('../autoReply').autoReplyState.stats
              });
            }, 100);
          } else {
            ws.send(JSON.stringify({
              type: 'trigger_error',
              message: 'Failed to delete trigger'
            }));
          }
        }

        // ============================================
        // TOGGLE TRIGGER (SQLite)
        // ============================================
        else if (msg.type === 'toggle_scenario' || msg.type === 'toggle_trigger') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({
              type: 'trigger_error',
              message: 'Please login first'
            }));
            return;
          }

          const triggerID = msg.id || msg.triggerID;
          const toggledTrigger = triggerDB.toggleTrigger(triggerID);

          if (toggledTrigger) {
            console.log('🔄 Toggled trigger:', triggerID, '→', toggledTrigger.enabled ? 'ON' : 'OFF');

            ws.send(JSON.stringify({
              type: 'trigger_toggled',
              trigger: toggledTrigger
            }));

            ws.send(JSON.stringify({
              type: 'scenario_toggled',
              scenario: toggledTrigger
            }));

            // Refresh triggers list
            setTimeout(() => {
              const allTriggers = triggerDB.getTriggersByUser(apiState.currentUser.uid);
              ws.send(JSON.stringify({
                type: 'auto_reply_status',
                enabled: require('../autoReply').autoReplyState.enabled,
                scenarios: allTriggers,
                stats: require('../autoReply').autoReplyState.stats
              }));
            }, 100);
          }
        }

        // ============================================
        // SEARCH TRIGGERS (SQLite)
        // ============================================
        else if (msg.type === 'search_triggers') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({
              type: 'triggers_search_result',
              triggers: [],
              error: 'Not logged in'
            }));
            return;
          }

          const results = triggerDB.searchTriggers(apiState.currentUser.uid, msg.query || '');

          ws.send(JSON.stringify({
            type: 'triggers_search_result',
            query: msg.query,
            triggers: results
          }));
        }

        // ============================================
        // GET TRIGGER STATS
        // ============================================
        else if (msg.type === 'get_trigger_stats') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({
              type: 'trigger_stats',
              stats: null,
              error: 'Not logged in'
            }));
            return;
          }

          const stats = triggerDB.getStats(apiState.currentUser.uid);

          ws.send(JSON.stringify({
            type: 'trigger_stats',
            stats: stats
          }));
        }

        // ============================================
        // GET MESSAGES
        // ============================================
        else if (msg.type === 'get_messages') {
          // ✅ Load from SQLite first
          let messages = messageDB.getMessages(msg.uid, 100);

          // If SQLite empty, try to fetch from Zalo
          if (messages.length === 0 && apiState.api) {
            console.log(`⏳ Local history empty for ${msg.uid}, requesting from Zalo...`);
            // requestOldMessages emits 'old_messages' event which we should handle
            // but for immediate response, we can also try to return what we have (empty)
            // and let the client wait for the broadcast.
            // Better: fetch synchronously if possible or wait for event.
            // zca-js requestOldMessages is async but doesn't return messages directly (uses listener).
            apiState.api.listener.requestOldMessages(ThreadType.User, null);
          }

          ws.send(JSON.stringify({
            type: 'messages_history',
            uid: msg.uid,
            messages: messages
          }));
          console.log(`📤 Sent ${messages.length} messages for ${msg.uid} (from ${messages.length > 0 ? 'SQLite' : 'Zalo request triggered'})`);
        }

        // ============================================
        // GET DASHBOARD STATS (RESTORED)
        // ============================================
        else if (msg.type === 'get_dashboard_stats') {
          (async () => {
            try {
              const stats = messageDB.getDashboardStats();
              // Also get Top Users
              const topStats = messageDB.getTopUsers(10);

              // Resolve names for Top Users (Message Senders)
              if (topStats.topMsg) {
                for (const item of topStats.topMsg) {
                  item.senderName = await resolveDisplayName(item.senderId, apiState);
                }
              }

              // Resolve names for Top Files
              if (topStats.topFiles) {
                for (const item of topStats.topFiles) {
                  item.senderName = await resolveDisplayName(item.senderId, apiState);
                }
              }

              // Resolve names for Top Images
              if (topStats.topImages) {
                for (const item of topStats.topImages) {
                  item.senderName = await resolveDisplayName(item.senderId, apiState);
                }
              }

              ws.send(JSON.stringify({
                type: 'dashboard_stats_response',
                stats: stats,
                topUsers: topStats
              }));
            } catch (e) {
              console.error('Error getting dashboard stats:', e);
            }
          })();
        }

        // ============================================
        // GET FILE LOGS (RESTORED)
        // ============================================
        else if (msg.type === 'get_file_logs') {
          (async () => {
            try {
              const logs = messageDB.getFileLogs(50);

              // Resolve names
              for (const log of logs) {
                log.senderName = await resolveDisplayName(log.senderId, apiState);
                log.recipientName = await resolveDisplayName(log.recipientId, apiState);
              }

              ws.send(JSON.stringify({
                type: 'file_logs_response',
                logs: logs
              }));
            } catch (e) {
              console.error('Error getting file logs:', e);
            }
          })();
        }

        // ============================================
        // REMOVE FRIENDS BATCH (BULK DELETE)
        // ============================================
        else if (msg.type === 'remove_friends_batch') {
          const { friendIds } = msg;
          console.log(`🗑️ Batch remove friends request: ${friendIds?.length} friends`);

          if (!apiState.api) {
            ws.send(JSON.stringify({
              type: 'batch_remove_result',
              success: [],
              failed: friendIds || [],
              error: 'Chưa đăng nhập Zalo'
            }));
            return;
          }

          if (!friendIds || !Array.isArray(friendIds) || friendIds.length === 0) {
            ws.send(JSON.stringify({
              type: 'batch_remove_result',
              success: [],
              failed: [],
              error: 'Danh sách bạn bè trống'
            }));
            return;
          }

          const successIds = [];
          const failedIds = [];

          for (const friendId of friendIds) {
            try {
              // Use Zalo API to remove friend
              await apiState.api.removeFriend(friendId);
              successIds.push(friendId);
              console.log(`✅ Removed friend: ${friendId}`);

              // Also delete local conversation data
              messageDB.deleteConversation(friendId);
              apiState.messageStore.delete(friendId);
            } catch (err) {
              failedIds.push(friendId);
              console.error(`❌ Failed to remove friend ${friendId}:`, err.message);
            }
          }

          ws.send(JSON.stringify({
            type: 'batch_remove_result',
            success: successIds,
            failed: failedIds
          }));

          console.log(`📊 Batch remove result: ${successIds.length} success, ${failedIds.length} failed`);
        }

        // ============================================
        // SEND CHAT ACTION (TYPING, ETC)
        // ============================================
        else if (msg.type === 'send_chat_action') {
          const { uid, action } = msg;
          if (uid) {
            // Use zaloBot if available, or apiState
            // Typically we use zaloBot for official API actions
            if (apiState.zaloBotToken) {
              await zaloBot.sendChatAction(apiState.zaloBotToken, uid, action || 'typing');
            }
          }
        }

        // ============================================
        // SEND MESSAGE
        // ============================================
        else if (msg.type === 'send_message') {
          (async () => {
            try {
              const threadId = /^\d+$/.test(msg.uid) ? BigInt(msg.uid) : msg.uid;

              // 1️⃣ GỬI TIN NHẮN GỐC TRƯỚC
              const response = await apiState.api.sendMessage(
                { msg: msg.text },
                threadId,
                ThreadType.User
              );

              // Extract real IDs from Zalo response
              const realMsgId = response?.message?.msgId;
              const realCliMsgId = response?.message?.cliMsgId;
              // Zalo might not return globalMsgId in sendMessage response, but we have msgId

              const sentMsg = {
                msgId: realMsgId || `sent_${Date.now()}`,
                cliMsgId: realCliMsgId || null,
                globalMsgId: realMsgId || null, // fallback
                content: msg.text,
                timestamp: msg.timestamp || Date.now(),
                senderId: apiState.currentUser?.uid,
                receiverId: msg.uid,
                isSelf: true
              };

              if (!apiState.messageStore.has(msg.uid)) {
                apiState.messageStore.set(msg.uid, []);
              }
              apiState.messageStore.get(msg.uid).push(sentMsg);

              // ✅ Save to SQLite
              messageDB.saveMessage(msg.uid, sentMsg);

              // Send to sender (confirmation)
              ws.send(JSON.stringify({
                type: 'sent_ok',
                uid: msg.uid,
                message: sentMsg
              }));

              // Broadcast to all clients (except sender who got sent_ok)
              broadcast(apiState, {
                type: 'new_message',
                uid: msg.uid,
                message: sentMsg
              }, ws);

              console.log(`📤 Sent message to ${msg.uid}`);

              // 2️⃣ SELF-TRIGGER: Kích hoạt SAU khi gửi tin gốc
              console.log(`[Self-Trigger] 🚀 Processing: "${msg.text}"`);
              try {
                const { processAutoReply } = require('../autoReply');
                const fakeMsg = {
                  type: 'text',
                  data: { content: msg.text },
                  threadId: String(msg.uid),
                  uidFrom: apiState.currentUser?.uid,
                  isSelf: true,
                  timestamp: msg.timestamp || Date.now()
                };
                await processAutoReply(apiState, fakeMsg);
                console.log(`[Self-Trigger] ✅ Done processing`);
              } catch (selfErr) {
                console.error(`[Self-Trigger] ❌ Error:`, selfErr.message);
              }
            } catch (err) {
              console.error('❌ Error sending message:', err.message);
              ws.send(JSON.stringify({
                type: 'send_error',
                error: err.message
              }));
            }
          })();
        }

        // ============================================
        // DELETE CONVERSATION
        // ============================================
        // ============================================
        // DELETE CONVERSATION (REAL API)
        // ============================================
        else if (msg.type === 'delete_conversation') {
          (async () => {
            const uid = msg.uid;
            try {
              if (apiState.api) {
                // To delete chat, we need the "last message" object for Zalo to sync status
                const lastMsg = messageDB.getLastMessage(uid);

                // Construct payload with real IDs
                const deletePayload = {
                  ownerId: lastMsg?.senderId || apiState.currentUser?.uid,
                  cliMsgId: lastMsg?.cliMsgId || lastMsg?.msgId || Date.now().toString(),
                  globalMsgId: lastMsg?.globalMsgId || lastMsg?.msgId || Date.now().toString()
                };

                console.log(`🗑️ Deleting chat ${uid} with payload:`, JSON.stringify(deletePayload));
                await apiState.api.deleteChat(deletePayload, uid);
                console.log('✅ Server delete success');
              }
            } catch (err) {
              console.error('❌ Delete chat API error:', err.message);
            } finally {
              // Always delete local even if API fails (unblocks user)
              apiState.messageStore.delete(uid);
              messageDB.deleteConversation(uid);

              // Broadcast delete to update ALL clients
              broadcast(apiState, {
                type: 'conversation_deleted',
                uid: uid
              });
            }
          })();
        }

        // ============================================
        // DELETE ORIGIN CHAT (ZALO SERVER DELETE)
        // ============================================
        else if (msg.type === 'delete_origin_chat') {
          (async () => {
            const threadId = msg.threadId;
            const threadType = msg.threadType || 0; // 0 = User, 1 = Group

            try {
              if (!apiState.api) {
                ws.send(JSON.stringify({
                  type: 'delete_origin_chat_error',
                  error: 'Chưa đăng nhập Zalo'
                }));
                return;
              }

              console.log(`🗑️ Deleting ORIGIN chat for ${threadId} (type: ${threadType})`);

              // Get last message to construct deleteChat payload
              let lastMsg = messageDB.getLastMessage(threadId);

              // ✅ FIX: Attempt to fetch the LATEST message from Zalo to ensure we delete EVERYTHING.
              // Local DB might be outdated.
              try {
                // If we can get thread info, it might have the last message ID
                // Note: zca-js might not expose finding thread easily but let's try standard approach if available
                // Or we can just use the current timestamp as a "future" ID which Zalo might accept as "latest"?
                // Creating a "fake" latest message ID usually works if the backend interprets "delete backwards from X".
                // But if X doesn't exist, it might fail.

                // Strategy: If we have a local message, use it. 
                // If the user says "old messages remain", it implies `deleteChat` logic is strict about the anchor.

                // Let's try to get more messages if local is empty or old
                if (!lastMsg || (Date.now() - lastMsg.timestamp > 300000)) { // If last msg older than 5 mins
                  console.log('🔄 Local last message might be old. Fetching standard thread info not available easily, relying on local state.');
                }
              } catch (e) { }

              const currentUserUID = apiState.currentUser?.uid || '';

              if (!lastMsg) {
                console.warn(`⚠️ No local last message for ${threadId}. Using fallback values.`);
                // Fallback: Use current time as mock ID 
                lastMsg = {
                  senderId: currentUserUID,
                  cliMsgId: Date.now().toString(),
                  globalMsgId: Date.now().toString()
                };
              }

              // ✅ CRITICAL FIX: To delete WHOLE history, Zalo might need the ownerId of the *User* we are deleting?
              // Or just the `ownerId` of the last message.
              // If the user said "only messages since update are deleted", it means specific IDs matter.

              // Let's assume we need to provide the ID of the latest message regardless of who sent it.

              const deletePayload = {
                ownerId: lastMsg.senderId || currentUserUID,
                cliMsgId: lastMsg.cliMsgId || lastMsg.msgId || Date.now().toString(),
                globalMsgId: lastMsg.globalMsgId || lastMsg.msgId || Date.now().toString()
              };

              // Import ThreadType safely
              let ThreadType;
              try {
                ThreadType = require('zca-js').ThreadType;
              } catch (e) {
                // Fallback enum if require fails
                ThreadType = { User: 0, Group: 1 };
              }

              // Call Zalo API
              await apiState.api.deleteChat(
                deletePayload,
                threadId,
                threadType === 1 ? ThreadType.Group : ThreadType.User
              );

              console.log('✅ Origin chat deleted successfully on Zalo server');

              // Also delete local data
              apiState.messageStore.delete(threadId);
              messageDB.deleteConversation(threadId);

              // Broadcast success
              broadcast(apiState, {
                type: 'delete_origin_chat_success',
                threadId: threadId
              });

              ws.send(JSON.stringify({
                type: 'delete_origin_chat_success',
                threadId: threadId,
                message: 'Đã xóa tin nhắn gốc thành công!'
              }));

            } catch (err) {
              console.error('❌ Delete origin chat error:', err);
              ws.send(JSON.stringify({
                type: 'delete_origin_chat_error',
                error: err.message || 'Lỗi không xác định'
              }));
            }
          })();
        }

        // ============================================
        // SEND CHAT IMAGE
        // ============================================
        else if (msg.type === 'send_chat_image') {
          if (!apiState.api) {
            ws.send(JSON.stringify({ type: 'send_error', error: 'Chưa đăng nhập Zalo' }));
            return;
          }

          (async () => {
            try {
              console.log(`📤 Sending image to ${msg.uid}: ${msg.fileName}`);

              // Extract base64 data
              const base64Data = msg.data.split(',')[1];
              const buffer = Buffer.from(base64Data, 'base64');

              // Save temp file
              const tempDir = path.join(__dirname, '../data/temp');
              if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

              const safeName = (msg.fileName || 'image.png').replace(/[^\w.-]/g, '_');
              const tempPath = path.join(tempDir, `img_${Date.now()}_${safeName}`);
              fs.writeFileSync(tempPath, buffer);

              // Send via Zalo API
              // UID BigInt conversion if it's numeric only (for Zalo 2.x stability)
              const threadId = /^\d+$/.test(msg.uid) ? BigInt(msg.uid) : msg.uid;

              const result = await apiState.api.sendMessage(
                { msg: '', attachments: [tempPath] },
                threadId,
                ThreadType.User
              );

              // Clean up temp file
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

              ws.send(JSON.stringify({
                type: 'sent_ok',
                uid: msg.uid,
                message: {
                  msgId: result?.msgId || `sent_${Date.now()}`,
                  content: '[Hình ảnh]',
                  timestamp: Date.now(),
                  isSelf: true,
                  type: 'image'
                }
              }));

              console.log(`✅ Image sent to ${msg.uid}`);
            } catch (err) {
              console.error('❌ Send image error:', err.message);
              ws.send(JSON.stringify({ type: 'send_error', error: err.message }));
            }
          })();
        }

        // ============================================
        // SEND CHAT FILE
        // ============================================
        else if (msg.type === 'send_chat_file') {
          if (!apiState.api) {
            ws.send(JSON.stringify({ type: 'send_error', error: 'Chưa đăng nhập Zalo' }));
            return;
          }

          (async () => {
            try {
              console.log(`📤 Sending file to ${msg.uid}: ${msg.fileName}`);

              // Extract base64 data
              const base64Data = msg.data.split(',')[1];
              const buffer = Buffer.from(base64Data, 'base64');

              // Save temp file
              const tempDir = path.join(__dirname, '../data/temp');
              if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

              const safeName = (msg.fileName || 'file').replace(/[^\w.-]/g, '_');
              const tempPath = path.join(tempDir, `f_${Date.now()}_${safeName}`);
              fs.writeFileSync(tempPath, buffer);

              // Send via Zalo API
              const threadId = /^\d+$/.test(msg.uid) ? BigInt(msg.uid) : msg.uid;

              const result = await apiState.api.sendMessage(
                { msg: '', attachments: [tempPath] },
                threadId,
                ThreadType.User
              );

              // Clean up temp file
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

              ws.send(JSON.stringify({
                type: 'sent_ok',
                uid: msg.uid,
                message: {
                  msgId: result?.msgId || `sent_${Date.now()}`,
                  content: `[📎 File: ${msg.fileName}]`,
                  timestamp: Date.now(),
                  isSelf: true,
                  type: 'file'
                }
              }));

              console.log(`✅ File sent to ${msg.uid}`);
            } catch (err) {
              console.error('❌ Send file error:', err.message);
              ws.send(JSON.stringify({ type: 'send_error', error: err.message }));
            }
          })();
        }

        // ============================================
        // LOGOUT
        // ============================================
        else if (msg.type === 'logout') {
          console.log('👋 User logout request');

          // Stop message listener first
          if (apiState.api?.listener) {
            try {
              apiState.api.listener.stop();
              console.log('🛑 Message listener stopped');
            } catch (e) {
              console.log('⚠️ Error stopping listener:', e.message);
            }
          }

          // Stop friend request polling
          if (apiState.friendRequestCheckInterval) {
            clearInterval(apiState.friendRequestCheckInterval);
            apiState.friendRequestCheckInterval = null;
            console.log('🛑 Friend request polling stopped');
          }

          // Reset all API state
          apiState.isLoggedIn = false;
          apiState.currentUser = null;
          apiState.api = null;
          apiState.friends = null;
          apiState.messageStore = new Map();
          apiState.acceptedFriendRequests = null;
          apiState.autoAcceptFriendEnabled = false;
          apiState.autoAcceptFriendWelcome = '';

          // ✅ Reset groups persistence fix
          apiState.groups = null;
          apiState.groupsMap = new Map();

          // Reset auto-reply state
          try {
            const autoReply = require('../autoReply');
            autoReply.autoReplyState.enabled = false;
            autoReply.autoReplyState.cooldowns.clear();
            autoReply.autoReplyState.botActiveStates.clear();
            autoReply.autoReplyState.pendingInputs.clear();
            console.log('🛑 Auto-reply state reset');
          } catch (e) { }

          // Delete cached credentials file (zca-js stores in working directory)
          const fs = require('fs');
          const path = require('path');
          const credFiles = ['credentials.json', 'creds.json', 'session.json', '.zalo_session', 'qr.png'];
          credFiles.forEach(file => {
            [process.cwd(), __dirname, path.join(__dirname, '..')].forEach(dir => {
              try {
                const filePath = path.join(dir, file);
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                  console.log(`🗑️ Deleted: ${filePath}`);
                }
              } catch (e) { }
            });
          });

          console.log('✅ Session fully cleared');

          broadcast(apiState, {
            type: 'logged_out'
          });

          // Restart login after a short delay
          setTimeout(() => {
            if (apiState.loginZalo) {
              console.log('🔄 Restarting login flow...');
              apiState.loginZalo();
            }
          }, 2000);
        }

        // ============================================
        // ACTIVITY LOGS
        // ============================================
        else if (msg.type === 'get_activity_logs') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({
              type: 'activity_logs',
              logs: []
            }));
            return;
          }

          const logs = triggerDB.getActivityLogs(apiState.currentUser.uid, msg.limit || 100);
          ws.send(JSON.stringify({
            type: 'activity_logs',
            logs: logs
          }));
        }

        // ============================================
        // GET ACTIVITY LOGS
        // ============================================
        else if (msg.type === 'get_activity_logs') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({ type: 'activity_logs', logs: [] }));
            return;
          }
          const logs = triggerDB.getActivityLogs(apiState.currentUser.uid, 50);
          ws.send(JSON.stringify({
            type: 'activity_logs',
            logs: logs
          }));
        }

        else if (msg.type === 'clear_activity_logs') {
          if (apiState.currentUser) {
            triggerDB.clearActivityLogs(apiState.currentUser.uid);
          }
          ws.send(JSON.stringify({
            type: 'activity_logs_cleared'
          }));
        }

        // ============================================
        // GET TRIGGER DETAIL (for Flow Builder UI)
        // ============================================
        else if (msg.type === 'get_trigger_detail') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({
              type: 'trigger_detail',
              trigger: null,
              flow: null,
              error: 'Not logged in'
            }));
            return;
          }

          const triggerId = msg.triggerId || msg.triggerID;

          // Get trigger info
          const trigger = triggerDB.getTriggerById(triggerId);

          if (!trigger) {
            ws.send(JSON.stringify({
              type: 'trigger_detail',
              trigger: null,
              flow: null,
              error: 'Trigger not found'
            }));
            return;
          }

          // Get flow for this trigger
          let flow = triggerDB.getFlowByTrigger(triggerId);

          // Auto-create flow if not exists and trigger is in flow mode
          if (!flow && trigger.setMode === 1) {
            flow = triggerDB.createFlow(triggerId, trigger.triggerName + ' Flow');
          }

          // Get blocks if flow exists
          let blocks = [];
          if (flow) {
            blocks = triggerDB.getFlowBlocks(flow.flowID);
            flow.blocks = blocks;
          }

          console.log(`📋 Trigger detail: #${triggerId} - ${trigger.triggerName}, Flow: ${flow ? flow.flowID : 'none'}, Blocks: ${blocks.length}`);

          ws.send(JSON.stringify({
            type: 'trigger_detail',
            trigger: trigger,
            flow: flow,
            blocks: blocks
          }));
        }

        // ============================================
        // SAVE BLOCK (for Flow Builder UI)
        // ============================================
        else if (msg.type === 'save_block') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({ type: 'block_error', message: 'Not logged in' }));
            return;
          }

          const { triggerId, flowId, block } = msg;
          let targetFlowId = flowId;

          // Create flow if not exists
          if (!targetFlowId && triggerId) {
            let flow = triggerDB.getFlowByTrigger(triggerId);
            if (!flow) {
              const trigger = triggerDB.getTriggerById(triggerId);
              flow = triggerDB.createFlow(triggerId, (trigger?.triggerName || 'Trigger') + ' Flow');
            }
            targetFlowId = flow?.flowID;
          }

          if (!targetFlowId) {
            ws.send(JSON.stringify({ type: 'block_error', message: 'No flow found' }));
            return;
          }

          let savedBlock;

          // Check if block exists (update) or new (create)
          const existingBlock = block.blockID ? triggerDB.getFlowBlockById(block.blockID) : null;

          if (existingBlock) {
            // Update existing block
            savedBlock = triggerDB.updateFlowBlock(block.blockID, {
              blockType: block.blockType,
              blockData: block.blockData,
              blockOrder: block.blockOrder,
              condition1: block.condition1,
              condition2: block.condition2
            });
          } else {
            // Create new block
            savedBlock = triggerDB.addFlowBlock(
              targetFlowId,
              block.blockType,
              block.blockData || {},
              block.blockOrder || 0
            );

            // Update additional fields if needed
            if (savedBlock && (block.condition1 || block.condition2)) {
              savedBlock = triggerDB.updateFlowBlock(savedBlock.blockID, {
                condition1: block.condition1,
                condition2: block.condition2
              });
            }
          }

          if (savedBlock) {
            console.log(`💾 Block saved: #${savedBlock.blockID} (${savedBlock.blockType})`);

            // Đặc biệt xử lý cho table-data block - lưu conditions, columnValues, resultMappings vào tables riêng
            if (savedBlock.blockType === 'table-data' && block.blockData) {
              const blockData = block.blockData;

              // Lưu conditions
              if (blockData.conditions && Array.isArray(blockData.conditions)) {
                triggerDB.saveBlockConditions(savedBlock.blockID, blockData.conditions);
                console.log(`  📋 Saved ${blockData.conditions.length} conditions`);
              }

              // Lưu columnValues
              if (blockData.columnValues && Array.isArray(blockData.columnValues)) {
                triggerDB.saveBlockColumnValues(savedBlock.blockID, blockData.columnValues);
                console.log(`  📝 Saved ${blockData.columnValues.length} column values`);
              }

              // Lưu resultMappings
              if (blockData.resultMappings && Array.isArray(blockData.resultMappings)) {
                triggerDB.saveBlockResultMappings(savedBlock.blockID, blockData.resultMappings);
                console.log(`  💾 Saved ${blockData.resultMappings.length} result mappings`);
              }

              // Reload block để có đầy đủ data
              savedBlock = triggerDB.getFlowBlockById(savedBlock.blockID);
            }

            ws.send(JSON.stringify({ type: 'block_saved', block: savedBlock }));

            // Send updated flow
            const flow = triggerDB.getFlowById(targetFlowId);
            if (flow) {
              flow.blocks = triggerDB.getFlowBlocks(targetFlowId);
              broadcast(apiState, { type: 'flow_updated', flow });
            }
          } else {
            ws.send(JSON.stringify({ type: 'block_error', message: 'Failed to save block' }));
          }
        }

        // ============================================
        // DELETE BLOCK (for Flow Builder UI)
        // ============================================
        else if (msg.type === 'delete_block') {
          const { blockId, flowId } = msg;

          const deleted = triggerDB.deleteFlowBlock(blockId);

          if (deleted) {
            console.log(`🗑️ Block deleted: #${blockId}`);
            ws.send(JSON.stringify({ type: 'block_deleted', blockId }));

            // Send updated flow
            if (flowId) {
              const flow = triggerDB.getFlowById(flowId);
              if (flow) {
                flow.blocks = triggerDB.getFlowBlocks(flowId);
                broadcast(apiState, { type: 'flow_updated', flow });
              }
            }
          } else {
            ws.send(JSON.stringify({ type: 'block_error', message: 'Failed to delete block' }));
          }
        }

        // ============================================
        // UPDATE BLOCK ORDERS (for Flow Builder UI)
        // ============================================
        else if (msg.type === 'update_block_orders') {
          const { flowId, orders } = msg;

          if (orders && Array.isArray(orders)) {
            orders.forEach(item => {
              triggerDB.updateFlowBlock(item.blockID, { blockOrder: item.blockOrder });
            });

            console.log(`📊 Block orders updated for flow #${flowId}`);
            ws.send(JSON.stringify({ type: 'block_orders_updated', flowId }));

            // Send updated flow
            const flow = triggerDB.getFlowById(flowId);
            if (flow) {
              flow.blocks = triggerDB.getFlowBlocks(flowId);
              broadcast(apiState, { type: 'flow_updated', flow });
            }
          }
        }

        // ============================================
        // SCHEDULED TASK MANAGEMENT
        // ============================================
        else if (msg.type === 'get_scheduled_tasks') {
          if (!apiState.currentUser) return;
          const tasks = triggerDB.getAllScheduledTasks(apiState.currentUser.uid);
          ws.send(JSON.stringify({ type: 'scheduled_tasks_list', tasks }));
        }

        else if (msg.type === 'create_scheduled_task') {
          if (!apiState.currentUser) return;
          const { targetId, targetName, content, taskType, executeTime } = msg;
          const newId = triggerDB.createScheduledTask(apiState.currentUser.uid, targetId, targetName, content, taskType, executeTime);

          if (newId) {
            const tasks = triggerDB.getAllScheduledTasks(apiState.currentUser.uid);

            // Broadcast specific event for notifications
            broadcast(apiState, { type: 'scheduled_task_created', success: true, tasks });

            // Broadcast list update
            broadcast(apiState, { type: 'scheduled_tasks_update', tasks });

            // Log Activity
            broadcast(apiState, {
              type: 'new_activity_log',
              log: {
                title: '📅 Lịch gửi mới',
                description: `Đã tạo lịch gửi cho ${targetName} lúc ${new Date(executeTime).toLocaleString('vi-VN')}`,
                type: 'info'
              }
            });
          } else {
            ws.send(JSON.stringify({ type: 'scheduled_task_error', message: 'Failed to create task' }));
          }
        }

        else if (msg.type === 'update_scheduled_task') {
          if (!apiState.currentUser) return;
          const { id, updates } = msg; // updates is an object { targetId, content, ... }
          const success = triggerDB.updateScheduledTask(id, apiState.currentUser.uid, updates);

          if (success) {
            const tasks = triggerDB.getAllScheduledTasks(apiState.currentUser.uid);

            // Broadcast specific event for notifications
            broadcast(apiState, { type: 'scheduled_task_updated', success: true, tasks });

            // Broadcast list update
            broadcast(apiState, { type: 'scheduled_tasks_update', tasks });

            // Log Activity
            broadcast(apiState, {
              type: 'new_activity_log',
              log: {
                title: '✏️ Cập nhật lịch',
                description: `Đã chỉnh sửa lịch gửi ID #${id}`,
                type: 'info'
              }
            });
          } else {
            ws.send(JSON.stringify({ type: 'scheduled_task_error', message: 'Failed to update task' }));
          }
        }

        else if (msg.type === 'delete_scheduled_task') {
          if (!apiState.currentUser) return;
          const { id } = msg;
          const success = triggerDB.deleteScheduledTask(id, apiState.currentUser.uid);

          if (success) {
            const tasks = triggerDB.getAllScheduledTasks(apiState.currentUser.uid);

            // Broadcast specific event for notifications
            broadcast(apiState, { type: 'scheduled_task_deleted', success: true, tasks });

            // Broadcast list update
            broadcast(apiState, { type: 'scheduled_tasks_update', tasks });

            // Log Activity
            broadcast(apiState, {
              type: 'new_activity_log',
              log: {
                title: '🗑️ Xóa lịch',
                description: `Đã xóa lịch gửi ID #${id}`,
                type: 'warning'
              }
            });
          } else {
            ws.send(JSON.stringify({ type: 'scheduled_task_error', message: 'Failed to delete task' }));
          }
        }

        // ============================================
        // USER SETTINGS (Per-User Toggle)
        // ============================================
        else if (msg.type === 'toggle_user_auto_reply') {
          if (!apiState.currentUser) return;
          const { targetId, enabled } = msg;

          // Save setting ('true' or 'false')
          const success = triggerDB.setUserSetting(apiState.currentUser.uid, targetId, 'auto_reply_enabled', enabled);

          if (success) {
            console.log(`👤 User Auto-Reply Toggle: ${targetId} -> ${enabled}`);
            ws.send(JSON.stringify({ type: 'user_auto_reply_updated', targetId, enabled }));
            // Log Activity
            broadcast(apiState, {
              type: 'new_activity_log',
              log: {
                title: `🤖 Auto Reply ${enabled ? 'Bật' : 'Tắt'}`,
                description: `Đã ${enabled ? 'bật' : 'tắt'} trả lời tự động cho ${targetId}`,
                type: 'info'
              }
            });
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to update user setting' }));
          }
        }

        else if (msg.type === 'get_user_settings') {
          if (!apiState.currentUser) return;
          const { targetId } = msg;
          const enabled = triggerDB.getUserSetting(apiState.currentUser.uid, targetId, 'auto_reply_enabled');
          // Default to 'true' (enabled) if not set
          ws.send(JSON.stringify({ type: 'user_settings_data', targetId, autoReplyEnabled: enabled !== 'false' }));
        }

        // ============================================
        // FLOW BUILDER API
        // ============================================
        else if (msg.type === 'get_all_flows') {
          if (!apiState.currentUser) return;
          const flows = triggerDB.getAllFlows(apiState.currentUser.uid);
          ws.send(JSON.stringify({ type: 'flows_list', flows }));
        }

        else if (msg.type === 'get_flow') {
          const flow = msg.flowID
            ? triggerDB.getFlowById(msg.flowID)
            : triggerDB.getFlowByTrigger(msg.triggerID);
          ws.send(JSON.stringify({
            type: 'flow_data',
            flow: flow
          }));
        }

        else if (msg.type === 'create_flow') {
          if (!apiState.currentUser) {
            ws.send(JSON.stringify({ type: 'flow_error', message: 'Not logged in' }));
            return;
          }
          const flow = triggerDB.createFlow(msg.triggerID, msg.flowName);
          if (flow) {
            ws.send(JSON.stringify({ type: 'flow_created', flow }));
          } else {
            ws.send(JSON.stringify({ type: 'flow_error', message: 'Failed to create flow' }));
          }
        }

        else if (msg.type === 'update_flow') {
          const updated = triggerDB.updateFlow(msg.flowID, msg.updates || {});
          if (updated) {
            ws.send(JSON.stringify({ type: 'flow_updated', flow: updated }));
          } else {
            ws.send(JSON.stringify({ type: 'flow_error', message: 'Failed to update flow' }));
          }
        }

        else if (msg.type === 'delete_flow') {
          if (triggerDB.deleteFlow(msg.flowID)) {
            ws.send(JSON.stringify({ type: 'flow_deleted', flowID: msg.flowID }));
          } else {
            ws.send(JSON.stringify({ type: 'flow_error', message: 'Failed to delete flow' }));
          }
        }

        // Flow Blocks
        else if (msg.type === 'get_flow_blocks') {
          const blocks = triggerDB.getFlowBlocks(msg.flowID);
          ws.send(JSON.stringify({ type: 'flow_blocks', flowID: msg.flowID, blocks }));
        }

        else if (msg.type === 'add_flow_block') {
          const block = triggerDB.addFlowBlock(msg.flowID, msg.blockType, msg.blockData || {}, msg.blockOrder);
          if (block) {
            ws.send(JSON.stringify({ type: 'flow_block_added', block }));
            const flow = triggerDB.getFlowById(msg.flowID);
            broadcast(apiState, { type: 'flow_updated', flow });
          } else {
            ws.send(JSON.stringify({ type: 'flow_error', message: 'Failed to add block' }));
          }
        }

        else if (msg.type === 'update_flow_block') {
          const updated = triggerDB.updateFlowBlock(msg.blockID, msg.updates || {});
          if (updated) {
            ws.send(JSON.stringify({ type: 'flow_block_updated', block: updated }));
            const flow = triggerDB.getFlowById(updated.flowID);
            broadcast(apiState, { type: 'flow_updated', flow });
          } else {
            ws.send(JSON.stringify({ type: 'flow_error', message: 'Failed to update block' }));
          }
        }

        else if (msg.type === 'delete_flow_block') {
          const block = triggerDB.getFlowBlockById(msg.blockID);
          if (block && triggerDB.deleteFlowBlock(msg.blockID)) {
            ws.send(JSON.stringify({ type: 'flow_block_deleted', blockID: msg.blockID }));
            const flow = triggerDB.getFlowById(block.flowID);
            broadcast(apiState, { type: 'flow_updated', flow });
          } else {
            ws.send(JSON.stringify({ type: 'flow_error', message: 'Failed to delete block' }));
          }
        }

        else if (msg.type === 'reorder_flow_blocks') {
          if (triggerDB.reorderFlowBlocks(msg.flowID, msg.blockIds)) {
            const flow = triggerDB.getFlowById(msg.flowID);
            ws.send(JSON.stringify({ type: 'flow_updated', flow }));
          } else {
            ws.send(JSON.stringify({ type: 'flow_error', message: 'Failed to reorder blocks' }));
          }
        }

        // ============================================
        // PAYMENT GATES HANDLERS
        // ============================================
        else if (msg.type === 'get_payment_gates') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Chưa đăng nhập' }));
            return;
          }
          const gates = triggerDB.getPaymentGates(userUID);
          ws.send(JSON.stringify({ type: 'payment_gates_list', gates }));
        }

        else if (msg.type === 'create_payment_gate') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Chưa đăng nhập' }));
            return;
          }
          const gate = triggerDB.createPaymentGate(userUID, {
            gateName: msg.gateName,
            bankBin: msg.bankBin,
            accountNumber: msg.accountNumber,
            accountName: msg.accountName,
            status: msg.status
          });
          if (gate) {
            ws.send(JSON.stringify({ type: 'payment_gate_created', gate }));
          } else {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Không thể tạo cổng thanh toán' }));
          }
        }

        else if (msg.type === 'update_payment_gate') {
          const updated = triggerDB.updatePaymentGate(msg.gateID, {
            gateName: msg.gateName,
            bankBin: msg.bankBin,
            accountNumber: msg.accountNumber,
            accountName: msg.accountName,
            status: msg.status
          });
          if (updated) {
            ws.send(JSON.stringify({ type: 'payment_gate_updated', gate: updated }));
          } else {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Không thể cập nhật' }));
          }
        }

        else if (msg.type === 'delete_payment_gate') {
          const success = triggerDB.deletePaymentGate(msg.gateID);
          if (success) {
            ws.send(JSON.stringify({ type: 'payment_gate_deleted', gateID: msg.gateID }));
          } else {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Không thể xóa' }));
          }
        }

        else if (msg.type === 'set_default_gate') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }

          // If gateID is null, just unset all defaults
          if (msg.gateID === null) {
            const success = triggerDB.unsetDefaultGate(userUID);
            if (success) {
              console.log(`⭐ Unset all default gates for user ${userUID}`);
              ws.send(JSON.stringify({
                type: 'default_gate_set',
                gateID: null
              }));
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Failed to unset default gate' }));
            }
          } else {
            const result = triggerDB.setDefaultGate(userUID, msg.gateID);
            if (result) {
              console.log(`⭐ Set default gate: ${msg.gateID} for user ${userUID}`);
              ws.send(JSON.stringify({
                type: 'default_gate_set',
                gateID: msg.gateID
              }));
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Failed to set default gate' }));
            }
          }
        }

        // ============================================
        // TRANSACTIONS HANDLERS
        // ============================================
        else if (msg.type === 'get_transactions') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Chưa đăng nhập' }));
            return;
          }
          const transactions = triggerDB.getTransactions(userUID);
          ws.send(JSON.stringify({ type: 'transactions_list', transactions }));
        }

        else if (msg.type === 'create_transaction') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Chưa đăng nhập' }));
            return;
          }
          const transaction = triggerDB.createTransaction(userUID, {
            gateID: msg.gateID,
            bankBin: msg.bankBin,
            accountNumber: msg.accountNumber,
            accountName: msg.accountName,
            amount: msg.amount,
            currency: msg.currency,
            customerID: msg.customerID,
            customerName: msg.customerName,
            note: msg.note
          });
          if (transaction) {
            broadcast(apiState, { type: 'transaction_created', transaction });
          } else {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Không thể tạo giao dịch' }));
          }
        }

        else if (msg.type === 'update_transaction') {
          const updated = triggerDB.updateTransaction(msg.transactionID, {
            gateID: msg.gateID,
            bankBin: msg.bankBin,
            amount: msg.amount,
            currency: msg.currency,
            customerID: msg.customerID,
            customerName: msg.customerName,
            note: msg.note,
            status: msg.status
          });
          if (updated) {
            ws.send(JSON.stringify({ type: 'transaction_updated', transaction: updated }));
          } else {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Không thể cập nhật' }));
          }
        }

        else if (msg.type === 'delete_transaction') {
          const success = triggerDB.deleteTransaction(msg.transactionID);
          if (success) {
            ws.send(JSON.stringify({ type: 'transaction_deleted', transactionID: msg.transactionID }));
          } else {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Không thể xóa' }));
          }
        }

        else if (msg.type === 'mark_transaction_paid') {
          const userUID = apiState.currentUser?.uid;
          const transaction = triggerDB.markTransactionPaid(msg.transactionID);
          if (transaction) {
            // Create payment log
            triggerDB.createPaymentLog(userUID, {
              transactionID: transaction.transactionID,
              transactionCode: transaction.transactionCode,
              bankBin: transaction.bankBin,
              accountNumber: transaction.accountNumber,
              accountName: transaction.accountName,
              amount: transaction.amount
            });
            ws.send(JSON.stringify({ type: 'transaction_updated', transaction }));
            broadcast(apiState, { type: 'payment_received', transactionCode: transaction.transactionCode, amount: transaction.amount });
          } else {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Không thể cập nhật' }));
          }
        }

        // ============================================
        // PAYMENT LOGS HANDLERS
        // ============================================
        else if (msg.type === 'get_payment_logs') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'payment_error', message: 'Chưa đăng nhập' }));
            return;
          }
          const logs = triggerDB.getPaymentLogs(userUID);
          ws.send(JSON.stringify({ type: 'payment_logs_list', logs }));
        }

        // ============================================
        // PROCESS PAYMENT (from external webhook or manual)
        // ============================================
        else if (msg.type === 'process_payment') {
          const userUID = apiState.currentUser?.uid;
          const { transactionCode, amount, bankBin, accountNumber, accountName } = msg;

          const transaction = triggerDB.getTransactionByCode(transactionCode);
          if (transaction && transaction.status === 'WAITING') {
            const updated = triggerDB.markTransactionPaid(transaction.transactionID);

            triggerDB.createPaymentLog(userUID || transaction.userUID, {
              transactionID: transaction.transactionID,
              transactionCode,
              bankBin: bankBin || transaction.bankBin,
              accountNumber: accountNumber || transaction.accountNumber,
              accountName: accountName || transaction.accountName,
              amount: amount || transaction.amount,
              rawData: msg
            });

            broadcast(apiState, {
              type: 'payment_received',
              transactionCode,
              amount: amount || transaction.amount,
              transaction: updated
            });

            console.log(`💰 Payment received: ${transactionCode} - ${amount || transaction.amount}đ`);
          }
        }

        // ============================================
        // USER TABLES HANDLERS (Google Sheets-like)
        // ============================================
        else if (msg.type === 'get_user_tables') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Chưa đăng nhập' }));
            return;
          }
          const tables = triggerDB.getUserTables(userUID);
          ws.send(JSON.stringify({ type: 'user_tables_list', tables }));
        }

        else if (msg.type === 'get_user_table') {
          const table = triggerDB.getUserTableById(msg.tableID);
          if (table) {
            ws.send(JSON.stringify({ type: 'user_table_data', table }));
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không tìm thấy bảng' }));
          }
        }

        else if (msg.type === 'get_full_table_data') {
          const data = triggerDB.getFullTableData(msg.tableID);
          if (data) {
            ws.send(JSON.stringify({ type: 'full_table_data', data }));
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không tìm thấy bảng' }));
          }
        }

        else if (msg.type === 'create_user_table') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Chưa đăng nhập' }));
            return;
          }
          const table = triggerDB.createUserTable(userUID, {
            tableName: msg.tableName,
            tableDescription: msg.tableDescription,
            flowID: msg.flowID,
            status: msg.status
          });
          if (table) {
            console.log(`📊 Created table: ${table.tableName}`);
            ws.send(JSON.stringify({ type: 'user_table_created', table }));
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không thể tạo bảng' }));
          }
        }

        else if (msg.type === 'update_user_table') {
          const updated = triggerDB.updateUserTable(msg.tableID, {
            tableName: msg.tableName,
            tableDescription: msg.tableDescription,
            flowID: msg.flowID,
            status: msg.status
          });
          if (updated) {
            ws.send(JSON.stringify({ type: 'user_table_updated', table: updated }));
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không thể cập nhật bảng' }));
          }
        }

        else if (msg.type === 'delete_user_table') {
          const success = triggerDB.deleteUserTable(msg.tableID);
          if (success) {
            console.log(`🗑️ Deleted table: ${msg.tableID}`);
            ws.send(JSON.stringify({ type: 'user_table_deleted', tableID: msg.tableID }));
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không thể xóa bảng' }));
          }
        }

        // Column handlers
        else if (msg.type === 'add_table_column') {
          const table = triggerDB.addTableColumn(msg.tableID, {
            name: msg.column?.name || msg.columnName || 'Cột mới',
            type: msg.column?.type || msg.columnType || 'text',
            width: msg.column?.width || 150,
            options: msg.column?.options || null
          });
          if (table) {
            ws.send(JSON.stringify({ type: 'table_updated', table }));
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không thể thêm cột' }));
          }
        }

        else if (msg.type === 'update_table_column') {
          const table = triggerDB.updateTableColumn(msg.tableID, msg.columnId || msg.columnID, msg.updates || {
            name: msg.columnName,
            type: msg.columnType,
            width: msg.width
          });
          if (table) {
            ws.send(JSON.stringify({ type: 'table_updated', table }));
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không thể cập nhật cột' }));
          }
        }

        else if (msg.type === 'delete_table_column') {
          const table = triggerDB.deleteTableColumn(msg.tableID, msg.columnId || msg.columnID);
          if (table) {
            ws.send(JSON.stringify({ type: 'table_updated', table }));
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không thể xóa cột' }));
          }
        }

        // Row handlers
        else if (msg.type === 'add_table_row') {
          const userUID = apiState.currentUser?.uid;
          const row = triggerDB.addTableRow(msg.tableID, msg.rowData || msg.cellValues || {});
          if (row) {
            const tableInfo = triggerDB.getUserTableById(msg.tableID);
            triggerDB.logActivity(userUID, 'add', 'row', row.rowID, `Row #${row.rowID}`, `Thêm hàng vào bảng "${tableInfo?.tableName || msg.tableID}"`);

            ws.send(JSON.stringify({ type: 'row_added', row }));
            const table = triggerDB.getUserTableById(msg.tableID);
            ws.send(JSON.stringify({ type: 'table_detail', table }));
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không thể thêm hàng' }));
          }
        }

        else if (msg.type === 'delete_table_row') {
          const userUID = apiState.currentUser?.uid;
          const tableInfo = triggerDB.getUserTableById(msg.tableID);
          const success = triggerDB.deleteTableRow(msg.rowID);
          if (success) {
            triggerDB.logActivity(userUID, 'delete', 'row', msg.rowID, `Row #${msg.rowID}`, `Xóa hàng từ bảng "${tableInfo?.tableName || msg.tableID}"`);

            ws.send(JSON.stringify({ type: 'row_deleted', rowID: msg.rowID }));
            if (msg.tableID) {
              const table = triggerDB.getUserTableById(msg.tableID);
              ws.send(JSON.stringify({ type: 'table_detail', table }));
            }
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không thể xóa hàng' }));
          }
        }

        else if (msg.type === 'delete_table_rows') {
          const userUID = apiState.currentUser?.uid;
          const tableInfo = triggerDB.getUserTableById(msg.tableID);
          const result = triggerDB.deleteTableRows(msg.tableID, msg.rowIDs || []);
          if (result && result.success) {
            triggerDB.logActivity(userUID, 'delete', 'row', null, `${result.deletedCount} rows`, `Xóa ${result.deletedCount} hàng từ bảng "${tableInfo?.tableName || msg.tableID}"`);

            ws.send(JSON.stringify({ type: 'rows_deleted', rowIDs: msg.rowIDs, deletedCount: result.deletedCount }));
            if (msg.tableID) {
              const table = triggerDB.getUserTableById(msg.tableID);
              ws.send(JSON.stringify({ type: 'table_detail', table }));
            }
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không thể xóa các hàng' }));
          }
        }

        // Cell handlers
        else if (msg.type === 'update_table_cell') {
          const row = triggerDB.updateTableCell(msg.rowID, msg.columnId || msg.columnID, msg.value);
          if (row) {
            ws.send(JSON.stringify({ type: 'cell_updated', row }));
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không thể cập nhật ô' }));
          }
        }

        else if (msg.type === 'update_row_cells') {
          const row = triggerDB.updateTableRow(msg.rowID, msg.rowData || msg.cellValues);
          if (row) {
            ws.send(JSON.stringify({ type: 'row_updated', row }));
          } else {
            ws.send(JSON.stringify({ type: 'table_error', message: 'Không thể cập nhật hàng' }));
          }
        }

        // ============================================
        // CUSTOM TABLES HANDLERS
        // ============================================
        else if (msg.type === 'get_tables') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'tables_list', tables: [], error: 'Not logged in' }));
            return;
          }
          const tables = triggerDB.getUserTables(userUID);
          ws.send(JSON.stringify({ type: 'tables_list', tables }));
        }

        else if (msg.type === 'get_all_variables') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'variables_list', variables: [], error: 'Not logged in' }));
            return;
          }
          const variables = triggerDB.getAllVariablesByUser(userUID);
          ws.send(JSON.stringify({ type: 'variables_list', variables }));
        }

        else if (msg.type === 'delete_variable') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }
          const { variableName, conversationID } = msg;
          triggerDB.deleteVariable(userUID, conversationID, variableName);
          ws.send(JSON.stringify({ type: 'variable_deleted', variableName }));
        }

        else if (msg.type === 'delete_variables') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }
          const { variables } = msg;
          if (Array.isArray(variables)) {
            triggerDB.deleteVariables(userUID, variables);
            ws.send(JSON.stringify({ type: 'variables_cleared' })); // Reuse variables_cleared for bulk delete refresh
          }
        }

        else if (msg.type === 'clear_all_variables') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }
          try {
            const db = triggerDB.getDB();
            db.prepare('DELETE FROM variables WHERE userUID = ?').run(userUID);
            ws.send(JSON.stringify({ type: 'variables_cleared' }));
          } catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
          }
        }

        else if (msg.type === 'get_table') {
          const table = triggerDB.getUserTableById(msg.tableID);
          ws.send(JSON.stringify({ type: 'table_data', table }));
        }

        else if (msg.type === 'get_table_detail') {
          const table = triggerDB.getUserTableById(msg.tableID);
          if (table) {
            ws.send(JSON.stringify({ type: 'table_detail', table }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Table not found' }));
          }
        }

        else if (msg.type === 'create_table') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }
          const table = triggerDB.createUserTable(userUID, {
            tableName: msg.tableName,
            tableDescription: msg.tableDescription,
            columns: msg.columns,
            flowID: msg.flowID
          });
          if (table) {
            console.log(`📊 Created custom table: ${table.tableName}`);
            triggerDB.logActivity(userUID, 'create', 'table', table.tableID, table.tableName, `Tạo bảng với ${table.columns?.length || 0} cột`);
            ws.send(JSON.stringify({ type: 'table_created', table }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to create table' }));
          }
        }

        else if (msg.type === 'update_table') {
          const userUID = apiState.currentUser?.uid;
          const table = triggerDB.updateUserTable(msg.tableID, {
            tableName: msg.tableName,
            tableDescription: msg.tableDescription,
            columns: msg.columns,
            flowID: msg.flowID,
            status: msg.status
          });
          if (table) {
            triggerDB.logActivity(userUID, 'update', 'table', table.tableID, table.tableName, 'Cập nhật thông tin bảng');
            ws.send(JSON.stringify({ type: 'table_updated', table }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to update table' }));
          }
        }

        else if (msg.type === 'delete_table') {
          const userUID = apiState.currentUser?.uid;
          const tableInfo = triggerDB.getUserTableById(msg.tableID);
          const tableName = tableInfo?.tableName || `Table #${msg.tableID}`;

          const success = triggerDB.deleteUserTable(msg.tableID);
          if (success) {
            console.log(`🗑️ Deleted custom table: ${msg.tableID}`);
            triggerDB.logActivity(userUID, 'delete', 'table', msg.tableID, tableName, 'Xóa bảng');
            ws.send(JSON.stringify({ type: 'table_deleted', tableID: msg.tableID }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to delete table' }));
          }
        }

        // ========================================
        // GOOGLE SHEETS CONFIG
        // ========================================
        else if (msg.type === 'get_google_sheet_configs') {
          const userUID = apiState.currentUser?.uid;
          console.log('[WS] get_google_sheet_configs - userUID:', userUID);

          let configs;
          if (userUID) {
            configs = triggerDB.getGoogleSheetConfigs(userUID);
          } else {
            try {
              const stmt = triggerDB.getDB().prepare('SELECT * FROM google_sheet_configs ORDER BY createdAt DESC');
              configs = stmt.all();
            } catch (e) {
              configs = [];
            }
          }
          console.log('[WS] Found configs:', configs?.length || 0);
          ws.send(JSON.stringify({ type: 'google_sheet_configs', configs }));
        }

        else if (msg.type === 'save_google_sheet_config') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'User not logged in' }));
            return;
          }
          const config = msg.config;
          config.userUID = userUID;

          const saved = triggerDB.saveGoogleSheetConfig(config);
          if (saved) {
            ws.send(JSON.stringify({ type: 'google_sheet_config_saved', config: saved }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể lưu config' }));
          }
        }

        else if (msg.type === 'delete_google_sheet_config') {
          const userUID = apiState.currentUser?.uid;
          const success = triggerDB.deleteGoogleSheetConfig(msg.configId, userUID);
          if (success) {
            ws.send(JSON.stringify({ type: 'google_sheet_config_deleted' }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể xóa config' }));
          }
        }

        // ========================================
        // AI CONFIGS
        // ========================================
        else if (msg.type === 'get_ai_configs') {
          const userUID = apiState.currentUser?.uid;
          console.log('[WS] get_ai_configs - userUID:', userUID);

          let configs;
          if (userUID) {
            configs = triggerDB.getAIConfigs(userUID);
          } else {
            try {
              const stmt = triggerDB.getDB().prepare('SELECT * FROM ai_configs ORDER BY createdAt DESC');
              configs = stmt.all().map(c => ({
                id: c.configID,
                configID: c.configID,
                name: c.name,
                provider: c.provider,
                model: c.model,
                apiKey: c.apiKey,
                endpoint: c.endpoint,
                temperature: c.temperature,
                maxTokens: c.maxTokens,
                systemPrompt: c.systemPrompt,
                status: c.status,
                isDefault: c.isDefault === 1
              }));
            } catch (e) {
              configs = [];
            }
          }
          console.log('[WS] Found AI configs:', configs?.length || 0);
          ws.send(JSON.stringify({ type: 'ai_configs', configs }));
        }

        else if (msg.type === 'save_ai_config') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'User not logged in' }));
            return;
          }
          const config = msg.config;
          config.userUID = userUID;

          const saved = triggerDB.saveAIConfig(config);
          if (saved) {
            ws.send(JSON.stringify({ type: 'ai_config_saved', config: saved }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể lưu AI config' }));
          }
        }

        else if (msg.type === 'delete_ai_config') {
          const userUID = apiState.currentUser?.uid;
          const success = triggerDB.deleteAIConfig(msg.configId, userUID);
          if (success) {
            ws.send(JSON.stringify({ type: 'ai_config_deleted' }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể xóa AI config' }));
          }
        }

        else if (msg.type === 'test_ai_connection') {
          testAIConnection(ws, msg).catch(err => {
            console.error('AI test error:', err);
            ws.send(JSON.stringify({
              type: 'ai_test_result',
              success: false,
              error: err.message,
              configId: msg.configId,
              isPlaygroundTest: msg.isPlaygroundTest
            }));
          });
        }

        // ========================================
        // BUILT-IN TRIGGERS STATE
        // ========================================
        else if (msg.type === 'save_builtin_trigger_state') {
          const { userUID, triggerKey, stateData } = msg;
          console.log('💾 Saving builtin trigger state:', { userUID, triggerKey, stateData });

          if (!userUID || !triggerKey) {
            ws.send(JSON.stringify({ type: 'error', message: 'Missing userUID or triggerKey' }));
            return;
          }

          const success = triggerDB.saveBuiltInTriggerState(userUID, triggerKey, stateData);
          if (success) {
            console.log('✅ State saved successfully');
            ws.send(JSON.stringify({
              type: 'builtin_trigger_state_saved',
              triggerKey,
              message: 'Đã lưu cài đặt thành công'
            }));
          } else {
            console.error('❌ Failed to save state');
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể lưu cài đặt' }));
          }
        }

        else if (msg.type === 'get_builtin_trigger_state') {
          const { userUID, triggerKey } = msg;
          console.log('📥 Getting builtin trigger state:', { userUID, triggerKey });

          if (!userUID || !triggerKey) {
            ws.send(JSON.stringify({ type: 'error', message: 'Missing userUID or triggerKey' }));
            return;
          }

          const state = triggerDB.getBuiltInTriggerState(userUID, triggerKey);
          console.log('📤 Sending state:', state);

          ws.send(JSON.stringify({
            type: 'builtin_trigger_state',
            triggerKey,
            state
          }));
        }

        // ========================================
        // IMAGES HANDLERS - QUAN TRỌNG!
        // ========================================
        else if (msg.type === 'get_images') {
          const userUID = apiState.currentUser?.uid;
          console.log('[WS] get_images - userUID:', userUID);

          let images;
          if (userUID) {
            images = triggerDB.getImages(userUID);
          } else {
            try {
              const stmt = triggerDB.getDB().prepare('SELECT * FROM images ORDER BY createdAt DESC');
              images = stmt.all().map(img => ({
                id: img.imageID,
                imageID: img.imageID,
                name: img.name,
                variableName: img.variableName,
                description: img.description,
                fileName: img.fileName,
                filePath: img.filePath,
                fileSize: img.fileSize,
                mimeType: img.mimeType,
                createdAt: img.createdAt,
                url: `/api/images/${img.imageID}`
              }));
            } catch (e) {
              images = [];
            }
          }
          console.log('[WS] Found images:', images?.length || 0);
          ws.send(JSON.stringify({ type: 'images_list', images }));
        }

        else if (msg.type === 'upload_image') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'User not logged in' }));
            return;
          }

          try {
            // Parse base64 data
            const base64Data = msg.data.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            // Create images directory if not exists
            const imagesDir = path.join(__dirname, '..', 'data', 'images');
            if (!fs.existsSync(imagesDir)) {
              fs.mkdirSync(imagesDir, { recursive: true });
            }

            // Generate unique filename - giữ nguyên extension gốc
            const ext = path.extname(msg.fileName) || '.png';
            const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
            const filePath = path.join(imagesDir, uniqueName);

            // ✅ Lấy width/height của ảnh gốc bằng sharp (nếu có)
            let width = 0, height = 0;
            try {
              const sharp = require('sharp');
              const metadata = await sharp(buffer).metadata();
              width = metadata.width || 0;
              height = metadata.height || 0;
              console.log(`📐 Image dimensions: ${width}x${height}`);
            } catch (sharpErr) {
              console.log('⚠️ Sharp not available, skipping dimension extraction');
            }

            // ✅ Lưu file GỐC không nén
            fs.writeFileSync(filePath, buffer);
            console.log(`💾 Saved original image: ${buffer.length} bytes`);

            // Extract name from filename (without extension)
            const baseName = path.basename(msg.fileName, ext);

            // Save to database với width/height
            const image = triggerDB.createImage(userUID, {
              name: baseName,
              fileName: msg.fileName,
              filePath: filePath,
              fileSize: buffer.length,
              mimeType: msg.fileType || 'image/png',
              width: width,
              height: height
            });

            if (image) {
              console.log(`✅ Created image: ${baseName} (ID: ${image.id}, ${width}x${height})`);
              ws.send(JSON.stringify({ type: 'image_uploaded', image }));
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Không thể lưu ảnh' }));
            }
          } catch (error) {
            console.error('❌ Upload image error:', error.message);
            ws.send(JSON.stringify({ type: 'error', message: 'Lỗi upload: ' + error.message }));
          }
        }

        else if (msg.type === 'update_image') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'User not logged in' }));
            return;
          }

          const updated = triggerDB.updateImage(msg.imageId, userUID, {
            name: msg.name,
            variableName: msg.variableName,
            description: msg.description
          });

          if (updated) {
            console.log(`✅ Updated image: ${msg.imageId}`);
            ws.send(JSON.stringify({ type: 'image_updated', image: updated }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể cập nhật ảnh' }));
          }
        }

        else if (msg.type === 'delete_image') {
          const userUID = apiState.currentUser?.uid;
          const result = triggerDB.deleteImage(msg.imageId, userUID);

          if (result.success) {
            // Delete file from disk
            if (result.filePath && fs.existsSync(result.filePath)) {
              try {
                fs.unlinkSync(result.filePath);
                console.log(`🗑️ Deleted file: ${result.filePath}`);
              } catch (e) {
                console.error('Failed to delete file:', e.message);
              }
            }
            console.log(`✅ Deleted image ID: ${msg.imageId}`);
            ws.send(JSON.stringify({ type: 'image_deleted' }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể xóa ảnh' }));
          }
        }

        else if (msg.type === 'delete_images') {
          const userUID = apiState.currentUser?.uid;
          const result = triggerDB.deleteImages(msg.imageIds, userUID);

          if (result.success) {
            // Delete files from disk
            result.filePaths.forEach(filePath => {
              if (filePath && fs.existsSync(filePath)) {
                try {
                  fs.unlinkSync(filePath);
                } catch (e) {
                  console.error('Failed to delete file:', e.message);
                }
              }
            });
            console.log(`✅ Deleted ${result.count} images`);
            ws.send(JSON.stringify({ type: 'images_deleted', count: result.count }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể xóa ảnh' }));
          }
        }

        // ========================================
        // GET FILES
        // ========================================
        else if (msg.type === 'get_files') {
          const userUID = apiState.currentUser?.uid;
          console.log('[WS] get_files - userUID:', userUID);

          let fileList = [];
          if (userUID) {
            fileList = triggerDB.getFiles(userUID);
          } else {
            try {
              const stmt = triggerDB.getDB().prepare('SELECT * FROM files ORDER BY createdAt DESC');
              fileList = stmt.all().map(f => ({
                id: f.fileID,
                fileID: f.fileID,
                name: f.name,
                variableName: f.variableName,
                description: f.description,
                fileName: f.fileName,
                filePath: f.filePath,
                fileSize: f.fileSize,
                mimeType: f.mimeType,
                fileType: f.fileType,
                category: f.category,
                createdAt: f.createdAt,
                url: `/api/files/${f.fileID}`
              }));
            } catch (e) {
              fileList = [];
            }
          }
          console.log('[WS] Found files:', fileList.length);
          ws.send(JSON.stringify({ type: 'files_list', files: fileList }));
        }

        // ========================================
        // UPLOAD FILE
        // ========================================
        else if (msg.type === 'upload_file') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'User not logged in' }));
            return;
          }

          try {
            // Parse base64 data
            const base64Match = msg.data.match(/^data:([^;]+);base64,(.+)$/);
            if (!base64Match) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid file data' }));
              return;
            }

            const mimeType = base64Match[1];
            const base64Data = base64Match[2];
            const buffer = Buffer.from(base64Data, 'base64');

            // Create files directory
            const filesDir = path.join(__dirname, '..', 'data', 'files');
            if (!fs.existsSync(filesDir)) {
              fs.mkdirSync(filesDir, { recursive: true });
            }

            // Generate unique filename
            const ext = path.extname(msg.fileName) || getExtFromMime(mimeType);
            const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
            const filePath = path.join(filesDir, uniqueName);

            // Save file
            fs.writeFileSync(filePath, buffer);
            console.log(`💾 Saved file: ${msg.fileName} (${buffer.length} bytes)`);

            // Get file type
            const fileType = getFileTypeFromMime(mimeType);

            // Save to database
            const file = triggerDB.createFile(userUID, {
              name: path.basename(msg.fileName, ext),
              fileName: msg.fileName,
              filePath: filePath,
              fileSize: buffer.length,
              mimeType: mimeType,
              fileType: fileType,
              category: 'document'
            });

            if (file) {
              console.log(`✅ Created file: ${file.name} (ID: ${file.id})`);
              ws.send(JSON.stringify({ type: 'file_uploaded', file }));
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Không thể lưu file' }));
            }
          } catch (error) {
            console.error('❌ Upload file error:', error.message);
            ws.send(JSON.stringify({ type: 'error', message: 'Lỗi upload: ' + error.message }));
          }
        }

        // ========================================
        // UPDATE FILE
        // ========================================
        else if (msg.type === 'update_file') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'User not logged in' }));
            return;
          }

          const updated = triggerDB.updateFile(msg.fileId, userUID, {
            name: msg.name,
            variableName: msg.variableName,
            description: msg.description,
            category: msg.category
          });

          if (updated) {
            console.log(`✅ Updated file: ${msg.fileId}`);
            ws.send(JSON.stringify({ type: 'file_updated', file: updated }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể cập nhật file' }));
          }
        }

        // ========================================
        // DELETE FILE
        // ========================================
        else if (msg.type === 'delete_file') {
          const userUID = apiState.currentUser?.uid;
          const result = triggerDB.deleteFile(msg.fileId, userUID);

          if (result.success) {
            // Delete from disk
            if (result.filePath && fs.existsSync(result.filePath)) {
              try {
                fs.unlinkSync(result.filePath);
                console.log(`🗑️ Deleted file: ${result.filePath}`);
              } catch (e) {
                console.error('Failed to delete file:', e.message);
              }
            }
            ws.send(JSON.stringify({ type: 'file_deleted', fileId: msg.fileId }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể xóa file' }));
          }
        }

        // ========================================
        // DELETE MULTIPLE FILES
        // ========================================
        else if (msg.type === 'delete_files') {
          const userUID = apiState.currentUser?.uid;
          const result = triggerDB.deleteFiles(msg.fileIds, userUID);

          if (result.success) {
            // Delete files from disk
            for (const fp of result.filePaths || []) {
              if (fs.existsSync(fp)) {
                try { fs.unlinkSync(fp); } catch (e) { }
              }
            }
            ws.send(JSON.stringify({ type: 'files_deleted', count: result.count }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể xóa files' }));
          }
        }

        // ========================================
        // GET FILE TEMPLATES
        // ========================================
        else if (msg.type === 'get_file_templates') {
          const userUID = apiState.currentUser?.uid;
          console.log('[WS] get_file_templates - userUID:', userUID);

          let templateList = [];
          if (userUID) {
            templateList = triggerDB.getFileTemplates(userUID);
          }
          console.log('[WS] Found templates:', templateList.length);
          ws.send(JSON.stringify({ type: 'file_templates_list', templates: templateList }));
        }

        // ========================================
        // CREATE FILE TEMPLATE
        // ========================================
        else if (msg.type === 'create_file_template') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'User not logged in' }));
            return;
          }

          try {
            // Parse base64 data
            const base64Match = msg.data.match(/^data:([^;]+);base64,(.+)$/);
            if (!base64Match) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid template file' }));
              return;
            }

            const mimeType = base64Match[1];
            const base64Data = base64Match[2];
            const buffer = Buffer.from(base64Data, 'base64');

            // Create templates directory
            const templatesDir = path.join(__dirname, '..', 'data', 'templates');
            if (!fs.existsSync(templatesDir)) {
              fs.mkdirSync(templatesDir, { recursive: true });
            }

            // Save template file
            const ext = path.extname(msg.fileName) || getExtFromMime(mimeType);
            const uniqueName = `template_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
            const filePath = path.join(templatesDir, uniqueName);

            fs.writeFileSync(filePath, buffer);
            console.log(`💾 Saved template file: ${msg.fileName}`);

            // Create template in database
            const template = triggerDB.createFileTemplate(userUID, {
              name: msg.name,
              description: msg.description,
              fileName: msg.fileName,
              filePath: filePath,
              fileSize: buffer.length,
              mimeType: mimeType,
              fileType: getFileTypeFromMime(mimeType),
              variables: msg.variables || [],
              outputFormat: msg.outputFormat || 'same'
            });

            if (template) {
              console.log(`✅ Created template: ${template.name} (ID: ${template.id})`);
              ws.send(JSON.stringify({ type: 'template_created', template }));
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Không thể tạo template' }));
            }
          } catch (error) {
            console.error('❌ Create template error:', error.message);
            ws.send(JSON.stringify({ type: 'error', message: 'Lỗi: ' + error.message }));
          }
        }

        // ========================================
        // UPDATE FILE TEMPLATE
        // ========================================
        else if (msg.type === 'update_file_template') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'User not logged in' }));
            return;
          }

          const updated = triggerDB.updateFileTemplate(msg.templateId, userUID, {
            name: msg.name,
            description: msg.description,
            variables: msg.variables,
            outputFormat: msg.outputFormat
          });

          if (updated) {
            console.log(`✅ Updated template: ${msg.templateId}`);
            ws.send(JSON.stringify({ type: 'template_updated', template: updated }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể cập nhật template' }));
          }
        }

        // ========================================
        // DELETE FILE TEMPLATE
        // ========================================
        else if (msg.type === 'delete_file_template') {
          const userUID = apiState.currentUser?.uid;
          const result = triggerDB.deleteFileTemplate(msg.templateId, userUID);

          if (result.success) {
            if (result.filePath && fs.existsSync(result.filePath)) {
              try { fs.unlinkSync(result.filePath); } catch (e) { }
            }
            ws.send(JSON.stringify({ type: 'template_deleted', templateId: msg.templateId }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể xóa template' }));
          }
        }

        // ========================================
        // FILE CONTENT HANDLERS - Đọc nội dung file để preview
        // ========================================

        else if (msg.type === 'get_file_content') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'file_content', content: null, error: 'Not logged in' }));
            return;
          }

          try {
            const fileId = parseInt(msg.fileId);
            const file = triggerDB.getFileById(fileId);

            if (!file) {
              ws.send(JSON.stringify({ type: 'file_content', content: null, error: 'File not found' }));
              return;
            }

            const content = readFileContentForPreview(file.filePath, file.mimeType, file.fileType);
            ws.send(JSON.stringify({
              type: 'file_content',
              content: content,
              fileType: file.fileType
            }));
          } catch (err) {
            console.error('❌ Get file content error:', err.message);
            ws.send(JSON.stringify({ type: 'file_content', content: null, error: err.message }));
          }
        }

        else if (msg.type === 'get_template_content') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'file_content', content: null, error: 'Not logged in' }));
            return;
          }

          try {
            const templateId = parseInt(msg.templateId);
            const template = triggerDB.getFileTemplateById(templateId);

            if (!template) {
              ws.send(JSON.stringify({ type: 'file_content', content: null, error: 'Template not found' }));
              return;
            }

            const content = readFileContentForPreview(template.filePath, template.mimeType, template.fileType);
            ws.send(JSON.stringify({
              type: 'file_content',
              content: content,
              fileType: template.fileType
            }));
          } catch (err) {
            console.error('❌ Get template content error:', err.message);
            ws.send(JSON.stringify({ type: 'file_content', content: null, error: err.message }));
          }
        }

        // Xóa nhiều templates cùng lúc
        else if (msg.type === 'delete_file_templates') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }

          const templateIds = msg.templateIds || [];
          let deleted = 0;

          for (const id of templateIds) {
            try {
              const template = triggerDB.getFileTemplateById(id);
              if (template && template.userUID === userUID) {
                if (template.filePath && fs.existsSync(template.filePath)) {
                  try { fs.unlinkSync(template.filePath); } catch (e) { }
                }
                triggerDB.deleteFileTemplate(id, userUID);
                deleted++;
              }
            } catch (err) {
              console.error('❌ Delete template error:', err.message);
            }
          }

          console.log(`🗑️ Deleted ${deleted} templates`);
          ws.send(JSON.stringify({ type: 'templates_deleted', count: deleted }));
        }

        // ========================================
        // DASHBOARD STATS & LOGS
        // ========================================
        else if (msg.type === 'get_dashboard_stats') {
          try {
            const stats = messageDB.getDashboardStats();
            const topUsers = messageDB.getTopUsers();
            ws.send(JSON.stringify({
              type: 'dashboard_stats_response',
              stats,
              topUsers
            }));
          } catch (e) { console.error('Stats Error:', e); }
        }


        // ============================================
        // GET FRIEND REQUESTS (Enhanced with Scan)
        // ============================================
        else if (msg.type === 'get_friend_requests') {
          try {
            let pending = [];

            // 1. Try standard API
            try {
              if (apiState.api && typeof apiState.api.getFriendRequests === 'function') {
                pending = await apiState.api.getFriendRequests();
              } else if (apiState.api && typeof apiState.api.getPendingFriendRequests === 'function') {
                pending = await apiState.api.getPendingFriendRequests();
              }
            } catch (err) { console.error('Standard friend req API failed, falling back to scan'); }

            // 2. Scan recent conversations (Discovery Mode)
            // Use messageDB to get recent users who are NOT friends and check status
            if (apiState.api && typeof apiState.api.getFriendRequestStatus === 'function') {
              const recentConvos = messageDB.getAllConversations ? messageDB.getAllConversations().slice(0, 20) : [];

              for (const convo of recentConvos) {
                const uid = convo.conversationId;

                // Skip if already in pending list
                if (pending && pending.some(p => (p.userId === uid || p.uid === uid))) continue;

                // Skip if invalid UID (groups/system)
                if (!/^\d+$/.test(uid)) continue;

                try {
                  const status = await apiState.api.getFriendRequestStatus(uid);
                  // Check if they are requesting US (is_requesting) and NOT already a friend
                  if (status && status.is_requesting === 1 && status.is_friend === 0) {

                    // Check duplication again
                    if (pending.some(p => p.userId === uid)) continue;

                    // Fetch user profile to get name/avatar
                    let profile = null;
                    if (apiState.api.getProfile) {
                      profile = await apiState.api.getProfile(uid).catch(() => null);
                    }

                    pending.push({
                      userId: uid,
                      zaloName: profile?.data?.name || profile?.params?.name || `Người dùng ${uid}`,
                      avatar: profile?.data?.avatar || profile?.params?.avatar || '',
                      msg: 'Lời mời từ tin nhắn (được phát hiện)',
                      time: convo.lastTimestamp
                    });
                    console.log(`✅ Discovered friend request from conversation: ${uid}`);
                  }
                } catch (err) {
                  // Ignore individual errors during scan
                }
              }
            }

            ws.send(JSON.stringify({ type: 'friend_requests_response', requests: pending || [] }));
          } catch (e) {
            console.error('Friend Req Error:', e);
            ws.send(JSON.stringify({ type: 'friend_requests_response', requests: [] }));
          }
        }

        else if (msg.type === 'delete_conversation') {
          const uid = msg.uid;
          if (uid) {
            messageDB.deleteConversation(uid);

            // ✅ Broadcast deletion to ALL connected clients for multi-device sync
            broadcast(apiState, {
              type: 'conversation_deleted_broadcast',
              uid: uid,
              timestamp: Date.now()
            });

            ws.send(JSON.stringify({ type: 'delete_conversation_success', uid }));
          }
        }

        else if (msg.type === 'get_file_logs') {
          const logs = messageDB.getFileLogs();
          ws.send(JSON.stringify({ type: 'file_logs_response', logs }));
        }

        // ========================================
        // PRINT AGENT REGISTRATION
        // ========================================
        else if (msg.type === 'register_print_agent') {
          console.log(`🖨️ Print Agent connected: ${msg.hostname || 'unknown'} (${msg.platform || 'unknown'})`);
          ws.isPrintAgent = true;
          printAgents.add(ws);
          ws.send(JSON.stringify({
            type: 'agent_registered',
            success: true,
            message: 'Print Agent registered successfully'
          }));
        }

        else if (msg.type === 'print_result') {
          console.log(`🖨️ Print result: ${msg.success ? '✅' : '❌'} ${msg.fileName}`);
          // Broadcast kết quả in về dashboard (nếu cần)
          broadcast(apiState, {
            type: 'print_completed',
            success: msg.success,
            fileName: msg.fileName,
            error: msg.error,
            senderId: msg.senderId
          });
        }

        // ========================================
        // SEND TEXT MESSAGE
        // ========================================
        else if (msg.type === 'send_message') {
          if (!apiState.api) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }

          const userId = String(msg.to || msg.uid);
          const text = msg.text || msg.content || '';

          console.log(`📤 Sending message to ${userId}: "${text.substring(0, 50)}..."`);

          try {
            const { ThreadType } = require('zca-js');
            // ✅ Manually trigger processAutoReply for Self-Trigger (Run in parallel, do not await API)
            console.log(`[Self-Trigger] 🚀 DEBUG INJECTION START: "${text}"`);
            (async () => {
              try {
                const { processAutoReply } = require('../autoReply');
                const fakeMsg = {
                  type: 'text',
                  data: { content: text },
                  threadId: userId,
                  uidFrom: apiState.currentUser?.uid,
                  isSelf: true,
                  timestamp: Date.now()
                };

                // Notify User via Toast (Using existing handler)
                ws.send(JSON.stringify({
                  type: 'auto_delete_chat_updated',
                  message: '🚀 Đang kiểm tra Self-Trigger...',
                  level: 'info'
                }));

                await processAutoReply(apiState, fakeMsg);

                console.log(`[Self-Trigger] ✅ DEBUG INJECTION COMPLETE`);
                ws.send(JSON.stringify({
                  type: 'auto_delete_chat_updated',
                  message: '✅ Đã chạy xong Self-Trigger Check (Xem Terminal)',
                  level: 'success'
                }));

              } catch (e) {
                console.error('[Self-Trigger] ❌ INJECTION ERROR:', e);
                ws.send(JSON.stringify({
                  type: 'auto_delete_chat_updated',
                  message: '❌ Lỗi Self-Trigger: ' + e.message,
                  level: 'error'
                }));
              }
            })();

            await apiState.api.sendMessage(
              { msg: text },
              userId,
              ThreadType.User
            );

            console.log(`✅ Message sent successfully`);

            ws.send(JSON.stringify({
              type: 'sent_ok',
              message: {
                content: text,
                timestamp: msg.timestamp || Date.now(),
                isSelf: true
              }
            }));
          } catch (err) {
            console.error(`❌ Error sending message:`, err.message);
            ws.send(JSON.stringify({
              type: 'error',
              message: `Failed to send message: ${err.message}`
            }));
          }
        }

        // ========================================
        // SEND FILE/IMAGE
        // ========================================
        else if (msg.type === 'send_file' || msg.type === 'send_image') {
          if (!apiState.api) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }

          console.log(`📎 Received ${msg.type} request to ${msg.to}`);

          try {
            // Convert base64 to buffer
            const base64Data = msg.fileData.replace(/^data:[^;]+;base64,/, '');
            const fileBuffer = Buffer.from(base64Data, 'base64');

            // Save to temp file (same approach as auto-reply flow)
            const tempDir = path.join(__dirname, '..', 'data', 'temp');
            if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir, { recursive: true });
            }

            const fileName = msg.fileName || `file_${Date.now()}`;
            const tempFilePath = path.join(tempDir, fileName);
            fs.writeFileSync(tempFilePath, fileBuffer);

            console.log(`💾 Saved temp file: ${tempFilePath}`);

            // Use attachments method (same as auto-reply flow)
            const resolvedPath = path.resolve(tempFilePath);
            console.log(`📤 Sending via attachments method: ${resolvedPath}`);

            const { ThreadType } = require('zca-js');
            await apiState.api.sendMessage(
              {
                msg: msg.content || "",
                attachments: [resolvedPath]
              },
              msg.to,
              ThreadType.User
            );

            console.log(`✅ ${msg.type} sent successfully via attachments!`);

            // Clean up temp file after sending
            setTimeout(() => {
              if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
                console.log(`🗑️ Cleaned up temp file: ${tempFilePath}`);
              }
            }, 5000);

            ws.send(JSON.stringify({
              type: 'sent_ok',
              message: {
                content: msg.content || `[${msg.fileName || 'File'}]`,
                timestamp: msg.timestamp || Date.now(),
                isSelf: true
              }
            }));
          } catch (err) {
            console.error(`❌ Error sending ${msg.type}:`, err.message);
            ws.send(JSON.stringify({
              type: 'error',
              message: `Failed to send ${msg.type}: ${err.message}`
            }));
          }
        }

        // ========================================
        // FIND USER BY PHONE
        // ========================================
        else if (msg.type === 'find_user') {
          if (!apiState.api) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }

          const phone = msg.phone || '';
          console.log(`🔍 Finding user by phone: ${phone}`);

          try {
            const result = await apiState.api.findUser(phone);
            console.log(`✅ Find user result:`, result);

            if (result && result.uid) {
              ws.send(JSON.stringify({
                type: 'user_found',
                user: {
                  uid: result.uid,
                  display_name: result.display_name || result.zalo_name || 'Người dùng Zalo',
                  zalo_name: result.zalo_name || result.display_name || '',
                  avatar: result.avatar || '',
                  gender: result.gender,
                  phone: phone
                }
              }));
            } else {
              ws.send(JSON.stringify({
                type: 'user_not_found',
                phone: phone
              }));
            }
          } catch (err) {
            console.error(`❌ Error finding user:`, err.message);
            ws.send(JSON.stringify({
              type: 'find_user_error',
              error: err.message
            }));
          }
        }

        // ========================================
        // REMOVE FRIEND (SINGLE)
        // ========================================
        else if (msg.type === 'remove_friend') {
          if (!apiState.api) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }

          const friendId = msg.friendId || '';
          console.log(`🗑️ Removing friend: ${friendId}`);

          try {
            await apiState.api.removeFriend(friendId);
            console.log(`✅ Friend removed: ${friendId}`);

            // Remove from cached friends list
            if (apiState.friends) {
              apiState.friends = apiState.friends.filter(f => f.userId !== friendId);
            }

            ws.send(JSON.stringify({
              type: 'friend_removed',
              friendId: friendId,
              success: true
            }));

            // Broadcast updated friends list
            broadcast(apiState, {
              type: 'friend_removed',
              friendId: friendId
            });

          } catch (err) {
            console.error(`❌ Error removing friend:`, err.message);
            ws.send(JSON.stringify({
              type: 'remove_friend_error',
              friendId: friendId,
              error: err.message
            }));
          }
        }

        // ========================================
        // REMOVE FRIENDS BATCH (MULTIPLE)
        // ========================================
        else if (msg.type === 'remove_friends_batch') {
          if (!apiState.api) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }

          const friendIds = msg.friendIds || [];
          console.log(`🗑️ Batch removing ${friendIds.length} friends`);

          const results = { success: [], failed: [] };

          for (const friendId of friendIds) {
            try {
              await apiState.api.removeFriend(friendId);
              results.success.push(friendId);
              console.log(`  ✅ Removed: ${friendId}`);

              // Remove from cached friends list
              if (apiState.friends) {
                apiState.friends = apiState.friends.filter(f => f.userId !== friendId);
              }
            } catch (err) {
              results.failed.push({ friendId, error: err.message });
              console.error(`  ❌ Failed: ${friendId} - ${err.message}`);
            }
          }

          console.log(`✅ Batch remove complete: ${results.success.length} removed, ${results.failed.length} failed`);

          ws.send(JSON.stringify({
            type: 'friends_batch_removed',
            success: results.success,
            failed: results.failed
          }));

          // Broadcast updated friends list
          if (results.success.length > 0) {
            broadcast(apiState, {
              type: 'friends_list_updated',
              removedIds: results.success
            });
          }
        }

        // ========================================
        // GET SENT FRIEND REQUESTS
        // ========================================
        else if (msg.type === 'get_sent_friend_requests') {
          if (!apiState.api) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }

          console.log(`📤 Getting sent friend requests...`);

          try {
            // Check if API method exists
            if (typeof apiState.api.getSentFriendRequest !== 'function') {
              console.error(`❌ API method getSentFriendRequest not available`);
              ws.send(JSON.stringify({
                type: 'sent_friend_requests_error',
                error: 'API không hỗ trợ chức năng này. Có thể cần cập nhật zca-js.'
              }));
              return;
            }

            const result = await apiState.api.getSentFriendRequest();
            console.log(`✅ Got sent friend requests:`, Object.keys(result || {}).length);
            console.log(`📋 Raw result:`, JSON.stringify(result).substring(0, 500));

            // Convert object to array for easier frontend handling
            const requests = Object.values(result || {}).map(req => ({
              userId: req.userId,
              zaloName: req.zaloName || req.displayName || '',
              displayName: req.displayName || req.zaloName || '',
              avatar: req.avatar || '',
              message: req.fReqInfo?.message || '',
              time: req.fReqInfo?.time || 0
            }));

            ws.send(JSON.stringify({
              type: 'sent_friend_requests_response',
              requests: requests
            }));

          } catch (err) {
            console.error(`❌ Error getting sent friend requests:`, err);

            // Error code 112 = no sent requests (empty list)
            if (err.code === 112) {
              console.log(`📭 No sent friend requests (code 112)`);
              ws.send(JSON.stringify({
                type: 'sent_friend_requests_response',
                requests: []
              }));
              return;
            }

            console.error(`   Stack:`, err.stack);
            ws.send(JSON.stringify({
              type: 'sent_friend_requests_error',
              error: err.message || 'Lỗi không xác định'
            }));
          }
        }

        // ========================================
        // FALLBACK - Unhandled message types
        // ========================================

        // ========================================
        // SELF TRIGGER CONFIG
        // ========================================
        else if (msg.type === 'get_self_trigger') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }
          const allTriggers = triggerDB.getTriggersByUser(userUID);
          const selfTrigger = allTriggers.find(t => t.triggerKey === '__builtin_self_trigger__' || t.keyword_pattern === '/.*');

          let config = { enabled: false, triggerContent: '', setMode: 0 };
          if (selfTrigger) {
            config = {
              enabled: selfTrigger.enabled,
              triggerContent: selfTrigger.triggerContent || selfTrigger.response,
              setMode: selfTrigger.setMode || 0
            };
          }
          ws.send(JSON.stringify({ type: 'self_trigger_config', config }));
        }

        else if (msg.type === 'set_self_trigger') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            console.log('⚠️ set_self_trigger rejected: Not logged in');
            return;
          }

          let config = msg.config;

          // Compatibility with User's Manual Test (Flat format)
          if (!config) {
            let content = msg.triggerContent;
            if (!content && (msg.command || msg.response)) {
              // Legacy Command/Response -> JSON
              content = JSON.stringify({
                command: msg.command,
                response: msg.response
              });
            }
            config = {
              enabled: msg.enabled,
              triggerContent: content,
              setMode: msg.setMode || 0
            };
          }

          // Check if exists
          const allTriggers = triggerDB.getTriggersByUser(userUID);
          let selfTrigger = allTriggers.find(t => t.triggerKey === '__builtin_self_trigger__' || t.keyword_pattern === '/.*');

          if (selfTrigger) {
            // Update
            triggerDB.updateTrigger(selfTrigger.id, {
              enabled: config.enabled,
              triggerContent: config.triggerContent,
              response: config.triggerContent,
              setMode: config.setMode || 0
            });
          } else {
            // Create
            triggerDB.createTrigger({
              triggerName: 'Tự kích hoạt (Self-Trigger)',
              triggerKey: '__builtin_self_trigger__',
              triggerContent: config.triggerContent,
              response: config.triggerContent,
              triggerUserID: userUID,
              enabled: config.enabled,
              scope: 0,
              setMode: config.setMode || 0
            });
          }

          console.log(`✅ Self-Trigger config saved: ${config.triggerContent}`);

          const updated = triggerDB.getTriggersByUser(userUID).find(t => t.triggerKey === '__builtin_self_trigger__' || t.keyword_pattern === '/.*');
          if (updated) {
            ws.send(JSON.stringify({
              type: 'self_trigger_config',
              config: {
                enabled: updated.enabled,
                triggerContent: updated.triggerContent,
                setMode: updated.setMode
              }
            }));
          }
        }

        else if (msg.type === 'debug_test_self_trigger') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'debug_result', error: 'Not logged in' }));
            return;
          }

          const triggers = triggerDB.getTriggersByUser(userUID);
          const selfTrigger = triggers.find(t => t.triggerKey === '__builtin_self_trigger__' || t.keyword_pattern === '/.*');

          if (!selfTrigger) {
            ws.send(JSON.stringify({ type: 'debug_result', error: 'Self Trigger not found in DB' }));
            return;
          }

          let rules = [];
          let legacyCommand = '';
          const report = {
            enabled: selfTrigger.enabled,
            rawContent: selfTrigger.triggerContent,
            input: msg.content,
            matched: false,
            details: []
          };

          try {
            const json = JSON.parse(selfTrigger.triggerContent || '{}');
            if (json.rules && Array.isArray(json.rules)) {
              rules = json.rules;
              report.details.push(`Parsed ${rules.length} rules from JSON`);
            } else if (json.command) {
              legacyCommand = json.command;
              report.details.push(`Parsed Legacy Command from JSON: ${legacyCommand}`);
            }
          } catch (e) {
            legacyCommand = selfTrigger.triggerContent;
            report.details.push(`JSON Parse Error, treating as raw Legacy: ${legacyCommand}`);
          }

          rules.sort((a, b) => (b.command?.length || 0) - (a.command?.length || 0));
          const contentLower = (msg.content || '').toLowerCase();

          // Check Rules
          for (const r of rules) {
            const cmd = (r.command || '').trim().toLowerCase();
            const isMatch = cmd && contentLower.startsWith(cmd);
            report.details.push(`Rule Check: "${cmd}" vs Input "${contentLower}" -> ${isMatch ? 'MATCH' : 'NO'}`);
            if (isMatch) {
              report.matched = true;
              report.matchedRule = r;
              break;
            }
          }

          // Check Legacy
          if (!report.matched) {
            const cmd = (legacyCommand || '').trim().toLowerCase();
            if (cmd) {
              const isMatch = contentLower.startsWith(cmd);
              report.details.push(`Legacy Check: "${cmd}" vs Input "${contentLower}" -> ${isMatch ? 'MATCH' : 'NO'}`);
              if (isMatch) report.matched = true;
            }
          }

          ws.send(JSON.stringify({ type: 'debug_result', report }));
        }

        // ========================================
        // GET STATIC VARIABLES LIST
        // ========================================
        else if (msg.type === 'get_static_variables') {
          const { STATIC_VARIABLES } = require('../autoReply');
          ws.send(JSON.stringify({
            type: 'static_variables',
            variables: STATIC_VARIABLES
          }));
        }

        // ========================================
        // SET VARIABLE (Manual Add/Edit)
        // ========================================
        else if (msg.type === 'set_variable') {
          const userUID = apiState.currentUser?.uid;
          if (userUID) {
            triggerDB.setVariable(
              userUID,
              msg.conversationID || 'manual',
              msg.variableName,
              msg.variableValue,
              msg.variableType || 'text'
            );
            ws.send(JSON.stringify({ type: 'variable_set', variableName: msg.variableName }));
          }
        }

        // ========================================
        // ZALO BOT HANDLERS
        // ========================================
        else if (msg.type === 'zalo_bot_get_info') {
          const zaloBot = require('./zaloBot');
          const token = msg.token;
          const res = await zaloBot.getMe(token);

          ws.send(JSON.stringify({
            type: 'zalo_bot_info',
            success: res.ok,
            data: res.result || res,
            error: res.description,
            token: token // Echoback
          }));
        }

        else if (msg.type === 'zalo_bot_send') {
          const zaloBot = require('./zaloBot');
          const token = msg.token;
          const res = await zaloBot.sendMessage(token, msg.userId, msg.text);

          ws.send(JSON.stringify({
            type: 'zalo_bot_response',
            success: res.ok,
            data: res.result || res,
            error: res.description
          }));
        }

        // ZALO BOT POLLING
        else if (msg.type === 'zalo_bot_start_polling') {
          const token = msg.token;
          if (!token) {
            ws.send(JSON.stringify({ type: 'error', message: 'Missing bot token' }));
            return;
          }
          // Use shared function to start polling
          startBotPolling(token, apiState);
        }

        else if (msg.type === 'zalo_bot_stop_polling') {
          apiState.zaloBotPolling = false;
          broadcast(apiState, { type: 'zalo_bot_polling_status', active: false });
          console.log('⏹️ Zalo Bot: Polling stopped by user');
        }

        else if (msg.type === 'get_zalo_contacts') {
          // Flatten groups map if needed, or just use friends
          const friends = apiState.friends || [];
          const groups = [];
          if (apiState.groupsMap) {
            apiState.groupsMap.forEach(g => groups.push({ id: g.id, name: g.name }));
          } else if (Array.isArray(apiState.groups)) {
            apiState.groups.forEach(g => groups.push({ id: g.id, name: g.name }));
          }

          // Get Captured Bot Contacts
          const botContacts = triggerDB.getZaloBotContacts();

          ws.send(JSON.stringify({
            type: 'zalo_contacts_list',
            friends: friends.map(f => ({ id: f.userId, name: f.displayName || f.name })),
            groups: groups,
            botContacts: botContacts
          }));
        }

        else if (msg.type === 'zalo_bot_delete_contact') {
          const { openid } = msg;
          if (!openid) {
            ws.send(JSON.stringify({ type: 'error', message: 'Missing openid' }));
            return;
          }

          console.log(`🗑️ Deleting Zalo Bot contact: ${openid}`);
          const success = triggerDB.deleteZaloBotContact(openid);

          if (success) {
            ws.send(JSON.stringify({
              type: 'zalo_bot_contact_deleted',
              openid,
              message: 'Contact deleted successfully'
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Failed to delete contact'
            }));
          }
        }

        // ========================================
        // AUTOMATION ROUTINES HANDLERS
        // ========================================
        else if (msg.type === 'get_automation_routines') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) return;
          const routines = triggerDB.getAutomationRoutines(userUID);
          ws.send(JSON.stringify({ type: 'automation_routines_list', routines }));
        }

        else if (msg.type === 'create_automation_routine') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) return;
          msg.routine.userUID = userUID;
          const id = triggerDB.createAutomationRoutine(msg.routine);
          if (id) {
            const routines = triggerDB.getAutomationRoutines(userUID);
            broadcast(apiState, { type: 'automation_routines_list', routines });
            ws.send(JSON.stringify({ type: 'automation_routine_created', id }));
          }
        }

        else if (msg.type === 'update_automation_routine') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) return;
          const success = triggerDB.updateAutomationRoutine(msg.id, userUID, msg.updates);
          if (success) {
            const routines = triggerDB.getAutomationRoutines(userUID);
            broadcast(apiState, { type: 'automation_routines_list', routines });
          }
        }

        else if (msg.type === 'delete_automation_routine') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) return;
          const success = triggerDB.deleteAutomationRoutine(msg.id, userUID);
          if (success) {
            const routines = triggerDB.getAutomationRoutines(userUID);
            broadcast(apiState, { type: 'automation_routines_list', routines });
          }
        }

        // ================================================
        // BUILTIN TRIGGERS (System Settings page)
        // ================================================
        else if (msg.type === 'get_builtin_triggers') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'builtin_triggers', triggers: {} }));
            return;
          }

          // Load all builtin trigger states from database
          const builtinKeys = [
            'builtin_auto_reply_user',
            'builtin_auto_reply_group',
            'builtin_auto_friend',
            'builtin_auto_file',
            'builtin_auto_unread',
            'builtin_auto_delete_messages',
            'builtin_self_trigger',
            'builtin_ai_conversation'
          ];

          const triggers = {};
          const keyToName = {
            'builtin_auto_reply_user': 'autoReplyUser',
            'builtin_auto_reply_group': 'autoReplyGroup',
            'builtin_auto_friend': 'autoAcceptFriend',
            'builtin_auto_file': 'autoFile',
            'builtin_auto_unread': 'autoUnread',
            'builtin_auto_delete_messages': 'autoDelete',
            'builtin_self_trigger': 'selfTrigger',
            'builtin_ai_conversation': 'aiConversation'
          };

          for (const key of builtinKeys) {
            try {
              const state = triggerDB.getBuiltInTriggerState(userUID, key) || { enabled: false };
              const name = keyToName[key];
              if (name) {
                triggers[name] = state;
              }
            } catch (e) {
              console.error(`Error loading builtin trigger ${key}:`, e);
            }
          }

          console.log('📤 Sending builtin triggers:', Object.keys(triggers));
          ws.send(JSON.stringify({ type: 'builtin_triggers', triggers }));
        }

        else if (msg.type === 'update_builtin_trigger') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }

          const { triggerId, data } = msg;
          if (!triggerId || !data) {
            ws.send(JSON.stringify({ type: 'error', message: 'Missing triggerId or data' }));
            return;
          }

          try {
            // Save to database
            triggerDB.saveBuiltInTriggerState(userUID, triggerId, data);
            console.log(`✅ Saved builtin trigger ${triggerId}:`, data.enabled);

            // Broadcast update to all clients
            broadcast(apiState, { type: 'builtin_trigger_updated', triggerId, data });
          } catch (e) {
            console.error(`Error saving builtin trigger ${triggerId}:`, e);
            ws.send(JSON.stringify({ type: 'error', message: e.message }));
          }
        }

        else {
          const handled = handleAutoReplyMessage(apiState, ws, msg);
          if (!handled) {
            console.log('⚠️ Unhandled message type:', msg.type);
          }
        }

      } catch (err) {
        console.error('❌ WebSocket message error:', err.message);
        console.error(err.stack);
      }

    });

    ws.on('close', () => {
      apiState.clients.delete(ws);
      // Xóa print agent nếu ngắt kết nối
      if (ws.isPrintAgent) {
        printAgents.delete(ws);
        console.log('🖨️ Print Agent disconnected');
      }
      console.log('❌ WebSocket disconnected');
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
      apiState.clients.delete(ws);
    });
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('🛑 Closing TriggerDB...');
    triggerDB.close();
  });

  process.on('SIGTERM', () => {
    console.log('🛑 Closing TriggerDB...');
    triggerDB.close();
  });

  return wss;
}


// Helper to start Zalo Bot Polling (can be called from anywhere)
async function startBotPolling(token, apiState) {
  const zaloBot = require('./zaloBot');

  if (apiState.zaloBotPolling) {
    console.log('🔄 Zalo Bot: Polling already running, restarting...');
    apiState.zaloBotPolling = false;
    await new Promise(r => setTimeout(r, 1000));
  }

  apiState.zaloBotPolling = true;
  apiState.botToken = token; // Store token for auto-reply
  console.log('🔄 Zalo Bot: Started Polling...');

  // Broadcast status to all clients
  broadcast(apiState, { type: 'zalo_bot_polling_status', active: true });

  // Start Loop
  (async () => {
    let offset = 0;
    while (apiState.zaloBotPolling) {
      try {
        const res = await zaloBot.getUpdates(token, offset);
        if (res && res.ok && res.result) {
          const updates = Array.isArray(res.result) ? res.result : [res.result];

          for (const update of updates) {
            // Broadcast each update as webhook event
            broadcast(apiState, {
              type: 'zalo_webhook_event',
              data: update
            });

            // PROCESS AUTO REPLY
            await processBotMessage(update, token, apiState);

            // Update offset if update_id exists
            if (update.update_id) offset = update.update_id + 1;
          }
        }
      } catch (e) {
        console.error('Polling error:', e.message);
        await new Promise(r => setTimeout(r, 5000)); // Backoff
      }
      if (!apiState.zaloBotPolling) break;
    }
    console.log('⏹️ Zalo Bot: Stopped Polling');
    broadcast(apiState, { type: 'zalo_bot_polling_status', active: false });
  })();
}

// Helper to process Zalo Bot Messages (Webhook or Polling)
async function processBotMessage(update, token, apiState) {
  try {
    // Check if bot auto reply is enabled
    if (!apiState?.botAutoReplyEnabled) {
      console.log('🤖 Bot Auto Reply is disabled, skipping...');
      return;
    }

    const zaloBot = require('./zaloBot');
    // Extract Info
    // Zalo structure: { sender: { id: "..." }, message: { text: "..." }, event_name: "user_send_text" }
    // OR New Structure: { event_name: "message.text.received", message: { text: "...", from: { id: "..." } } }

    const eventName = update.event_name;
    let senderId = update.sender?.id || update.sender?.user_id || update.user_id_by_app;
    let text = update.message?.text || update.message;

    // Handle "message.text.received" format
    if (eventName === 'message.text.received') {
      senderId = update.message?.from?.id;
      text = update.message?.text;
    }

    if (!senderId || !text) return;
    if (eventName !== 'user_send_text' && eventName !== 'message.text.received') return;

    // ✅ SAVE CONTACT TO DB
    const senderName = update.message?.from?.display_name || update.sender?.display_name || update.sender?.name || update.message?.from?.name || 'Unknown';
    const senderAvatar = update.sender?.avatar || update.message?.from?.avatar || '';
    triggerDB.saveZaloBotContact(senderId, senderName, senderAvatar);

    console.log(`🤖 Bot Msg from ${senderName} (${senderId}): ${text}`);

    // Load ALL enabled triggers
    const allTriggers = triggerDB.getAllTriggers();
    const inputLower = text.toLowerCase().trim();

    // Match trigger by keyword
    const matched = allTriggers.find(t => {
      if (!t.enabled) return false;

      // Get keywords from triggerKey (comma-separated)
      const keywords = (t.triggerKey || '').split(',').map(k => k.trim().toLowerCase()).filter(k => k);
      if (keywords.length === 0) return false;

      // Check match based on setMode
      // setMode: 0 = contains, 1 = exact, 2 = startsWith, 3 = endsWith
      for (const keyword of keywords) {
        if (t.setMode === 1) {
          if (inputLower === keyword) return true;
        } else if (t.setMode === 2) {
          if (inputLower.startsWith(keyword)) return true;
        } else if (t.setMode === 3) {
          if (inputLower.endsWith(keyword)) return true;
        } else {
          // Default: contains
          if (inputLower.includes(keyword)) return true;
        }
      }
      return false;
    });

    if (matched) {
      console.log(`🎯 Bot Trigger Matched: ${matched.triggerName}`);

      // Get reply content
      let replyContent = matched.triggerContent || '';

      // Check if has flow
      if (matched.flowId) {
        // TODO: Execute flow for bot (complex - needs separate implementation)
        console.log(`⚙️ Bot Flow execution not implemented yet, using direct reply`);
      }

      if (replyContent) {
        // Simple variable substitution
        replyContent = replyContent
          .replace(/\{zalo_name\}/gi, senderName)
          .replace(/\{zalo_id\}/gi, senderId)
          .replace(/\{message\}/gi, text)
          .replace(/\{time\}/gi, new Date().toLocaleTimeString('vi-VN'))
          .replace(/\{date\}/gi, new Date().toLocaleDateString('vi-VN'));

        await zaloBot.sendMessage(token, senderId, replyContent);
        console.log(`✅ Bot Replied: ${replyContent.substring(0, 50)}...`);
      }
    } else {
      console.log(`📭 No trigger matched for: "${text}"`);
    }

  } catch (err) {
    console.error('❌ Bot AutoReply Error:', err.message);
  }
}

// Export triggerDB và print agent functions để các module khác có thể dùng
module.exports = { startWebSocketServer, broadcast, triggerDB, sendToPrintAgent, hasPrintAgent, processBotMessage, startBotPolling };