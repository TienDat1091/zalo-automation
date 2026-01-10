const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database configuration
const USE_POSTGRES = !!process.env.DATABASE_URL;
const DATA_DIR = path.join(__dirname, '..', 'data');
const SQLITE_PATH = path.join(DATA_DIR, 'triggers.db');

let pool = null;
let sqliteDb = null;

/**
 * Initialize database connection
 */
function initDatabase() {
  if (USE_POSTGRES) {
    console.log('🐘 Using PostgreSQL database');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    return { type: 'postgres', client: pool };
  } else {
    console.log('🗄️  Using SQLite database');
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    sqliteDb = new Database(SQLITE_PATH);
    sqliteDb.pragma('journal_mode = WAL');
    return { type: 'sqlite', client: sqliteDb };
  }
}

/**
 * Execute query with automatic adapter
 */
async function query(sql, params = []) {
  if (USE_POSTGRES) {
    // PostgreSQL uses $1, $2, etc
    const pgSql = convertToPostgresSQL(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
  } else {
    // SQLite
    const stmt = sqliteDb.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return stmt.all(...params);
    } else {
      const info = stmt.run(...params);
      return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
    }
  }
}

/**
 * Execute multiple statements (for schema creation)
 */
async function exec(sql) {
  if (USE_POSTGRES) {
    const pgSql = convertSchemaToPostgres(sql);
    await pool.query(pgSql);
  } else {
    sqliteDb.exec(sql);
  }
}

/**
 * Convert SQLite SQL to PostgreSQL
 */
function convertToPostgresSQL(sql) {
  // Replace AUTOINCREMENT with SERIAL
  sql = sql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');

  // Replace SQLite date functions
  sql = sql.replace(/strftime\('%s','now'\) \* 1000/g, 'EXTRACT(EPOCH FROM NOW()) * 1000');
  sql = sql.replace(/datetime\('now'\)/g, 'NOW()');

  // Replace ? with $1, $2, etc
  let i = 0;
  sql = sql.replace(/\?/g, () => `$${++i}`);

  return sql;
}

/**
 * Convert schema SQL from SQLite to PostgreSQL
 */
function convertSchemaToPostgres(sql) {
  sql = sql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  sql = sql.replace(/strftime\('%s','now'\) \* 1000/g, 'EXTRACT(EPOCH FROM NOW()) * 1000');
  sql = sql.replace(/datetime\('now'\)/g, 'NOW()');
  sql = sql.replace(/IF NOT EXISTS/gi, 'IF NOT EXISTS');
  return sql;
}

/**
 * Get database type
 */
function getDatabaseType() {
  return USE_POSTGRES ? 'postgres' : 'sqlite';
}

/**
 * Close database connection
 */
async function close() {
  if (USE_POSTGRES && pool) {
    await pool.end();
  } else if (sqliteDb) {
    sqliteDb.close();
  }
}

module.exports = {
  initDatabase,
  query,
  exec,
  getDatabaseType,
  close
};
