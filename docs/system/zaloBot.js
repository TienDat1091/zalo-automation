const fs = require('fs');
const path = require('path');

// Default Token REMOVED per user request
// const DEFAULT_TOKEN = '...';

/**
 * Call Zalo Bot API
 * @param {string} token 
 * @param {string} method e.g. 'getMe', 'sendMessage'
 * @param {object} payload 
 */
async function callBotApi(token, method, payload = {}) {
    try {
        const url = `https://bot-api.zaloplatforms.com/bot${token}/${method}`;
        console.log(`🤖 ZaloBot API Call: ${method}`);

        // Using global fetch (Node 18+)
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`❌ ZaloBot API Error (${method}):`, error.message);
        return { ok: false, error_code: -1, description: error.message };
    }
}

async function getMe(token) {
    if (!token) return { ok: false, description: 'Missing Bot Token' };
    return await callBotApi(token, 'getMe', {});
}

async function sendMessage(token, userId, text) {
    if (!token) return { ok: false, description: 'Missing Bot Token' };
    return await callBotApi(token, 'sendMessage', {
        chat_id: userId,
        text: text
    });
}

async function getUpdates(token, offset) {
    if (!token) return { ok: false, description: 'Missing Bot Token' };
    const payload = { timeout: 30 };
    if (offset) payload.offset = offset;

    return await callBotApi(token, 'getUpdates', payload);
}

// REQUESTED API: sendChatAction
async function sendChatAction(token, userId, action = 'typing') {
    if (!token) return { ok: false, description: 'Missing Bot Token' };
    // https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}/sendChatAction
    return await callBotApi(token, 'sendChatAction', {
        chat_id: userId,
        action: action
    });
}

// INFERRED API: getProfile
async function getProfile(token, userId) {
    if (!token) return { ok: false, description: 'Missing Bot Token' };
    // Try to get profile - inferred endpoint based on standard Zalo patterns
    // If this fails, we will rely on webhook data
    return await callBotApi(token, 'getProfile', { user_id: userId });
}

module.exports = { getMe, sendMessage, getUpdates, sendChatAction, getProfile };
