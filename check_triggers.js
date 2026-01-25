const db = require('./docs/system/db').initDB();
const rows = db.prepare("SELECT triggerID, triggerKey, triggerUserID, enabled FROM triggers WHERE triggerKey LIKE '__builtin_%'").all();
console.log(JSON.stringify(rows, null, 2));
