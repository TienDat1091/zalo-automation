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
 * Returns a database object with better-sqlite3 compatible API
 */
function initDatabase() {
  if (USE_POSTGRES) {
    console.log('🐘 Using PostgreSQL database');
    console.log('📡 Database URL:', process.env.DATABASE_URL ? 'Set ✓' : 'Not set ✗');

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });

    // Return PostgreSQL wrapper with better-sqlite3 compatible API
    return createPostgresWrapper();
  } else {
    console.log('🗄️  Using SQLite database');
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    sqliteDb = new Database(SQLITE_PATH);
    sqliteDb.pragma('journal_mode = WAL');
    return sqliteDb; // Return SQLite directly (already has prepare() API)
  }
}

/**
 * Create PostgreSQL wrapper with better-sqlite3 compatible API
 * Uses deasync to make async calls synchronous for compatibility
 */
function createPostgresWrapper() {
  // Helper to make async function synchronous
  const syncify = (asyncFn) => {
    return (...args) => {
      let result;
      let error;
      let done = false;

      asyncFn(...args)
        .then(res => { result = res; done = true; })
        .catch(err => { error = err; done = true; });

      // Busy wait (not ideal but works for simple sync compatibility)
      require('deasync').loopWhile(() => !done);

      if (error) throw error;
      return result;
    };
  };

  return {
    prepare: (sql) => {
      // Convert ? to $1, $2, etc
      let paramCount = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++paramCount}`);

      return {
        run: syncify(async (...params) => {
          // For INSERT statements, add RETURNING clause to get the ID
          let finalSql = pgSql;
          if (pgSql.trim().toUpperCase().startsWith('INSERT')) {
            // Check if RETURNING clause already exists
            if (!pgSql.toUpperCase().includes('RETURNING')) {
              // Find the table name and primary key
              const match = pgSql.match(/INSERT\s+INTO\s+(\w+)/i);
              if (match) {
                const tableName = match[1];
                // Common primary key patterns
                const pkName = `${tableName.replace(/s$/, '')}ID`; // Remove trailing 's' and add 'ID'
                finalSql += ` RETURNING ${pkName}`;
              }
            }
          }

          const result = await pool.query(finalSql, params);

          // Get lastInsertRowid from RETURNING clause or first column
          let lastInsertRowid = null;
          if (result.rows && result.rows.length > 0) {
            const firstRow = result.rows[0];
            lastInsertRowid = firstRow[Object.keys(firstRow)[0]];
          }

          return {
            changes: result.rowCount || 0,
            lastInsertRowid: lastInsertRowid
          };
        }),
        get: syncify(async (...params) => {
          const result = await pool.query(pgSql, params);
          return result.rows[0] || null;
        }),
        all: syncify(async (...params) => {
          const result = await pool.query(pgSql, params);
          return result.rows || [];
        })
      };
    },
    exec: syncify(async (sql) => {
      await pool.query(sql);
    }),
    pragma: () => {} // No-op for PostgreSQL
  };
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
  init: initDatabase,  // Alias for better naming
  initDatabase,
  query,
  exec,
  getDatabaseType,
  close
};
