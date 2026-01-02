// autoReply.js - Auto Reply v4.4 - FIXED CONDITION TO RUN FLOWS
// Fix: condition chạy flow khác thay vì tìm child blocks
const triggerDB = require('./triggerDB');
const fetch = require('node-fetch');

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
    if (typeof content !== 'string' || !content.trim()) return;

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
    console.log(`📨 Message from ${senderId}: "${content.substring(0, 30)}..."`);

    // ========== CHECK PENDING USER INPUT ==========
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
        if (data.imageUrl) {
          const caption = substituteVariables(data.caption || '', context);
          const msg = caption ? `${caption}\n${data.imageUrl}` : data.imageUrl;
          await sendMessage(apiState, senderId, msg, userUID);
        }
        break;
      }

      case 'send-file': {
        if (data.fileUrl) {
          await sendMessage(apiState, senderId, `📎 ${data.fileName || 'File'}: ${data.fileUrl}`, userUID);
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
            const opts = { method: data.method || 'GET' };
            if (data.headers) try { opts.headers = JSON.parse(substituteVariables(data.headers, context)); } catch(e){}
            if (data.body && ['POST','PUT'].includes(opts.method)) {
              opts.body = substituteVariables(data.body, context);
              opts.headers = opts.headers || {};
              opts.headers['Content-Type'] = 'application/json';
            }
            const res = await fetch(data.url, opts);
            context.webhook_response = await res.text();
          } catch(e) { console.error('Webhook error:', e.message); }
        }
        break;
      }

      case 'ai-gemini': {
        try {
          if (data.enabled === false) {
            console.log(`    ⏸️ AI block disabled`);
            break;
          }

          // Lấy AI config
          let aiConfig = null;
          if (data.configId) {
            aiConfig = triggerDB.getAIConfigById(data.configId);
          }
          
          // Fallback to legacy apiKey
          if (!aiConfig && data.apiKey) {
            aiConfig = {
              provider: 'gemini',
              model: data.model || 'gemini-1.5-flash',
              apiKey: data.apiKey,
              temperature: 0.7,
              maxTokens: 1024,
              systemPrompt: ''
            };
          }

          if (!aiConfig || !aiConfig.apiKey) {
            console.log(`    ⚠️ AI config not found or missing API key`);
            break;
          }

          const prompt = substituteVariables(data.prompt || '', context);
          if (!prompt) {
            console.log(`    ⚠️ Empty prompt`);
            break;
          }

          console.log(`    🧠 Calling AI (${aiConfig.provider}/${aiConfig.model}): "${prompt.substring(0, 50)}..."`);

          // Call AI API
          const aiResponse = await callAIAPI(aiConfig, prompt);
          
          if (aiResponse.success) {
            const responseText = aiResponse.text || '';
            console.log(`    ✅ AI Response: "${responseText.substring(0, 50)}..."`);
            
            // Save to variable
            if (data.saveResponseTo) {
              triggerDB.setVariable(userUID, senderId, data.saveResponseTo, responseText, 'text', block.blockID, flow.flowID);
              context[data.saveResponseTo] = responseText;
              console.log(`    💾 Saved to {${data.saveResponseTo}}`);
            }
            
            // Send response to user if enabled
            if (data.sendResponse !== false && responseText) {
              await sendMessage(apiState, senderId, responseText, userUID);
              console.log(`    💬 Sent AI response to user`);
            }
          } else {
            console.log(`    ❌ AI Error: ${aiResponse.error}`);
            if (data.saveResponseTo) {
              context[data.saveResponseTo] = '[AI Error: ' + aiResponse.error + ']';
            }
          }
        } catch (err) {
          console.error(`    ❌ AI Gemini error: ${err.message}`);
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
          console.log(`    📋 Conditions:`, JSON.stringify(conditions));
          console.log(`    📝 ColumnValues:`, JSON.stringify(columnValues));

          // Helper: Check if row matches conditions
          const checkConditions = (row) => {
            if (!conditions || conditions.length === 0) return true;
            
            return conditions.every(cond => {
              const columnID = cond.column;
              const operator = cond.operator || 'equals';
              const compareValue = substituteVariables(cond.value || '', context);
              
              // Find cell value for this column - FIX: use value instead of cellValue
              let cellValue = '';
              if (row.cells) {
                const cell = row.cells.find(c => String(c.columnID) === String(columnID));
                cellValue = cell?.value || cell?.cellValue || '';
              }
              // Also check rowData for direct access
              if (!cellValue && row.rowData) {
                cellValue = row.rowData[columnID] || '';
              }
              
              // Compare based on operator
              const rv = String(cellValue).toLowerCase();
              const cv = String(compareValue).toLowerCase();
              
              console.log(`      🔍 Checking: column=${columnID}, cellValue="${cellValue}", operator=${operator}, compareValue="${compareValue}"`);
              
              let result = false;
              switch (operator) {
                case 'equals': result = rv === cv; break;
                case 'not_equals': result = rv !== cv; break;
                case 'contains': result = rv.includes(cv); break;
                case 'not_contains': result = !rv.includes(cv); break;
                case 'starts_with': result = rv.startsWith(cv); break;
                case 'ends_with': result = rv.endsWith(cv); break;
                case 'is_empty': result = !rv.trim(); break;
                case 'is_not_empty': result = !!rv.trim(); break;
                case 'greater': result = parseFloat(cellValue) > parseFloat(compareValue); break;
                case 'less': result = parseFloat(cellValue) < parseFloat(compareValue); break;
                default: result = rv === cv;
              }
              console.log(`      ➡️ Result: ${result}`);
              return result;
            });
          };

          const rows = table.rows || [];
          console.log(`    📊 Total rows in table: ${rows.length}`);

          if (action === 'find') {
            // Find rows matching conditions
            const matchedRows = rows.filter(checkConditions).slice(0, limitResults);
            
            // Get result mappings
            const resultMappings = data.resultMappings || [];
            
            // Convert to usable format
            const results = matchedRows.map(row => {
              const rowData = { rowID: row.rowID };
              if (row.cells) {
                row.cells.forEach(cell => {
                  // Find column name
                  const col = table.columns?.find(c => c.columnID === cell.columnID);
                  if (col) {
                    rowData[col.columnName] = cell.value || cell.cellValue || '';
                    rowData[`col_${cell.columnID}`] = cell.value || cell.cellValue || '';
                  }
                });
              }
              return rowData;
            });

            // Nếu có resultMappings, lưu từng cột vào biến riêng
            if (resultMappings.length > 0 && resultMappings.some(rm => rm.column && rm.variableName)) {
              const firstRow = results[0] || {};
              
              for (const mapping of resultMappings) {
                if (!mapping.column || !mapping.variableName) continue;
                
                const columnID = String(mapping.column);
                const variableName = mapping.variableName;
                
                // Tìm giá trị từ cột
                let value = '';
                
                // Tìm theo col_ID
                if (firstRow[`col_${columnID}`] !== undefined) {
                  value = firstRow[`col_${columnID}`];
                } else {
                  // Tìm theo tên cột
                  const col = table.columns?.find(c => String(c.columnID) === columnID);
                  if (col && firstRow[col.columnName] !== undefined) {
                    value = firstRow[col.columnName];
                  }
                }
                
                // Lưu vào context và database
                context[variableName] = value;
                triggerDB.setVariable(userUID, senderId, variableName, value, 'text', block.blockID, flow.flowID);
                
                console.log(`    💾 Saved: {${variableName}} = "${value}"`);
              }
              
              console.log(`    🔍 Found ${results.length} row(s), saved ${resultMappings.filter(rm => rm.column && rm.variableName).length} variables`);
            } else {
              // Fallback: lưu toàn bộ row vào 1 biến (backward compatibility)
              const resultValue = limitResults === 1 ? (results[0] || null) : results;
              context[resultVariable] = resultValue;
              triggerDB.setVariable(userUID, senderId, resultVariable, JSON.stringify(resultValue), 'json', block.blockID, flow.flowID);
              
              console.log(`    🔍 Found ${results.length} row(s), saved to {${resultVariable}}`);
              if (results.length > 0) {
                console.log(`    📦 Result data:`, JSON.stringify(resultValue));
              }
            }
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
            
            console.log(`    🔍 Found ${matchedRows.length} row(s) to update`);
            
            for (const row of matchedRows) {
              for (const cv of columnValues) {
                const columnID = cv.column;
                const value = substituteVariables(cv.value || '', context);
                if (columnID) {
                  console.log(`    ✏️ Updating row ${row.rowID}, column ${columnID}: "${value}"`);
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
            
            console.log(`    🔍 Found ${matchedRows.length} row(s) to delete`);
            
            for (const row of matchedRows) {
              console.log(`    🗑️ Deleting row ${row.rowID}`);
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

      // ========================================
      // GOOGLE SHEET DATA BLOCK
      // ========================================
      case 'google-sheet-data': {
        try {
          const configId = data.configId;
          const action = data.action || 'find';
          const conditions = data.conditions || [];
          const columnValues = data.columnValues || [];
          const resultMappings = data.resultMappings || [];
          const limitResults = data.limitResults || 1;
          const columns = data._columns || [];

          if (!configId) {
            console.log(`    ⚠️ Google Sheet Data: No config selected`);
            break;
          }

          // Get Google Sheet config
          const config = triggerDB.getGoogleSheetConfigById(configId);
          if (!config || !config.scriptURL) {
            console.log(`    ⚠️ Google Sheet Data: Config not found or missing scriptURL (ID: ${configId})`);
            break;
          }

          console.log(`    📗 Google Sheet Data: ${action} on "${config.name}"`);
          console.log(`    📋 Conditions:`, JSON.stringify(conditions));
          console.log(`    📝 ColumnValues:`, JSON.stringify(columnValues));

          const scriptURL = config.scriptURL;
          const sheetName = config.sheetName || 'Sheet1';

          // Helper function to call Google Sheet API
          const callGoogleSheetAPI = async (params) => {
            const url = new URL(scriptURL);
            url.searchParams.set('sheet', sheetName);
            for (const [key, value] of Object.entries(params)) {
              url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
            }
            
            console.log(`    🌐 Calling: ${url.toString().substring(0, 100)}...`);
            
            const response = await fetch(url.toString());
            const result = await response.json();
            return result;
          };

          if (action === 'find') {
            // Lấy tất cả dữ liệu từ sheet
            const getData = await callGoogleSheetAPI({ action: 'getData' });
            
            if (!getData.success) {
              console.log(`    ❌ Failed to get data: ${getData.error}`);
              break;
            }

            const headers = getData.headers || [];
            const rows = getData.rows || [];
            
            console.log(`    📊 Total rows: ${rows.length}, Headers: ${headers.join(', ')}`);

            // Filter rows by conditions
            const matchedRows = rows.filter(row => {
              if (!conditions || conditions.length === 0) return true;
              
              return conditions.every(cond => {
                const colIndex = parseInt(cond.column) - 1; // Convert to 0-based index
                const operator = cond.operator || 'equals';
                const compareValue = substituteVariables(cond.value || '', context);
                
                const cellValue = row.cells ? String(row.cells[colIndex] || '') : '';
                const cv = String(cellValue).toLowerCase();
                const rv = String(compareValue).toLowerCase();
                
                console.log(`      🔍 Column ${cond.column}: "${cellValue}" ${operator} "${compareValue}"`);
                
                let result = false;
                switch (operator) {
                  case 'equals': result = cv === rv; break;
                  case 'not_equals': result = cv !== rv; break;
                  case 'contains': result = cv.includes(rv); break;
                  case 'not_contains': result = !cv.includes(rv); break;
                  case 'starts_with': result = cv.startsWith(rv); break;
                  case 'ends_with': result = cv.endsWith(rv); break;
                  case 'is_empty': result = !cv.trim(); break;
                  case 'is_not_empty': result = !!cv.trim(); break;
                  default: result = cv === rv;
                }
                console.log(`      ➡️ Result: ${result}`);
                return result;
              });
            }).slice(0, limitResults);

            console.log(`    🔍 Found ${matchedRows.length} matching row(s)`);

            // Convert to usable format with column names
            const results = matchedRows.map(row => {
              const rowData = { rowIndex: row.rowIndex };
              if (row.cells) {
                row.cells.forEach((cellValue, idx) => {
                  const colName = headers[idx] || `col_${idx + 1}`;
                  const colLetter = String.fromCharCode(65 + idx);
                  rowData[colName] = cellValue;
                  rowData[`col_${idx + 1}`] = cellValue;
                  rowData[colLetter] = cellValue;
                });
              }
              return rowData;
            });

            // Lưu kết quả vào biến
            if (resultMappings.length > 0 && resultMappings.some(rm => rm.column && rm.variableName)) {
              const firstRow = results[0] || {};
              
              for (const mapping of resultMappings) {
                if (!mapping.column || !mapping.variableName) continue;
                
                const colIndex = parseInt(mapping.column) - 1;
                const variableName = mapping.variableName;
                
                // Tìm giá trị từ cột
                let value = '';
                const colKey = `col_${mapping.column}`;
                
                if (firstRow[colKey] !== undefined) {
                  value = firstRow[colKey];
                } else if (headers[colIndex] && firstRow[headers[colIndex]] !== undefined) {
                  value = firstRow[headers[colIndex]];
                }
                
                // Lưu vào context và database
                context[variableName] = value;
                triggerDB.setVariable(userUID, senderId, variableName, String(value), 'text', block.blockID, flow.flowID);
                
                console.log(`    💾 Saved: {${variableName}} = "${value}"`);
              }
              
              console.log(`    ✅ Saved ${resultMappings.filter(rm => rm.column && rm.variableName).length} variables`);
            } else {
              // Fallback: lưu toàn bộ row vào biến table_result
              const resultValue = limitResults === 1 ? (results[0] || null) : results;
              context['gsheet_result'] = resultValue;
              triggerDB.setVariable(userUID, senderId, 'gsheet_result', JSON.stringify(resultValue), 'json', block.blockID, flow.flowID);
              
              console.log(`    🔍 Saved to {gsheet_result}:`, JSON.stringify(resultValue));
            }
          }
          
          else if (action === 'add') {
            // Tạo mảng giá trị cho row mới
            // Đầu tiên lấy headers để biết số cột
            const getData = await callGoogleSheetAPI({ action: 'getData' });
            const headers = getData.success ? getData.headers || [] : [];
            
            // Tạo mảng với số cột tương ứng
            const rowData = new Array(headers.length).fill('');
            
            for (const cv of columnValues) {
              const colIndex = parseInt(cv.column) - 1;
              const value = substituteVariables(cv.value || '', context);
              if (colIndex >= 0 && colIndex < rowData.length) {
                rowData[colIndex] = value;
              }
              console.log(`    📝 Column ${cv.column}: "${value}"`);
            }
            
            const result = await callGoogleSheetAPI({ 
              action: 'addRow', 
              data: JSON.stringify(rowData) 
            });
            
            if (result.success) {
              context['gsheet_result'] = { success: true, rowNumber: result.rowNumber };
              console.log(`    ➕ Added new row #${result.rowNumber}`);
            } else {
              context['gsheet_result'] = { success: false, error: result.error };
              console.log(`    ❌ Failed to add row: ${result.error}`);
            }
          }
          
          else if (action === 'update') {
            // Lấy dữ liệu và tìm rows matching
            const getData = await callGoogleSheetAPI({ action: 'getData' });
            
            if (!getData.success) {
              console.log(`    ❌ Failed to get data: ${getData.error}`);
              break;
            }

            const headers = getData.headers || [];
            const rows = getData.rows || [];
            
            // Filter rows by conditions
            const matchedRows = rows.filter(row => {
              if (!conditions || conditions.length === 0) return true;
              
              return conditions.every(cond => {
                const colIndex = parseInt(cond.column) - 1;
                const operator = cond.operator || 'equals';
                const compareValue = substituteVariables(cond.value || '', context);
                const cellValue = row.cells ? String(row.cells[colIndex] || '') : '';
                
                const cv = cellValue.toLowerCase();
                const rv = String(compareValue).toLowerCase();
                
                switch (operator) {
                  case 'equals': return cv === rv;
                  case 'not_equals': return cv !== rv;
                  case 'contains': return cv.includes(rv);
                  case 'not_contains': return !cv.includes(rv);
                  case 'starts_with': return cv.startsWith(rv);
                  case 'ends_with': return cv.endsWith(rv);
                  case 'is_empty': return !cv.trim();
                  case 'is_not_empty': return !!cv.trim();
                  default: return cv === rv;
                }
              });
            });

            console.log(`    🔍 Found ${matchedRows.length} row(s) to update`);
            
            let updatedCount = 0;
            for (const row of matchedRows) {
              for (const cv of columnValues) {
                const colIndex = parseInt(cv.column);
                const value = substituteVariables(cv.value || '', context);
                
                console.log(`    ✏️ Updating row ${row.rowIndex}, column ${colIndex}: "${value}"`);
                
                const result = await callGoogleSheetAPI({
                  action: 'updateCell',
                  row: row.rowIndex,
                  col: colIndex,
                  value: value
                });
                
                if (result.success) updatedCount++;
              }
            }
            
            context['gsheet_result'] = { success: true, updatedCount };
            console.log(`    ✏️ Updated ${updatedCount} cell(s)`);
          }
          
          else if (action === 'delete') {
            // Lấy dữ liệu và tìm rows matching
            const getData = await callGoogleSheetAPI({ action: 'getData' });
            
            if (!getData.success) {
              console.log(`    ❌ Failed to get data: ${getData.error}`);
              break;
            }

            const rows = getData.rows || [];
            
            // Filter rows by conditions (lấy từ cuối để tránh index shift khi xóa)
            const matchedRows = rows.filter(row => {
              if (!conditions || conditions.length === 0) return false; // Không xóa nếu không có điều kiện
              
              return conditions.every(cond => {
                const colIndex = parseInt(cond.column) - 1;
                const operator = cond.operator || 'equals';
                const compareValue = substituteVariables(cond.value || '', context);
                const cellValue = row.cells ? String(row.cells[colIndex] || '') : '';
                
                const cv = cellValue.toLowerCase();
                const rv = String(compareValue).toLowerCase();
                
                switch (operator) {
                  case 'equals': return cv === rv;
                  case 'not_equals': return cv !== rv;
                  case 'contains': return cv.includes(rv);
                  case 'not_contains': return !cv.includes(rv);
                  case 'starts_with': return cv.startsWith(rv);
                  case 'ends_with': return cv.endsWith(rv);
                  case 'is_empty': return !cv.trim();
                  case 'is_not_empty': return !!cv.trim();
                  default: return cv === rv;
                }
              });
            }).sort((a, b) => b.rowIndex - a.rowIndex); // Sort descending để xóa từ cuối

            console.log(`    🔍 Found ${matchedRows.length} row(s) to delete`);
            
            let deletedCount = 0;
            for (const row of matchedRows) {
              console.log(`    🗑️ Deleting row ${row.rowIndex}`);
              
              const result = await callGoogleSheetAPI({
                action: 'deleteRow',
                row: row.rowIndex
              });
              
              if (result.success) deletedCount++;
            }
            
            context['gsheet_result'] = { success: true, deletedCount };
            console.log(`    🗑️ Deleted ${deletedCount} row(s)`);
          }

        } catch (err) {
          console.error(`    ❌ Google Sheet Data error: ${err.message}`);
          context['gsheet_result'] = { success: false, error: err.message };
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
// AI API HELPER
// ========================================
async function callAIAPI(config, prompt) {
  const fetch = require('node-fetch');
  
  try {
    const { provider, model, apiKey, systemPrompt, temperature, maxTokens } = config;
    
    switch (provider) {
      case 'gemini':
        return await callGeminiAPI(apiKey, model, prompt, systemPrompt, temperature, maxTokens);
      case 'openai':
        return await callOpenAIAPI(apiKey, model, prompt, systemPrompt, temperature, maxTokens);
      case 'claude':
        return await callClaudeAPI(apiKey, model, prompt, systemPrompt, temperature, maxTokens);
      case 'custom':
        return await callCustomAPI(apiKey, model, config.endpoint, prompt, systemPrompt, temperature, maxTokens);
      default:
        // Default to Gemini
        return await callGeminiAPI(apiKey, model || 'gemini-1.5-flash', prompt, systemPrompt, temperature, maxTokens);
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function callGeminiAPI(apiKey, model, prompt, systemPrompt, temperature, maxTokens) {
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
    return { success: false, error: data.error.message || 'Gemini API error' };
  }
  
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { success: true, text };
}

async function callOpenAIAPI(apiKey, model, prompt, systemPrompt, temperature, maxTokens) {
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
    return { success: false, error: data.error.message || 'OpenAI API error' };
  }
  
  const text = data.choices?.[0]?.message?.content || '';
  return { success: true, text };
}

async function callClaudeAPI(apiKey, model, prompt, systemPrompt, temperature, maxTokens) {
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
    return { success: false, error: data.error.message || 'Claude API error' };
  }
  
  const text = data.content?.[0]?.text || '';
  return { success: true, text };
}

async function callCustomAPI(apiKey, model, endpoint, prompt, systemPrompt, temperature, maxTokens) {
  const fetch = require('node-fetch');
  
  if (!endpoint) {
    return { success: false, error: 'Custom endpoint is required' };
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
    return { success: false, error: data.error.message || 'API error' };
  }
  
  const text = data.choices?.[0]?.message?.content || data.response || data.text || '';
  return { success: true, text };
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
      if (['yes','y','có','co','ok','1','true','đồng ý'].includes(l)) return { valid: true, value: 'yes' };
      if (['no','n','không','khong','ko','0','false','từ chối'].includes(l)) return { valid: true, value: 'no' };
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
  
  // Match {variable} hoặc {variable.property} hoặc {variable.property.subproperty}
  return text.replace(/\{([^}]+)\}/g, (match, key) => {
    // Kiểm tra nếu có dot notation (nested property)
    if (key.includes('.')) {
      const parts = key.split('.');
      let value = context;
      
      for (const part of parts) {
        if (value === undefined || value === null) {
          return match; // Giữ nguyên nếu không tìm thấy
        }
        value = value[part];
      }
      
      // Nếu value là object, stringify nó
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value);
      }
      return match;
    }
    
    // Simple variable
    const value = context[key];
    if (value !== undefined && value !== null) {
      // Nếu value là object, stringify nó
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    }
    return match;
  });
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
  
  apiState.clients.forEach(ws => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'new_message', uid: senderId, message: msg })); } catch(e){} });
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

module.exports = { autoReplyState, processAutoReply, handleAutoReplyMessage };