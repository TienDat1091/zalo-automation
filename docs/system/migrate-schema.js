/**
 * Database Schema Migration Script
 * Creates all necessary tables for PostgreSQL or SQLite
 */

const dbWrapper = require('./db-wrapper');

async function migrateSchema() {
  console.log('🔄 Starting schema migration...');
  const { type } = dbWrapper.initDatabase();

  try {
    // Create triggers table
    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS triggers (
        triggerID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        triggerName TEXT NOT NULL,
        triggerKey TEXT,
        triggerUserID TEXT NOT NULL,
        triggerContent TEXT,
        timeCreated BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        timeUpdate BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
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
    console.log('✅ Created triggers table');

    // Create flows table
    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS flows (
        flowID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        triggerID INTEGER NOT NULL,
        flowName TEXT,
        flowDescription TEXT,
        isActive INTEGER DEFAULT 1,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        FOREIGN KEY (triggerID) REFERENCES triggers(triggerID) ON DELETE CASCADE
      )
    `);
    console.log('✅ Created flows table');

    // Create flow_blocks table
    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS flow_blocks (
        blockID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        flowID INTEGER NOT NULL,
        blockType TEXT NOT NULL,
        blockData TEXT DEFAULT '{}',
        blockOrder INTEGER DEFAULT 0,
        parentBlockID INTEGER,
        condition1 INTEGER,
        condition2 INTEGER,
        branchType TEXT,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        FOREIGN KEY (flowID) REFERENCES flows(flowID) ON DELETE CASCADE
      )
    `);
    console.log('✅ Created flow_blocks table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS block_conditions (
        conditionID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        blockID INTEGER NOT NULL,
        columnID TEXT,
        operator TEXT DEFAULT 'equals',
        conditionValue TEXT,
        conditionOrder INTEGER DEFAULT 0,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        FOREIGN KEY (blockID) REFERENCES flow_blocks(blockID) ON DELETE CASCADE
      )
    `);
    console.log('✅ Created block_conditions table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS block_column_values (
        valueID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        blockID INTEGER NOT NULL,
        columnID TEXT,
        columnValue TEXT,
        valueOrder INTEGER DEFAULT 0,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        FOREIGN KEY (blockID) REFERENCES flow_blocks(blockID) ON DELETE CASCADE
      )
    `);
    console.log('✅ Created block_column_values table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS block_result_mappings (
        mappingID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        blockID INTEGER NOT NULL,
        columnID TEXT,
        variableName TEXT,
        mappingOrder INTEGER DEFAULT 0,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        FOREIGN KEY (blockID) REFERENCES flow_blocks(blockID) ON DELETE CASCADE
      )
    `);
    console.log('✅ Created block_result_mappings table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS google_sheet_configs (
        configID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        userUID TEXT NOT NULL,
        name TEXT NOT NULL,
        scriptURL TEXT NOT NULL,
        sheetName TEXT DEFAULT 'Sheet1',
        spreadsheetId TEXT,
        apiKey TEXT,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created google_sheet_configs table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS ai_configs (
        configID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
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
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created ai_configs table');

    // Create additional tables for block data
    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS images (
        imageID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
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
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created images table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS files (
        fileID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
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
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created files table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS file_templates (
        templateID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
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
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created file_templates table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS variables (
        variableID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        userUID TEXT NOT NULL,
        conversationID TEXT,
        variableName TEXT NOT NULL,
        variableValue TEXT,
        variableType TEXT DEFAULT 'text',
        blockID INTEGER,
        flowID INTEGER,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        expiresAt BIGINT,
        ${type === 'postgres' ? 'UNIQUE(userUID, conversationID, variableName)' : 'UNIQUE(userUID, conversationID, variableName)'}
      )
    `);
    console.log('✅ Created variables table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS user_input_states (
        stateID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
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
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        expiresAt BIGINT,
        isActive INTEGER DEFAULT 1,
        questions TEXT,
        currentQuestionIndex INTEGER DEFAULT 0,
        flowContext TEXT,
        nextBlockOrder INTEGER,
        retryMessage TEXT,
        timeoutMessage TEXT,
        ${type === 'postgres' ? 'UNIQUE(userUID, conversationID)' : 'UNIQUE(userUID, conversationID)'}
      )
    `);
    console.log('✅ Created user_input_states table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        logID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        userUID TEXT,
        action TEXT NOT NULL,
        entityType TEXT NOT NULL,
        entityID INTEGER,
        entityName TEXT,
        details TEXT,
        oldValue TEXT,
        newValue TEXT,
        timestamp BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created activity_logs table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS email_senders (
        senderID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        email TEXT UNIQUE NOT NULL,
        displayName TEXT,
        description TEXT,
        googleRefreshToken TEXT,
        googleAccessToken TEXT,
        tokenExpiresAt BIGINT,
        isActive INTEGER DEFAULT 0,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created email_senders table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS email_recipients (
        recipientID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        company TEXT,
        tags TEXT,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created email_recipients table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS email_logs (
        logID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        senderProfileID INTEGER NOT NULL,
        senderEmail TEXT,
        recipientEmail TEXT NOT NULL,
        subject TEXT,
        body TEXT,
        status TEXT DEFAULT 'pending',
        errorMessage TEXT,
        sentAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        flowID INTEGER,
        triggerID INTEGER,
        FOREIGN KEY (senderProfileID) REFERENCES email_senders(senderID) ON DELETE CASCADE,
        FOREIGN KEY (flowID) REFERENCES flows(flowID),
        FOREIGN KEY (triggerID) REFERENCES triggers(triggerID)
      )
    `);
    console.log('✅ Created email_logs table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS custom_tables (
        tableID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        tableName TEXT NOT NULL UNIQUE,
        tableData TEXT DEFAULT '[]',
        userUID TEXT NOT NULL,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created custom_tables table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS payment_gates (
        gateID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        userUID TEXT NOT NULL,
        gateName TEXT NOT NULL,
        bankBin TEXT,
        accountNumber TEXT,
        accountName TEXT,
        status INTEGER DEFAULT 1,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created payment_gates table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS user_tables (
        tableID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        userUID TEXT NOT NULL,
        flowID INTEGER,
        tableName TEXT NOT NULL,
        tableDescription TEXT,
        status INTEGER DEFAULT 1,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created user_tables table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS table_columns (
        columnID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        tableID INTEGER NOT NULL,
        columnName TEXT NOT NULL,
        columnType TEXT DEFAULT 'text',
        columnOrder INTEGER DEFAULT 0,
        isRequired INTEGER DEFAULT 0,
        defaultValue TEXT,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        FOREIGN KEY (tableID) REFERENCES user_tables(tableID) ON DELETE CASCADE
      )
    `);
    console.log('✅ Created table_columns table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS table_rows (
        rowID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        tableID INTEGER NOT NULL,
        rowData TEXT DEFAULT '{}',
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        FOREIGN KEY (tableID) REFERENCES user_tables(tableID) ON DELETE CASCADE
      )
    `);
    console.log('✅ Created table_rows table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        transactionID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        userUID TEXT NOT NULL,
        gateID INTEGER,
        transactionCode TEXT UNIQUE,
        amount REAL DEFAULT 0,
        description TEXT,
        status TEXT DEFAULT 'pending',
        bankTransactionID TEXT,
        createdAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        updatedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"},
        FOREIGN KEY (gateID) REFERENCES payment_gates(gateID) ON DELETE SET NULL
      )
    `);
    console.log('✅ Created transactions table');

    console.log('');
    console.log('🎉 Schema migration completed successfully!');
    console.log(`📊 Database type: ${type.toUpperCase()}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await dbWrapper.close();
  }
}

// Run if called directly
if (require.main === module) {
  migrateSchema()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { migrateSchema };
