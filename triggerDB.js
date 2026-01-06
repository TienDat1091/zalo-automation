// triggerDB.js - SQLite Database cho Trigger System v4
// Với Variables table và Flow Conditions support
const dbModule = require('./system/db');

let db = null;

// Enums
const AutoReplyScope = {
  Everyone: 0,
  Stranger: 1,
  SpecificFriends: 2,
  FriendsExcept: 3
};

const TriggerMode = {
  Direct: 0,
  Flow: 1
};

const VariableType = {
  Text: 'text',
  Number: 'number',
  Phone: 'phone',
  Email: 'email',
  Boolean: 'boolean',
  Date: 'date',
  Any: 'any'
};

const InputValidation = {
  None: 'none',
  Text: 'text',
  Number: 'number',
  Phone: 'phone',
  Email: 'email',
  Picture: 'picture',
  File: 'file',
  YesNo: 'yesno'
};

module.exports = {
  AutoReplyScope,
  TriggerMode,
  VariableType,
  InputValidation,

  init() {
    try {
      db = dbModule.initDB();
      db.pragma('journal_mode = WAL');
      console.log('✅ SQLite database connected:', dbModule.DB_PATH || 'triggers.db');
      dbModule.createTables(db);
      return true;
    } catch (error) {
      console.error('❌ SQLite init error:', error.message);
      return false;
    }
  },

  

  // ========================================
  // TRIGGERS CRUD
  // ========================================
  createTrigger(data) {
    try {
      const stmt = db.prepare(`
        INSERT INTO triggers (triggerName, triggerKey, triggerUserID, triggerContent, 
          timeStartActive, timeEndActive, dateStartActive, dateEndActive, 
          cooldown, scope, uids, enabled, setMode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        data.triggerName || 'New Trigger',
        data.triggerKey || '',
        data.triggerUserID,
        data.triggerContent || '',
        data.timeStartActive || '00:00',
        data.timeEndActive || '23:59',
        data.dateStartActive || null,
        data.dateEndActive || null,
        data.cooldown || 30000,
        data.scope ?? AutoReplyScope.Everyone,
        data.uids ? JSON.stringify(data.uids) : null,
        data.enabled !== false ? 1 : 0,
        data.setMode ?? TriggerMode.Direct
      );

      const triggerID = result.lastInsertRowid;
      
      // Auto create flow if setMode is Flow
      if (data.setMode === TriggerMode.Flow) {
        this.createFlow(triggerID, `Flow: ${data.triggerName}`);
      }

      return this.getTriggerById(triggerID);
    } catch (error) {
      console.error('❌ Create trigger error:', error.message);
      return null;
    }
  },

  getTriggerById(triggerID) {
    try {
      const trigger = db.prepare('SELECT * FROM triggers WHERE triggerID = ?').get(triggerID);
      if (trigger) {
        const formatted = this._formatTrigger(trigger);
        if (trigger.setMode === TriggerMode.Flow) {
          formatted.flow = this.getFlowByTrigger(triggerID);
        }
        return formatted;
      }
      return null;
    } catch (error) {
      console.error('❌ Get trigger error:', error.message);
      return null;
    }
  },

  getTriggersByUser(userUID) {
    try {
      const triggers = db.prepare('SELECT * FROM triggers WHERE triggerUserID = ? ORDER BY timeCreated DESC').all(userUID);
      return triggers.map(t => {
        const formatted = this._formatTrigger(t);
        if (t.setMode === TriggerMode.Flow) {
          formatted.flow = this.getFlowByTrigger(t.triggerID);
        }
        return formatted;
      });
    } catch (error) {
      console.error('❌ Get triggers error:', error.message);
      return [];
    }
  },

  getEnabledTriggers(userUID) {
    try {
      const triggers = db.prepare('SELECT * FROM triggers WHERE triggerUserID = ? AND enabled = 1').all(userUID);
      return triggers.map(t => this._formatTrigger(t));
    } catch (error) {
      console.error('❌ Get enabled triggers error:', error.message);
      return [];
    }
  },

  updateTrigger(triggerID, updates) {
    try {
      const fields = [];
      const values = [];

      const allowedFields = ['triggerName', 'triggerKey', 'triggerContent', 
        'timeStartActive', 'timeEndActive', 'dateStartActive', 'dateEndActive',
        'cooldown', 'scope', 'uids', 'enabled', 'setMode'];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);
          if (key === 'uids' && Array.isArray(value)) {
            values.push(JSON.stringify(value));
          } else if (key === 'enabled') {
            values.push(value ? 1 : 0);
          } else {
            values.push(value);
          }
        }
      }

      if (fields.length === 0) return null;

      fields.push('timeUpdate = ?');
      values.push(Date.now());
      values.push(triggerID);

      const sql = `UPDATE triggers SET ${fields.join(', ')} WHERE triggerID = ?`;
      db.prepare(sql).run(...values);

      // Create flow if switching to Flow mode
      if (updates.setMode === TriggerMode.Flow && !this.getFlowByTrigger(triggerID)) {
        const trigger = this.getTriggerById(triggerID);
        this.createFlow(triggerID, `Flow: ${trigger?.triggerName || 'Trigger'}`);
      }

      return this.getTriggerById(triggerID);
    } catch (error) {
      console.error('❌ Update trigger error:', error.message);
      return null;
    }
  },

  toggleTrigger(triggerID) {
    try {
      const trigger = db.prepare('SELECT enabled FROM triggers WHERE triggerID = ?').get(triggerID);
      if (!trigger) return null;

      const newEnabled = trigger.enabled ? 0 : 1;
      db.prepare('UPDATE triggers SET enabled = ?, timeUpdate = ? WHERE triggerID = ?')
        .run(newEnabled, Date.now(), triggerID);

      return this.getTriggerById(triggerID);
    } catch (error) {
      console.error('❌ Toggle trigger error:', error.message);
      return null;
    }
  },

  deleteTrigger(triggerID) {
    try {
      db.prepare('DELETE FROM triggers WHERE triggerID = ?').run(triggerID);
      return true;
    } catch (error) {
      console.error('❌ Delete trigger error:', error.message);
      return false;
    }
  },

  findMatchingTrigger(userUID, messageContent, senderId, isFriend) {
    try {
      const triggers = this.getEnabledTriggers(userUID);
      const lowerContent = messageContent.toLowerCase().trim();
      const now = new Date();

      for (const trigger of triggers) {
        // Check time range
        if (!this._isWithinTimeRange(now, trigger.schedule.startTime, trigger.schedule.endTime)) continue;
        
        // Check date range
        if (!this._isWithinDateRange(now, trigger.dateStartActive, trigger.dateEndActive)) continue;

        // Check scope
        if (!this._checkScope(trigger, senderId, isFriend)) continue;

        // Check keywords
        const keywords = trigger.keywords || [];
        for (const keyword of keywords) {
          if (lowerContent.includes(keyword.toLowerCase())) {
            return trigger;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Find matching trigger error:', error.message);
      return null;
    }
  },

  _formatTrigger(row) {
    return {
      triggerID: row.triggerID,
      id: row.triggerID,
      triggerName: row.triggerName,
      name: row.triggerName,
      triggerKey: row.triggerKey,
      keywords: row.triggerKey ? row.triggerKey.split(',').map(k => k.trim()).filter(k => k) : [],
      triggerContent: row.triggerContent,
      response: row.triggerContent,
      triggerUserID: row.triggerUserID,
      userUID: row.triggerUserID,
      timeCreated: row.timeCreated,
      createdAt: row.timeCreated,
      timeUpdate: row.timeUpdate,
      updatedAt: row.timeUpdate,
      schedule: {
        startTime: row.timeStartActive || '00:00',
        endTime: row.timeEndActive || '23:59'
      },
      timeStartActive: row.timeStartActive,
      timeEndActive: row.timeEndActive,
      dateStartActive: row.dateStartActive,
      dateEndActive: row.dateEndActive,
      cooldown: row.cooldown || 30000,
      scope: row.scope ?? 0,
      uids: row.uids ? JSON.parse(row.uids) : [],
      enabled: row.enabled === 1,
      setMode: row.setMode ?? 0
    };
  },

  _isWithinTimeRange(now, startTime, endTime) {
    if (!startTime || !endTime) return true;
    const currentTime = now.toTimeString().slice(0, 5);
    return currentTime >= startTime && currentTime <= endTime;
  },

  _isWithinDateRange(now, startDate, endDate) {
    if (!startDate && !endDate) return true;
    const today = now.toISOString().slice(0, 10);
    if (startDate && today < startDate) return false;
    if (endDate && today > endDate) return false;
    return true;
  },

  _checkScope(trigger, senderId, isFriend) {
    const scope = trigger.scope ?? 0;
    const uids = trigger.uids || [];

    switch (scope) {
      case AutoReplyScope.Everyone:
        return true;
      case AutoReplyScope.Stranger:
        return !isFriend;
      case AutoReplyScope.SpecificFriends:
        return uids.includes(senderId);
      case AutoReplyScope.FriendsExcept:
        return !uids.includes(senderId);
      default:
        return true;
    }
  },

  // ========================================
  // FLOWS CRUD
  // ========================================
  createFlow(triggerID, flowName) {
    try {
      const stmt = db.prepare(`
        INSERT INTO flows (triggerID, flowName)
        VALUES (?, ?)
      `);
      const result = stmt.run(triggerID, flowName || `Flow #${triggerID}`);
      return this.getFlowById(result.lastInsertRowid);
    } catch (error) {
      console.error('❌ Create flow error:', error.message);
      return null;
    }
  },

  getFlowById(flowID) {
    try {
      const flow = db.prepare('SELECT * FROM flows WHERE flowID = ?').get(flowID);
      if (flow) {
        flow.blocks = this.getFlowBlocks(flowID);
      }
      return flow;
    } catch (error) {
      console.error('❌ Get flow error:', error.message);
      return null;
    }
  },

  getFlowByTrigger(triggerID) {
    try {
      const flow = db.prepare('SELECT * FROM flows WHERE triggerID = ?').get(triggerID);
      if (flow) {
        flow.blocks = this.getFlowBlocks(flow.flowID);
      }
      return flow;
    } catch (error) {
      console.error('❌ Get flow by trigger error:', error.message);
      return null;
    }
  },

  updateFlow(flowID, updates) {
    try {
      const fields = [];
      const values = [];

      if (updates.flowName !== undefined) {
        fields.push('flowName = ?');
        values.push(updates.flowName);
      }
      if (updates.flowDescription !== undefined) {
        fields.push('flowDescription = ?');
        values.push(updates.flowDescription);
      }
      if (updates.isActive !== undefined) {
        fields.push('isActive = ?');
        values.push(updates.isActive ? 1 : 0);
      }

      if (fields.length === 0) return this.getFlowById(flowID);

      fields.push('updatedAt = ?');
      values.push(Date.now());
      values.push(flowID);

      db.prepare(`UPDATE flows SET ${fields.join(', ')} WHERE flowID = ?`).run(...values);
      return this.getFlowById(flowID);
    } catch (error) {
      console.error('❌ Update flow error:', error.message);
      return null;
    }
  },

  deleteFlow(flowID) {
    try {
      db.prepare('DELETE FROM flows WHERE flowID = ?').run(flowID);
      return true;
    } catch (error) {
      console.error('❌ Delete flow error:', error.message);
      return false;
    }
  },

  // ========================================
  // FLOW BLOCKS CRUD
  // ========================================
  getFlowBlocks(flowID) {
    try {
      const blocks = db.prepare('SELECT * FROM flow_blocks WHERE flowID = ? ORDER BY blockOrder').all(flowID);
      return blocks.map(b => {
        const block = {
          ...b,
          blockData: b.blockData ? JSON.parse(b.blockData) : {}
        };
        
        return block;
      });
    } catch (error) {
      console.error('❌ Get flow blocks error:', error.message);
      return [];
    }
  },

  getFlowBlockById(blockID) {
    try {
      const block = db.prepare('SELECT * FROM flow_blocks WHERE blockID = ?').get(blockID);
      if (block) {
        block.blockData = block.blockData ? JSON.parse(block.blockData) : {};
      }
      return block;
    } catch (error) {
      console.error('❌ Get flow block error:', error.message);
      return null;
    }
  },

  addFlowBlock(flowID, blockType, blockData = {}, blockOrder = null, parentBlockID = null, branchType = null, condition1 = null, condition2 = null) {
    try {
      if (blockOrder === null) {
        // Tính blockOrder riêng cho các block cùng parent và branchType
        let query, params;
        if (parentBlockID && branchType) {
          query = 'SELECT MAX(blockOrder) as max FROM flow_blocks WHERE flowID = ? AND parentBlockID = ? AND branchType = ?';
          params = [flowID, parentBlockID, branchType];
        } else if (parentBlockID) {
          query = 'SELECT MAX(blockOrder) as max FROM flow_blocks WHERE flowID = ? AND parentBlockID = ?';
          params = [flowID, parentBlockID];
        } else {
          query = 'SELECT MAX(blockOrder) as max FROM flow_blocks WHERE flowID = ? AND parentBlockID IS NULL';
          params = [flowID];
        }
        const maxOrder = db.prepare(query).get(...params);
        blockOrder = (maxOrder?.max ?? -1) + 1;
      }

      const stmt = db.prepare(`
        INSERT INTO flow_blocks (flowID, blockType, blockData, blockOrder, parentBlockID, branchType, condition1, condition2)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        flowID,
        blockType,
        JSON.stringify(blockData),
        blockOrder,
        parentBlockID,
        branchType,
        condition1,
        condition2
      );

      return this.getFlowBlockById(result.lastInsertRowid);
    } catch (error) {
      console.error('❌ Add flow block error:', error.message);
      return null;
    }
  },

  updateFlowBlock(blockID, updates) {
    try {
      const fields = [];
      const values = [];

      if (updates.blockType !== undefined) {
        fields.push('blockType = ?');
        values.push(updates.blockType);
      }
      if (updates.blockData !== undefined) {
        fields.push('blockData = ?');
        values.push(JSON.stringify(updates.blockData));
      }
      if (updates.blockOrder !== undefined) {
        fields.push('blockOrder = ?');
        values.push(updates.blockOrder);
      }
      if (updates.parentBlockID !== undefined) {
        fields.push('parentBlockID = ?');
        values.push(updates.parentBlockID);
      }
      if (updates.branchType !== undefined) {
        fields.push('branchType = ?');
        values.push(updates.branchType);
      }
      if (updates.condition1 !== undefined) {
        fields.push('condition1 = ?');
        values.push(updates.condition1);
      }
      if (updates.condition2 !== undefined) {
        fields.push('condition2 = ?');
        values.push(updates.condition2);
      }

      if (fields.length === 0) return this.getFlowBlockById(blockID);

      values.push(blockID);
      db.prepare(`UPDATE flow_blocks SET ${fields.join(', ')} WHERE blockID = ?`).run(...values);

      return this.getFlowBlockById(blockID);
    } catch (error) {
      console.error('❌ Update flow block error:', error.message);
      return null;
    }
  },

  deleteFlowBlock(blockID) {
    try {
      // Xóa tất cả block con trước
      db.prepare('DELETE FROM flow_blocks WHERE parentBlockID = ?').run(blockID);
      // Xóa block chính
      db.prepare('DELETE FROM flow_blocks WHERE blockID = ?').run(blockID);
      return true;
    } catch (error) {
      console.error('❌ Delete flow block error:', error.message);
      return false;
    }
  },

  reorderFlowBlocks(flowID, blockIds) {
    try {
      const updateStmt = db.prepare('UPDATE flow_blocks SET blockOrder = ? WHERE blockID = ? AND flowID = ?');
      
      const transaction = db.transaction(() => {
        blockIds.forEach((blockID, index) => {
          updateStmt.run(index, blockID, flowID);
        });
      });
      
      transaction();
      return true;
    } catch (error) {
      console.error('❌ Reorder blocks error:', error.message);
      return false;
    }
  },

  getChildBlocks(parentBlockID) {
    try {
      const blocks = db.prepare('SELECT * FROM flow_blocks WHERE parentBlockID = ? ORDER BY blockOrder').all(parentBlockID);
      return blocks.map(b => ({
        ...b,
        blockData: b.blockData ? JSON.parse(b.blockData) : {}
      }));
    } catch (error) {
      console.error('❌ Get child blocks error:', error.message);
      return [];
    }
  },

  // ========================================
  // VARIABLES CRUD
  // ========================================
  setVariable(userUID, conversationID, variableName, variableValue, variableType = 'text', blockID = null, flowID = null, expiresInMinutes = null) {
    try {
      const expiresAt = expiresInMinutes ? Date.now() + (expiresInMinutes * 60 * 1000) : null;
      
      const stmt = db.prepare(`
        INSERT INTO variables (userUID, conversationID, variableName, variableValue, variableType, blockID, flowID, expiresAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userUID, conversationID, variableName) 
        DO UPDATE SET variableValue = ?, variableType = ?, blockID = ?, flowID = ?, expiresAt = ?, updatedAt = ?
      `);

      stmt.run(
        userUID, conversationID, variableName, variableValue, variableType, blockID, flowID, expiresAt, Date.now(),
        variableValue, variableType, blockID, flowID, expiresAt, Date.now()
      );

      return this.getVariable(userUID, conversationID, variableName);
    } catch (error) {
      console.error('❌ Set variable error:', error.message);
      return null;
    }
  },

  getVariable(userUID, conversationID, variableName) {
    try {
      const variable = db.prepare(`
        SELECT * FROM variables 
        WHERE userUID = ? AND conversationID = ? AND variableName = ?
        AND (expiresAt IS NULL OR expiresAt > ?)
      `).get(userUID, conversationID, variableName, Date.now());
      return variable;
    } catch (error) {
      console.error('❌ Get variable error:', error.message);
      return null;
    }
  },

  getAllVariables(userUID, conversationID) {
    try {
      const variables = db.prepare(`
        SELECT * FROM variables 
        WHERE userUID = ? AND conversationID = ?
        AND (expiresAt IS NULL OR expiresAt > ?)
        ORDER BY variableName
      `).all(userUID, conversationID, Date.now());
      return variables;
    } catch (error) {
      console.error('❌ Get all variables error:', error.message);
      return [];
    }
  },

  // Lấy tất cả biến của user (không cần conversationID) - dùng cho File Manager
  getAllVariablesByUser(userUID) {
    try {
      const variables = db.prepare(`
        SELECT DISTINCT variableName, variableValue, variableType, conversationID, updatedAt
        FROM variables 
        WHERE userUID = ?
        AND (expiresAt IS NULL OR expiresAt > ?)
        ORDER BY variableName ASC, updatedAt DESC
      `).all(userUID, Date.now());
      
      // Loại bỏ trùng lặp, giữ lại giá trị mới nhất cho mỗi variableName
      const uniqueVars = {};
      variables.forEach(v => {
        if (!uniqueVars[v.variableName]) {
          uniqueVars[v.variableName] = v;
        }
      });
      
      return Object.values(uniqueVars);
    } catch (error) {
      console.error('❌ Get all variables by user error:', error.message);
      return [];
    }
  },

  deleteVariable(userUID, conversationID, variableName) {
    try {
      db.prepare('DELETE FROM variables WHERE userUID = ? AND conversationID = ? AND variableName = ?')
        .run(userUID, conversationID, variableName);
      return true;
    } catch (error) {
      console.error('❌ Delete variable error:', error.message);
      return false;
    }
  },

  clearVariables(userUID, conversationID) {
    try {
      db.prepare('DELETE FROM variables WHERE userUID = ? AND conversationID = ?')
        .run(userUID, conversationID);
      return true;
    } catch (error) {
      console.error('❌ Clear variables error:', error.message);
      return false;
    }
  },

  cleanExpiredVariables() {
    try {
      db.prepare('DELETE FROM variables WHERE expiresAt IS NOT NULL AND expiresAt < ?').run(Date.now());
      return true;
    } catch (error) {
      console.error('❌ Clean expired variables error:', error.message);
      return false;
    }
  },

  // ========================================
  // USER INPUT STATES
  // ========================================
  setInputState(userUID, conversationID, blockID, flowID, triggerID, config) {
    try {
      const expiresAt = Date.now() + ((config.timeoutMinutes || 30) * 60 * 1000);
      
      // Xóa state cũ nếu có
      db.prepare(`DELETE FROM user_input_states WHERE userUID = ? AND conversationID = ?`).run(userUID, conversationID);
      
      const stmt = db.prepare(`
        INSERT INTO user_input_states 
        (userUID, conversationID, blockID, flowID, triggerID, expectedType, variableName, 
         maxRetries, timeoutMinutes, expiresAt, questions, currentQuestionIndex, flowContext, 
         nextBlockOrder, retryMessage, timeoutMessage, isActive, createdAt, retryCount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0)
      `);

      stmt.run(
        userUID, conversationID, blockID, flowID, triggerID,
        config.expectedType || 'text',
        config.variableName || null,
        config.maxRetries || 3,
        config.timeoutMinutes || 30,
        expiresAt,
        config.questions || null,
        config.currentQuestionIndex || 0,
        config.flowContext || null,
        config.nextBlockOrder || 0,
        config.retryMessage || null,
        config.timeoutMessage || null,
        Date.now()
      );

      return this.getInputState(userUID, conversationID);
    } catch (error) {
      console.error('❌ Set input state error:', error.message);
      return null;
    }
  },

  getInputState(userUID, conversationID) {
    try {
      const state = db.prepare(`
        SELECT * FROM user_input_states 
        WHERE userUID = ? AND conversationID = ? AND isActive = 1 AND expiresAt > ?
      `).get(userUID, conversationID, Date.now());
      return state;
    } catch (error) {
      console.error('❌ Get input state error:', error.message);
      return null;
    }
  },

  incrementRetry(userUID, conversationID) {
    try {
      db.prepare(`
        UPDATE user_input_states 
        SET retryCount = retryCount + 1 
        WHERE userUID = ? AND conversationID = ? AND isActive = 1
      `).run(userUID, conversationID);
      return this.getInputState(userUID, conversationID);
    } catch (error) {
      console.error('❌ Increment retry error:', error.message);
      return null;
    }
  },

  clearInputState(userUID, conversationID) {
    try {
      db.prepare('UPDATE user_input_states SET isActive = 0 WHERE userUID = ? AND conversationID = ?')
        .run(userUID, conversationID);
      return true;
    } catch (error) {
      console.error('❌ Clear input state error:', error.message);
      return false;
    }
  },

  cleanExpiredInputStates() {
    try {
      db.prepare('UPDATE user_input_states SET isActive = 0 WHERE expiresAt < ?').run(Date.now());
      return true;
    } catch (error) {
      console.error('❌ Clean expired states error:', error.message);
      return false;
    }
  },

  // Update input state (for multi-question flow)
  updateInputState(userUID, conversationID, updates) {
    try {
      const fields = [];
      const values = [];
      
      if (updates.currentQuestionIndex !== undefined) {
        fields.push('currentQuestionIndex = ?');
        values.push(updates.currentQuestionIndex);
      }
      if (updates.expectedType !== undefined) {
        fields.push('expectedType = ?');
        values.push(updates.expectedType);
      }
      if (updates.variableName !== undefined) {
        fields.push('variableName = ?');
        values.push(updates.variableName);
      }
      if (updates.maxRetries !== undefined) {
        fields.push('maxRetries = ?');
        values.push(updates.maxRetries);
      }
      if (updates.retryCount !== undefined) {
        fields.push('retryCount = ?');
        values.push(updates.retryCount);
      }
      if (updates.nextBlockOrder !== undefined) {
        fields.push('nextBlockOrder = ?');
        values.push(updates.nextBlockOrder);
      }
      if (updates.flowContext !== undefined) {
        fields.push('flowContext = ?');
        values.push(updates.flowContext);
      }
      
      if (fields.length === 0) return null;
      
      values.push(userUID, conversationID);
      
      db.prepare(`UPDATE user_input_states SET ${fields.join(', ')} WHERE userUID = ? AND conversationID = ? AND isActive = 1`).run(...values);
      
      return this.getInputState(userUID, conversationID);
    } catch (error) {
      console.error('❌ Update input state error:', error.message);
      return null;
    }
  },

  // ========================================
  // ACTIVITY LOGS
  // ========================================
  logActivity(userUID, action, triggerID, triggerName, details = {}) {
    try {
      db.prepare(`
        INSERT INTO activity_logs (userUID, action, triggerID, triggerName, details)
        VALUES (?, ?, ?, ?, ?)
      `).run(userUID, action, triggerID, triggerName, JSON.stringify(details));
      return true;
    } catch (error) {
      console.error('❌ Log activity error:', error.message);
      return false;
    }
  },

  getActivityLogs(userUID, limit = 100) {
    try {
      const logs = db.prepare(`
        SELECT * FROM activity_logs 
        WHERE userUID = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `).all(userUID, limit);
      
      return logs.map(log => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : {}
      }));
    } catch (error) {
      console.error('❌ Get activity logs error:', error.message);
      return [];
    }
  },

  clearActivityLogs(userUID) {
    try {
      db.prepare('DELETE FROM activity_logs WHERE userUID = ?').run(userUID);
      return true;
    } catch (error) {
      console.error('❌ Clear activity logs error:', error.message);
      return false;
    }
  },

  


  // ========================================
  // PAYMENT GATES CRUD
  // ========================================
  getPaymentGates(userUID) {
    try {
      return db.prepare('SELECT * FROM payment_gates WHERE userUID = ? ORDER BY createdAt DESC').all(userUID);
    } catch (error) {
      console.error('❌ Get payment gates error:', error.message);
      return [];
    }
  },

  getPaymentGateById(gateID) {
    try {
      return db.prepare('SELECT * FROM payment_gates WHERE gateID = ?').get(gateID);
    } catch (error) {
      console.error('❌ Get payment gate error:', error.message);
      return null;
    }
  },

  createPaymentGate(userUID, data) {
    try {
      const stmt = db.prepare(`
        INSERT INTO payment_gates (userUID, gateName, bankBin, accountNumber, accountName, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(userUID, data.gateName, data.bankBin, data.accountNumber, data.accountName, data.status ? 1 : 0);
      return this.getPaymentGateById(result.lastInsertRowid);
    } catch (error) {
      console.error('❌ Create payment gate error:', error.message);
      return null;
    }
  },

  updatePaymentGate(gateID, updates) {
    try {
      const fields = [];
      const values = [];

      if (updates.gateName !== undefined) { fields.push('gateName = ?'); values.push(updates.gateName); }
      if (updates.bankBin !== undefined) { fields.push('bankBin = ?'); values.push(updates.bankBin); }
      if (updates.accountNumber !== undefined) { fields.push('accountNumber = ?'); values.push(updates.accountNumber); }
      if (updates.accountName !== undefined) { fields.push('accountName = ?'); values.push(updates.accountName); }
      if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status ? 1 : 0); }

      if (fields.length === 0) return this.getPaymentGateById(gateID);

      fields.push('updatedAt = ?');
      values.push(Date.now());
      values.push(gateID);

      db.prepare(`UPDATE payment_gates SET ${fields.join(', ')} WHERE gateID = ?`).run(...values);
      return this.getPaymentGateById(gateID);
    } catch (error) {
      console.error('❌ Update payment gate error:', error.message);
      return null;
    }
  },

  deletePaymentGate(gateID) {
    try {
      const result = db.prepare('DELETE FROM payment_gates WHERE gateID = ?').run(gateID);
      return result.changes > 0;
    } catch (error) {
      console.error('❌ Delete payment gate error:', error.message);
      return false;
    }
  },

  // ========================================
  // TRANSACTIONS CRUD
  // ========================================
  generateTransactionCode() {
    const prefix = 'DHS';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = prefix;
    for (let i = 0; i < 10; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  },

  getTransactions(userUID, limit = 100) {
    try {
      return db.prepare('SELECT * FROM transactions WHERE userUID = ? ORDER BY createdAt DESC LIMIT ?').all(userUID, limit);
    } catch (error) {
      console.error('❌ Get transactions error:', error.message);
      return [];
    }
  },

  getTransactionById(transactionID) {
    try {
      return db.prepare('SELECT * FROM transactions WHERE transactionID = ?').get(transactionID);
    } catch (error) {
      console.error('❌ Get transaction error:', error.message);
      return null;
    }
  },

  getTransactionByCode(transactionCode) {
    try {
      return db.prepare('SELECT * FROM transactions WHERE transactionCode = ?').get(transactionCode);
    } catch (error) {
      console.error('❌ Get transaction by code error:', error.message);
      return null;
    }
  },

  getWaitingTransactions(userUID) {
    try {
      return db.prepare('SELECT * FROM transactions WHERE userUID = ? AND status = ? ORDER BY createdAt DESC').all(userUID, 'WAITING');
    } catch (error) {
      console.error('❌ Get waiting transactions error:', error.message);
      return [];
    }
  },

  createTransaction(userUID, data) {
    try {
      const transactionCode = this.generateTransactionCode();
      const stmt = db.prepare(`
        INSERT INTO transactions (userUID, transactionCode, gateID, bankBin, accountNumber, accountName, amount, currency, status, customerID, customerName, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?, ?)
      `);
      const result = stmt.run(
        userUID, transactionCode, data.gateID || null, data.bankBin, data.accountNumber, data.accountName,
        data.amount, data.currency || 'VND', data.customerID || null, data.customerName || null, data.note || null
      );
      return this.getTransactionById(result.lastInsertRowid);
    } catch (error) {
      console.error('❌ Create transaction error:', error.message);
      return null;
    }
  },

  updateTransaction(transactionID, updates) {
    try {
      const fields = [];
      const values = [];

      if (updates.gateID !== undefined) { fields.push('gateID = ?'); values.push(updates.gateID); }
      if (updates.bankBin !== undefined) { fields.push('bankBin = ?'); values.push(updates.bankBin); }
      if (updates.accountNumber !== undefined) { fields.push('accountNumber = ?'); values.push(updates.accountNumber); }
      if (updates.accountName !== undefined) { fields.push('accountName = ?'); values.push(updates.accountName); }
      if (updates.amount !== undefined) { fields.push('amount = ?'); values.push(updates.amount); }
      if (updates.currency !== undefined) { fields.push('currency = ?'); values.push(updates.currency); }
      if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
      if (updates.customerID !== undefined) { fields.push('customerID = ?'); values.push(updates.customerID); }
      if (updates.customerName !== undefined) { fields.push('customerName = ?'); values.push(updates.customerName); }
      if (updates.note !== undefined) { fields.push('note = ?'); values.push(updates.note); }
      if (updates.paidAt !== undefined) { fields.push('paidAt = ?'); values.push(updates.paidAt); }

      if (fields.length === 0) return this.getTransactionById(transactionID);

      fields.push('updatedAt = ?');
      values.push(Date.now());
      values.push(transactionID);

      db.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE transactionID = ?`).run(...values);
      return this.getTransactionById(transactionID);
    } catch (error) {
      console.error('❌ Update transaction error:', error.message);
      return null;
    }
  },

  markTransactionPaid(transactionID) {
    try {
      const paidAt = Date.now();
      db.prepare('UPDATE transactions SET status = ?, paidAt = ?, updatedAt = ? WHERE transactionID = ?')
        .run('PAID', paidAt, paidAt, transactionID);
      return this.getTransactionById(transactionID);
    } catch (error) {
      console.error('❌ Mark transaction paid error:', error.message);
      return null;
    }
  },

  deleteTransaction(transactionID) {
    try {
      const result = db.prepare('DELETE FROM transactions WHERE transactionID = ?').run(transactionID);
      return result.changes > 0;
    } catch (error) {
      console.error('❌ Delete transaction error:', error.message);
      return false;
    }
  },

  // ========================================
  // PAYMENT LOGS CRUD
  // ========================================
  getPaymentLogs(userUID, limit = 100) {
    try {
      return db.prepare('SELECT * FROM payment_logs WHERE userUID = ? ORDER BY paidAt DESC LIMIT ?').all(userUID, limit);
    } catch (error) {
      console.error('❌ Get payment logs error:', error.message);
      return [];
    }
  },

  createPaymentLog(userUID, data) {
    try {
      const stmt = db.prepare(`
        INSERT INTO payment_logs (userUID, transactionID, transactionCode, bankBin, accountNumber, accountName, amount, rawData)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        userUID, data.transactionID || null, data.transactionCode, data.bankBin,
        data.accountNumber, data.accountName, data.amount, data.rawData ? JSON.stringify(data.rawData) : null
      );
      return db.prepare('SELECT * FROM payment_logs WHERE logID = ?').get(result.lastInsertRowid);
    } catch (error) {
      console.error('❌ Create payment log error:', error.message);
      return null;
    }
  },

  // ========================================
  // STATS & SEARCH
  // ========================================
  getStats(userUID) {
    try {
      const total = db.prepare('SELECT COUNT(*) as count FROM triggers WHERE triggerUserID = ?').get(userUID);
      const enabled = db.prepare('SELECT COUNT(*) as count FROM triggers WHERE triggerUserID = ? AND enabled = 1').get(userUID);
      const flows = db.prepare(`
        SELECT COUNT(*) as count FROM flows f 
        JOIN triggers t ON f.triggerID = t.triggerID 
        WHERE t.triggerUserID = ?
      `).get(userUID);
      const variables = db.prepare('SELECT COUNT(*) as count FROM variables WHERE userUID = ?').get(userUID);
      
      return {
        total: total?.count || 0,
        enabled: enabled?.count || 0,
        disabled: (total?.count || 0) - (enabled?.count || 0),
        flows: flows?.count || 0,
        variables: variables?.count || 0,
      };
    } catch (error) {
      console.error('❌ Get stats error:', error.message);
      return { total: 0, enabled: 0, disabled: 0, flows: 0, variables: 0};
    }
  },

  searchTriggers(userUID, query) {
    try {
      const searchQuery = `%${query}%`;
      const triggers = db.prepare(`
        SELECT * FROM triggers 
        WHERE triggerUserID = ? AND (triggerName LIKE ? OR triggerKey LIKE ? OR triggerContent LIKE ?)
        ORDER BY timeCreated DESC
      `).all(userUID, searchQuery, searchQuery, searchQuery);
      return triggers.map(t => this._formatTrigger(t));
    } catch (error) {
      console.error('❌ Search triggers error:', error.message);
      return [];
    }
  },

  // ========================================
  // USER TABLES CRUD (Google Sheets-like)
  // ========================================
  
  // Get all tables for user
  getUserTables(userUID) {
    try {
      const tables = db.prepare(`
        SELECT t.*, 
          (SELECT COUNT(*) FROM table_columns WHERE tableID = t.tableID) as columnCount,
          (SELECT COUNT(*) FROM table_rows WHERE tableID = t.tableID) as rowCount
        FROM user_tables t 
        WHERE t.userUID = ? 
        ORDER BY t.createdAt DESC
      `).all(userUID);
      
      // Load columns for each table
      tables.forEach(table => {
        table.columns = this.getTableColumns(table.tableID);
        table.rows = this.getTableRows(table.tableID);
      });
      
      return tables;
    } catch (error) {
      console.error('❌ Get user tables error:', error.message);
      return [];
    }
  },

  // Get single table by ID
  getUserTableById(tableID) {
    try {
      const table = db.prepare('SELECT * FROM user_tables WHERE tableID = ?').get(tableID);
      if (table) {
        table.columns = this.getTableColumns(tableID);
        table.rows = this.getTableRows(tableID);
      }
      return table;
    } catch (error) {
      console.error('❌ Get user table error:', error.message);
      return null;
    }
  },

  // Create new table
  createUserTable(userUID, data) {
    try {
      console.log(`📊 createUserTable called for user: ${userUID}`);
      console.log(`  - tableName: ${data.tableName}`);
      console.log(`  - columns provided: ${data.columns ? data.columns.length : 0}`);
      
      const stmt = db.prepare(`
        INSERT INTO user_tables (userUID, flowID, tableName, tableDescription, status)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        userUID,
        data.flowID || null,
        data.tableName || 'New Table',
        data.tableDescription || '',
        data.status !== undefined ? (data.status ? 1 : 0) : 1
      );
      
      const tableID = result.lastInsertRowid;
      console.log(`  ✓ Table created with tableID: ${tableID}`);
      
      // Tạo columns nếu có
      if (data.columns && Array.isArray(data.columns) && data.columns.length > 0) {
        const colStmt = db.prepare(`
          INSERT INTO table_columns (tableID, columnName, columnType, columnOrder, isRequired, defaultValue)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        data.columns.forEach((col, index) => {
          const colName = col.columnName || col.name || `Column ${index + 1}`;
          colStmt.run(
            tableID,
            colName,
            col.columnType || col.type || 'text',
            col.columnOrder ?? index,
            col.isRequired ? 1 : 0,
            col.defaultValue || null
          );
          console.log(`  ✓ Column created: ${colName}`);
        });
        
        console.log(`  ✅ Created ${data.columns.length} columns for table ${tableID}`);
      } else {
        console.log(`  ⚠️ No columns provided for table ${tableID}`);
      }
      
      return this.getUserTableById(tableID);
    } catch (error) {
      console.error('❌ Create user table error:', error.message);
      console.error('  Stack:', error.stack);
      return null;
    }
  },

  // Update table
  updateUserTable(tableID, updates) {
    try {
      const fields = [];
      const values = [];

      if (updates.tableName !== undefined) { fields.push('tableName = ?'); values.push(updates.tableName); }
      if (updates.tableDescription !== undefined) { fields.push('tableDescription = ?'); values.push(updates.tableDescription); }
      if (updates.flowID !== undefined) { fields.push('flowID = ?'); values.push(updates.flowID); }
      if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status ? 1 : 0); }

      if (fields.length === 0) return this.getUserTableById(tableID);

      fields.push('updatedAt = ?');
      values.push(Date.now());
      values.push(tableID);

      db.prepare(`UPDATE user_tables SET ${fields.join(', ')} WHERE tableID = ?`).run(...values);
      return this.getUserTableById(tableID);
    } catch (error) {
      console.error('❌ Update user table error:', error.message);
      return null;
    }
  },

  // Delete table (cascades to columns, rows, cells)
  deleteUserTable(tableID) {
    try {
      db.prepare('DELETE FROM user_tables WHERE tableID = ?').run(tableID);
      return true;
    } catch (error) {
      console.error('❌ Delete user table error:', error.message);
      return false;
    }
  },

  // ========================================
  // TABLE COLUMNS CRUD
  // ========================================
  
  getTableColumns(tableID) {
    try {
      return db.prepare('SELECT * FROM table_columns WHERE tableID = ? ORDER BY columnOrder').all(tableID);
    } catch (error) {
      console.error('❌ Get table columns error:', error.message);
      return [];
    }
  },

  addTableColumn(tableID, data) {
    try {
      // Get max order
      const maxOrder = db.prepare('SELECT MAX(columnOrder) as max FROM table_columns WHERE tableID = ?').get(tableID);
      const order = (maxOrder?.max ?? -1) + 1;

      // Support cả format cũ (name/type) và mới (columnName/columnType)
      const colName = data.columnName || data.name || `Column ${order + 1}`;
      const colType = data.columnType || data.type || 'text';

      const stmt = db.prepare(`
        INSERT INTO table_columns (tableID, columnName, columnType, columnOrder, isRequired, defaultValue)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        tableID,
        colName,
        colType,
        data.columnOrder ?? order,
        data.isRequired ? 1 : 0,
        data.defaultValue || null
      );
      
      // Return updated table instead of just column
      return this.getUserTableById(tableID);
    } catch (error) {
      console.error('❌ Add table column error:', error.message);
      return null;
    }
  },

  updateTableColumn(tableID, columnID, updates) {
    try {
      const fields = [];
      const values = [];

      // Support cả format cũ (name/type) và mới (columnName/columnType)
      const colName = updates.columnName || updates.name;
      const colType = updates.columnType || updates.type;
      
      if (colName !== undefined) { fields.push('columnName = ?'); values.push(colName); }
      if (colType !== undefined) { fields.push('columnType = ?'); values.push(colType); }
      if (updates.columnOrder !== undefined) { fields.push('columnOrder = ?'); values.push(updates.columnOrder); }
      if (updates.isRequired !== undefined) { fields.push('isRequired = ?'); values.push(updates.isRequired ? 1 : 0); }
      if (updates.defaultValue !== undefined) { fields.push('defaultValue = ?'); values.push(updates.defaultValue); }
      // Note: width is stored client-side, not in database

      if (fields.length === 0) return this.getUserTableById(tableID);

      values.push(columnID);
      db.prepare(`UPDATE table_columns SET ${fields.join(', ')} WHERE columnID = ?`).run(...values);
      
      // Return updated table
      return this.getUserTableById(tableID);
    } catch (error) {
      console.error('❌ Update table column error:', error.message);
      return null;
    }
  },

  deleteTableColumn(tableID, columnID) {
    try {
      // Delete all cells in this column first
      db.prepare('DELETE FROM table_cells WHERE columnID = ?').run(columnID);
      db.prepare('DELETE FROM table_columns WHERE columnID = ?').run(columnID);
      
      // Return updated table
      return this.getUserTableById(tableID);
    } catch (error) {
      console.error('❌ Delete table column error:', error.message);
      return null;
    }
  },

  // ========================================
  // TABLE ROWS CRUD
  // ========================================
  
  getTableRows(tableID) {
    try {
      const rows = db.prepare('SELECT * FROM table_rows WHERE tableID = ? ORDER BY rowOrder').all(tableID);
      const columns = this.getTableColumns(tableID);
      
      // Get cells for each row
      return rows.map(row => {
        const cells = db.prepare('SELECT * FROM table_cells WHERE rowID = ?').all(row.rowID);
        const cellMap = {};
        cells.forEach(cell => {
          cellMap[cell.columnID] = cell.cellValue;
        });
        
        // Map to column order
        row.cells = columns.map(col => ({
          columnID: col.columnID,
          columnName: col.columnName,
          value: cellMap[col.columnID] || ''
        }));
        
        // Also create rowData object for easier access (by columnID and columnName)
        row.rowData = {};
        columns.forEach(col => {
          row.rowData[col.columnID] = cellMap[col.columnID] || '';
          row.rowData[col.columnName] = cellMap[col.columnID] || '';
        });
        
        return row;
      });
    } catch (error) {
      console.error('❌ Get table rows error:', error.message);
      return [];
    }
  },

  addTableRow(tableID, cellValues = {}) {
    try {
      console.log(`📝 addTableRow called with tableID: ${tableID}`);
      
      // Kiểm tra bảng có tồn tại không
      const table = db.prepare('SELECT * FROM user_tables WHERE tableID = ?').get(tableID);
      if (!table) {
        console.error(`❌ Table ${tableID} does not exist in user_tables!`);
        return null;
      }
      console.log(`  ✓ Table exists: ${table.tableName}`);
      
      // Kiểm tra columns
      const columns = this.getTableColumns(tableID);
      console.log(`  ✓ Columns count: ${columns.length}`);
      
      if (columns.length === 0) {
        console.log(`  ⚠️ No columns found, creating row without cells`);
      }
      
      // Get max order
      const maxOrder = db.prepare('SELECT MAX(rowOrder) as max FROM table_rows WHERE tableID = ?').get(tableID);
      const order = (maxOrder?.max ?? -1) + 1;

      const stmt = db.prepare('INSERT INTO table_rows (tableID, rowOrder) VALUES (?, ?)');
      const result = stmt.run(tableID, order);
      const rowID = result.lastInsertRowid;
      console.log(`  ✓ Row inserted with rowID: ${rowID}`);

      // Insert cell values if provided and columns exist
      if (columns.length > 0) {
        const cellStmt = db.prepare(`
          INSERT INTO table_cells (rowID, columnID, cellValue)
          VALUES (?, ?, ?)
        `);

        columns.forEach(col => {
          const value = cellValues[col.columnID] || cellValues[col.columnName] || col.defaultValue || '';
          cellStmt.run(rowID, col.columnID, value);
        });
        console.log(`  ✓ Cells inserted for ${columns.length} columns`);
      }

      return this.getTableRowById(rowID);
    } catch (error) {
      console.error('❌ Add table row error:', error.message);
      console.error('  Stack:', error.stack);
      return null;
    }
  },

  getTableRowById(rowID) {
    try {
      const row = db.prepare('SELECT * FROM table_rows WHERE rowID = ?').get(rowID);
      if (row) {
        const cells = db.prepare('SELECT c.*, col.columnName FROM table_cells c JOIN table_columns col ON c.columnID = col.columnID WHERE c.rowID = ?').all(rowID);
        row.cells = cells;
      }
      return row;
    } catch (error) {
      console.error('❌ Get table row error:', error.message);
      return null;
    }
  },

  deleteTableRow(rowID) {
    try {
      db.prepare('DELETE FROM table_cells WHERE rowID = ?').run(rowID);
      db.prepare('DELETE FROM table_rows WHERE rowID = ?').run(rowID);
      return true;
    } catch (error) {
      console.error('❌ Delete table row error:', error.message);
      return false;
    }
  },

  // Delete multiple rows at once
  deleteTableRows(tableID, rowIDs) {
    try {
      if (!rowIDs || rowIDs.length === 0) return { success: false, deletedCount: 0 };
      
      let deletedCount = 0;
      for (const rowID of rowIDs) {
        // Verify row belongs to this table
        const row = db.prepare('SELECT * FROM table_rows WHERE rowID = ? AND tableID = ?').get(rowID, tableID);
        if (row) {
          db.prepare('DELETE FROM table_cells WHERE rowID = ?').run(rowID);
          db.prepare('DELETE FROM table_rows WHERE rowID = ?').run(rowID);
          deletedCount++;
        }
      }
      
      console.log(`🗑️ Deleted ${deletedCount} rows from table ${tableID}`);
      return { success: true, deletedCount };
    } catch (error) {
      console.error('❌ Delete table rows error:', error.message);
      return { success: false, deletedCount: 0, error: error.message };
    }
  },

  // ========================================
  // TABLE CELLS CRUD
  // ========================================
  
  updateTableCell(rowID, columnID, value) {
    try {
      console.log(`📝 updateTableCell: rowID=${rowID}, columnID=${columnID}, value="${value}"`);
      
      // Kiểm tra row có tồn tại không
      const row = db.prepare('SELECT * FROM table_rows WHERE rowID = ?').get(rowID);
      if (!row) {
        console.error(`  ❌ Row ${rowID} does not exist!`);
        return null;
      }
      
      // Kiểm tra column có tồn tại không
      const column = db.prepare('SELECT * FROM table_columns WHERE columnID = ?').get(columnID);
      if (!column) {
        console.error(`  ❌ Column ${columnID} does not exist!`);
        return null;
      }
      
      // Kiểm tra cell đã tồn tại chưa
      const existingCell = db.prepare('SELECT * FROM table_cells WHERE rowID = ? AND columnID = ?').get(rowID, columnID);
      const now = Date.now();
      
      if (existingCell) {
        // Update existing cell
        db.prepare('UPDATE table_cells SET cellValue = ?, updatedAt = ? WHERE rowID = ? AND columnID = ?')
          .run(value, now, rowID, columnID);
        console.log(`  ✓ Updated existing cell`);
      } else {
        // Insert new cell
        db.prepare('INSERT INTO table_cells (rowID, columnID, cellValue, updatedAt) VALUES (?, ?, ?, ?)')
          .run(rowID, columnID, value, now);
        console.log(`  ✓ Inserted new cell`);
      }
      
      // Update row's updatedAt
      db.prepare('UPDATE table_rows SET updatedAt = ? WHERE rowID = ?').run(now, rowID);
      
      return db.prepare('SELECT * FROM table_cells WHERE rowID = ? AND columnID = ?').get(rowID, columnID);
    } catch (error) {
      console.error('❌ Update table cell error:', error.message);
      console.error('  Stack:', error.stack);
      return null;
    }
  },

  // Bulk update cells for a row
  updateRowCells(rowID, cellValues) {
    try {
      const stmt = db.prepare(`
        INSERT INTO table_cells (rowID, columnID, cellValue, updatedAt)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(rowID, columnID) 
        DO UPDATE SET cellValue = ?, updatedAt = ?
      `);
      
      const now = Date.now();
      const transaction = db.transaction(() => {
        for (const [columnID, value] of Object.entries(cellValues)) {
          stmt.run(rowID, parseInt(columnID), value, now, value, now);
        }
        db.prepare('UPDATE table_rows SET updatedAt = ? WHERE rowID = ?').run(now, rowID);
      });
      
      transaction();
      return this.getTableRowById(rowID);
    } catch (error) {
      console.error('❌ Update row cells error:', error.message);
      return null;
    }
  },

  // Get full table data (for export/display)
  getFullTableData(tableID) {
    try {
      const table = db.prepare('SELECT * FROM user_tables WHERE tableID = ?').get(tableID);
      if (!table) return null;

      const columns = this.getTableColumns(tableID);
      const rows = this.getTableRows(tableID);

      return {
        ...table,
        columns,
        rows,
        data: rows.map(row => {
          const rowData = { _rowID: row.rowID };
          row.cells.forEach(cell => {
            rowData[cell.columnName] = cell.value;
          });
          return rowData;
        })
      };
    } catch (error) {
      console.error('❌ Get full table data error:', error.message);
      return null;
    }
  },

  // ========================================
  // ALIAS FUNCTIONS (for compatibility)
  // ========================================
  
  // Alias for getUserTables
  getTablesByUser(userUID) {
    return this.getUserTables(userUID);
  },
  
  // Alias for getUserTableById
  getTableById(tableID) {
    return this.getUserTableById(tableID);
  },
  
  // Alias for createUserTable
  createTable(userUID, data) {
    return this.createUserTable(userUID, data);
  },
  
  // Alias for updateUserTable (need to implement)
  updateTable(tableID, updates) {
    try {
      const sets = [];
      const values = [];
      
      if (updates.tableName !== undefined) {
        sets.push('tableName = ?');
        values.push(updates.tableName);
      }
      if (updates.tableDescription !== undefined) {
        sets.push('tableDescription = ?');
        values.push(updates.tableDescription);
      }
      if (updates.status !== undefined) {
        sets.push('status = ?');
        values.push(updates.status ? 1 : 0);
      }
      if (updates.flowID !== undefined) {
        sets.push('flowID = ?');
        values.push(updates.flowID);
      }
      
      sets.push('updatedAt = ?');
      values.push(Date.now());
      values.push(tableID);
      
      if (sets.length > 1) {
        db.prepare(`UPDATE user_tables SET ${sets.join(', ')} WHERE tableID = ?`).run(...values);
      }
      
      return this.getUserTableById(tableID);
    } catch (error) {
      console.error('❌ Update table error:', error.message);
      return null;
    }
  },
  
  // Alias for deleteUserTable
  deleteTable(tableID) {
    try {
      db.prepare('DELETE FROM user_tables WHERE tableID = ?').run(tableID);
      return true;
    } catch (error) {
      console.error('❌ Delete table error:', error.message);
      return false;
    }
  },
  
  // Update table row (for table-data block)
  updateTableRow(rowID, rowData) {
    try {
      // rowData is object like { columnID: value, ... }
      const now = Date.now();
      
      const transaction = db.transaction(() => {
        for (const [columnID, value] of Object.entries(rowData)) {
          const colId = parseInt(columnID) || columnID;
          db.prepare(`
            INSERT INTO table_cells (rowID, columnID, cellValue, updatedAt)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(rowID, columnID) 
            DO UPDATE SET cellValue = ?, updatedAt = ?
          `).run(rowID, colId, value, now, value, now);
        }
        db.prepare('UPDATE table_rows SET updatedAt = ? WHERE rowID = ?').run(now, rowID);
      });
      
      transaction();
      return this.getTableRowById(rowID);
    } catch (error) {
      console.error('❌ Update table row error:', error.message);
      return null;
    }
  },

  // ========================================
  // ACTIVITY LOG
  // ========================================
  
  /**
   * Log một hoạt động
   * @param {string} userUID - User ID
   * @param {string} action - Hành động: create, update, delete, add
   * @param {string} entityType - Loại đối tượng: table, column, row, cell, trigger
   * @param {number} entityID - ID của đối tượng
   * @param {string} entityName - Tên đối tượng
   * @param {string} details - Chi tiết
   * @param {string} oldValue - Giá trị cũ (nếu có)
   * @param {string} newValue - Giá trị mới (nếu có)
   */
  logActivity(userUID, action, entityType, entityID, entityName, details = '', oldValue = null, newValue = null) {
    try {
      const stmt = db.prepare(`
        INSERT INTO activity_logs (userUID, action, entityType, entityID, entityName, details, oldValue, newValue)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(userUID, action, entityType, entityID, entityName, details, oldValue, newValue);
      console.log(`📝 Activity logged: ${action} ${entityType} "${entityName}"`);
      return true;
    } catch (error) {
      console.error('❌ Log activity error:', error.message);
      return false;
    }
  },

  /**
   * Lấy danh sách activity logs
   * @param {string} userUID - User ID (optional)
   * @param {number} limit - Số lượng tối đa
   * @param {number} offset - Vị trí bắt đầu
   */
  getActivityLogs(userUID = null, limit = 500, offset = 0) {
    try {
      let query = 'SELECT * FROM activity_logs';
      const params = [];
      
      if (userUID) {
        query += ' WHERE userUID = ?';
        params.push(userUID);
      }
      
      query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      return db.prepare(query).all(...params);
    } catch (error) {
      console.error('❌ Get activity logs error:', error.message);
      return [];
    }
  },

  /**
   * Xóa tất cả activity logs
   * @param {string} userUID - User ID (optional, nếu null thì xóa tất cả)
   */
  clearActivityLogs(userUID = null) {
    try {
      if (userUID) {
        db.prepare('DELETE FROM activity_logs WHERE userUID = ?').run(userUID);
      } else {
        db.prepare('DELETE FROM activity_logs').run();
      }
      console.log('🗑️ Activity logs cleared');
      return true;
    } catch (error) {
      console.error('❌ Clear activity logs error:', error.message);
      return false;
    }
  },

  /**
   * Đếm số lượng activity logs
   */
  countActivityLogs(userUID = null) {
    try {
      if (userUID) {
        return db.prepare('SELECT COUNT(*) as count FROM activity_logs WHERE userUID = ?').get(userUID).count;
      }
      return db.prepare('SELECT COUNT(*) as count FROM activity_logs').get().count;
    } catch (error) {
      console.error('❌ Count activity logs error:', error.message);
      return 0;
    }
  },

  // ========================================
  // BLOCK CONDITIONS CRUD
  // ========================================
  getBlockConditions(blockID) {
    try { return db.prepare('SELECT * FROM block_conditions WHERE blockID = ? ORDER BY conditionOrder').all(blockID); }
    catch (error) { console.error('❌ Get block conditions error:', error.message); return []; }
  },

  saveBlockConditions(blockID, conditions) {
    try {
      db.prepare('DELETE FROM block_conditions WHERE blockID = ?').run(blockID);
      if (!conditions || conditions.length === 0) return true;
      const stmt = db.prepare('INSERT INTO block_conditions (blockID, columnID, operator, conditionValue, conditionOrder) VALUES (?, ?, ?, ?, ?)');
      const transaction = db.transaction(() => {
        conditions.forEach((cond, index) => {
          stmt.run(blockID, cond.column || cond.columnID || '', cond.operator || 'equals', cond.value || cond.conditionValue || '', index);
        });
      });
      transaction();
      return true;
    } catch (error) { console.error('❌ Save block conditions error:', error.message); return false; }
  },

  getBlockColumnValues(blockID) {
    try { return db.prepare('SELECT * FROM block_column_values WHERE blockID = ? ORDER BY valueOrder').all(blockID); }
    catch (error) { console.error('❌ Get block column values error:', error.message); return []; }
  },

  saveBlockColumnValues(blockID, columnValues) {
    try {
      db.prepare('DELETE FROM block_column_values WHERE blockID = ?').run(blockID);
      if (!columnValues || columnValues.length === 0) return true;
      const stmt = db.prepare('INSERT INTO block_column_values (blockID, columnID, columnValue, valueOrder) VALUES (?, ?, ?, ?)');
      const transaction = db.transaction(() => {
        columnValues.forEach((val, index) => {
          stmt.run(blockID, val.column || val.columnID || '', val.value || val.columnValue || '', index);
        });
      });
      transaction();
      return true;
    } catch (error) { console.error('❌ Save block column values error:', error.message); return false; }
  },

  getBlockResultMappings(blockID) {
    try { return db.prepare('SELECT * FROM block_result_mappings WHERE blockID = ? ORDER BY mappingOrder').all(blockID); }
    catch (error) { console.error('❌ Get block result mappings error:', error.message); return []; }
  },

  saveBlockResultMappings(blockID, resultMappings) {
    try {
      db.prepare('DELETE FROM block_result_mappings WHERE blockID = ?').run(blockID);
      if (!resultMappings || resultMappings.length === 0) return true;
      const stmt = db.prepare('INSERT INTO block_result_mappings (blockID, columnID, variableName, mappingOrder) VALUES (?, ?, ?, ?)');
      const transaction = db.transaction(() => {
        resultMappings.forEach((mapping, index) => {
          if (mapping.column && mapping.variableName) {
            stmt.run(blockID, mapping.column || mapping.columnID || '', mapping.variableName || '', index);
          }
        });
      });
      transaction();
      return true;
    } catch (error) { console.error('❌ Save block result mappings error:', error.message); return false; }
  },

  // ========================================
  // GOOGLE SHEET CONFIGS
  // ========================================
  getGoogleSheetConfigs(userUID) {
    try {
      const configs = db.prepare('SELECT * FROM google_sheet_configs WHERE userUID = ? ORDER BY updatedAt DESC').all(userUID);
      return configs.map(c => ({ id: c.configID, name: c.name, scriptURL: c.scriptURL, sheetName: c.sheetName, spreadsheetId: c.spreadsheetId, apiKey: c.apiKey, createdAt: c.createdAt, updatedAt: c.updatedAt }));
    } catch (error) { console.error('❌ Get Google Sheet configs error:', error.message); return []; }
  },

  getGoogleSheetConfigById(configId) {
    try {
      const config = db.prepare('SELECT * FROM google_sheet_configs WHERE configID = ?').get(configId);
      if (config) return { id: config.configID, name: config.name, scriptURL: config.scriptURL, sheetName: config.sheetName, spreadsheetId: config.spreadsheetId, apiKey: config.apiKey, createdAt: config.createdAt, updatedAt: config.updatedAt };
      return null;
    } catch (error) { console.error('❌ Get Google Sheet config by ID error:', error.message); return null; }
  },

  saveGoogleSheetConfig(config) {
    try {
      const now = Date.now();
      let existingConfig = config.id ? db.prepare('SELECT configID FROM google_sheet_configs WHERE configID = ? AND userUID = ?').get(config.id, config.userUID) : null;
      if (existingConfig) {
        db.prepare('UPDATE google_sheet_configs SET name = ?, scriptURL = ?, sheetName = ?, spreadsheetId = ?, apiKey = ?, updatedAt = ? WHERE configID = ? AND userUID = ?').run(config.name, config.scriptURL, config.sheetName || 'Sheet1', config.spreadsheetId || null, config.apiKey || null, now, config.id, config.userUID);
        return this.getGoogleSheetConfigById(config.id);
      } else {
        const result = db.prepare('INSERT INTO google_sheet_configs (userUID, name, scriptURL, sheetName, spreadsheetId, apiKey, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(config.userUID, config.name, config.scriptURL, config.sheetName || 'Sheet1', config.spreadsheetId || null, config.apiKey || null, now, now);
        return this.getGoogleSheetConfigById(result.lastInsertRowid);
      }
    } catch (error) { console.error('❌ Save Google Sheet config error:', error.message); return null; }
  },

  deleteGoogleSheetConfig(configId, userUID) {
    try { return db.prepare('DELETE FROM google_sheet_configs WHERE configID = ? AND userUID = ?').run(configId, userUID).changes > 0; }
    catch (error) { console.error('❌ Delete Google Sheet config error:', error.message); return false; }
  },

  // ========================================
  // AI CONFIGS
  // ========================================
  getAIConfigs(userUID) {
    try {
      const configs = db.prepare('SELECT * FROM ai_configs WHERE userUID = ? ORDER BY isDefault DESC, updatedAt DESC').all(userUID);
      return configs.map(c => ({ id: c.configID, configID: c.configID, name: c.name, provider: c.provider, model: c.model, apiKey: c.apiKey, endpoint: c.endpoint, temperature: c.temperature, maxTokens: c.maxTokens, systemPrompt: c.systemPrompt, status: c.status, isDefault: c.isDefault === 1, createdAt: c.createdAt, updatedAt: c.updatedAt }));
    } catch (error) { console.error('❌ Get AI configs error:', error.message); return []; }
  },

  getAIConfigById(configId) {
    try {
      const config = db.prepare('SELECT * FROM ai_configs WHERE configID = ?').get(configId);
      if (config) return { id: config.configID, configID: config.configID, name: config.name, provider: config.provider, model: config.model, apiKey: config.apiKey, endpoint: config.endpoint, temperature: config.temperature, maxTokens: config.maxTokens, systemPrompt: config.systemPrompt, status: config.status, isDefault: config.isDefault === 1, createdAt: config.createdAt, updatedAt: config.updatedAt };
      return null;
    } catch (error) { console.error('❌ Get AI config by ID error:', error.message); return null; }
  },

  getDefaultAIConfig(userUID) {
    try {
      const config = db.prepare('SELECT * FROM ai_configs WHERE userUID = ? AND isDefault = 1').get(userUID);
      if (config) return this.getAIConfigById(config.configID);
      return this.getAIConfigs(userUID)[0] || null;
    } catch (error) { console.error('❌ Get default AI config error:', error.message); return null; }
  },

  saveAIConfig(config) {
    try {
      const now = Date.now();
      let existingConfig = config.id ? db.prepare('SELECT configID FROM ai_configs WHERE configID = ? AND userUID = ?').get(config.id, config.userUID) : null;
      if (existingConfig) {
        db.prepare('UPDATE ai_configs SET name = ?, provider = ?, model = ?, apiKey = ?, endpoint = ?, temperature = ?, maxTokens = ?, systemPrompt = ?, status = ?, updatedAt = ? WHERE configID = ? AND userUID = ?').run(config.name, config.provider || 'gemini', config.model, config.apiKey, config.endpoint || null, config.temperature ?? 0.7, config.maxTokens || 1024, config.systemPrompt || null, config.status || 'unknown', now, config.id, config.userUID);
        return this.getAIConfigById(config.id);
      } else {
        const result = db.prepare('INSERT INTO ai_configs (userUID, name, provider, model, apiKey, endpoint, temperature, maxTokens, systemPrompt, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(config.userUID, config.name, config.provider || 'gemini', config.model, config.apiKey, config.endpoint || null, config.temperature ?? 0.7, config.maxTokens || 1024, config.systemPrompt || null, config.status || 'unknown', now, now);
        return this.getAIConfigById(result.lastInsertRowid);
      }
    } catch (error) { console.error('❌ Save AI config error:', error.message); return null; }
  },

  updateAIConfigStatus(configId, status) {
    try { db.prepare('UPDATE ai_configs SET status = ?, updatedAt = ? WHERE configID = ?').run(status, Date.now(), configId); return true; }
    catch (error) { console.error('❌ Update AI config status error:', error.message); return false; }
  },

  setDefaultAIConfig(userUID, configId) {
    try {
      db.prepare('UPDATE ai_configs SET isDefault = 0 WHERE userUID = ?').run(userUID);
      db.prepare('UPDATE ai_configs SET isDefault = 1 WHERE configID = ? AND userUID = ?').run(configId, userUID);
      return true;
    } catch (error) { console.error('❌ Set default AI config error:', error.message); return false; }
  },

  deleteAIConfig(configId, userUID) {
    try { return db.prepare('DELETE FROM ai_configs WHERE configID = ? AND userUID = ?').run(configId, userUID).changes > 0; }
    catch (error) { console.error('❌ Delete AI config error:', error.message); return false; }
  },

  // ========================================
  // IMAGES
  // ========================================
  getImages(userUID) {
    try {
      const images = db.prepare('SELECT * FROM images WHERE userUID = ? ORDER BY createdAt DESC').all(userUID);
      return images.map(img => ({ id: img.imageID, imageID: img.imageID, name: img.name, variableName: img.variableName, description: img.description, fileName: img.fileName, filePath: img.filePath, fileSize: img.fileSize, mimeType: img.mimeType, width: img.width, height: img.height, createdAt: img.createdAt, updatedAt: img.updatedAt, url: `/api/images/${img.imageID}` }));
    } catch (error) { console.error('❌ Get images error:', error.message); return []; }
  },

  getImageById(imageId) {
    try {
      const img = db.prepare('SELECT * FROM images WHERE imageID = ?').get(imageId);
      if (img) return { id: img.imageID, imageID: img.imageID, userUID: img.userUID, name: img.name, variableName: img.variableName, description: img.description, fileName: img.fileName, filePath: img.filePath, fileSize: img.fileSize, mimeType: img.mimeType, width: img.width, height: img.height, createdAt: img.createdAt, updatedAt: img.updatedAt, url: `/api/images/${img.imageID}` };
      return null;
    } catch (error) { console.error('❌ Get image by ID error:', error.message); return null; }
  },

  getImageByVariable(userUID, variableName) {
    try {
      const img = db.prepare('SELECT * FROM images WHERE userUID = ? AND variableName = ?').get(userUID, variableName);
      if (img) return { id: img.imageID, imageID: img.imageID, name: img.name, variableName: img.variableName, filePath: img.filePath, mimeType: img.mimeType, url: `/api/images/${img.imageID}` };
      return null;
    } catch (error) { console.error('❌ Get image by variable error:', error.message); return null; }
  },

  createImage(userUID, data) {
    try {
      const now = Date.now();
      const result = db.prepare('INSERT INTO images (userUID, name, variableName, description, fileName, filePath, fileSize, mimeType, width, height, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(userUID, data.name, data.variableName || null, data.description || null, data.fileName, data.filePath, data.fileSize || 0, data.mimeType || 'image/jpeg', data.width || null, data.height || null, now, now);
      return this.getImageById(result.lastInsertRowid);
    } catch (error) { console.error('❌ Create image error:', error.message); return null; }
  },

  updateImage(imageId, userUID, updates) {
    try {
      const fields = [], values = [];
      if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
      if (updates.variableName !== undefined) { fields.push('variableName = ?'); values.push(updates.variableName || null); }
      if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
      if (fields.length === 0) return this.getImageById(imageId);
      fields.push('updatedAt = ?'); values.push(Date.now()); values.push(imageId); values.push(userUID);
      db.prepare(`UPDATE images SET ${fields.join(', ')} WHERE imageID = ? AND userUID = ?`).run(...values);
      return this.getImageById(imageId);
    } catch (error) { console.error('❌ Update image error:', error.message); return null; }
  },

  deleteImage(imageId, userUID) {
    try {
      const img = this.getImageById(imageId);
      const result = db.prepare('DELETE FROM images WHERE imageID = ? AND userUID = ?').run(imageId, userUID);
      if (result.changes > 0) return { success: true, filePath: img?.filePath };
      return { success: false };
    } catch (error) { console.error('❌ Delete image error:', error.message); return { success: false }; }
  },

  deleteImages(imageIds, userUID) {
    try {
      const images = imageIds.map(id => this.getImageById(id)).filter(Boolean);
      const placeholders = imageIds.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM images WHERE imageID IN (${placeholders}) AND userUID = ?`).run(...imageIds, userUID);
      return { success: true, count: result.changes, filePaths: images.map(img => img.filePath) };
    } catch (error) { console.error('❌ Delete images error:', error.message); return { success: false, count: 0 }; }
  },

  // ========================================
  // FILES
  // ========================================
  getFiles(userUID, category = null) {
    try {
      let query = 'SELECT * FROM files WHERE userUID = ?';
      const params = [userUID];
      if (category) { query += ' AND category = ?'; params.push(category); }
      query += ' ORDER BY createdAt DESC';
      const files = db.prepare(query).all(...params);
      return files.map(f => ({ id: f.fileID, fileID: f.fileID, userUID: f.userUID, name: f.name, variableName: f.variableName, description: f.description, fileName: f.fileName, filePath: f.filePath, fileSize: f.fileSize, mimeType: f.mimeType, fileType: f.fileType, category: f.category, createdAt: f.createdAt, updatedAt: f.updatedAt, url: `/api/files/${f.fileID}` }));
    } catch (error) { console.error('❌ Get files error:', error.message); return []; }
  },

  getFileById(fileId) {
    try {
      const f = db.prepare('SELECT * FROM files WHERE fileID = ?').get(fileId);
      if (f) return { id: f.fileID, fileID: f.fileID, userUID: f.userUID, name: f.name, variableName: f.variableName, description: f.description, fileName: f.fileName, filePath: f.filePath, fileSize: f.fileSize, mimeType: f.mimeType, fileType: f.fileType, category: f.category, createdAt: f.createdAt, updatedAt: f.updatedAt, url: `/api/files/${f.fileID}` };
      return null;
    } catch (error) { console.error('❌ Get file by ID error:', error.message); return null; }
  },

  getFileByVariable(userUID, variableName) {
    try {
      const f = db.prepare('SELECT * FROM files WHERE userUID = ? AND variableName = ?').get(userUID, variableName);
      if (f) return { id: f.fileID, fileID: f.fileID, userUID: f.userUID, name: f.name, variableName: f.variableName, description: f.description, fileName: f.fileName, filePath: f.filePath, fileSize: f.fileSize, mimeType: f.mimeType, fileType: f.fileType, category: f.category, createdAt: f.createdAt, updatedAt: f.updatedAt, url: `/api/files/${f.fileID}` };
      return null;
    } catch (error) { console.error('❌ Get file by variable error:', error.message); return null; }
  },

  createFile(userUID, data) {
    try {
      const now = Date.now();
      const result = db.prepare('INSERT INTO files (userUID, name, variableName, description, fileName, filePath, fileSize, mimeType, fileType, category, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(userUID, data.name, data.variableName || null, data.description || null, data.fileName, data.filePath, data.fileSize || 0, data.mimeType || 'application/octet-stream', data.fileType || 'other', data.category || 'document', now, now);
      return this.getFileById(result.lastInsertRowid);
    } catch (error) { console.error('❌ Create file error:', error.message); return null; }
  },

  updateFile(fileId, userUID, updates) {
    try {
      const fields = [], values = [];
      if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
      if (updates.variableName !== undefined) { fields.push('variableName = ?'); values.push(updates.variableName); }
      if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
      if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
      if (fields.length === 0) return this.getFileById(fileId);
      fields.push('updatedAt = ?'); values.push(Date.now()); values.push(fileId); values.push(userUID);
      db.prepare(`UPDATE files SET ${fields.join(', ')} WHERE fileID = ? AND userUID = ?`).run(...values);
      return this.getFileById(fileId);
    } catch (error) { console.error('❌ Update file error:', error.message); return null; }
  },

  deleteFile(fileId, userUID) {
    try {
      const file = this.getFileById(fileId);
      if (!file) return { success: false };
      db.prepare('DELETE FROM files WHERE fileID = ? AND userUID = ?').run(fileId, userUID);
      return { success: true, filePath: file.filePath };
    } catch (error) { console.error('❌ Delete file error:', error.message); return { success: false }; }
  },

  deleteFiles(fileIds, userUID) {
    try {
      const filePaths = [];
      for (const id of fileIds) {
        const file = this.getFileById(id);
        if (file && file.userUID === userUID) filePaths.push(file.filePath);
      }
      const placeholders = fileIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM files WHERE fileID IN (${placeholders}) AND userUID = ?`).run(...fileIds, userUID);
      return { success: true, count: filePaths.length, filePaths };
    } catch (error) { console.error('❌ Delete files error:', error.message); return { success: false, count: 0 }; }
  },

  // ========================================
  // FILE TEMPLATES
  // ========================================
  getFileTemplates(userUID) {
    try {
      const templates = db.prepare('SELECT * FROM file_templates WHERE userUID = ? ORDER BY createdAt DESC').all(userUID);
      return templates.map(t => ({ id: t.templateID, templateID: t.templateID, userUID: t.userUID, name: t.name, description: t.description, fileName: t.fileName, filePath: t.filePath, fileSize: t.fileSize, mimeType: t.mimeType, fileType: t.fileType, variables: t.variables ? JSON.parse(t.variables) : [], outputFormat: t.outputFormat, isActive: t.isActive === 1, createdAt: t.createdAt, updatedAt: t.updatedAt, url: `/api/templates/${t.templateID}` }));
    } catch (error) { console.error('❌ Get templates error:', error.message); return []; }
  },

  getFileTemplateById(templateId) {
    try {
      const t = db.prepare('SELECT * FROM file_templates WHERE templateID = ?').get(templateId);
      if (t) return { id: t.templateID, templateID: t.templateID, userUID: t.userUID, name: t.name, description: t.description, fileName: t.fileName, filePath: t.filePath, fileSize: t.fileSize, mimeType: t.mimeType, fileType: t.fileType, variables: t.variables ? JSON.parse(t.variables) : [], outputFormat: t.outputFormat, isActive: t.isActive === 1, createdAt: t.createdAt, updatedAt: t.updatedAt, url: `/api/templates/${t.templateID}` };
      return null;
    } catch (error) { console.error('❌ Get template by ID error:', error.message); return null; }
  },

  createFileTemplate(userUID, data) {
    try {
      const now = Date.now();
      const result = db.prepare('INSERT INTO file_templates (userUID, name, description, fileName, filePath, fileSize, mimeType, fileType, variables, outputFormat, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(userUID, data.name, data.description || null, data.fileName, data.filePath, data.fileSize || 0, data.mimeType || 'application/octet-stream', data.fileType || 'other', JSON.stringify(data.variables || []), data.outputFormat || 'same', 1, now, now);
      return this.getFileTemplateById(result.lastInsertRowid);
    } catch (error) { console.error('❌ Create template error:', error.message); return null; }
  },

  updateFileTemplate(templateId, userUID, updates) {
    try {
      const fields = [], values = [];
      if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
      if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
      if (updates.variables !== undefined) { fields.push('variables = ?'); values.push(JSON.stringify(updates.variables)); }
      if (updates.outputFormat !== undefined) { fields.push('outputFormat = ?'); values.push(updates.outputFormat); }
      if (updates.isActive !== undefined) { fields.push('isActive = ?'); values.push(updates.isActive ? 1 : 0); }
      if (fields.length === 0) return this.getFileTemplateById(templateId);
      fields.push('updatedAt = ?'); values.push(Date.now()); values.push(templateId); values.push(userUID);
      db.prepare(`UPDATE file_templates SET ${fields.join(', ')} WHERE templateID = ? AND userUID = ?`).run(...values);
      return this.getFileTemplateById(templateId);
    } catch (error) { console.error('❌ Update template error:', error.message); return null; }
  },

  deleteFileTemplate(templateId, userUID) {
    try {
      const template = this.getFileTemplateById(templateId);
      if (!template) return { success: false };
      db.prepare('DELETE FROM file_templates WHERE templateID = ? AND userUID = ?').run(templateId, userUID);
      return { success: true, filePath: template.filePath };
    } catch (error) { console.error('❌ Delete template error:', error.message); return { success: false }; }
  },

  // ========================================
  // DATABASE UTILITIES
  // ========================================
  getDB() { return db; },

  close() {
    try {
      if (db) {
        db.close();
        console.log('✅ Database closed');
      }
    } catch (error) {
      console.error('❌ Close database error:', error.message);
    }
  }
};