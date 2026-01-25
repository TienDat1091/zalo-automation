const { initDB, getBuiltInTriggerState, getAllBuiltInTriggerStates } = require('./docs/triggerDB');
const path = require('path');

// Mock initDB to use the correct path if needed, but triggerDB has it relative to itself usually.
// Let's rely on triggerDB's internal init.
initDB();

console.log('--- Debugging Built-in Triggers State ---');
const db = require('./docs/system/db').getDB();

// Dump all rows in builtin_triggers_state
try {
    const rows = db.prepare('SELECT * FROM builtin_triggers_state').all();
    console.log(`Found ${rows.length} rows in builtin_triggers_state:`);
    rows.forEach(r => {
        console.log(`- User: ${r.userUID}, Key: ${r.triggerKey}, State: ${r.stateData}, Updated: ${new Date(r.updatedAt).toLocaleTimeString()}`);
    });
} catch (e) {
    console.error('Error querying table:', e.message);
}

console.log('--- Validating Specific Keys ---');
// We don't have the exact userUID conveniently, so we listed all above.
console.log('Check if global_auto_reply_personal or global_auto_reply_bot exists above.');
