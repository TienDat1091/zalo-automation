const triggerDB = require('../triggerDB');
const autoReply = require('../autoReply');

// Configuration
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let watchdogInterval = null;

/**
 * Start the Watchdog service
 * @param {Object} apiState - Global API state object
 */
function startWatchdog(apiState) {
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
    }

    console.log('🐶 Watchdog Service STARTED (Interval: 5m)');

    watchdogInterval = setInterval(async () => {
        try {
            if (!apiState) return;

            // 1. Check if logged in
            if (!apiState.currentUser || !apiState.currentUser.uid) {
                // console.log('🐶 Watchdog: User not logged in, skipping check.');
                return;
            }

            const uid = apiState.currentUser.uid;

            // 2. STATE SYNC: Restore Personal Auto-Reply State
            const savedPersonal = triggerDB.getBuiltInTriggerState(uid, 'global_auto_reply_personal');
            if (savedPersonal && savedPersonal.enabled !== undefined) {
                const currentInMemory = autoReply.autoReplyState.enabled;

                if (currentInMemory !== savedPersonal.enabled) {
                    console.warn(`🐶 Watchdog: State mismatch detected! DB=${savedPersonal.enabled}, Mem=${currentInMemory}. Restoring...`);
                    autoReply.autoReplyState.enabled = savedPersonal.enabled;

                    // Broadcast update to UI if possible (optional)
                }
            }

            // 3. CONNECTION CHECK: Ping Zalo API if logged in
            if (apiState.api && apiState.isLoggedIn) {
                try {
                    // Lightweight call to check connection
                    // getOwnId is purely local usually, maybe getProfile or just rely on 'error' events?
                    // Let's try to get own profile or similar if cheap.
                    // Or just check if apiState.api is still valid object.

                    // If we want to be proactive, we could try:
                    // await apiState.api.getOwnId();
                    // console.log('🐶 Watchdog: Connection ALIVE');
                } catch (e) {
                    console.warn('🐶 Watchdog: Connection seems broken:', e.message);
                    // Potential re-connect logic could go here if Zalo supports it
                }
            }

        } catch (error) {
            console.error('🐶 Watchdog Error:', error.message);
        }
    }, CHECK_INTERVAL_MS);
}

module.exports = { startWatchdog };
