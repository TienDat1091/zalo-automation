// conversation-history-handler.js
// WebSocket handler for loading historical messages from database

(function () {
    'use strict';

    console.log('📡 Conversation History Handler loaded');

    // Setup function to register WebSocket listener
    window.setupConversationHistoryHandler = function () {
        if (typeof ws === 'undefined' || !ws) {
            console.warn('⚠️ WebSocket not ready for conversation history handler');
            return false;
        }

        console.log('✅ Registering conversation history WebSocket handler');

        // Store original onmessage handler
        const originalOnMessage = ws.onmessage;

        // Override ws.onmessage to handle conversation_history
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // Handle conversation_history response
                if (data.type === 'conversation_history') {
                    console.log(`📜 Received ${data.messages?.length || 0} historical messages for thread ${data.threadId}`);

                    if (data.messages && data.messages.length > 0) {
                        // Check if this is for the currently selected friend
                        if (typeof selectedFriend !== 'undefined' && selectedFriend && selectedFriend.userId === data.threadId) {
                            // Store in currentMessages and render
                            if (typeof currentMessages !== 'undefined') {
                                currentMessages = data.messages.sort((a, b) => a.timestamp - b.timestamp);
                                console.log(`✅ Rendering ${currentMessages.length} historical messages`);

                                if (typeof renderMessages === 'function') {
                                    renderMessages();
                                }
                            }

                            // Save to IndexedDB for next time
                            if (typeof dbInstance !== 'undefined' && dbInstance) {
                                try {
                                    const transaction = dbInstance.transaction(['messages'], 'readwrite');
                                    const store = transaction.objectStore('messages');

                                    data.messages.forEach(msg => {
                                        try {
                                            store.put({
                                                ...msg,
                                                uid: data.threadId,
                                                msgId: msg.msgId || msg.id || `msg_${Date.now()}_${Math.random()}`
                                            });
                                        } catch (err) {
                                            console.warn('⚠️ Failed to save message to IndexedDB:', err.message);
                                        }
                                    });

                                    console.log(`💾 Saved ${data.messages.length} messages to IndexedDB`);
                                } catch (err) {
                                    console.error('❌ IndexedDB error:', err);
                                }
                            }
                        }
                    } else if (data.messages && data.messages.length === 0) {
                        console.log('📭 No historical messages found in server DB');
                        const msgContainer = document.getElementById('messagesContainer');
                        if (msgContainer && typeof selectedFriend !== 'undefined' && selectedFriend && selectedFriend.userId === data.threadId) {
                            msgContainer.innerHTML = '<div class="empty-chat"><div class="icon">💬</div><div>Chưa có tin nhắn nào</div></div>';
                        }
                    }
                }

                // ✅ Handle stranger_info events
                if (data.type === 'stranger_info') {
                    console.log('👤 Received stranger_info event:', data);

                    // Call global handler if available
                    if (typeof window.handleStrangerInfo === 'function') {
                        window.handleStrangerInfo(data);
                    } else {
                        console.warn('⚠️ handleStrangerInfo function not found');
                    }
                }
            } catch (err) {
                console.error('❌ Error parsing WebSocket message:', err);
            }

            // Call original handler if it exists
            if (originalOnMessage) {
                originalOnMessage.call(ws, event);
            }
        };

        console.log('✅ Conversation history handler registered successfully');
        return true;
    };

    // Auto-setup when ws becomes available
    let setupAttempts = 0;
    const maxAttempts = 20; // 10 seconds max
    const setupInterval = setInterval(() => {
        setupAttempts++;

        if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
            if (window.setupConversationHistoryHandler()) {
                clearInterval(setupInterval);
                console.log('🎉 Conversation history handler active');
            }
        } else if (setupAttempts >= maxAttempts) {
            console.warn('⚠️ Failed to setup conversation history handler after 10s');
            clearInterval(setupInterval);
        }
    }, 500);
})();
