// autoReply.js - Auto Reply v4.4 - FIXED CONDITION TO RUN FLOWS
// Fix: condition chạy flow khác thay vì tìm child blocks
const triggerDB = require('./triggerDB');

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
            const fetch = require('node-fetch');
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
        if (data.saveResponseTo) {
          const resp = `[AI: ${(data.prompt||'').substring(0,20)}...]`;
          triggerDB.setVariable(userUID, senderId, data.saveResponseTo, resp, 'text', block.blockID, flow.flowID);
          context[data.saveResponseTo] = resp;
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
  
  // Load all variables
  const vars = triggerDB.getAllVariables(userUID, senderId);
  vars.forEach(v => { context[v.variableName] = v.variableValue; });

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