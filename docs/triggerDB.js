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

      this.initBuiltInTriggers();

      return true;
    } catch (error) {
      console.error('❌ SQLite init error:', error.message);
      return false;
    }
  },

  initBuiltInTriggers() {
    try {
      // Check Auto Friend Accept Trigger (System level)
      const check = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_auto_friend__' AND triggerUserID = 'system'").get();
      if (!check) {
        console.log('✨ Creating built-in trigger: Auto Friend Accept (System)');
        this.createTrigger({
          triggerName: 'Chấp nhận kết bạn',
          triggerKey: '__builtin_auto_friend__',
          triggerUserID: 'system',
          triggerContent: 'Chào {name}, mình đã chấp nhận kết bạn lúc {time}.',
          enabled: false, // Default disabled
          scope: AutoReplyScope.Stranger
        });
      }

      // Check Auto File Trigger
      const checkFile = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_auto_file__' AND triggerUserID = 'system'").get();
      if (!checkFile) {
        console.log('✨ Creating built-in trigger: Auto File Processing (System)');
        this.createTrigger({
          triggerName: 'Nhận diện File',
          triggerKey: '__builtin_auto_file__',
          triggerUserID: 'system',
          triggerContent: 'Đã nhận file từ bạn.',
          enabled: false,
          scope: AutoReplyScope.Everyone
        });
      }

      // ✅ Check Auto Reply User Trigger (1-on-1 messages)
      const checkReplyUser = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_auto_reply_user__' AND triggerUserID = 'system'").get();
      if (!checkReplyUser) {
        console.log('✨ Creating built-in trigger: Auto Reply User (System)');
        this.createTrigger({
          triggerName: 'Tự động trả lời (Cá nhân)',
          triggerKey: '__builtin_auto_reply_user__',
          triggerUserID: 'system',
          triggerContent: 'Xin chào! Tin nhắn của bạn đã được ghi nhận.',
          enabled: false,
          scope: AutoReplyScope.Everyone
        });
      }

      // ✅ Check Auto Reply Group Trigger (group messages)
      const checkReplyGroup = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_auto_reply_group__' AND triggerUserID = 'system'").get();
      if (!checkReplyGroup) {
        console.log('✨ Creating built-in trigger: Auto Reply Group (System)');
        this.createTrigger({
          triggerName: 'Tự động trả lời (Nhóm)',
          triggerKey: '__builtin_auto_reply_group__',
          triggerUserID: 'system',
          triggerContent: 'Xin chào nhóm! Tin nhắn đã được ghi nhận.',
          enabled: false,
          scope: AutoReplyScope.Everyone
        });
      }

      // ✅ Check Self-Trigger (Trigger by self command)
      const checkSelfTrigger = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_self_trigger__' AND triggerUserID = 'system'").get();
      if (!checkSelfTrigger) {
        console.log('✨ Creating built-in trigger: Self Trigger (System)');
        this.createTrigger({
          triggerName: 'Tự kích hoạt (Self-Trigger)',
          triggerKey: '__builtin_self_trigger__',
          triggerUserID: 'system',
          triggerContent: '/test',
          enabled: false,
        });
      }

      // ✅ Check Auto Unread Trigger
      const checkUnreadTracker = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_auto_unread__' AND triggerUserID = 'system'").get();
      if (!checkUnreadTracker) {
        console.log('✨ Creating built-in trigger: Auto Unread (System)');
        this.createTrigger({
          triggerName: 'Tự động đánh dấu chưa đọc',
          triggerKey: '__builtin_auto_unread__',
          triggerUserID: 'system',
          triggerContent: 'Đánh dấu hội thoại là chưa đọc sau khi Bot phản hồi.',
          enabled: false,
          scope: AutoReplyScope.Everyone
        });
      }

      // ✅ Check Auto Delete Messages Trigger
      const checkAutoDelete = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_auto_delete_messages__' AND triggerUserID = 'system'").get();
      if (!checkAutoDelete) {
        console.log('✨ Creating built-in trigger: Auto Delete Messages (System)');
        this.createTrigger({
          triggerName: 'Kích hoạt tự động xóa tin nhắn',
          triggerKey: '__builtin_auto_delete_messages__',
          triggerUserID: 'system',
          triggerContent: 'Tự động bật tính năng tin nhắn tự xóa (1 ngày) sau khi kết bạn.',
          enabled: false,
          scope: AutoReplyScope.Everyone
        });
      }
    } catch (e) {
      console.error('❌ Init built-in triggers error:', e.message);
    }
  },

  ensureUserTriggers(userUID) {
    try {
      // 1. Auto Friend
      let userTrigger = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_auto_friend__' AND triggerUserID = ?").get(userUID);
      if (!userTrigger) {
        console.log(`✨ Creating user trigger for ${userUID}: Auto Friend Accept`);
        // Get system template
        const systemTrigger = db.prepare("SELECT * FROM triggers WHERE triggerKey = '__builtin_auto_friend__' AND triggerUserID = 'system'").get();

        if (systemTrigger) {
          this.createTrigger({
            triggerName: systemTrigger.triggerName,
            triggerKey: systemTrigger.triggerKey,
            triggerUserID: userUID, // Assign to user
            triggerContent: systemTrigger.triggerContent,
            enabled: false, // Start disabled calling 'createTrigger' sets it to 0
            scope: systemTrigger.scope
          });
        } else {
          // Fallback
          this.createTrigger({
            triggerName: 'Chấp nhận kết bạn',
            triggerKey: '__builtin_auto_friend__',
            triggerUserID: userUID,
            triggerContent: 'Chào {name}, mình đã chấp nhận kết bạn lúc {time}.',
            enabled: false,
            scope: AutoReplyScope.Stranger
          });
        }
      }

      // 2. Auto Reply User (1-on-1 messages)
      let userReplyTrigger = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_auto_reply_user__' AND triggerUserID = ?").get(userUID);
      if (!userReplyTrigger) {
        console.log(`✨ Creating user trigger for ${userUID}: Auto Reply User`);
        const systemTrigger = db.prepare("SELECT * FROM triggers WHERE triggerKey = '__builtin_auto_reply_user__' AND triggerUserID = 'system'").get();

        if (systemTrigger) {
          this.createTrigger({
            triggerName: systemTrigger.triggerName,
            triggerKey: systemTrigger.triggerKey,
            triggerUserID: userUID,
            triggerContent: systemTrigger.triggerContent,
            enabled: false,
            scope: systemTrigger.scope
          });
        } else {
          this.createTrigger({
            triggerName: 'Tự động trả lời (Cá nhân)',
            triggerKey: '__builtin_auto_reply_user__',
            triggerUserID: userUID,
            triggerContent: 'Xin chào! Tin nhắn của bạn đã được ghi nhận.',
            enabled: false,
            scope: AutoReplyScope.Everyone
          });
        }
      }

      // 3. Auto Reply Group (group messages)
      let groupReplyTrigger = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_auto_reply_group__' AND triggerUserID = ?").get(userUID);
      if (!groupReplyTrigger) {
        console.log(`✨ Creating user trigger for ${userUID}: Auto Reply Group`);
        const systemTrigger = db.prepare("SELECT * FROM triggers WHERE triggerKey = '__builtin_auto_reply_group__' AND triggerUserID = 'system'").get();

        if (systemTrigger) {
          this.createTrigger({
            triggerName: systemTrigger.triggerName,
            triggerKey: systemTrigger.triggerKey,
            triggerUserID: userUID,
            triggerContent: systemTrigger.triggerContent,
            enabled: false,
            scope: systemTrigger.scope
          });
        } else {
          this.createTrigger({
            triggerName: 'Tự động trả lời (Nhóm)',
            triggerKey: '__builtin_auto_reply_group__',
            triggerUserID: userUID,
            triggerContent: 'Xin chào nhóm! Tin nhắn đã được ghi nhận.',
            enabled: false,
          });
        }
      }

      // 4. Self Trigger
      let selfTrigger = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_self_trigger__' AND triggerUserID = ?").get(userUID);
      if (!selfTrigger) {
        console.log(`✨ Creating user trigger for ${userUID}: Self Trigger`);
        const systemTrigger = db.prepare("SELECT * FROM triggers WHERE triggerKey = '__builtin_self_trigger__' AND triggerUserID = 'system'").get();

        if (systemTrigger) {
          this.createTrigger({
            triggerName: systemTrigger.triggerName,
            triggerKey: systemTrigger.triggerKey,
            triggerUserID: userUID,
            triggerContent: systemTrigger.triggerContent,
            enabled: false,
            scope: systemTrigger.scope
          });
        } else {
          this.createTrigger({
            triggerName: 'Tự kích hoạt (Self-Trigger)',
            triggerKey: '__builtin_self_trigger__',
            triggerUserID: userUID,
            triggerContent: '/test',
            enabled: false,
            scope: AutoReplyScope.Everyone
          });
        }
      }

      // 5. Auto Unread
      let unreadTrigger = db.prepare("SELECT id FROM triggers WHERE triggerKey = '__builtin_auto_unread__' AND triggerUserID = ?").get(userUID);
      if (!unreadTrigger) {
        console.log(`✨ Creating user trigger for ${userUID}: Auto Unread`);
        const systemTrigger = db.prepare("SELECT * FROM triggers WHERE triggerKey = '__builtin_auto_unread__' AND triggerUserID = 'system'").get();

        if (systemTrigger) {
          this.createTrigger({
            triggerName: systemTrigger.triggerName,
            triggerKey: systemTrigger.triggerKey,
            triggerUserID: userUID,
            triggerContent: systemTrigger.triggerContent,
            enabled: false,
            scope: systemTrigger.scope
          });
        } else {
          this.createTrigger({
            triggerName: 'Tự động đánh dấu chưa đọc',
            triggerKey: '__builtin_auto_unread__',
            triggerUserID: userUID,
            triggerContent: 'Đánh dấu hội thoại là chưa đọc sau khi Bot phản hồi.',
            enabled: false,
            scope: AutoReplyScope.Everyone
          });
        }
      }
    } catch (e) {
      console.error('❌ Ensure user triggers error:', e.message);
    }
  },



  // ========================================
  // TRIGGERS CRUD
  // ========================================
  createTrigger(data) {
    try {
      const isBuiltIn = data.triggerKey && data.triggerKey.startsWith('__builtin_');
      const stmt = db.prepare(`
        ${isBuiltIn ? 'INSERT OR REPLACE' : 'INSERT'} INTO triggers (triggerName, triggerKey, triggerType, triggerUserID, triggerContent, 
          timeStartActive, timeEndActive, dateStartActive, dateEndActive, 
          cooldown, scope, uids, enabled, setMode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        data.triggerName || 'New Trigger',
        data.triggerKey || '',
        data.triggerType || 'keyword',  // MỚI: loại trigger
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
      const trigger = db.prepare('SELECT * FROM triggers WHERE id = ?').get(triggerID);
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

  getAllTriggers() {
    try {
      const triggers = db.prepare('SELECT * FROM triggers').all();
      return triggers.map(t => this._formatTrigger(t));
    } catch (error) {
      console.error('❌ Get all triggers error:', error.message);
      return [];
    }
  },

  // ========================================
  // ZALO BOT CONTACTS
  // ========================================
  saveZaloBotContact(openid, displayName, avatar) {
    try {
      const stmt = db.prepare(`
        INSERT INTO zalo_bot_contacts (openid, displayName, avatar, lastActive)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(openid) DO UPDATE SET
          displayName = excluded.displayName,
          avatar = excluded.avatar,
          lastActive = excluded.lastActive
      `);
      stmt.run(openid, displayName || 'Unknown User', avatar || '', Date.now());
      return true;
    } catch (error) {
      console.error('❌ Save Zalo contact error:', error.message);
      return false;
    }
  },

  getZaloBotContacts() {
    try {
      return db.prepare('SELECT * FROM zalo_bot_contacts ORDER BY lastActive DESC').all();
    } catch (error) {
      console.error('❌ Get Zalo contacts error:', error.message);
      return [];
    }
  },

  deleteZaloBotContact(openid) {
    try {
      const stmt = db.prepare('DELETE FROM zalo_bot_contacts WHERE openid = ?');
      stmt.run(openid);
      console.log(`✅ Deleted Zalo Bot contact: ${openid}`);
      return true;
    } catch (error) {
      console.error('❌ Delete Zalo contact error:', error.message);
      return false;
    }
  },

  updateTrigger(triggerID, updates) {
    try {
      const fields = [];
      const values = [];

      const allowedFields = ['triggerName', 'triggerKey', 'triggerType', 'triggerContent',
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

      const sql = `UPDATE triggers SET ${fields.join(', ')} WHERE id = ?`;
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
      const trigger = db.prepare('SELECT enabled FROM triggers WHERE id = ?').get(triggerID);
      if (!trigger) return null;

      const newEnabled = trigger.enabled ? 0 : 1;
      db.prepare('UPDATE triggers SET enabled = ?, timeUpdate = ? WHERE id = ?')
        .run(newEnabled, Date.now(), triggerID);

      return this.getTriggerById(triggerID);
    } catch (error) {
      console.error('❌ Toggle trigger error:', error.message);
      return null;
    }
  },

  deleteTrigger(triggerID) {
    try {
      db.prepare('DELETE FROM triggers WHERE id = ?').run(triggerID);
      return true;
    } catch (error) {
      console.error('❌ Delete trigger error:', error.message);
      return false;
    }
  },

  findMatchingTrigger(userUID, messageContent, senderId, isFriend, hasAttachment = false) {
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

        // MỚI: Check theo loại trigger
        const triggerType = trigger.triggerType || 'keyword';

        if (triggerType === 'any_message') {
          // Match tất cả tin nhắn
          return trigger;
        } else if (triggerType === 'any_file') {
          // Chỉ match khi có file/ảnh
          if (hasAttachment) {
            return trigger;
          }
          continue;
        } else {
          // triggerType === 'keyword' - loại mặc định
          const keywords = trigger.keywords || [];
          for (const keyword of keywords) {
            if (lowerContent.includes(keyword.toLowerCase())) {
              return trigger;
            }
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
      triggerID: row.id,
      id: row.id,
      triggerName: row.triggerName,
      name: row.triggerName,
      triggerKey: row.triggerKey,
      triggerType: row.triggerType || 'keyword',  // MỚI: loại trigger
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

  getAllFlows(userUID) {
    try {
      // Get all triggers for this user, then find flows attached to them
      // Or if flows table had userUID it would be easier. 
      // Current schema: flows -> triggerID -> triggers -> triggerUserID
      const sql = `
        SELECT f.*, t.triggerName 
        FROM flows f
        JOIN triggers t ON f.triggerID = t.id
        WHERE t.triggerUserID = ?
        ORDER BY f.flowID DESC
      `;
      const flows = db.prepare(sql).all(userUID);
      return flows;
    } catch (error) {
      console.error('❌ Get all flows error:', error.message);
      return [];
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

  deleteVariables(userUID, variables) {
    try {
      const stmt = db.prepare('DELETE FROM variables WHERE userUID = ? AND conversationID = ? AND variableName = ?');
      const transaction = db.transaction(() => {
        for (const v of variables) {
          stmt.run(userUID, v.conversationID, v.variableName);
        }
      });
      transaction();
      return true;
    } catch (error) {
      console.error('❌ Delete variables error:', error.message);
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
        INSERT INTO payment_gates (userUID, gateName, bankCode, accountNumber, accountName, isActive)
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
      if (updates.isDefault !== undefined) { fields.push('isDefault = ?'); values.push(updates.isDefault ? 1 : 0); }

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

  setDefaultGate(userUID, gateID) {
    try {
      // 1. Unset all defaults for this user
      db.prepare('UPDATE payment_gates SET isDefault = 0 WHERE userUID = ?').run(userUID);

      // 2. Set new default
      db.prepare('UPDATE payment_gates SET isDefault = 1 WHERE userUID = ? AND gateID = ?').run(userUID, gateID);
      return true;
    } catch (error) {
      console.error('❌ Set default gate error:', error.message);
      return false;
    }
  },

  unsetDefaultGate(userUID) {
    try {
      db.prepare('UPDATE payment_gates SET isDefault = 0 WHERE userUID = ?').run(userUID);
      return true;
    } catch (error) {
      console.error('❌ Unset default gate error:', error.message);
      return false;
    }
  },



  getDefaultGate(userUID) {
    try {
      return db.prepare('SELECT * FROM payment_gates WHERE userUID = ? AND isDefault = 1 AND isActive = 1 LIMIT 1').get(userUID);
    } catch (error) {
      console.error('❌ Get default gate error:', error.message);
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
    for (let i = 0; i < 5; i++) {
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

  // Removed duplicate getAllTransactions definition


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
        INSERT INTO transactions (userUID, transactionCode, gateID, amount, currency, status, description, senderName, senderAccount, updatedAt)
        VALUES (?, ?, ?, ?, ?, 'WAITING', ?, ?, ?, ?)
      `);

      // Fix: Handle mapping of customerName/customerID -> senderName/senderAccount
      const senderName = data.senderName || data.customerName || null;
      const senderAccount = data.senderAccount || data.customerID || null;
      const now = Date.now();

      // Fallback gateID if missing (gateID is NOT NULL in DB)
      let gateID = data.gateID;
      if (!gateID) {
        console.log(`⚠️ Missing gateID for transaction, attempting to find default...`);
        const defaultGate = this.getDefaultGate(userUID);
        gateID = defaultGate?.gateID;
      }

      if (!gateID) {
        throw new Error('Cannot create transaction: No payment gate ID provided and no default gate found.');
      }

      console.log(`💾 Creating transaction ${transactionCode} for ${userUID}, gate: ${gateID}, amount: ${data.amount}`);

      const result = stmt.run(
        userUID || 'system',
        transactionCode,
        gateID,
        parseFloat(data.amount) || 0,
        data.currency || 'VND',
        data.note || data.description || null,
        senderName,
        senderAccount,
        now
      );

      console.log(`✅ Transaction created with ID: ${result.lastInsertRowid}`);
      return this.getTransactionById(result.lastInsertRowid);
    } catch (error) {
      console.error('❌ Create transaction error:', error.message, error.stack);
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

      // Fix: Map customerID/customerName to senderAccount/senderName columns
      if (updates.customerID !== undefined || updates.senderAccount !== undefined) {
        fields.push('senderAccount = ?');
        values.push(updates.senderAccount || updates.customerID);
      }
      if (updates.customerName !== undefined || updates.senderName !== undefined) {
        fields.push('senderName = ?');
        values.push(updates.senderName || updates.customerName);
      }

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

  getAllTransactions(userUID) {
    try {
      if (userUID) {
        return db.prepare('SELECT * FROM transactions WHERE userUID = ? ORDER BY createdAt DESC').all(userUID);
      }
      return db.prepare('SELECT * FROM transactions ORDER BY createdAt DESC').all();
    } catch (error) {
      console.error('❌ Get all transactions error:', error.message);
      return [];
    }
  },

  getTransactionById(transactionID) {
    try {
      return db.prepare('SELECT * FROM transactions WHERE transactionID = ?').get(transactionID);
    } catch (error) {
      console.error('❌ Get transaction by ID error:', error.message);
      return null;
    }
  },

  markTransactionPaid(transactionID) {
    try {
      const now = Date.now();
      db.prepare('UPDATE transactions SET status = ?, processedAt = ? WHERE transactionID = ?')
        .run('PAID', now, transactionID);
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

  generateTransactionCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'SEVQR';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  },

  // ========================================
  // TRANSACTION STATISTICS
  // ========================================

  /**
   * Get top users by payment amount
   * @param {number} limit - Max users to return
   * @param {string} month - Optional month filter (YYYY-MM format)
   * @returns {Array} Top users with total amounts
   */
  getTopUsersByAmount(limit = 10, month = null) {
    try {
      let sql = `
        SELECT 
          senderName,
          senderAccount,
          SUM(amount) as totalAmount,
          COUNT(*) as transactionCount
        FROM transactions
        WHERE status = 'PAID' AND senderAccount IS NOT NULL
      `;

      if (month) {
        sql += ` AND strftime('%Y-%m', datetime(createdAt/1000, 'unixepoch')) = ?`;
      }

      sql += `
        GROUP BY senderAccount
        ORDER BY totalAmount DESC
        LIMIT ?
      `;

      return month ?
        db.prepare(sql).all(month, limit) :
        db.prepare(sql).all(limit);
    } catch (error) {
      console.error('❌ Get top users error:', error.message);
      return [];
    }
  },

  /**
   * Get monthly transaction totals
   * @param {number} year - Year to get stats for
   * @param {number} months - Number of months
   * @returns {Array} Monthly statistics
   */
  getMonthlyTransactionStats(year = new Date().getFullYear(), months = 12) {
    try {
      const sql = `
        SELECT 
          strftime('%m', datetime(createdAt/1000, 'unixepoch')) as month,
          SUM(amount) as totalAmount,
          COUNT(*) as count
        FROM transactions
        WHERE status = 'PAID'
        AND strftime('%Y', datetime(createdAt/1000, 'unixepoch')) = ?
        GROUP BY month
        ORDER BY month ASC
      `;

      const results = db.prepare(sql).all(String(year));

      // Fill in missing months with zeros
      const monthMap = {};
      results.forEach(r => {
        monthMap[parseInt(r.month)] = {
          month: parseInt(r.month),
          totalAmount: r.totalAmount || 0,
          count: r.count || 0
        };
      });

      const fullResults = [];
      for (let i = 1; i <= 12; i++) {
        fullResults.push(monthMap[i] || {
          month: i,
          totalAmount: 0,
          count: 0
        });
      }

      return fullResults;
    } catch (error) {
      console.error('❌ Get monthly stats error:', error.message);
      return [];
    }
  },

  /**
   * Get transaction summary statistics
   * @returns {Object} Summary stats
   */
  getTransactionSummary() {
    try {
      const total = db.prepare('SELECT COUNT(*) as count FROM transactions').get();
      const paid = db.prepare('SELECT COUNT(*) as count, SUM(amount) as total FROM transactions WHERE status = \'PAID\'').get();
      const waiting = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE status = \'WAITING\'').get();
      const expired = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE status = \'EXPIRED\'').get();

      return {
        total: total.count || 0,
        paid: paid.count || 0,
        waiting: waiting.count || 0,
        expired: expired.count || 0,
        totalAmount: paid.total || 0,
        successRate: total.count > 0 ? ((paid.count / total.count) * 100).toFixed(1) : 0,
        avgAmount: paid.count > 0 ? Math.round(paid.total / paid.count) : 0
      };
    } catch (error) {
      console.error('❌ Get transaction summary error:', error.message);
      return {
        total: 0,
        paid: 0,
        waiting: 0,
        expired: 0,
        totalAmount: 0,
        successRate: 0,
        avgAmount: 0
      };
    }
  },

  // ========================================
  // PAYMENT LOGS CRUD
  // ========================================
  getPaymentLogs(userUID, limit = 100) {
    try {
      // TODO: Create payment_logs table first
      // return db.prepare('SELECT * FROM payment_logs WHERE userUID = ? ORDER BY paidAt DESC LIMIT ?').all(userUID, limit);
      return []; // Return empty array for now
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
        JOIN triggers t ON f.triggerID = t.id 
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
      return { total: 0, enabled: 0, disabled: 0, flows: 0, variables: 0 };
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
        INSERT INTO user_tables (userUID, tableName, tableDescription)
        VALUES (?, ?, ?)
      `);
      const result = stmt.run(
        userUID,
        data.tableName || 'New Table',
        data.tableDescription || ''
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
      console.log(`  ✓ Row inserted with rowID: ${rowID}, order: ${order}`);

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
  // EMAIL MANAGEMENT
  // ========================================
  getAllEmailSenders() {
    try {
      return db.prepare(`
        SELECT senderID as id, email, displayName, description, isActive, createdAt, updatedAt
        FROM email_senders
        ORDER BY createdAt DESC
      `).all();
    } catch (error) { console.error('❌ Get all senders error:', error.message); return []; }
  },

  getEmailSenderById(senderID) {
    try {
      return db.prepare(`
        SELECT senderID as id, email, displayName, description, googleRefreshToken, googleAccessToken, 
               tokenExpiresAt, isActive, createdAt, updatedAt
        FROM email_senders WHERE senderID = ?
      `).get(senderID);
    } catch (error) { console.error('❌ Get sender error:', error.message); return null; }
  },

  getEmailSenderByEmail(email) {
    try {
      return db.prepare(`
        SELECT senderID as id, email, displayName, description, googleRefreshToken, googleAccessToken,
               tokenExpiresAt, isActive, createdAt, updatedAt
        FROM email_senders WHERE email = ?
      `).get(email);
    } catch (error) { console.error('❌ Get sender by email error:', error.message); return null; }
  },

  createEmailSender(data) {
    try {
      const { email, displayName, description, refreshToken, accessToken } = data;
      if (!email) throw new Error('Email is required');

      const result = db.prepare(`
        INSERT INTO email_senders (email, displayName, description, googleRefreshToken, googleAccessToken, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(email, displayName || '', description || '', refreshToken || '', accessToken || '', 1, Date.now(), Date.now());

      return this.getEmailSenderById(result.lastInsertRowid);
    } catch (error) { console.error('❌ Create sender error:', error.message); return null; }
  },

  updateEmailSender(senderID, updates) {
    try {
      const fields = [];
      const values = [];
      if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email); }
      if (updates.displayName !== undefined) { fields.push('displayName = ?'); values.push(updates.displayName); }
      if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
      if (updates.refreshToken !== undefined) { fields.push('googleRefreshToken = ?'); values.push(updates.refreshToken); }
      if (updates.accessToken !== undefined) { fields.push('googleAccessToken = ?'); values.push(updates.accessToken); }
      if (updates.tokenExpiresAt !== undefined) { fields.push('tokenExpiresAt = ?'); values.push(updates.tokenExpiresAt); }
      if (updates.isActive !== undefined) { fields.push('isActive = ?'); values.push(updates.isActive ? 1 : 0); }
      if (fields.length === 0) return this.getEmailSenderById(senderID);
      fields.push('updatedAt = ?'); values.push(Date.now()); values.push(senderID);
      db.prepare(`UPDATE email_senders SET ${fields.join(', ')} WHERE senderID = ?`).run(...values);
      return this.getEmailSenderById(senderID);
    } catch (error) { console.error('❌ Update sender error:', error.message); return null; }
  },

  deleteEmailSender(senderID) {
    try {
      const result = db.prepare('DELETE FROM email_senders WHERE senderID = ?').run(senderID);
      return result.changes > 0;
    } catch (error) { console.error('❌ Delete sender error:', error.message); return false; }
  },

  // ========================================
  // EMAIL RECIPIENTS
  // ========================================
  getAllEmailRecipients() {
    try {
      return db.prepare(`
        SELECT recipientID as id, email, name, company, tags, createdAt
        FROM email_recipients
        ORDER BY createdAt DESC
      `).all();
    } catch (error) { console.error('❌ Get all recipients error:', error.message); return []; }
  },

  getEmailRecipientById(recipientID) {
    try {
      return db.prepare(`
        SELECT recipientID as id, email, name, company, tags, createdAt
        FROM email_recipients WHERE recipientID = ?
      `).get(recipientID);
    } catch (error) { console.error('❌ Get recipient error:', error.message); return null; }
  },

  getEmailRecipientByEmail(email) {
    try {
      return db.prepare(`
        SELECT recipientID as id, email, name, company, tags, createdAt
        FROM email_recipients WHERE email = ?
      `).get(email);
    } catch (error) { console.error('❌ Get recipient by email error:', error.message); return null; }
  },

  createEmailRecipient(data) {
    try {
      const { email, name, company, tags } = data;
      if (!email || !name) throw new Error('Email and name are required');

      // Check if exists
      const existing = this.getEmailRecipientByEmail(email);
      if (existing) return existing;

      const result = db.prepare(`
        INSERT INTO email_recipients (email, name, company, tags, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(email, name, company || '', tags || '', Date.now());

      return this.getEmailRecipientById(result.lastInsertRowid);
    } catch (error) { console.error('❌ Create recipient error:', error.message); return null; }
  },

  updateEmailRecipient(recipientID, updates) {
    try {
      const fields = [];
      const values = [];
      if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email); }
      if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
      if (updates.company !== undefined) { fields.push('company = ?'); values.push(updates.company); }
      if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(updates.tags); }
      if (fields.length === 0) return this.getEmailRecipientById(recipientID);
      values.push(recipientID);
      db.prepare(`UPDATE email_recipients SET ${fields.join(', ')} WHERE recipientID = ?`).run(...values);
      return this.getEmailRecipientById(recipientID);
    } catch (error) { console.error('❌ Update recipient error:', error.message); return null; }
  },

  deleteEmailRecipient(recipientID) {
    try {
      const result = db.prepare('DELETE FROM email_recipients WHERE recipientID = ?').run(recipientID);
      return result.changes > 0;
    } catch (error) { console.error('❌ Delete recipient error:', error.message); return false; }
  },

  // ========================================
  // EMAIL LOGS
  // ========================================
  getEmailLogs(limit = 100) {
    try {
      return db.prepare(`
        SELECT logID as id, senderProfileID, senderEmail, recipientEmail, subject, status, 
               sentAt, errorMessage, flowID, triggerID
        FROM email_logs
        ORDER BY sentAt DESC
        LIMIT ?
      `).all(limit);
    } catch (error) { console.error('❌ Get logs error:', error.message); return []; }
  },

  getEmailLogById(logID) {
    try {
      return db.prepare(`
        SELECT logID as id, senderProfileID, senderEmail, recipientEmail, subject, body, status,
               sentAt, errorMessage, flowID, triggerID
        FROM email_logs WHERE logID = ?
      `).get(logID);
    } catch (error) { console.error('❌ Get log error:', error.message); return null; }
  },

  createEmailLog(data) {
    try {
      const { senderProfileID, senderEmail, recipientEmail, subject, body, status, errorMessage, flowID, triggerID } = data;
      if (!senderProfileID || !recipientEmail || !subject) throw new Error('Missing required fields');

      const result = db.prepare(`
        INSERT INTO email_logs (senderProfileID, senderEmail, recipientEmail, subject, body, status, errorMessage, sentAt, flowID, triggerID)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(senderProfileID, senderEmail || '', recipientEmail, subject, body || '', status || 'pending', errorMessage || '', Date.now(), flowID || null, triggerID || null);

      return this.getEmailLogById(result.lastInsertRowid);
    } catch (error) { console.error('❌ Create log error:', error.message); return null; }
  },

  updateEmailLogStatus(logID, status, errorMessage = null) {
    try {
      db.prepare(`
        UPDATE email_logs SET status = ?, errorMessage = ?
        WHERE logID = ?
      `).run(status, errorMessage || '', logID);

      return this.getEmailLogById(logID);
    } catch (error) { console.error('❌ Update log status error:', error.message); return null; }
  },

  getEmailLogsByRecipient(recipientEmail, limit = 50) {
    try {
      return db.prepare(`
        SELECT logID as id, senderProfileID, senderEmail, recipientEmail, subject, status, sentAt
        FROM email_logs
        WHERE recipientEmail = ?
        ORDER BY sentAt DESC
        LIMIT ?
      `).all(recipientEmail, limit);
    } catch (error) { console.error('❌ Get logs by recipient error:', error.message); return []; }
  },

  getEmailLogsBySender(senderProfileID, limit = 50) {
    try {
      return db.prepare(`
        SELECT logID as id, senderProfileID, senderEmail, recipientEmail, subject, status, sentAt
        FROM email_logs
        WHERE senderProfileID = ?
        ORDER BY sentAt DESC
        LIMIT ?
      `).all(senderProfileID, limit);
    } catch (error) { console.error('❌ Get logs by sender error:', error.message); return []; }
  },

  // ========================================
  // SCHEDULED TASKS METHODS
  // ========================================
  getPendingScheduledTasks(userId, currentTime) {
    try {
      return db.prepare("SELECT * FROM scheduled_tasks WHERE userId = ? AND status = 'pending' AND enabled = 1 AND executeTime <= ?").all(userId, currentTime);
    } catch (e) { console.error('❌ Get pending tasks error:', e.message); return []; }
  },

  getAllScheduledTasks(userId) {
    try {
      return db.prepare("SELECT * FROM scheduled_tasks WHERE userId = ? ORDER BY executeTime ASC").all(userId);
    } catch (e) { console.error('❌ Get all tasks error:', e.message); return []; }
  },

  createScheduledTask(userId, targetId, targetName, content, type, executeTime) {
    try {
      const stmt = db.prepare(`
        INSERT INTO scheduled_tasks (userId, targetId, targetName, content, type, executeTime, status, enabled)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', 1)
      `);
      const res = stmt.run(userId, targetId, targetName, content, type || 'text', executeTime);
      return res.lastInsertRowid;
    } catch (e) { console.error('❌ Create scheduled task error:', e.message); return null; }
  },

  updateScheduledTaskStatus(id, status) {
    try {
      db.prepare("UPDATE scheduled_tasks SET status = ? WHERE id = ?").run(status, id);
      return true;
    } catch (e) { console.error('❌ Update task status error:', e.message); return false; }
  },

  updateScheduledTask(id, userId, updates) {
    try {
      const allowedFields = ['targetId', 'targetName', 'content', 'type', 'executeTime', 'status', 'enabled'];
      const fields = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined) {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (fields.length === 0) return false;

      values.push(id);
      values.push(userId);

      const stmt = db.prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ? AND userId = ? `);
      const result = stmt.run(...values);
      return result.changes > 0;
    } catch (error) {
      console.error('❌ Update scheduled task error:', error.message);
      return false;
    }
  },

  deleteScheduledTask(id, userId) {
    try {
      db.prepare("DELETE FROM scheduled_tasks WHERE id = ? AND userId = ?").run(id, userId);
      return true;
    } catch (e) { console.error('❌ Delete task error:', e.message); return false; }
  },

  // ========================================
  // USER SETTINGS METHODS (Per-User Toggle)
  // ========================================
  setUserSetting(userId, targetId, key, value) {
    try {
      db.prepare(`
        INSERT INTO user_settings(userId, targetId, settingKey, settingValue)
      VALUES(?, ?, ?, ?)
        ON CONFLICT(userId, targetId, settingKey) 
        DO UPDATE SET settingValue = excluded.settingValue
        `).run(userId, targetId, key, value.toString());
      return true;
    } catch (e) { console.error('❌ Set user setting error:', e.message); return false; }
  },

  getUserSetting(userId, targetId, key) {
    try {
      const res = db.prepare("SELECT settingValue FROM user_settings WHERE userId = ? AND targetId = ? AND settingKey = ?").get(userId, targetId, key);
      return res ? res.settingValue : null;
    } catch (e) { console.error('❌ Get user setting error:', e.message); return null; }
  },

  getAutoReplyBlacklist(userId) {
    try {
      // Get all targetIds where auto_reply_enabled is 'false'
      const rows = db.prepare("SELECT targetId FROM user_settings WHERE userId = ? AND settingKey = 'auto_reply_enabled' AND settingValue = 'false'").all(userId);
      return rows.map(r => r.targetId);
    } catch (e) { console.error('❌ Get blacklist error:', e.message); return []; }
  },

  // ========================================
  // ACTIVITY LOGS (New Implementation)
  // ========================================
  logActivity(userUID, action, entityType, entityID, entityName, details) {
    try {
      const stmt = db.prepare(`
        INSERT INTO activity_logs(userUID, action, entityType, entityID, entityName, details, timestamp)
      VALUES(?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(userUID, action, entityType, entityID || null, entityName || null, details || null, Date.now());
      // console.log(`📝 Logged activity: ${ action } - ${ entityName } `);
      return true;
    } catch (e) {
      console.error('❌ Log activity error:', e.message);
      return false;
    }
  },

  getActivityLogs(userUID, limit = 50) {
    try {
      return db.prepare(`
      SELECT * FROM activity_logs 
        WHERE userUID = ?
        ORDER BY timestamp DESC
      LIMIT ?
        `).all(userUID, limit);
    } catch (e) {
      console.error('❌ Get activity logs error:', e.message);
      return [];
    }
  },

  // ========================================
  // BUILT-IN TRIGGERS STATE
  // ========================================
  saveBuiltInTriggerState(userUID, triggerKey, stateData) {
    try {
      const dataJSON = JSON.stringify(stateData);
      console.log(`💾 Saving to DB - userUID: ${userUID}, triggerKey: ${triggerKey}`);
      console.log(`📦 Data to save:`, stateData);
      console.log(`📝 JSON string length: ${dataJSON.length} chars`);

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO builtin_triggers_state (userUID, triggerKey, stateData, updatedAt)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(userUID, triggerKey, dataJSON, Date.now());
      console.log(`✅ Saved built-in trigger state: ${triggerKey} for user ${userUID}`);
      return true;
    } catch (e) {
      console.error('❌ Save built-in trigger state error:', e.message);
      console.error('Stack:', e.stack);
      return false;
    }
  },

  getBuiltInTriggerState(userUID, triggerKey) {
    try {
      console.log(`📥 Loading from DB - userUID: ${userUID}, triggerKey: ${triggerKey}`);

      const row = db.prepare(`
        SELECT stateData FROM builtin_triggers_state
        WHERE userUID = ? AND triggerKey = ?
      `).get(userUID, triggerKey);

      if (row && row.stateData) {
        const parsed = JSON.parse(row.stateData);
        console.log(`✅ Loaded state:`, parsed);
        return parsed;
      }
      console.log(`ℹ️ No state found in DB for ${triggerKey}`);
      return null;
    } catch (e) {
      console.error('❌ Get built-in trigger state error:', e.message);
      console.error('Stack:', e.stack);
      return null;
    }
  },

  getAllBuiltInTriggerStates(userUID) {
    try {
      const rows = db.prepare(`
        SELECT triggerKey, stateData FROM builtin_triggers_state
        WHERE userUID = ?
      `).all(userUID);

      const states = {};
      rows.forEach(row => {
        if (row.stateData) {
          states[row.triggerKey] = JSON.parse(row.stateData);
        }
      });
      return states;
    } catch (e) {
      console.error('❌ Get all built-in trigger states error:', e.message);
      return {};
    }
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
  },

  // ========================================
  // PAYMENT GATES
  // ========================================
  getAllPaymentGates(userUID) {
    try {
      if (userUID) {
        return db.prepare('SELECT * FROM payment_gates WHERE userUID = ? ORDER BY createdAt DESC').all(userUID);
      }
      return db.prepare('SELECT * FROM payment_gates ORDER BY createdAt DESC').all();
    } catch (error) {
      console.error('❌ Get all payment gates error:', error.message);
      return [];
    }
  },

  getPaymentGateById(gateID) {
    try {
      return db.prepare('SELECT * FROM payment_gates WHERE gateID = ?').get(gateID);
    } catch (error) {
      console.error('❌ Get payment gate by ID error:', error.message);
      return null;
    }
  },

  getDefaultGate(userUID) {
    try {
      let gate = null;
      if (userUID) {
        gate = db.prepare('SELECT * FROM payment_gates WHERE userUID = ? AND isDefault = 1').get(userUID);
      }

      if (!gate) {
        gate = db.prepare('SELECT * FROM payment_gates WHERE isDefault = 1 LIMIT 1').get();
      }

      if (!gate) {
        // Ultimate fallback: get any active gate
        gate = db.prepare('SELECT * FROM payment_gates WHERE isActive = 1 ORDER BY createdAt DESC LIMIT 1').get();
      }

      return gate;
    } catch (error) {
      console.error('❌ Get default gate error:', error.message);
      return null;
    }
  },

  createPaymentGate(userUID, data) {
    try {
      const targetUID = userUID || 'system';
      console.log(`💾 Attempting to create payment gate for ${targetUID}:`, {
        name: data.gateName,
        bank: data.bankCode,
        account: data.accountNumber
      });

      // If this is default, unset others first for this UID
      if (data.isDefault) {
        try {
          db.prepare('UPDATE payment_gates SET isDefault = 0 WHERE userUID = ? OR userUID IS NULL').run(targetUID);
        } catch (e) {
          console.warn('⚠️ Could not unset default gates:', e.message);
        }
      }

      const stmt = db.prepare(`
        INSERT INTO payment_gates (
          userUID, gateName, gateType, bankCode, accountNumber, accountName, 
          isActive, isDefault, createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `);

      const now = Date.now();
      const result = stmt.run(
        targetUID,
        data.gateName || 'Chưa đặt tên',
        data.gateType || 'manual',
        String(data.bankCode || ''),
        String(data.accountNumber || ''),
        String(data.accountName || ''),
        data.isDefault ? 1 : 0,
        now,
        now
      );

      console.log(`✅ Payment gate created successfully, ID: ${result.lastInsertRowid}`);
      return this.getPaymentGateById(result.lastInsertRowid);
    } catch (error) {
      console.error('❌ Create payment gate failed in triggerDB:', error.message);
      // Fallback: If it failed due to unique constraint or something, we want to know
      throw new Error(`Database Error: ${error.message}`);
    }
  },

  setDefaultGate(userUID, gateID) {
    try {
      const targetUID = userUID || 'system';
      console.log(`⭐ Setting gate ${gateID} as default for ${targetUID}`);

      db.transaction(() => {
        // Unset all as default (including those with null userUID)
        db.prepare('UPDATE payment_gates SET isDefault = 0 WHERE userUID = ? OR userUID IS NULL').run(targetUID);
        // Set this specific one as default
        db.prepare('UPDATE payment_gates SET isDefault = 1 WHERE gateID = ?').run(gateID);
      })();
      return true;
    } catch (error) {
      console.error('❌ Set default gate error:', error.message);
      return false;
    }
  },

  deletePaymentGate(gateID) {
    try {
      const result = db.prepare('DELETE FROM payment_gates WHERE gateID = ?').get(gateID);
      return result.changes > 0;
    } catch (error) {
      console.error('❌ Delete payment gate error:', error.message);
      return false;
    }
  },

  // ========================================
  // AUTOMATION ROUTINES (New)
  // ========================================
  getAutomationRoutines(userUID) {
    try {
      const rows = db.prepare("SELECT * FROM automation_routines WHERE userUID = ? ORDER BY createdAt DESC").all(userUID);
      return rows.map(r => ({
        ...r,
        integrations: r.integrations ? JSON.parse(r.integrations) : {},
        enabled: !!r.enabled
      }));
    } catch (e) { console.error('❌ Get routines error:', e.message); return []; }
  },

  getAutomationRoutineById(id) {
    try {
      const r = db.prepare("SELECT * FROM automation_routines WHERE id = ?").get(id);
      if (r) {
        r.integrations = r.integrations ? JSON.parse(r.integrations) : {};
        r.enabled = !!r.enabled;
      }
      return r;
    } catch (e) { return null; }
  },

  createAutomationRoutine(data) {
    try {
      const stmt = db.prepare(`
        INSERT INTO automation_routines (userUID, targetId, targetName, routineName, frequency, atTime, integrations, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const res = stmt.run(
        data.userUID,
        data.targetId,
        data.targetName || 'Unknown',
        data.routineName,
        data.frequency || 'daily',
        data.atTime,
        data.integrations ? JSON.stringify(data.integrations) : '{}',
        data.enabled !== false ? 1 : 0
      );
      return res.lastInsertRowid;
    } catch (e) { console.error('❌ Create routine error:', e.message); return null; }
  },

  updateAutomationRoutine(id, userUID, updates) {
    try {
      const allowedFields = ['targetId', 'targetName', 'routineName', 'frequency', 'atTime', 'integrations', 'enabled', 'lastRun'];
      const fields = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined) {
          fields.push(`${key} = ?`);
          if (key === 'integrations' && typeof value === 'object') {
            values.push(JSON.stringify(value));
          } else if (key === 'enabled') {
            values.push(value ? 1 : 0);
          } else {
            values.push(value);
          }
        }
      }

      if (fields.length === 0) return false;

      values.push(id);
      values.push(userUID);

      const stmt = db.prepare(`UPDATE automation_routines SET ${fields.join(', ')} WHERE id = ? AND userUID = ?`);
      const result = stmt.run(...values);
      return result.changes > 0;
    } catch (error) {
      console.error('❌ Update routine error:', error.message);
      return false;
    }
  },

  deleteAutomationRoutine(id, userUID) {
    try {
      db.prepare("DELETE FROM automation_routines WHERE id = ? AND userUID = ?").run(id, userUID);
      return true;
    } catch (e) { console.error('❌ Delete routine error:', e.message); return false; }
  },

  getDueAutomationRoutines() {
    try {
      const rows = db.prepare("SELECT * FROM automation_routines WHERE enabled = 1").all();
      return rows.map(r => ({
        ...r,
        integrations: r.integrations ? JSON.parse(r.integrations) : {},
        enabled: !!r.enabled
      }));
    } catch (e) { return []; }
  }
};