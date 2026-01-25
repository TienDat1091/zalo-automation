const db = require('./docs/system/db').initDB();
const tableInfo = db.prepare('PRAGMA table_info(payment_gates)').all();
console.log('--- TABLE SCHEMA: payment_gates ---');
tableInfo.forEach(col => {
    console.log(`${col.cid}: ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PK' : ''}`);
});

try {
    const testInsert = db.prepare(`
        INSERT INTO payment_gates (userUID, gateName, gateType, bankCode, accountNumber, accountName, isActive, isDefault)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run('test_user', 'Test Gate', 'manual', '970436', '123456', 'Test Name', 0);
    console.log('✅ Test insert successful, ID:', testInsert.lastInsertRowid);
    // Delete test
    db.prepare('DELETE FROM payment_gates WHERE gateID = ?').run(testInsert.lastInsertRowid);
    console.log('✅ Test delete successful');
} catch (err) {
    console.error('❌ Test insert failed:', err.message);
}
db.close();
