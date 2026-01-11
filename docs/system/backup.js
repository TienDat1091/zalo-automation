// backup.js - GitHub Backup System for SQLite Database
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKUP_ENABLED = !!process.env.GITHUB_BACKUP_TOKEN;
const BACKUP_INTERVAL = 5 * 60 * 1000; // Backup every 5 minutes
const DB_PATH = path.join(__dirname, '..', 'data', 'triggers.db');
const BACKUP_DIR = path.join(__dirname, '..', 'data');

let backupTimer = null;
let lastBackupHash = null;

/**
 * Initialize GitHub backup system
 */
function initBackup() {
  if (!BACKUP_ENABLED) {
    console.log('⚠️  GitHub backup disabled (GITHUB_BACKUP_TOKEN not set)');
    return;
  }

  console.log('🔄 Initializing GitHub backup system...');

  try {
    // Configure git with token
    setupGitAuth();

    // Try to restore from GitHub first
    restoreFromGithub();

    // Start periodic backup
    startPeriodicBackup();

    console.log('✅ GitHub backup system initialized');
    console.log(`📦 Auto-backup every ${BACKUP_INTERVAL / 1000 / 60} minutes`);
  } catch (error) {
    console.error('❌ Failed to initialize backup:', error.message);
  }
}

/**
 * Setup git authentication with token
 */
function setupGitAuth() {
  const token = process.env.GITHUB_BACKUP_TOKEN;
  if (!token) return;

  try {
    // Get current remote URL
    const remoteUrl = execSync('git config --get remote.origin.url', {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..', '..')
    }).trim();

    // Extract repo info (handles both HTTPS and SSH URLs)
    let repoPath;
    if (remoteUrl.includes('github.com')) {
      if (remoteUrl.startsWith('https://')) {
        repoPath = remoteUrl.replace('https://github.com/', '').replace('.git', '');
      } else if (remoteUrl.startsWith('git@')) {
        repoPath = remoteUrl.replace('git@github.com:', '').replace('.git', '');
      }
    }

    if (repoPath) {
      // Set authenticated URL
      const authUrl = `https://${token}@github.com/${repoPath}.git`;
      execSync(`git remote set-url origin ${authUrl}`, {
        cwd: path.join(__dirname, '..', '..'),
        stdio: 'ignore'
      });
      console.log('🔐 Git authentication configured');
    }
  } catch (error) {
    console.error('⚠️  Could not setup git auth:', error.message);
  }
}

/**
 * Restore database from GitHub if exists
 */
function restoreFromGithub() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('📥 Database not found locally, attempting restore from GitHub...');

    try {
      // Pull latest changes
      execSync('git pull origin main', {
        cwd: path.join(__dirname, '..', '..'),
        stdio: 'pipe'
      });

      if (fs.existsSync(DB_PATH)) {
        console.log('✅ Database restored from GitHub');
        return true;
      } else {
        console.log('ℹ️  No backup found in GitHub, starting fresh');
        return false;
      }
    } catch (error) {
      console.log('ℹ️  Could not restore from GitHub:', error.message);
      return false;
    }
  } else {
    console.log('✅ Database found locally');
    return true;
  }
}

/**
 * Start periodic backup
 */
function startPeriodicBackup() {
  // Initial backup
  setTimeout(() => backupToGithub(), 30000); // First backup after 30 seconds

  // Periodic backup
  backupTimer = setInterval(() => {
    backupToGithub();
  }, BACKUP_INTERVAL);
}

/**
 * Stop periodic backup
 */
function stopPeriodicBackup() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
    console.log('🛑 Periodic backup stopped');
  }
}

/**
 * Backup database to GitHub
 */
function backupToGithub() {
  if (!BACKUP_ENABLED) return;

  try {
    // Check if database exists
    if (!fs.existsSync(DB_PATH)) {
      console.log('⚠️  No database to backup');
      return;
    }

    // Check if database has changed
    const currentHash = getFileHash(DB_PATH);
    if (currentHash === lastBackupHash) {
      console.log('ℹ️  Database unchanged, skipping backup');
      return;
    }

    console.log('📤 Backing up database to GitHub...');

    const repoRoot = path.join(__dirname, '..', '..');

    // Add database file
    execSync('git add docs/data/triggers.db', {
      cwd: repoRoot,
      stdio: 'pipe'
    });

    // Check if there are changes to commit
    try {
      const status = execSync('git status --porcelain docs/data/triggers.db', {
        cwd: repoRoot,
        encoding: 'utf8'
      });

      if (!status.trim()) {
        console.log('ℹ️  No changes to backup');
        return;
      }
    } catch (error) {
      // Continue with commit
    }

    // Commit
    const timestamp = new Date().toISOString();
    execSync(`git commit -m "Auto-backup database - ${timestamp}"`, {
      cwd: repoRoot,
      stdio: 'pipe'
    });

    // Push to GitHub
    execSync('git push origin main', {
      cwd: repoRoot,
      stdio: 'pipe'
    });

    lastBackupHash = currentHash;
    console.log(`✅ Database backed up to GitHub at ${timestamp}`);
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
  }
}

/**
 * Manual backup trigger
 */
function backupNow() {
  console.log('🔄 Manual backup triggered...');
  backupToGithub();
}

/**
 * Get file hash for change detection
 */
function getFileHash(filePath) {
  try {
    const crypto = require('crypto');
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (error) {
    return null;
  }
}

/**
 * Export database as JSON (additional backup option)
 */
function exportDatabaseToJSON() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH, { readonly: true });

    const tables = [
      'triggers', 'flows', 'flow_blocks', 'block_conditions',
      'block_column_values', 'block_result_mappings',
      'google_sheet_configs', 'ai_configs', 'images', 'files',
      'file_templates', 'variables', 'user_input_states',
      'activity_logs', 'email_senders', 'email_recipients',
      'email_logs', 'payment_gates', 'user_tables',
      'table_columns', 'table_rows', 'transactions'
    ];

    const backup = {
      timestamp: new Date().toISOString(),
      tables: {}
    };

    for (const table of tables) {
      try {
        const rows = db.prepare(`SELECT * FROM ${table}`).all();
        backup.tables[table] = rows;
      } catch (error) {
        // Table might not exist, skip it
        console.log(`⚠️  Skipping table ${table}:`, error.message);
      }
    }

    db.close();

    const jsonPath = path.join(BACKUP_DIR, 'backup.json');
    fs.writeFileSync(jsonPath, JSON.stringify(backup, null, 2));
    console.log('✅ Database exported to JSON:', jsonPath);

    return jsonPath;
  } catch (error) {
    console.error('❌ JSON export failed:', error.message);
    return null;
  }
}

module.exports = {
  initBackup,
  backupNow,
  stopPeriodicBackup,
  exportDatabaseToJSON,
  BACKUP_ENABLED
};
