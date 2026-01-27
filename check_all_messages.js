const messageDB = require('./docs/messageDB');

messageDB.init();

const conversationId = '2118888339358894264';

console.log(`\n📊 Checking ALL messages for: ${conversationId}\n`);

const messages = messageDB.getMessages(conversationId, 100);

console.log(`✅ Total messages in database: ${messages.length}\n`);

if (messages.length > 0) {
    messages.forEach((msg, idx) => {
        const date = new Date(msg.timestamp).toLocaleString('vi-VN');
        const direction = msg.isSelf ? '➡️ ME' : '⬅️ THEM';
        const autoLabel = msg.isAutoReply ? ' [AUTO-REPLY]' : '';
        console.log(`${idx + 1}. [${date}] ${direction}${autoLabel}: "${msg.content.substring(0, 40)}"`);
    });
} else {
    console.log('❌ NO MESSAGES in database!');
}

// Also check for duplicates
console.log(`\n🔍 Checking for duplicate msgIds...\n`);
const msgIds = messages.map(m => m.msgId);
const uniqueIds = new Set(msgIds);
if (msgIds.length !== uniqueIds.size) {
    console.log(`⚠️  Found ${msgIds.length - uniqueIds.size} duplicate msgIds!`);
    const duplicates = msgIds.filter((id, idx) => msgIds.indexOf(id) !== idx);
    console.log('Duplicates:', [...new Set(duplicates)]);
} else {
    console.log('✅ No duplicate msgIds found');
}
