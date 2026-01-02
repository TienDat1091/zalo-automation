// websocket.js - WebSocket server với SQLite TriggerDB
const WebSocket = require('ws');
const { handleAutoReplyMessage } = require('./autoReply');
const { loadFriends } = require('./friends');
const triggerDB = require('./triggerDB');
const fs = require('fs');
const path = require('path');

// ============================================
// INIT TRIGGER DATABASE
// ============================================
triggerDB.init();

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
  const oldFilePath = path.join(__dirname, 'data', 'triggers', `triggers_${userUID}.json`);
  if (fs.existsSync(oldFilePath)) {
    console.log('🔄 Found old JSON data, migrating to SQLite...');
    triggerDB.migrateFromJSON(oldFilePath, userUID);
  }
}

// ============================================
// WEBSOCKET SERVER
// ============================================
function startWebSocketServer(apiState) {
  const wss = new WebSocket.Server({ port: 8080 });
  console.log('🔌 WebSocket server started on port 8080');

  wss.on('connection', (ws) => {
    console.log('✅ New WebSocket connection');
    apiState.clients.add(ws);

    // Send current user info if logged in
    if (apiState.currentUser) {
      ws.send(JSON.stringify({
        type: 'current_user',
        user: apiState.currentUser
      }));

      // Migrate old data if needed
      migrateOldData(apiState.currentUser.uid);
    }

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw);
        console.log('📨 WebSocket message:', msg.type);

        // ============================================
        // USER INFO
        // ============================================
        if (msg.type === 'get_current_user') {
          if (apiState.currentUser) {
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
            enabled: require('./autoReply').autoReplyState.enabled,
            scenarios: userTriggers,
            stats: require('./autoReply').autoReplyState.stats || { received: 0, replied: 0, skipped: 0 }
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

          require('./autoReply').autoReplyState.enabled = msg.enabled;
          
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
            triggerName: msg.keywords?.[0] || 'New Trigger',
            triggerKey: msg.keywords?.join(',') || '',
            triggerContent: msg.response || '',
            enabled: true
          };

          // Thêm userUID
          triggerData.triggerUserID = apiState.currentUser.uid;

          const newTrigger = triggerDB.createTrigger(triggerData);

          if (newTrigger) {
            console.log('➕ Created trigger:', newTrigger.triggerID);

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
                enabled: require('./autoReply').autoReplyState.enabled,
                scenarios: allTriggers,
                stats: require('./autoReply').autoReplyState.stats
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
          const updates = msg.trigger || {
            triggerName: msg.keywords?.[0],
            triggerKey: msg.keywords?.join(','),
            triggerContent: msg.response,
            enabled: msg.enabled
          };

          const updatedTrigger = triggerDB.updateTrigger(triggerID, updates);

          if (updatedTrigger) {
            console.log('✏️ Updated trigger:', triggerID);

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
                enabled: require('./autoReply').autoReplyState.enabled,
                scenarios: allTriggers,
                stats: require('./autoReply').autoReplyState.stats
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
                enabled: require('./autoReply').autoReplyState.enabled,
                scenarios: allTriggers,
                stats: require('./autoReply').autoReplyState.stats
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
                enabled: require('./autoReply').autoReplyState.enabled,
                scenarios: allTriggers,
                stats: require('./autoReply').autoReplyState.stats
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
          const messages = apiState.messageStore.get(msg.uid) || [];
          ws.send(JSON.stringify({
            type: 'messages_history',
            uid: msg.uid,
            messages: messages
          }));
          console.log(`📤 Sent ${messages.length} messages for ${msg.uid}`);
        }

        // ============================================
        // SEND MESSAGE
        // ============================================
        else if (msg.type === 'send_message') {
          (async () => {
            try {
              const { ThreadType } = require('zca-js');
              await apiState.api.sendMessage(
                { msg: msg.text },
                msg.uid,
                ThreadType.User
              );

              const sentMsg = {
                msgId: `sent_${Date.now()}`,
                content: msg.text,
                timestamp: Date.now(),
                senderId: apiState.currentUser?.uid,
                isSelf: true
              };

              if (!apiState.messageStore.has(msg.uid)) {
                apiState.messageStore.set(msg.uid, []);
              }
              apiState.messageStore.get(msg.uid).push(sentMsg);

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
        // LOGOUT
        // ============================================
        else if (msg.type === 'logout') {
          console.log('👋 User logout request');
          apiState.isLoggedIn = false;
          apiState.currentUser = null;
          
          broadcast(apiState, {
            type: 'logged_out'
          });

          if (apiState.api?.listener) {
            try {
              apiState.api.listener.stop();
            } catch (e) {}
          }

          setTimeout(() => {
            if (apiState.loginZalo) {
              apiState.loginZalo();
            }
          }, 2000);
        }
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
          // This can be called from a webhook when payment is detected
          const userUID = apiState.currentUser?.uid;
          const { transactionCode, amount, bankBin, accountNumber, accountName } = msg;
          
          // Find transaction by code
          const transaction = triggerDB.getTransactionByCode(transactionCode);
          if (transaction && transaction.status === 'WAITING') {
            // Mark as paid
            const updated = triggerDB.markTransactionPaid(transaction.transactionID);
            
            // Create log
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
        // AUTO REPLY HANDLERS (fallback)
        // ============================================

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

        // Column handlers (for custom_tables)
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
            // Log activity
            const tableInfo = triggerDB.getUserTableById(msg.tableID);
            triggerDB.logActivity(userUID, 'add', 'row', row.rowID, `Row #${row.rowID}`, `Thêm hàng vào bảng "${tableInfo?.tableName || msg.tableID}"`);
            
            ws.send(JSON.stringify({ type: 'row_added', row }));
            // Send updated table - use table_detail for auto-refresh
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
            // Log activity
            triggerDB.logActivity(userUID, 'delete', 'row', msg.rowID, `Row #${msg.rowID}`, `Xóa hàng từ bảng "${tableInfo?.tableName || msg.tableID}"`);
            
            ws.send(JSON.stringify({ type: 'row_deleted', rowID: msg.rowID }));
            // Send updated table - use table_detail for auto-refresh
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
            // Log activity
            triggerDB.logActivity(userUID, 'delete', 'row', null, `${result.deletedCount} rows`, `Xóa ${result.deletedCount} hàng từ bảng "${tableInfo?.tableName || msg.tableID}"`);
            
            ws.send(JSON.stringify({ type: 'rows_deleted', rowIDs: msg.rowIDs, deletedCount: result.deletedCount }));
            // Send updated table
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
          const userUID = apiState.currentUser?.uid;
          const oldCell = triggerDB.getTableRowById ? null : null; // Could get old value here if needed
          const row = triggerDB.updateTableCell(msg.rowID, msg.columnId || msg.columnID, msg.value);
          if (row) {
            // Log activity - nhưng không log quá nhiều để tránh spam
            // triggerDB.logActivity(userUID, 'update', 'cell', msg.rowID, `Cell [${msg.rowID}, ${msg.columnId || msg.columnID}]`, `Cập nhật giá trị: "${msg.value?.substring(0, 50) || ''}"`);
            
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
        // CUSTOM TABLES HANDLERS (for table-manager.html)
        // ============================================
        
        // Get all tables
        else if (msg.type === 'get_tables') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'tables_list', tables: [], error: 'Not logged in' }));
            return;
          }
          const tables = triggerDB.getUserTables(userUID);
          ws.send(JSON.stringify({ type: 'tables_list', tables }));
        }

        // ============================================
        // GET ALL VARIABLES - Lấy tất cả biến đã lưu
        // ============================================
        else if (msg.type === 'get_all_variables') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'variables_list', variables: [], error: 'Not logged in' }));
            return;
          }
          const variables = triggerDB.getAllVariablesByUser(userUID);
          ws.send(JSON.stringify({ type: 'variables_list', variables }));
        }

        // ============================================
        // DELETE VARIABLE - Xóa một biến
        // ============================================
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

        // ============================================
        // CLEAR ALL VARIABLES - Xóa tất cả biến của user
        // ============================================
        else if (msg.type === 'clear_all_variables') {
          const userUID = apiState.currentUser?.uid;
          if (!userUID) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
            return;
          }
          // Xóa tất cả biến của user
          try {
            const db = triggerDB.getDB();
            db.prepare('DELETE FROM variables WHERE userUID = ?').run(userUID);
            ws.send(JSON.stringify({ type: 'variables_cleared' }));
          } catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
          }
        }

        // Get single table with data
        else if (msg.type === 'get_table') {
          const table = triggerDB.getUserTableById(msg.tableID);
          ws.send(JSON.stringify({ type: 'table_data', table }));
        }
        
        // Get table detail (alias for table-manager.html)
        else if (msg.type === 'get_table_detail') {
          const table = triggerDB.getUserTableById(msg.tableID);
          if (table) {
            ws.send(JSON.stringify({ type: 'table_detail', table }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Table not found' }));
          }
        }

        // Create table
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
            // Log activity
            triggerDB.logActivity(userUID, 'create', 'table', table.tableID, table.tableName, `Tạo bảng với ${table.columns?.length || 0} cột`);
            ws.send(JSON.stringify({ type: 'table_created', table }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to create table' }));
          }
        }

        // Update table
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
            // Log activity
            triggerDB.logActivity(userUID, 'update', 'table', table.tableID, table.tableName, 'Cập nhật thông tin bảng');
            ws.send(JSON.stringify({ type: 'table_updated', table }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to update table' }));
          }
        }

        // Delete table
        else if (msg.type === 'delete_table') {
          const userUID = apiState.currentUser?.uid;
          // Get table name before delete
          const tableInfo = triggerDB.getUserTableById(msg.tableID);
          const tableName = tableInfo?.tableName || `Table #${msg.tableID}`;
          
          const success = triggerDB.deleteUserTable(msg.tableID);
          if (success) {
            console.log(`🗑️ Deleted custom table: ${msg.tableID}`);
            // Log activity
            triggerDB.logActivity(userUID, 'delete', 'table', msg.tableID, tableName, 'Xóa bảng');
            ws.send(JSON.stringify({ type: 'table_deleted', tableID: msg.tableID }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to delete table' }));
          }
        }

        // ========================================
        // ACTIVITY LOGS
        // ========================================
        else if (msg.type === 'get_activity_logs') {
          const userUID = apiState.currentUser?.uid;
          const logs = triggerDB.getActivityLogs(userUID, msg.limit || 500, msg.offset || 0);
          ws.send(JSON.stringify({ type: 'activity_logs', logs }));
        }
        
        else if (msg.type === 'clear_activity_logs') {
          const userUID = apiState.currentUser?.uid;
          const success = triggerDB.clearActivityLogs(userUID);
          if (success) {
            ws.send(JSON.stringify({ type: 'logs_cleared' }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Không thể xóa logs' }));
          }
        }

        // ========================================
        // GOOGLE SHEETS CONFIG
        // ========================================
        else if (msg.type === 'get_google_sheet_configs') {
          const userUID = apiState.currentUser?.uid;
          console.log('[WS] get_google_sheet_configs - userUID:', userUID);
          
          // Temporarily get ALL configs for testing
          let configs;
          if (userUID) {
            configs = triggerDB.getGoogleSheetConfigs(userUID);
          } else {
            // Fallback: get all configs
            try {
              const stmt = triggerDB.db.prepare('SELECT * FROM google_sheet_configs ORDER BY createdAt DESC');
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
            // Fallback: get all configs
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
          // Test AI connection
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

// Export triggerDB để các module khác có thể dùng
module.exports = { startWebSocketServer, broadcast, triggerDB };