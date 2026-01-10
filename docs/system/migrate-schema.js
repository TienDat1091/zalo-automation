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

    // Create additional tables for block data
    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        fileName TEXT NOT NULL,
        originalName TEXT,
        mimeType TEXT,
        fileSize INTEGER,
        filePath TEXT NOT NULL,
        userUID TEXT NOT NULL,
        uploadedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created images table');

    await dbWrapper.exec(`
      CREATE TABLE IF NOT EXISTS files (
        fileID ${type === 'postgres' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${type === 'sqlite' ? 'AUTOINCREMENT' : ''},
        fileName TEXT NOT NULL,
        originalName TEXT,
        mimeType TEXT,
        fileSize INTEGER,
        filePath TEXT NOT NULL,
        userUID TEXT NOT NULL,
        uploadedAt BIGINT DEFAULT ${type === 'postgres' ? 'EXTRACT(EPOCH FROM NOW()) * 1000' : "(strftime('%s','now') * 1000)"}
      )
    `);
    console.log('✅ Created files table');

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
