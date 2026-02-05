const triggerDB = require('./docs/triggerDB');
const dbModule = require('./docs/system/db');

triggerDB.init();
const db = dbModule.initDB();

// Check all builtin triggers
const all = db.prepare("SELECT triggerKey, triggerName, triggerUserID, enabled FROM triggers WHERE triggerKey LIKE '__builtin_%' ORDER BY triggerKey").all();
console.log('All builtin triggers in database:');
all.forEach(t => console.log(`  - ${t.triggerKey} (user: ${t.triggerUserID}): "${t.triggerName}" [${t.enabled ? 'ENABLED' : 'disabled'}]`));

// Specifically check for auto_reaction
const autoReaction = db.prepare("SELECT * FROM triggers WHERE triggerKey = '__builtin_auto_reaction__'").all();
console.log(`\nAuto Reaction trigger found: ${autoReaction.length} rows`);
autoReaction.forEach(t => console.log(`  User: ${t.triggerUserID}, Enabled: ${t.enabled}, Content: ${t.triggerContent}`));

db.close();
