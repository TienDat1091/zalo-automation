// SEPAY.vn API Integration
// =====================================================
// API để nhận thông báo tự động khi có giao dịch chuyển khoản

const https = require('https');
const crypto = require('crypto');

// SEPAY API Configuration
const SEPAY_CONFIG = {
    baseUrl: 'https://my.sepay.vn/userapi',
    webhookUrl: 'https://my.sepay.vn/userapi/webhook',
    // Credentials - should be stored securely
    accountId: '',
    token: 'MIGYJCVUTLD0XPGSYFRXGW14MENB76PFLEJTUUNFK6C3ZDALWKSBTFO5TJGPNEUH' // User's API token
};

/**
 * Set SEPAY API credentials
 * @param {string} accountId - SEPAY Account ID
 * @param {string} token - SEPAY API Token
 */
function setCredentials(accountId, token) {
    SEPAY_CONFIG.accountId = accountId;
    SEPAY_CONFIG.token = token;
    console.log('✅ SEPAY credentials updated');
}

/**
 * Get credentials status
 * @returns {Object} Status object
 */
function getCredentialsStatus() {
    return {
        configured: !!(SEPAY_CONFIG.accountId && SEPAY_CONFIG.token),
        accountId: SEPAY_CONFIG.accountId ? SEPAY_CONFIG.accountId.substring(0, 8) + '...' : null
    };
}

/**
 * Verify webhook signature from SEPAY
 * SEPAY uses HMAC-SHA256 với token làm secret key
 * @param {Object} payload - Webhook payload
 * @param {string} receivedSignature - Signature từ header
 * @returns {boolean} True if valid
 */
function verifyWebhookSignature(payload, receivedSignature) {
    try {
        if (!SEPAY_CONFIG.token) {
            console.warn('⚠️ SEPAY token not configured for signature verification');
            return false;
        }

        // Create signature: HMAC-SHA256(payload, token)
        const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const hmac = crypto.createHmac('sha256', SEPAY_CONFIG.token);
        hmac.update(payloadString);
        const calculated = hmac.digest('hex');

        const isValid = calculated === receivedSignature;
        console.log(isValid ? '✅ SEPAY signature valid' : '❌ SEPAY signature invalid');

        return isValid;
    } catch (error) {
        console.error('❌ SEPAY signature verification error:', error.message);
        return false;
    }
}

/**
 * Get bank list supported by SEPAY
 * @returns {Promise<Object>} Bank list result
 */
async function getBankList() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'my.sepay.vn',
            port: 443,
            path: '/userapi/v2/banks',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SEPAY_CONFIG.token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.status === 200 && response.data) {
                        resolve({
                            success: true,
                            banks: response.data
                        });
                    } else {
                        resolve({
                            success: false,
                            error: response.message || 'Failed to get bank list'
                        });
                    }
                } catch (e) {
                    resolve({
                        success: false,
                        error: 'Invalid response format'
                    });
                }
            });
        });

        req.on('error', (error) => {
            resolve({
                success: false,
                error: error.message
            });
        });

        req.end();
    });
}

/**
 * Get transaction history from SEPAY
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Transaction history
 */
async function getTransactionHistory(fromDate, toDate) {
    if (!SEPAY_CONFIG.accountId || !SEPAY_CONFIG.token) {
        return {
            success: false,
            error: 'SEPAY credentials not configured'
        };
    }

    return new Promise((resolve, reject) => {
        const queryParams = new URLSearchParams({
            account_id: SEPAY_CONFIG.accountId,
            from_date: fromDate,
            to_date: toDate
        });

        const options = {
            hostname: 'my.sepay.vn',
            port: 443,
            path: `/userapi/transactions?${queryParams}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SEPAY_CONFIG.token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.status === 200) {
                        resolve({
                            success: true,
                            transactions: response.transactions || []
                        });
                    } else {
                        resolve({
                            success: false,
                            error: response.message || 'Failed to get transactions'
                        });
                    }
                } catch (e) {
                    resolve({
                        success: false,
                        error: 'Invalid response format'
                    });
                }
            });
        });

        req.on('error', (error) => {
            resolve({
                success: false,
                error: error.message
            });
        });

        req.end();
    });
}

/**
 * Test SEPAY connection
 * @returns {Promise<Object>} Test result
 */
async function testConnection() {
    if (!SEPAY_CONFIG.accountId || !SEPAY_CONFIG.token) {
        return {
            success: false,
            error: 'SEPAY credentials not configured'
        };
    }

    console.log('🔍 Testing SEPAY connection...');

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'my.sepay.vn',
            port: 443,
            path: '/userapi/account/info',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SEPAY_CONFIG.token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.status === 200) {
                        console.log('✅ SEPAY connection successful');
                        resolve({
                            success: true,
                            accountInfo: response.data || {}
                        });
                    } else {
                        console.log('❌ SEPAY connection failed:', response.message);
                        resolve({
                            success: false,
                            error: response.message || 'Connection test failed'
                        });
                    }
                } catch (e) {
                    resolve({
                        success: false,
                        error: 'Invalid response format'
                    });
                }
            });
        });

        req.on('error', (error) => {
            console.log('❌ SEPAY connection error:', error.message);
            resolve({
                success: false,
                error: error.message
            });
        });

        req.setTimeout(10000, () => {
            console.log('❌ SEPAY connection timeout');
            req.destroy();
            resolve({
                success: false,
                error: 'Connection timeout'
            });
        });

        req.end();
    });
}

/**
 * Parse webhook data from SEPAY
 * @param {Object} webhookData - Raw webhook data
 * @returns {Object} Parsed transaction info
 */
function parseWebhookData(webhookData) {
    try {
        // SEPAY Real Format (based on actual webhook):
        // {
        //   "gateway": "VietinBank",
        //   "transactionDate": "2026-01-21 22:59:54",
        //   "accountNumber": "102875037553",
        //   "content": "...",
        //   "transferType": "in",
        //   "transferAmount": 10000,
        //   "referenceCode": "164T2610ZZVLSBA9",
        //   "id": 39634195
        // }

        return {
            transactionId: webhookData.id || webhookData.transaction_id,
            amount: parseFloat(webhookData.transferAmount || webhookData.amount_in || webhookData.amount || 0),
            content: webhookData.content || webhookData.transaction_content || '',
            bankBin: webhookData.gateway || webhookData.bank_brand_name || webhookData.bank_code,
            accountNumber: webhookData.accountNumber || webhookData.account_number,
            accountName: webhookData.accountName || webhookData.account_name || 'N/A',
            referenceNo: webhookData.referenceCode || webhookData.reference_number || webhookData.ref_no,
            timestamp: webhookData.transactionDate || webhookData.transaction_date || webhookData.created_at,
            status: webhookData.transferType === 'in' ? 'completed' : (webhookData.status || 'completed')
        };
    } catch (error) {
        console.error('❌ Error parsing SEPAY webhook data:', error.message);
        return null;
    }
}

/**
 * Get user's bank accounts from SEPAY
 * @param {Object} options - Query options (short_name, limit, etc.)
 * @returns {Promise<Object>} Bank accounts list
 */
async function getBankAccounts(options = {}) {
    if (!SEPAY_CONFIG.token) {
        return {
            success: false,
            error: 'SEPAY token not configured'
        };
    }

    return new Promise((resolve) => {
        const queryParams = new URLSearchParams(options);
        const path = `/userapi/bankaccounts/list${queryParams.toString() ? '?' + queryParams : ''}`;

        const req = https.request({
            hostname: 'my.sepay.vn',
            port: 443,
            path: path,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SEPAY_CONFIG.token}`,
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.status === 200 && response.bankaccounts) {
                        resolve({
                            success: true,
                            accounts: response.bankaccounts
                        });
                    } else {
                        resolve({
                            success: false,
                            error: response.error || 'Failed to get bank accounts'
                        });
                    }
                } catch (e) {
                    resolve({ success: false, error: 'Invalid response format' });
                }
            });
        });

        req.on('error', (error) => {
            resolve({ success: false, error: error.message });
        });

        req.setTimeout(10000, () => {
            req.destroy();
            resolve({ success: false, error: 'Request timeout' });
        });

        req.end();
    });
}

/**
 * Get specific bank account details from SEPAY
 * @param {string} bankAccountId - Bank account ID
 * @returns {Promise<Object>} Bank account details
 */
async function getBankAccountDetails(bankAccountId) {
    if (!SEPAY_CONFIG.token) {
        return {
            success: false,
            error: 'SEPAY token not configured'
        };
    }

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'my.sepay.vn',
            port: 443,
            path: `/userapi/bankaccounts/details/${bankAccountId}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SEPAY_CONFIG.token}`,
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.status === 200 && response.bankaccount) {
                        resolve({
                            success: true,
                            account: response.bankaccount
                        });
                    } else {
                        resolve({
                            success: false,
                            error: response.error || 'Failed to get account details'
                        });
                    }
                } catch (e) {
                    resolve({ success: false, error: 'Invalid response format' });
                }
            });
        });

        req.on('error', (error) => {
            resolve({ success: false, error: error.message });
        });

        req.setTimeout(10000, () => {
            req.destroy();
            resolve({ success: false, error: 'Request timeout' });
        });

        req.end();
    });
}

module.exports = {
    setCredentials,
    getCredentialsStatus,
    verifyWebhookSignature,
    getBankList,
    getTransactionHistory,
    testConnection,
    parseWebhookData,
    getBankAccounts,
    getBankAccountDetails
};
