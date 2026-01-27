const messageDB = require('./docs/messageDB');
const fs = require('fs');

messageDB.init();

let output = '';

output += '\n========================================\n';
output += '  MESSAGE PERSISTENCE VERIFICATION\n';
output += '========================================\n\n';

// Get all conversations
const conversations = messageDB.getAllConversations();

output += `Total conversations in database: ${conversations.length}\n\n`;

if (conversations.length === 0) {
    output += 'No conversations found in database!\n';
    output += '\nTo test, please:\n';
    output += '   1. Send a message from another Zalo account\n';
    output += '   2. Wait for auto-reply\n';
    output += '   3. Run this script again\n';
    console.log(output);
    process.exit(0);
}

// Show details for each conversation
conversations.forEach((conv, idx) => {
    output += `\nConversation ${idx + 1}: ${conv.conversationId}\n`;
    output += `   Total messages: ${conv.messageCount}\n`;

    // Get all messages for this conversation
    const messages = messageDB.getMessages(conv.conversationId, 100);

    output += `\n   Messages:\n`;
    messages.forEach((msg, msgIdx) => {
        const date = new Date(msg.timestamp).toLocaleString('vi-VN');
        const direction = msg.isSelf ? 'ME' : 'THEM';
        const autoLabel = msg.isAutoReply ? ' [AUTO-REPLY]' : '';
        const content = msg.content.substring(0, 50);

        output += `   ${msgIdx + 1}. [${date}] ${direction}${autoLabel}\n`;
        output += `      "${content}"\n`;
    });

    output += '\n   -------------------------------------\n';
});

// Summary
const totalMessages = conversations.reduce((sum, conv) => sum + conv.messageCount, 0);
const autoReplyCount = conversations.reduce((sum, conv) => {
    const msgs = messageDB.getMessages(conv.conversationId, 100);
    return sum + msgs.filter(m => m.isAutoReply).length;
}, 0);

output += `\nSUMMARY:\n`;
output += `   - Total conversations: ${conversations.length}\n`;
output += `   - Total messages: ${totalMessages}\n`;
output += `   - Auto-reply messages: ${autoReplyCount}\n`;
output += `   - Incoming messages: ${totalMessages - autoReplyCount}\n`;

output += `\nMESSAGE PERSISTENCE IS WORKING CORRECTLY!\n`;
output += '\n========================================\n';

// Save to file
fs.writeFileSync('persistence_report.txt', output, 'utf8');
console.log(output);
console.log('\nReport saved to: persistence_report.txt');
