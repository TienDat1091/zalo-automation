const triggerDB = require('./docs/triggerDB');
const db = require('./docs/system/db').initDB();

// Init DB module manually if needed (triggerDB.init() does it)
triggerDB.init();

const userUID = '716585949090695726'; // From previous log
console.log(`Running ensureUserTriggers for ${userUID}...`);

triggerDB.ensureUserTriggers(userUID);

// Verify again
const dbConn = require('./docs/system/db').getDB();
const t = dbConn.prepare("SELECT * FROM triggers WHERE triggerKey = '__builtin_auto_unread__' AND triggerUserID = ?").get(userUID);
console.log(`User Trigger Status:`, t ? 'FIXED/FOUND' : 'STILL MISSING');
