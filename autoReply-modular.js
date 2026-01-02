// autoReply-modular.js - Auto Reply v5.0 - Modular Architecture
// Sử dụng block registry để execute các blocks

const triggerDB = require('./triggerDB');
const blockRegistry = require('./blocks');

// ========================================
// STATE
// ========================================
const autoReplyState = {
  enabled: false,
  stats: { received: 0, replied: 0, skipped: 0, flowExecuted: 0 },
  cooldowns: new Map(),
  botActiveStates: new Map(),
  pendingInputs: new Map()
};

const flowProcessLog = [];

// ========================================
// HELPER FUNCTIONS
// ========================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function substituteVariables(text, context) {
  if (!text) return '';
  return text.replace(/\{(\w+)\}/g, (match, varName) => {
    if (context[varName] !== undefined) {
      return String(context[varName]);
    }
    return match;
  });
}

async function sendMessage(apiState, userId, message, userUID) {
  if (!apiState.api || !message) return;
  try {
    const { ThreadType } = require('zca-js');
    await apiState.api.sendMessage({ msg: message, quote: null }, userId, ThreadType.User);
    autoReplyState.stats.replied++;
  } catch (err) {
    console.error(`❌ Send message error: ${err.message}`);
  }
}

function logFlowProcess(processId, event, data = {}) {
  flowProcessLog.push({
    processId,
    event,
    data,
    timestamp: Date.now()
  });
  // Keep only last 100 entries
  if (flowProcessLog.length > 100) flowProcessLog.shift();
}

// ========================================
// INPUT VALIDATION
// ========================================
function validateInput(value, expectedType) {
  if (!expectedType || expectedType === 'none' || expectedType === 'text') return true;
  
  const validators = {
    number: (v) => !isNaN(parseFloat(v)),
    phone: (v) => /^(0|\+84)[0-9]{9,10}$/.test(v.replace(/\s/g, '')),
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    yesno: (v) => ['có', 'không', 'yes', 'no', 'đúng', 'sai', '1', '0'].includes(v.toLowerCase()),
    picture: (v) => true, // Will be validated by message type
    file: (v) => true
  };
  
  return validators[expectedType] ? validators[expectedType](value) : true;
}

// ========================================
// MAIN PROCESS
// ========================================
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
        pendingInput = {
          ...dbState,
          questions: dbState.questions ? JSON.parse(dbState.questions) : [],
          flowContext: dbState.flowContext ? JSON.parse(dbState.flowContext) : {}
        };
        autoReplyState.pendingInputs.set(pendingKey, pendingInput);
      }
    }

    if (pendingInput) {
      await handleUserInputResponse(apiState, senderId, content, pendingInput, userUID);
      return;
    }

    // ========== FIND MATCHING TRIGGER ==========
    const trigger = triggerDB.findMatchingTrigger(userUID, content, senderId, isFriend);
    if (!trigger) {
      autoReplyState.stats.skipped++;
      return;
    }

    // ========== COOLDOWN CHECK ==========
    const cooldownKey = `${trigger.triggerID}_${senderId}`;
    const lastRun = autoReplyState.cooldowns.get(cooldownKey);
    if (lastRun && Date.now() - lastRun < trigger.cooldown) {
      console.log(`⏸️ Cooldown active for trigger ${trigger.triggerID}`);
      return;
    }
    autoReplyState.cooldowns.set(cooldownKey, Date.now());

    // ========== EXECUTE ==========
    console.log(`✅ Matched trigger: ${trigger.triggerName} (ID:${trigger.triggerID})`);

    if (trigger.setMode === 1) {
      await executeFlow(apiState, senderId, trigger, content, userUID);
    } else if (trigger.triggerContent) {
      const response = substituteVariables(trigger.triggerContent, {
        message: content,
        sender_id: senderId
      });
      await sendMessage(apiState, senderId, response, userUID);
    }

    triggerDB.logActivity(userUID, 'trigger_executed', trigger.triggerID, trigger.triggerName, {
      senderId, message: content.substring(0, 100)
    });

  } catch (err) {
    console.error('❌ AutoReply error:', err.message);
  }
}

// ========================================
// EXECUTE FLOW
// ========================================
async function executeFlow(apiState, senderId, trigger, messageContent, userUID) {
  const processId = `${trigger.triggerID}_${Date.now()}`;
  console.log(`\n🚀 [FLOW] Starting: ${trigger.triggerName}`);
  logFlowProcess(processId, 'FLOW_START', { triggerId: trigger.triggerID });

  const flow = triggerDB.getFlowByTrigger(trigger.triggerID);
  if (!flow || !flow.blocks || flow.blocks.length === 0) {
    console.log('  ⚠️ No flow blocks found');
    return;
  }

  // Build context
  const senderInfo = apiState.friends?.find(f => f.userId === senderId);
  const context = {
    message: messageContent,
    sender_id: senderId,
    sender_name: senderInfo?.displayName || senderInfo?.name || 'User',
    timestamp: Date.now()
  };

  // Load existing variables
  const existingVars = triggerDB.getAllVariables(userUID, senderId);
  existingVars.forEach(v => { context[v.variableName] = v.variableValue; });

  // Get root blocks (no parent)
  const rootBlocks = flow.blocks
    .filter(b => !b.parentBlockID)
    .sort((a, b) => a.blockOrder - b.blockOrder);

  console.log(`  📦 ${rootBlocks.length} root blocks to execute`);

  // Helpers object for blocks
  const helpers = {
    sendMessage,
    substituteVariables,
    sleep,
    triggerDB,
    executeFlow,
    autoReplyState
  };

  // Execute blocks
  for (let i = 0; i < rootBlocks.length; i++) {
    const block = rootBlocks[i];
    const result = await executeBlock(
      apiState, senderId, block, flow, context, userUID, 
      i + 1, rootBlocks.length, processId, helpers
    );
    
    // Check if should stop (e.g., waiting for user input)
    if (result && result.shouldStop) {
      console.log(`  ⏸️ Flow paused - waiting for input`);
      break;
    }
  }

  autoReplyState.stats.flowExecuted++;
  console.log(`✅ [FLOW] Completed: ${trigger.triggerName}\n`);
  logFlowProcess(processId, 'FLOW_COMPLETE');
}

// ========================================
// EXECUTE SINGLE BLOCK
// ========================================
async function executeBlock(apiState, senderId, block, flow, context, userUID, num, total, processId, helpers) {
  const data = block.blockData || {};
  console.log(`  [${num}/${total}] ${block.blockType} (ID:${block.blockID})`);
  logFlowProcess(processId, 'BLOCK_START', { blockId: block.blockID, blockType: block.blockType });

  try {
    // Use block registry to execute
    const result = await blockRegistry.executeBlock(block.blockType, {
      block,
      data,
      context,
      apiState,
      senderId,
      userUID,
      flow,
      helpers
    });

    logFlowProcess(processId, 'BLOCK_COMPLETE', { blockId: block.blockID, result });

    // Check if should stop flow
    if (result && result.shouldContinue === false) {
      return { shouldStop: true };
    }

    return { shouldStop: false };

  } catch (err) {
    console.error(`    ❌ Error in block ${block.blockID}: ${err.message}`);
    logFlowProcess(processId, 'BLOCK_ERROR', { blockId: block.blockID, error: err.message });
    return { shouldStop: false };
  }
}

// ========================================
// USER INPUT HANDLER
// ========================================
async function handleUserInputResponse(apiState, senderId, userMessage, inputState, userUID) {
  console.log(`👂 Processing input from ${senderId}`);

  const pendingKey = `${userUID}_${senderId}`;
  const questions = inputState.questions || [];
  const currentIndex = inputState.currentQuestionIndex || 0;
  const retryCount = inputState.retryCount || 0;
  const flowContext = inputState.flowContext || {};

  if (questions.length === 0 || !questions[currentIndex]) {
    console.log(`  ⚠️ No questions found, clearing state`);
    autoReplyState.pendingInputs.delete(pendingKey);
    triggerDB.clearInputState(userUID, senderId);
    return;
  }

  const currentQuestion = questions[currentIndex];
  const expectedType = currentQuestion.expectedType || 'text';
  const variableName = currentQuestion.variableName || '';
  const maxRetries = currentQuestion.maxRetries || 2;
  const retryMessage = currentQuestion.retryMessage || '';

  // Validate input
  if (!validateInput(userMessage, expectedType)) {
    if (retryCount >= maxRetries) {
      console.log(`  ❌ Max retries reached, clearing state`);
      await sendMessage(apiState, senderId, '❌ Đã hết số lần thử. Vui lòng bắt đầu lại.', userUID);
      autoReplyState.pendingInputs.delete(pendingKey);
      triggerDB.clearInputState(userUID, senderId);
      return;
    }

    // Send retry message
    const msg = retryMessage || `⚠️ Vui lòng nhập đúng định dạng (${expectedType})`;
    await sendMessage(apiState, senderId, msg, userUID);
    
    // Update retry count
    inputState.retryCount = retryCount + 1;
    autoReplyState.pendingInputs.set(pendingKey, inputState);
    triggerDB.incrementRetry(userUID, senderId);
    return;
  }

  // Save variable
  if (variableName) {
    triggerDB.setVariable(userUID, senderId, variableName, userMessage, expectedType);
    flowContext[variableName] = userMessage;
  }

  // Move to next question or continue flow
  const nextIndex = currentIndex + 1;
  
  if (nextIndex < questions.length) {
    // More questions
    const nextQuestion = questions[nextIndex];
    const nextMsg = substituteVariables(nextQuestion.message || '', flowContext);
    
    if (nextMsg) {
      await sendMessage(apiState, senderId, nextMsg, userUID);
    }

    inputState.currentQuestionIndex = nextIndex;
    inputState.retryCount = 0;
    inputState.flowContext = flowContext;
    autoReplyState.pendingInputs.set(pendingKey, inputState);
    
    triggerDB.updateInputState(userUID, senderId, {
      currentQuestionIndex: nextIndex,
      expectedType: nextQuestion.expectedType || 'text',
      variableName: nextQuestion.variableName || '',
      retryCount: 0,
      flowContext: JSON.stringify(flowContext)
    });

  } else {
    // All questions answered - continue flow
    console.log(`  ✅ All questions answered, continuing flow`);
    
    autoReplyState.pendingInputs.delete(pendingKey);
    triggerDB.clearInputState(userUID, senderId);

    // Get trigger and continue
    const trigger = triggerDB.getTriggerById(inputState.triggerID);
    if (trigger && trigger.setMode === 1) {
      const flow = triggerDB.getFlowByTrigger(trigger.triggerID);
      if (flow && flow.blocks) {
        const nextBlocks = flow.blocks
          .filter(b => !b.parentBlockID && b.blockOrder > inputState.nextBlockOrder - 1)
          .sort((a, b) => a.blockOrder - b.blockOrder);

        const helpers = {
          sendMessage,
          substituteVariables,
          sleep,
          triggerDB,
          executeFlow,
          autoReplyState
        };

        for (const block of nextBlocks) {
          await executeBlock(apiState, senderId, block, flow, flowContext, userUID, 
            block.blockOrder + 1, flow.blocks.length, `continue_${Date.now()}`, helpers);
        }
      }
    }
  }
}

// ========================================
// EXPORTS
// ========================================
module.exports = {
  autoReplyState,
  processAutoReply,
  executeFlow,
  setEnabled(val) { autoReplyState.enabled = val; },
  isEnabled() { return autoReplyState.enabled; },
  getStats() { return autoReplyState.stats; },
  resetStats() {
    autoReplyState.stats = { received: 0, replied: 0, skipped: 0, flowExecuted: 0 };
  }
};
