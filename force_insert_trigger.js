const db = require('./docs/system/db').initDB();

const userUID = '716585949090695726';
const triggerKey = '__builtin_auto_unread__';

// Check existing
const exist = db.prepare("SELECT triggerID FROM triggers WHERE triggerKey = ? AND triggerUserID = ?").get(triggerKey, userUID);

if (!exist) {
    console.log('Inserting missing trigger...');
    const stmt = db.prepare(`
    INSERT INTO triggers (triggerName, triggerKey, triggerType, triggerUserID, triggerContent, 
      timeStartActive, timeEndActive, cooldown, scope, enabled, setMode, timeCreated, timeUpdate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    stmt.run(
        'Tự động đánh dấu chưa đọc',
        triggerKey,
        'keyword',
        userUID,
        'Đánh dấu hội thoại là chưa đọc sau khi Bot phản hồi.',
        '00:00', '23:59',
        0, 0, 0, 0, Date.now(), Date.now()
    );
    console.log('✅ Trigger inserted successfully.');
} else {
    console.log('ℹ️ Trigger already exists.');
}
