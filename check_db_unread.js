const db = require('./docs/system/db').initDB();
const userUID = 'system';

// Check system trigger
const sys = db.prepare("SELECT * FROM triggers WHERE triggerKey = '__builtin_auto_unread__' AND triggerUserID = 'system'").get();
console.log('System Trigger:', sys ? 'FOUND' : 'MISSING');

// Check user triggers (random 5)
const users = db.prepare("SELECT DISTINCT triggerUserID FROM triggers WHERE triggerUserID != 'system' LIMIT 5").all();
users.forEach(u => {
    const t = db.prepare("SELECT * FROM triggers WHERE triggerKey = '__builtin_auto_unread__' AND triggerUserID = ?").get(u.triggerUserID);
    console.log(`User ${u.triggerUserID}:`, t ? 'FOUND' : 'MISSING');
});
