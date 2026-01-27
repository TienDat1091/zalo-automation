const messageDB = require('./docs/messageDB');

messageDB.init();

// Check specific conversation
const conversationId = '2118888339358894264'; // User ID from logs

console.log(`\n🔍 Checking messages for conversation: ${conversationId}\n`);

const messages = messageDB.getMessages(conversationId, 50);

if (messages.length > 0) {
    console.log(`✅ Found ${messages.length} messages in database:\n`);
    messages.forEach((msg, idx) => {
        console.log(`${idx + 1}. [${new Date(msg.timestamp).toLocaleString('vi-VN')}] ${msg.isSelf ? 'ME' : 'THEM'}: ${msg.content.substring(0, 50)}`);
    });
} else {
    console.log('❌ NO MESSAGES FOUND in database for this conversation!');
    console.log('\nℹ️  This confirms messages are NOT being saved.');
}

console.log(`\n📊 Checking all conversations...\n`);
const allConversations = messageDB.getAllConversations();
console.log(`Total conversations with messages: ${allConversations.length}`);

if (allConversations.length > 0) {
    console.log('\nConversations:');
    allConversations.forEach(conv => {
        const msgs = messageDB.getMessages(conv.conversationId, 1);
        const last = messageDB.getLastMessage(conv.conversationId);
        console.log(`  - ${conv.conversationId}: ${conv.messageCount} messages, last: "${last?.content?.substring(0, 30) || 'N/A'}"`);
    });
}
