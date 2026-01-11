const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'triggers.db');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function initDB() {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

function createTables(db) {
  // Moved from triggerDB._createTables
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

  // Flow blocks table
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

  // BLOCK DATA TABLES
  db.exec(`
    CREATE TABLE IF NOT EXISTS block_conditions (
      conditionID INTEGER PRIMARY KEY AUTOINCREMENT,
      blockID INTEGER NOT NULL,
      columnID TEXT,
      operator TEXT DEFAULT 'equals',
      conditionValue TEXT,
      conditionOrder INTEGER DEFAULT 0,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (blockID) REFERENCES flow_blocks(blockID) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS block_column_values (
      valueID INTEGER PRIMARY KEY AUTOINCREMENT,
      blockID INTEGER NOT NULL,
      columnID TEXT,
      columnValue TEXT,
      valueOrder INTEGER DEFAULT 0,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (blockID) REFERENCES flow_blocks(blockID) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS block_result_mappings (
      mappingID INTEGER PRIMARY KEY AUTOINCREMENT,
      blockID INTEGER NOT NULL,
      columnID TEXT,
      variableName TEXT,
      mappingOrder INTEGER DEFAULT 0,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (blockID) REFERENCES flow_blocks(blockID) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_block_conditions_blockID ON block_conditions(blockID);
    CREATE INDEX IF NOT EXISTS idx_block_column_values_blockID ON block_column_values(blockID);
    CREATE INDEX IF NOT EXISTS idx_block_result_mappings_blockID ON block_result_mappings(blockID);
  `);

  // GOOGLE SHEET CONFIGS
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_sheet_configs (
      configID INTEGER PRIMARY KEY AUTOINCREMENT,
      userUID TEXT NOT NULL,
      name TEXT NOT NULL,
      scriptURL TEXT NOT NULL,
      sheetName TEXT DEFAULT 'Sheet1',
      spreadsheetId TEXT,
      apiKey TEXT,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_google_sheet_configs_userUID ON google_sheet_configs(userUID)`);

  // AI CONFIGS
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_configs (
      configID INTEGER PRIMARY KEY AUTOINCREMENT,
      userUID TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'gemini',
      model TEXT NOT NULL,
      apiKey TEXT NOT NULL,
      endpoint TEXT,
      temperature REAL DEFAULT 0.7,
      maxTokens INTEGER DEFAULT 1024,
      systemPrompt TEXT,
      status TEXT DEFAULT 'unknown',
      isDefault INTEGER DEFAULT 0,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_configs_userUID ON ai_configs(userUID)`);

  // IMAGES
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      imageID INTEGER PRIMARY KEY AUTOINCREMENT,
      userUID TEXT NOT NULL,
      name TEXT NOT NULL,
      variableName TEXT,
      description TEXT,
      fileName TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileSize INTEGER DEFAULT 0,
      mimeType TEXT DEFAULT 'image/jpeg',
      width INTEGER,
      height INTEGER,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_images_userUID ON images(userUID);
    CREATE INDEX IF NOT EXISTS idx_images_variableName ON images(variableName);
  `);

  // FILES
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      fileID INTEGER PRIMARY KEY AUTOINCREMENT,
      userUID TEXT NOT NULL,
      name TEXT NOT NULL,
      variableName TEXT,
      description TEXT,
      fileName TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileSize INTEGER DEFAULT 0,
      mimeType TEXT,
      fileType TEXT,
      category TEXT DEFAULT 'document',
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_files_userUID ON files(userUID);
    CREATE INDEX IF NOT EXISTS idx_files_variableName ON files(variableName);
    CREATE INDEX IF NOT EXISTS idx_files_category ON files(category);
    CREATE INDEX IF NOT EXISTS idx_files_fileType ON files(fileType);
  `);

  // FILE TEMPLATES
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_templates (
      templateID INTEGER PRIMARY KEY AUTOINCREMENT,
      userUID TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      fileName TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileSize INTEGER DEFAULT 0,
      mimeType TEXT,
      fileType TEXT,
      variables TEXT,
      outputFormat TEXT DEFAULT 'same',
      isActive INTEGER DEFAULT 1,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_file_templates_userUID ON file_templates(userUID)`);

  // Variables table
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

  // User input states
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
      userUID TEXT,
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityID INTEGER,
      entityName TEXT,
      details TEXT,
      oldValue TEXT,
      newValue TEXT,
      timestamp INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activity_logs_userUID ON activity_logs(userUID);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_entityType ON activity_logs(entityType);
  `);

  // EMAIL SENDER PROFILES
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_senders (
      senderID INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      displayName TEXT,
      description TEXT,
      googleRefreshToken TEXT,
      googleAccessToken TEXT,
      tokenExpiresAt INTEGER,
      isActive INTEGER DEFAULT 0,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_senders_email ON email_senders(email)`);

  // EMAIL RECIPIENTS
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_recipients (
      recipientID INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      company TEXT,
      tags TEXT,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_recipients_email ON email_recipients(email)`);

  // EMAIL LOGS
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_logs (
      logID INTEGER PRIMARY KEY AUTOINCREMENT,
      senderProfileID INTEGER NOT NULL,
      senderEmail TEXT,
      recipientEmail TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      status TEXT DEFAULT 'pending',
      errorMessage TEXT,
      sentAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      flowID INTEGER,
      triggerID INTEGER,
      FOREIGN KEY (senderProfileID) REFERENCES email_senders(senderID) ON DELETE CASCADE,
      FOREIGN KEY (flowID) REFERENCES flows(flowID),
      FOREIGN KEY (triggerID) REFERENCES triggers(triggerID)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_email_logs_senderProfileID ON email_logs(senderProfileID);
    CREATE INDEX IF NOT EXISTS idx_email_logs_recipientEmail ON email_logs(recipientEmail);
    CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
    CREATE INDEX IF NOT EXISTS idx_email_logs_sentAt ON email_logs(sentAt);
  `);

  // PAYMENT GATES
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_gates (
      gateID INTEGER PRIMARY KEY AUTOINCREMENT,
      userUID TEXT NOT NULL,
      gateName TEXT NOT NULL,
      gateType TEXT NOT NULL DEFAULT 'momo',
      accountNumber TEXT,
      accountName TEXT,
      bankCode TEXT,
      apiKey TEXT,
      apiSecret TEXT,
      webhookURL TEXT,
      qrCodeURL TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_payment_gates_userUID ON payment_gates(userUID)`);

  // USER TABLES (Custom data tables)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_tables (
      tableID INTEGER PRIMARY KEY AUTOINCREMENT,
      userUID TEXT NOT NULL,
      tableName TEXT NOT NULL,
      tableDescription TEXT,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      UNIQUE(userUID, tableName)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_tables_userUID ON user_tables(userUID)`);

  // TABLE COLUMNS
  db.exec(`
    CREATE TABLE IF NOT EXISTS table_columns (
      columnID INTEGER PRIMARY KEY AUTOINCREMENT,
      tableID INTEGER NOT NULL,
      columnName TEXT NOT NULL,
      columnType TEXT DEFAULT 'TEXT',
      isUnique INTEGER DEFAULT 0,
      isRequired INTEGER DEFAULT 0,
      defaultValue TEXT,
      columnOrder INTEGER DEFAULT 0,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (tableID) REFERENCES user_tables(tableID) ON DELETE CASCADE,
      UNIQUE(tableID, columnName)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_table_columns_tableID ON table_columns(tableID)`);

  // TABLE ROWS (Data storage for custom tables)
  db.exec(`
    CREATE TABLE IF NOT EXISTS table_rows (
      rowID INTEGER PRIMARY KEY AUTOINCREMENT,
      tableID INTEGER NOT NULL,
      rowData TEXT NOT NULL,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      updatedAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (tableID) REFERENCES user_tables(tableID) ON DELETE CASCADE
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_table_rows_tableID ON table_rows(tableID)`);

  // TRANSACTIONS
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      transactionID INTEGER PRIMARY KEY AUTOINCREMENT,
      userUID TEXT NOT NULL,
      gateID INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'VND',
      status TEXT DEFAULT 'pending',
      transactionCode TEXT,
      description TEXT,
      senderName TEXT,
      senderAccount TEXT,
      receivedAt INTEGER,
      processedAt INTEGER,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (gateID) REFERENCES payment_gates(gateID) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_userUID ON transactions(userUID);
    CREATE INDEX IF NOT EXISTS idx_transactions_gateID ON transactions(gateID);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_transactionCode ON transactions(transactionCode);
  `);

  console.log('✅ Database tables created/verified');
}

module.exports = {
  DATA_DIR,
  DB_PATH,
  initDB,
  createTables
};
