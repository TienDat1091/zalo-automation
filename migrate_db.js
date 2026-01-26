const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'docs', 'data', 'messages.db');
const db = new Database(dbPath);

console.log('Running migration on:', dbPath);

try {
    // Check if column exists
    const tableInfo = db.prepare('PRAGMA table_info(messages)').all();
    const hasCol = tableInfo.some(c => c.name === 'cliMsgId');

    if (!hasCol) {
        console.log('Adding missing column cliMsgId...');
        db.exec('ALTER TABLE messages ADD COLUMN cliMsgId TEXT');
        console.log('✅ Column cliMsgId added.');
    } else {
        console.log('ℹ️ Column cliMsgId already exists.');
    }

    // Also check globalMsgId just in case
    const hasGlobal = tableInfo.some(c => c.name === 'globalMsgId');
    if (!hasGlobal) {
        console.log('Adding missing column globalMsgId...');
        db.exec('ALTER TABLE messages ADD COLUMN globalMsgId TEXT');
        console.log('✅ Column globalMsgId added.');
    } else {
        console.log('ℹ️ Column globalMsgId already exists.');
    }

} catch (e) {
    console.error('Migration failed:', e.message);
}
