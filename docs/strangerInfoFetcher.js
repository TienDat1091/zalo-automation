// strangerInfoFetcher.js
// ✅ Fetch full user info for strangers from Zalo API

async function fetchAndBroadcastStrangerInfo(apiState, userId, messageData, broadcast) {
    try {
        console.log(`🔍 Fetching user info for stranger: ${userId}`);

        // Try to get info from Zalo API
        let userInfo = null;

        if (apiState.api && typeof apiState.api.getUserInfo === 'function') {
            const response = await apiState.api.getUserInfo(userId);
            console.log('📋 getUserInfo response:', JSON.stringify(response, null, 2));

            // Parse response - try multiple possible structures
            userInfo = response[userId]
                || response.changed_profiles?.[userId]
                || response.changed?.[userId]
                || null;

            // Fallback: Check if response itself has user data
            if (!userInfo && (response.displayName || response.zaloName)) {
                userInfo = response;
            }
        }

        // Extract name and avatar from various sources
        const displayName =
            userInfo?.displayName ||
            userInfo?.zaloName ||
            userInfo?.username ||
            messageData?.dName ||  // ✅ From message event!
            messageData?.senderName ||
            `Người lạ (${userId.substring(0, 8)})`;

        const avatar =
            userInfo?.avatar ||
            userInfo?.avatarUrl ||
            messageData?.avatar ||
            `https://graph.zalo.me/v2.0/avatar?user_id=${userId}&width=120&height=120`;

        console.log(`✅ Stranger info fetched: name="${displayName}", avatar="${avatar}"`);

        // Broadcast stranger info to all clients
        broadcast(apiState, {
            type: 'stranger_info',
            userId: userId,
            displayName: displayName,
            avatar: avatar,
            isStranger: true,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error(`❌ Failed to fetch stranger info for ${userId}:`, error.message);

        // Broadcast fallback info with dName from message
        broadcast(apiState, {
            type: 'stranger_info',
            userId: userId,
            displayName: messageData?.dName || `Người lạ (${userId.substring(0, 8)})`,
            avatar: `https://graph.zalo.me/v2.0/avatar?user_id=${userId}&width=120&height=120`,
            isStranger: true,
            timestamp: Date.now()
        });
    }
}

module.exports = { fetchAndBroadcastStrangerInfo };
