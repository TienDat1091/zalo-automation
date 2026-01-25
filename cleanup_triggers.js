const db = require('./docs/system/db').initDB();

function cleanup() {
    console.log('🧹 Cleaning up duplicate built-in triggers...');

    // Find all built-in triggers
    const builtIns = db.prepare("SELECT * FROM triggers WHERE triggerKey LIKE '__builtin_%'").all();

    const seen = new Map(); // key -> oldest triggerID
    const toDelete = [];

    for (const t of builtIns) {
        const key = `${t.triggerKey}:${t.triggerUserID}`;
        if (seen.has(key)) {
            // Keep the one with the highest ID (newest) or some other criteria.
            // Let's keep the one that is currently enabled if possible, otherwise the newest one.
            const current = seen.get(key);
            if (t.enabled && !current.enabled) {
                toDelete.push(current.triggerID);
                seen.set(key, t);
            } else {
                toDelete.push(t.triggerID);
            }
        } else {
            seen.set(key, t);
        }
    }

    if (toDelete.length > 0) {
        console.log(`🗑️ Deleting ${toDelete.length} duplicate(s): ${toDelete.join(', ')}`);
        const deleteBtn = db.prepare(`DELETE FROM triggers WHERE triggerID IN (${toDelete.map(() => '?').join(',')})`);
        deleteBtn.run(...toDelete);
    } else {
        console.log('✅ No duplicates found.');
    }
}

cleanup();
process.exit(0);
