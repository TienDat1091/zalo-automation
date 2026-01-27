const dbModule = require('./docs/system/db');
const db = dbModule.initDB();

try {
    console.log('🔄 Starting DB Schema Migration (triggers table)...');

    // 1. Check if migration is needed
    const columns = db.pragma('table_info(triggers)');
    const hasId = columns.some(c => c.name === 'id');
    const hasTriggerID = columns.some(c => c.name === 'triggerID');

    if (hasId && !hasTriggerID) {
        console.log('✅ Schema is already correct (has id, no triggerID). No action needed.');
        process.exit(0);
    }

    if (!hasTriggerID) {
        console.log('❌ Unexpected schema: neither id nor triggerID found? Aborting.');
        console.log('Columns:', columns.map(c => c.name));
        process.exit(1);
    }

    console.log('⚠️ Legacy schema detected (triggerID present). Proceeding with migration...');

    // 2. Transaction for safety
    db.transaction(() => {
        // Disable foreign keys temporarily
        db.pragma('foreign_keys = OFF');

        // Rename old table
        console.log('1️⃣ Renaming current table to triggers_backup_legacy...');
        db.exec(`ALTER TABLE triggers RENAME TO triggers_backup_legacy`);

        // Create new table with correct schema (copied from db.js)
        console.log('2️⃣ Creating new triggers table with correct schema...');
        db.exec(`
      CREATE TABLE IF NOT EXISTS triggers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        triggerName TEXT,
        triggerKey TEXT,
        triggerUserID TEXT,
        triggerContent TEXT,
        enabled INTEGER DEFAULT 1,
        scope INTEGER DEFAULT 0,
        uids TEXT DEFAULT NULL,
        timeCreated INTEGER DEFAULT (cast(strftime('%s','now') as int) * 1000),
        timeUpdate INTEGER DEFAULT (cast(strftime('%s','now') as int) * 1000),
        timeStartActive TEXT DEFAULT '00:00',
        timeEndActive TEXT DEFAULT '23:59',
        dateStartActive TEXT DEFAULT NULL,
        dateEndActive TEXT DEFAULT NULL,
        cooldown INTEGER DEFAULT 30000,
        setMode INTEGER DEFAULT 0,
        flow TEXT DEFAULT NULL,
        triggerType TEXT DEFAULT 'keyword',
        keywords TEXT DEFAULT NULL,
        response TEXT DEFAULT NULL,
        schedule TEXT DEFAULT NULL
      )
    `);

        // Copy data
        console.log('3️⃣ Copying data from backup to new table...');
        // We map triggerID -> id
        // We select columns that exist in both commonly, or rely on defaults for new ones

        // Get columns from backup table to key safe
        const backupColumns = db.pragma('table_info(triggers_backup_legacy)').map(c => c.name);

        // Construct SELECT list, mapping triggerID to id
        const selectCols = backupColumns.map(col => {
            if (col === 'triggerID') return 'triggerID as id';
            return col;
        }).filter(col => {
            // Filter out columns that might not exist in new schema or duplicate
            // Actually we should only select columns that exist in new table
            // But standard SQL 'INSERT INTO target (col1, col2) SELECT col1, col2' is safer
            return true;
        });

        // Let's do explicit mapping for safety
        // Common fields
        const commonFields = [
            'triggerName', 'triggerKey', 'triggerUserID', 'triggerContent',
            'enabled', 'scope', 'uids', 'timeCreated', 'timeUpdate',
            'timeStartActive', 'timeEndActive', 'dateStartActive', 'dateEndActive',
            'cooldown', 'setMode'
            // 'flow', 'triggerType' might be explicit in old schema or not?
        ];

        // Check if optional fields exist in backup
        if (backupColumns.includes('flow')) commonFields.push('flow');
        if (backupColumns.includes('triggerType')) commonFields.push('triggerType');
        if (backupColumns.includes('keywords')) commonFields.push('keywords');
        if (backupColumns.includes('response')) commonFields.push('response');
        if (backupColumns.includes('schedule')) commonFields.push('schedule');

        const insertSql = `
      INSERT INTO triggers (id, ${commonFields.join(', ')})
      SELECT triggerID, ${commonFields.join(', ')}
      FROM triggers_backup_legacy
    `;

        console.log('   Executing copy...');
        db.exec(insertSql);

        // Verify count
        const oldCnt = db.prepare('SELECT count(*) as count FROM triggers_backup_legacy').get().count;
        const newCnt = db.prepare('SELECT count(*) as count FROM triggers').get().count;

        console.log(`4️⃣ Verification: Old Rows = ${oldCnt}, New Rows = ${newCnt}`);

        if (oldCnt !== newCnt) {
            throw new Error('Row count mismatch! Rolling back.');
        }

        db.pragma('foreign_keys = ON');

        console.log('✅ Migration successful!');
    })();

} catch (e) {
    console.error('❌ Migration FAILED:', e);
    process.exit(1);
}
