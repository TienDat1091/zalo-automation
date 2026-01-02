// triggerDB.js - SQLite Database cho Trigger System v4
// Với Variables table và Flow Conditions support
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'triggers.db');

// Tạo thư mục nếu chưa có
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      console.log('✅ SQLite database connected:', DB_PATH);
      this._createTables();
      return true;
    } catch (error) {
      console.error('❌ SQLite init error:', error.message);
      return false;
    }
  },

  _createTables() {
    // Triggers table
    db.exec(`
      CREATE TABLE IF NOT EXISTS triggers (
        triggerID INTEGER PRIMARY KEY AUTOINCREMENT,
        triggerName TEXT NOT NULL,
        triggerKey TEXT,
        triggerUserID TEXT NOT NULL,
        triggerContent TEXT,
        timeCreated INTEGER DEFAULT (strftime('%s','now') * 1000),
        timeUpdate INTEGER DEFAULT (strftime('%s','now') * 1000),
        timeStartActive TEXT DEFAULT '00:00',
        timeEndActive TEXT DEFAULT '23:59',
        dateStartActive TEXT,
        dateEndActive TEXT,
        cooldown INTEGER DEFAULT 30000,
        scope INTEGER DEFAULT 0,
        uids TEXT,
        enabled INTEGER DEFAULT 1,
        setMode INTEGER DEFAULT 0
      )
    `);

    // Flows table
    db.exec(`
      CREATE TABLE IF NOT EXISTS flows (
        flowID INTEGER PRIMARY KEY AUTOINCREMENT,
        triggerID INTEGER NOT NULL,
        flowName TEXT,
        flowDescription TEXT,
        isActive INTEGER DEFAULT 1,
        createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
        updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000),
        FOREIGN KEY (triggerID) REFERENCES triggers(triggerID) ON DELETE CASCADE
      )
    `);

    // Flow blocks table - sửa lại FOREIGN KEY cho condition1, condition2
    db.exec(`
      CREATE TABLE IF NOT EXISTS flow_blocks (
        blockID INTEGER PRIMARY KEY AUTOINCREMENT,
        flowID INTEGER NOT NULL,
        blockType TEXT NOT NULL,
        blockData TEXT DEFAULT '{}',
        blockOrder INTEGER DEFAULT 0,
        parentBlockID INTEGER,
        condition1 INTEGER,
        condition2 INTEGER,
        branchType TEXT,
        createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
        FOREIGN KEY (flowID) REFERENCES flows(flowID) ON DELETE CASCADE,
        FOREIGN KEY (parentBlockID) REFERENCES flow_blocks(blockID) ON DELETE CASCADE,
        FOREIGN KEY (condition1) REFERENCES flows(flowID) ON DELETE CASCADE,
        FOREIGN KEY (condition2) REFERENCES flows(flowID) ON DELETE CASCADE
      )
    `);

    // Variables table - Lưu biến cho mỗi user/conversation
    db.exec(`
      CREATE TABLE IF NOT EXISTS variables (
        variableID INTEGER PRIMARY KEY AUTOINCREMENT,
        userUID TEXT NOT NULL,
        conversationID TEXT,
        variableName TEXT NOT NULL,
        variableValue TEXT,
        variableType TEXT DEFAULT 'text',
        blockID INTEGER,
        flowID INTEGER,
        createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
        updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000),
        expiresAt INTEGER,
        UNIQUE(userUID, conversationID, variableName)
      )
    `);

    // User input states - Theo dõi trạng thái chờ input
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_input_states (
        stateID INTEGER PRIMARY KEY AUTOINCREMENT,
        userUID TEXT NOT NULL,
        conversationID TEXT NOT NULL,
        blockID INTEGER NOT NULL,
        flowID INTEGER NOT NULL,
        triggerID INTEGER NOT NULL,
        expectedType TEXT DEFAULT 'text',
        variableName TEXT,
        retryCount INTEGER DEFAULT 0,
        maxRetries INTEGER DEFAULT 3,
        timeoutMinutes INTEGER DEFAULT 30,
        createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
        expiresAt INTEGER,
        isActive INTEGER DEFAULT 1,
        questions TEXT,
        currentQuestionIndex INTEGER DEFAULT 0,
        flowContext TEXT,
        nextBlockOrder INTEGER,
        retryMessage TEXT,
        timeoutMessage TEXT,
        UNIQUE(userUID, conversationID)
      )
    `);

    // Activity logs
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        logID INTEGER PRIMARY KEY AUTOINCREMENT,
        userUID TEXT NOT NULL,
        action TEXT NOT NULL,
        triggerID INTEGER,
        triggerName TEXT,
        details TEXT,
        timestamp INTEGER DEFAULT (strftime('%s','now') * 1000)
      )
    `);
    // Payment gates table - Cổng thanh toán
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_gates (
        gateID INTEGER PRIMARY KEY AUTOINCREMENT,
        userUID TEXT NOT NULL,
        gateName TEXT NOT NULL,
        bankBin INTEGER NOT NULL,
        accountNumber TEXT NOT NULL,
        accountName TEXT NOT NULL,
        status INTEGER DEFAULT 1,
        createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
        updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000)
      )
    `);

    // Transactions table - Giao dịch
    db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        transactionID INTEGER PRIMARY KEY AUTOINCREMENT,
        userUID TEXT NOT NULL,
        transactionCode TEXT NOT NULL UNIQUE,
        gateID INTEGER,
        bankBin INTEGER,
        accountNumber TEXT,
        accountName TEXT,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'VND',
        status TEXT DEFAULT 'WAITING',
        customerID TEXT,
        customerName TEXT,
        note TEXT,
        paidAt INTEGER,
        createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
        updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000),
        FOREIGN KEY (gateID) REFERENCES payment_gates(gateID) ON DELETE SET NULL
      )
    `);

    // Payment logs table - Lịch sử thanh toán
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_logs (
        logID INTEGER PRIMARY KEY AUTOINCREMENT,
        userUID TEXT NOT NULL,
        transactionID INTEGER,
        transactionCode TEXT,
        bankBin INTEGER,
        accountNumber TEXT,
        accountName TEXT,
        amount REAL,
        paidAt INTEGER DEFAULT (strftime('%s','now') * 1000),
        rawData TEXT,
        FOREIGN KEY (transactionID) REFERENCES transactions(transactionID) ON DELETE SET NULL
      )
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_triggers_userID ON triggers(triggerUserID);
      CREATE INDEX IF NOT EXISTS idx_triggers_enabled ON triggers(enabled);
      CREATE INDEX IF NOT EXISTS idx_flows_triggerID ON flows(triggerID);
      CREATE INDEX IF NOT EXISTS idx_blocks_flowID ON flow_blocks(flowID);
      CREATE INDEX IF NOT EXISTS idx_blocks_parent ON flow_blocks(parentBlockID);
      CREATE INDEX IF NOT EXISTS idx_variables_user ON variables(userUID, conversationID);
      CREATE INDEX IF NOT EXISTS idx_input_states_user ON user_input_states(userUID, conversationID);
      CREATE INDEX IF NOT EXISTS idx_activity_userUID ON activity_logs(userUID);
      CREATE INDEX IF NOT EXISTS idx_payment_gates_userUID ON payment_gates(userUID);
      CREATE INDEX IF NOT EXISTS idx_transactions_userUID ON transactions(userUID);
      CREATE INDEX IF NOT EXISTS idx_transactions_code ON transactions(transactionCode);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
      CREATE INDEX IF NOT EXISTS idx_payment_logs_userUID ON payment_logs(userUID);
    `);
    console.log('✅ Database tables created/verified');
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
  // DATABASE UTILITIES
  // ========================================
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