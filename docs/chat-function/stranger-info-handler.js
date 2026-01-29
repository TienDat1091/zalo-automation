// stranger-info-handler.js
// ✅ Client-side handler for stranger_info WebSocket events

(function (window) {
    'use strict';

    // Global handler for stranger_info events
    window.handleStrangerInfo = function (data) {
        console.log('👤 Received stranger_info:', data);

        const { userId, displayName, avatar, isStranger } = data;

        if (!userId) {
            console.warn('⚠️ Invalid stranger_info data');
            return;
        }

        // Check if friends list exists (defined in dashboard.html)
        if (typeof friends === 'undefined' || !Array.isArray(friends)) {
            console.warn('⚠️ Friends list not ready');
            return;
        }

        // Find existing friend or stranger
        const existingIndex = friends.findIndex(f => f.userId === userId);

        if (existingIndex >= 0) {
            // Update existing entry
            // Update existing entry (MUTATE object to preserve references in filteredFriends)
            console.log(`✏️ Updating stranger info for ${userId}`);
            Object.assign(friends[existingIndex], {
                displayName,
                avatar,
                isStranger: true,
                zaloName: displayName
            });
        } else {
            // Add new stranger to friends list
            // Add new stranger to friends list
            console.log(`➕ Adding new stranger ${userId} to friends list`);
            const newStranger = {
                userId,
                displayName,
                avatar,
                isStranger: true,
                zaloName: displayName
            };
            friends.push(newStranger);

            // Also add to filteredFriends if it exists
            if (typeof filteredFriends !== 'undefined' && Array.isArray(filteredFriends)) {
                filteredFriends.push(newStranger);
            }
        }

        // Re-render friends list (function defined in load_data.js)
        if (typeof renderFriendsVirtual === 'function') {
            console.log('🔄 Re-rendering friends list...');
            renderFriendsVirtual();
        } else {
            console.warn('⚠️ renderFriendsVirtual function not found');
        }

        // Save to localStorage for persistence
        try {
            const storageKey = `strangers_${currentUserId || 'default'}`;
            const strangers = friends.filter(f => f.isStranger);
            localStorage.setItem(storageKey, JSON.stringify(strangers));
            console.log(`💾 Saved ${strangers.length} strangers to localStorage`);
        } catch (e) {
            console.warn('⚠️ Failed to save strangers to localStorage:', e.message);
        }
    };

    console.log('✅ Stranger info handler loaded');

})(window);
