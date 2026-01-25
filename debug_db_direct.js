const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'docs', 'data', 'triggers.db');
console.log('Opening DB at:', dbPath);

try {
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT * FROM builtin_triggers_state').all();
    console.log('--- builtin_triggers_state content ---');
    if (rows.length === 0) {
        console.log('(Table is empty)');
    } else {
        rows.forEach(r => {
            console.log(JSON.stringify(r, null, 2));
        });
    }
} catch (e) {
    console.error('Error:', e.message);
}
