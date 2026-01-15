class SessionManager {
    constructor() {
        this.sessions = new Map(); // sessionId -> { api, currentUser, isLoggedIn, clients: Set<ws> }
        this.loginLock = false; // Mutex for QR generation
    }

    createSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, {
                id: sessionId,
                api: null,
                currentUser: null,
                isLoggedIn: false,
                messageStore: new Map(), // Message storage per session
                clients: new Set(),
                authorizedIP: null, // IP lock per session
                createdAt: Date.now()
            });
        }
        return this.sessions.get(sessionId);
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    removeSession(sessionId) {
        this.sessions.delete(sessionId);
    }

    // Helpers
    isLocked() { return this.loginLock; }
    lock() { this.loginLock = true; }
    unlock() { this.loginLock = false; }
}

module.exports = new SessionManager();
