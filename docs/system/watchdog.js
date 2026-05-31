const triggerDB = require('../triggerDB');
const autoReply = require('../autoReply');

// Configuration
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let watchdogInterval = null;

/**
 * Start the Watchdog service
 * @param {Object} apiState - Global API state object
 */
function startWatchdog(multiState) {
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
    }

    console.log('🐶 Watchdog Service STARTED (Interval: 5m)');

    watchdogInterval = setInterval(async () => {
        try {
            if (!multiState) return;

            const messageDB = require('../messageDB');
            const accounts = multiState.accounts 
                ? Array.from(multiState.accounts.values())
                : [multiState];

            for (const account of accounts) {
                if (!account.currentUser || !account.currentUser.uid) continue;

                const uid = account.currentUser.uid;

                await messageDB.dbStorage.run(uid, async () => {
                    // 2. STATE SYNC: Restore Personal Auto-Reply State
                    const savedPersonal = triggerDB.getBuiltInTriggerState(uid, 'global_auto_reply_personal');
                    if (savedPersonal && savedPersonal.enabled !== undefined) {
                        const currentInMemory = autoReply.autoReplyState.enabled;

                        if (currentInMemory !== savedPersonal.enabled) {
                            console.warn(`🐶 Watchdog [${uid}]: State mismatch detected! DB=${savedPersonal.enabled}, Mem=${currentInMemory}. Restoring...`);
                            autoReply.autoReplyState.enabled = savedPersonal.enabled;
                        }
                    }
                });
            }

        } catch (error) {
            console.error('🐶 Watchdog Error:', error.message);
        }
    }, CHECK_INTERVAL_MS);
}

module.exports = { startWatchdog };
