const triggerDB = require('../triggerDB');
const messageDB = require('../messageDB');
const { ThreadType } = require('zca-js');

// To avoid spamming Zalo API, we use a delay between operations
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runAutoUnfriendCheck(multiState) {
    if (!multiState) return;
    
    const accounts = multiState.accounts 
        ? Array.from(multiState.accounts.values())
        : [multiState];

    for (const accountState of accounts) {
        if (!accountState.isLoggedIn || !accountState.currentUser) continue;
        
        const userUID = accountState.currentUser.uid;
        
        await messageDB.dbStorage.run(userUID, async () => {
            const settings = triggerDB.getBuiltInTriggerState(userUID, 'builtin_auto_unfriend');
            
            // Only run if feature is enabled
            if (!settings || !settings.enabled) return;

            const days = parseInt(settings.days) || 30;
            const thresholdTime = Date.now() - (days * 24 * 60 * 60 * 1000);
            
            console.log(`[Auto-Unfriend] [${userUID}] Bắt đầu quét... Điều kiện: không có tin nhắn sau ${days} ngày.`);
            
            try {
                let friends = accountState.friends;
                if (!friends || friends.length === 0) {
                    console.log(`[Auto-Unfriend] [${userUID}] Chưa có danh sách bạn bè, bỏ qua lượt quét này.`);
                    return;
                }

                // Make a safety check: if we have 0 messages total in SQLite, skip entirely to prevent catastrophic mistakes.
                const allLocalMessages = messageDB.getAllLastMessages();
                if (allLocalMessages.size === 0) {
                    console.log(`[Auto-Unfriend] [${userUID}] ⚠️ An toàn: Database tin nhắn trống. Bỏ qua quét để tránh xóa nhầm bạn bè mới.`);
                    return;
                }

                console.log(`[Auto-Unfriend] [${userUID}] Đang kiểm tra ${friends.length} bạn bè...`);

                let unfriendedCount = 0;
                const excludedUsers = settings.excludedUsers || [];

                for (const friend of friends) {
                    const friendId = friend.userId;
                    
                    // Skip excluded users
                    if (excludedUsers.includes(friendId)) {
                        console.log(`[Auto-Unfriend] [${userUID}] Bỏ qua ${friend.displayName} (ID: ${friendId}) do ngoại trừ.`);
                        continue;
                    }

                    // Check local SQLite first
                    const localMessage = allLocalMessages.get(friendId);
                    let lastTimestamp = 0;

                    if (localMessage) {
                        lastTimestamp = localMessage.timestamp;
                    } else {
                        // Not in local DB. Query Zalo directly for the last message
                        try {
                            const result = await accountState.api.getMessages(friendId, ThreadType.User, 1);
                            if (result && Array.isArray(result) && result.length > 0) {
                                lastTimestamp = result[0].ts || result[0].timestamp || 0;
                                
                                const latestMsg = result[0];
                                messageDB.saveMessage(friendId, {
                                    msgId: latestMsg.msgId || latestMsg.id || Date.now().toString(),
                                    senderId: latestMsg.uidFrom || latestMsg.senderId,
                                    content: latestMsg.data?.content || latestMsg.content || latestMsg.msg || '',
                                    timestamp: lastTimestamp,
                                    isSelf: (latestMsg.uidFrom || latestMsg.senderId) === userUID,
                                    attachmentType: null
                                });
                            }
                            await delay(500); // Rate limit buffer
                        } catch (apiErr) {
                            // Ignored, might be rate limited or no history
                        }
                    }

                    // Logic Unfriend
                    if (lastTimestamp > 0 && lastTimestamp < thresholdTime) {
                        console.log(`[Auto-Unfriend] [${userUID}] ⚠️ Phát hiện bạn bè không tương tác: ${friend.displayName} (ID: ${friendId}). Lần nhắn cuối: ${new Date(lastTimestamp).toLocaleString()}`);
                        
                        try {
                            await accountState.api.removeFriend(friendId);
                            console.log(`[Auto-Unfriend] [${userUID}] ✅ Đã hủy kết bạn với ${friend.displayName}`);
                            
                            // Log the activity
                            triggerDB.logActivity(
                                userUID,
                                'AUTO_UNFRIEND',
                                'system',
                                null,
                                friendId,
                                `Tự động hủy kết bạn với ${friend.displayName} do không tương tác sau ${days} ngày.`
                            );

                            unfriendedCount++;
                            await delay(2000); // Wait 2s to avoid spam
                        } catch (rmErr) {
                            console.error(`[Auto-Unfriend] [${userUID}] ❌ Lỗi hủy kết bạn với ${friendId}:`, rmErr.message);
                        }
                    }
                }

                if (unfriendedCount > 0) {
                    console.log(`[Auto-Unfriend] [${userUID}] Hoàn tất quét. Đã hủy kết bạn ${unfriendedCount} người.`);
                } else {
                    console.log(`[Auto-Unfriend] [${userUID}] Hoàn tất quét. Không có người nào bị hủy kết bạn.`);
                }

            } catch (err) {
                console.error(`[Auto-Unfriend] [${userUID}] Lỗi trong quá trình quét:`, err.message);
            }
        });
    }
}

/**
 * Khởi chạy worker chạy ngầm mỗi X giờ (VD: 4 giờ/lần)
 */
function startAutoUnfriendScheduler(apiState) {
    // Chạy thử lần đầu sau 1 phút khởi động
    setTimeout(() => {
        runAutoUnfriendCheck(apiState);
    }, 60 * 1000);

    // Lặp lại mỗi 4 giờ (4 * 60 * 60 * 1000)
    setInterval(() => {
        runAutoUnfriendCheck(apiState);
    }, 4 * 60 * 60 * 1000);
}

module.exports = {
    runAutoUnfriendCheck,
    startAutoUnfriendScheduler
};
