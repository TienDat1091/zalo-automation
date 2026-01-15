// websocket.js - WebSocket server với SQLite TriggerDB
const WebSocket = require('ws');
const { handleAutoReplyMessage } = require('../autoReply.js');
const { loadFriends } = require('../chat-function/friends');
const { ThreadType } = require('zca-js');
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


// ============================================
// BROADCAST HELPER
// ============================================
function broadcast(apiState, data) {
  try {
    const json = JSON.stringify(data);
    apiState.clients.forEach(ws => {
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
    ? new WebSocket.Server({ server: httpServer })
    : new WebSocket.Server({ port: 8080 });

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
    ws.clientIP = clientIP; // Store for IP Gating

    console.log(`✅ New WebSocket connection from: ${clientIP}`);
    apiState.clients.add(ws);

    // Send current user info ONLY if authorized
    // If authorizedIP is set, MUST match. If null, anyone can connect.
    if (apiState.currentUser) {
      if (apiState.authorizedIP && clientIP !== apiState.authorizedIP) {
        console.log(`🔒 Gating WebSocket info for unauthorized IP: ${clientIP}`);
        ws.send(JSON.stringify({ type: 'session_info', isLoggedIn: false }));
      } else {
        ws.send(JSON.stringify({
          type: 'current_user',
          user: apiState.currentUser
        }));
      }

      // Migrate old data if needed
      migrateOldData(apiState.currentUser.uid);
    }

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw);
        // console.log('📨 WebSocket message:', msg.type); // Optional log

        // ============================================
        // USER INFO
        // ============================================
        if (msg.type === 'get_current_user') {
          // IP Gating
          if (apiState.authorizedIP && ws.clientIP !== apiState.authorizedIP) {
            ws.send(JSON.stringify({ type: 'session_info', isLoggedIn: false }));
            return;
          }

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
          console.log('👥 Loading friends list...');
          loadFriends(apiState, ws);
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

          // Load user triggers từ SQLite
          const userTriggers = triggerDB.getTriggersByUser(apiState.currentUser.uid);

          ws.send(JSON.stringify({
            type: 'auto_reply_status',
            enabled: require('../autoReply').autoReplyState.enabled,
            scenarios: userTriggers,
            stats: require('../autoReply').autoReplyState.stats || { received: 0, replied: 0, skipped: 0 }
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

          require('../autoReply').autoReplyState.enabled = msg.enabled;

          broadcast(apiState, {
            type: 'auto_reply_status_changed',
            enabled: msg.enabled
          });

          console.log('🤖 Auto Reply:', msg.enabled ? 'BẬT' : 'TẮT');
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

            ws.send(JSON.stringify({
              type: 'trigger_created',
              trigger: newTrigger
            }));

            // Also send legacy format
            ws.send(JSON.stringify({
              type: 'scenario_added',
              scenario: newTrigger
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

            ws.send(JSON.stringify({
              type: 'trigger_updated',
              trigger: updatedTrigger
            }));

            ws.send(JSON.stringify({
              type: 'scenario_updated',
              scenario: updatedTrigger
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

            ws.send(JSON.stringify({
              type: 'trigger_deleted',
              id: triggerID
            }));

            ws.send(JSON.stringify({
              type: 'scenario_deleted',
              id: triggerID
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
          // ✅ Load from SQLite first, fallback to memory
          let messages = messageDB.getMessages(msg.uid, 100);

          // If SQLite empty, try memory store (backward compatibility)
          if (messages.length === 0) {
            messages = apiState.messageStore.get(msg.uid) || [];
          }

          ws.send(JSON.stringify({
            type: 'messages_history',
            uid: msg.uid,
            messages: messages
          }));
          console.log(`📤 Sent ${messages.length} messages for ${msg.uid} (from ${messages.length > 0 ? 'SQLite' : 'memory'})`);
        }

        // ============================================
        // SEND MESSAGE
        // ============================================
        else if (msg.type === 'send_message') {
          (async () => {
            try {
              const threadId = /^\d+$/.test(msg.uid) ? BigInt(msg.uid) : msg.uid;
              await apiState.api.sendMessage(
                { msg: msg.text },
                threadId,
                ThreadType.User
              );

              const sentMsg = {
                msgId: `sent_${Date.now()}`,
                content: msg.text,
                timestamp: Date.now(),
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

              // Broadcast to all clients
              broadcast(apiState, {
                type: 'new_message',
                uid: msg.uid,
                message: sentMsg
              });

              console.log(`📤 Sent message to ${msg.uid}`);
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
        else if (msg.type === 'delete_conversation') {
          apiState.messageStore.delete(msg.uid);
          console.log(`🗑️ Deleted conversation: ${msg.uid}`);
          ws.send(JSON.stringify({
            type: 'conversation_deleted',
            uid: msg.uid
          }));
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
        // FLOW BUILDER API
        // ============================================
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
            ws.send(JSON.stringify({ type: 'transaction_created', transaction }));
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


        else if (msg.type === 'get_friend_requests') {
          try {
            let pending = [];
            if (apiState.api && typeof apiState.api.getPendingFriendRequests === 'function') {
              pending = await apiState.api.getPendingFriendRequests();
            } else if (apiState.api && typeof apiState.api.getFriendRequests === 'function') {
              pending = await apiState.api.getFriendRequests();
            }
            ws.send(JSON.stringify({ type: 'friend_requests_response', requests: pending || [] }));
          } catch (e) { console.error('Friend Req Error:', e); ws.send(JSON.stringify({ type: 'friend_requests_response', requests: [] })); }
        }

        else if (msg.type === 'delete_conversation') {
          const uid = msg.uid;
          if (uid) {
            messageDB.deleteConversation(uid);
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
        // FALLBACK - Unhandled message types
        // ========================================
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

// Export triggerDB và print agent functions để các module khác có thể dùng
module.exports = { startWebSocketServer, broadcast, triggerDB, sendToPrintAgent, hasPrintAgent };