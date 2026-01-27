const dbModule = require('./docs/system/db');
const db = dbModule.initDB();

try {
    const columns = db.pragma('table_info(triggers)');
    const hasId = columns.some(c => c.name === 'id');
    const hasTriggerID = columns.some(c => c.name === 'triggerID');

    console.log('Has id:', hasId);
    console.log('Has triggerID:', hasTriggerID);

    if (hasTriggerID && !hasId) {
        console.log('CONFIRMED: Legacy schema detected (triggerID instead of id)');
    }
} catch (e) {
    console.error('Error:', e);
}
