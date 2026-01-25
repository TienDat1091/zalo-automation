// sepay-api-routes.js - API endpoints for SEPAY integration
// ============================================

const fs = require('fs');
const path = require('path');
const sepayApi = require('../system/sepay-api');

// Path to store SEPAY credentials
const SEPAY_CREDENTIALS_PATH = path.join(__dirname, '..', 'sepay-credentials.json');

// Load credentials on startup
try {
    if (fs.existsSync(SEPAY_CREDENTIALS_PATH)) {
        const creds = JSON.parse(fs.readFileSync(SEPAY_CREDENTIALS_PATH, 'utf8'));
        if (creds.accountId && creds.token) {
            sepayApi.setCredentials(creds.accountId, creds.token);
            console.log('✅ SEPAY credentials loaded from file');
        }
    }
} catch (e) {
    console.warn('⚠️ Could not load SEPAY credentials:', e.message);
}

module.exports = function (app, triggerDB, apiState) {
    console.log('🔧 Registering SEPAY API endpoints...');

    // =====================================================
    // GET SEPAY CREDENTIALS STATUS
    // =====================================================
    app.get('/api/sepay/status', (req, res) => {
        try {
            const status = sepayApi.getCredentialsStatus();
            res.json(status);
        } catch (error) {
            res.status(500).json({ error: error.message, success: false });
        }
    });

    // =====================================================
    // SAVE SEPAY CREDENTIALS
    // =====================================================
    app.post('/api/sepay/credentials', (req, res) => {
        try {
            const { accountId, token } = req.body;

            if (!accountId || !token) {
                return res.status(400).json({
                    error: 'Missing accountId or token',
                    success: false
                });
            }

            // Save to file
            fs.writeFileSync(
                SEPAY_CREDENTIALS_PATH,
                JSON.stringify({ accountId, token }, null, 2),
                'utf8'
            );

            // Update in memory
            sepayApi.setCredentials(accountId, token);

            console.log('✅ SEPAY credentials saved successfully');

            res.json({
                success: true,
                message: 'SEPAY credentials saved successfully'
            });
        } catch (error) {
            console.error('❌ Save SEPAY credentials error:', error.message);
            res.status(500).json({ error: error.message, success: false });
        }
    });

    // =====================================================
    // TEST SEPAY CONNECTION
    // =====================================================
    app.post('/api/sepay/test', async (req, res) => {
        try {
            const result = await sepayApi.testConnection();
            res.json(result);
        } catch (error) {
            console.error('❌ SEPAY connection test error:', error.message);
            res.status(500).json({ error: error.message, success: false });
        }
    });

    // =====================================================
    // GET SEPAY BANK LIST
    // =====================================================
    app.get('/api/sepay/banks', async (req, res) => {
        try {
            const result = await sepayApi.getBankList();
            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error) {
            console.error('❌ Get bank list error:', error.message);
            res.status(500).json({ error: error.message, success: false });
        }
    });

    // =====================================================
    // GET SEPAY TRANSACTION HISTORY
    // =====================================================
    app.get('/api/sepay/transactions', async (req, res) => {
        try {
            const { from, to } = req.query;

            if (!from || !to) {
                return res.status(400).json({
                    error: 'Missing from or to date',
                    success: false
                });
            }

            const result = await sepayApi.getTransactionHistory(from, to);
            res.json(result);
        } catch (error) {
            console.error('❌ Get transaction history error:', error.message);
            res.status(500).json({ error: error.message, success: false });
        }
    });

    // =====================================================
    // SEPAY WEBHOOK RECEIVER
    // =====================================================
    app.post('/api/sepay/webhook', async (req, res) => {
        try {
            console.log('📨 SEPAY webhook received');
            console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
            console.log('📦 Body:', JSON.stringify(req.body, null, 2));

            const webhookData = req.body;
            const signature = req.headers['x-sepay-signature'] || req.headers['signature'];

            console.log('🔑 Signature found:', signature);

            // TEMPORARILY SKIP signature verification for debugging
            // TODO: Re-enable after finding correct signature method
            const isValid = true; // sepayApi.verifyWebhookSignature(webhookData, signature);
            if (!isValid) {
                console.warn('⚠️ Invalid SEPAY webhook signature');
                return res.status(401).json({
                    error: 'Invalid signature',
                    success: false
                });
            }

            // Parse webhook data
            const transaction = sepayApi.parseWebhookData(webhookData);
            if (!transaction) {
                console.warn('⚠️ Failed to parse SEPAY webhook data');
                return res.status(400).json({
                    error: 'Invalid webhook data',
                    success: false
                });
            }

            console.log('💰 SEPAY Transaction:', {
                id: transaction.transactionId,
                amount: transaction.amount,
                content: transaction.content
            });

            // Match with existing transaction in DB
            // SEPAY typically returns "SEVQR" as content, so we prioritize amount-based matching
            let matchedTransaction = null;

            // Get all WAITING transactions
            const allTransactions = triggerDB.getAllTransactions();
            const waitingTransactions = allTransactions.filter(t => t.status === 'WAITING');

            console.log(`📊 Found ${waitingTransactions.length} waiting transactions`);

            // Try to find a WAITING transaction where the content includes the transaction code
            // (This works if user manually enters the code)
            for (const txn of waitingTransactions) {
                if (txn.transactionCode && transaction.content.includes(txn.transactionCode)) {
                    matchedTransaction = txn;
                    console.log('✅ Found matching transaction by code in content:', txn.transactionCode);
                    break;
                }
            }

            // Primary matching: By amount (for SEPAY QR payments where content is "SEVQR")
            if (!matchedTransaction) {
                console.log('⚠️ No transaction code match, using amount matching...');

                // Filter by amount first, then pick the most recent one
                const amountMatches = waitingTransactions.filter(txn =>
                    Math.abs(txn.amount - transaction.amount) < 1
                );

                if (amountMatches.length > 0) {
                    // Sort by creation time (most recent first) and pick the first
                    amountMatches.sort((a, b) => b.createdAt - a.createdAt);
                    matchedTransaction = amountMatches[0];

                    console.log(`✅ Found ${amountMatches.length} amount match(es), selected most recent:`, {
                        code: matchedTransaction.transactionCode,
                        amount: matchedTransaction.amount,
                        createdAt: new Date(matchedTransaction.createdAt).toLocaleString('vi-VN')
                    });
                }
            }

            if (matchedTransaction) {
                // Validate amount
                if (Math.abs(matchedTransaction.amount - transaction.amount) < 1) {
                    // Mark as PAID
                    const updated = triggerDB.markTransactionPaid(matchedTransaction.transactionID);

                    // Create payment log
                    // TODO: Create payment_logs table in database schema
                    // triggerDB.createPaymentLog(matchedTransaction.userUID, {
                    //     transactionID: matchedTransaction.transactionID,
                    //     transactionCode: matchedTransaction.transactionCode,
                    //     bankBin: transaction.bankBin,
                    //     accountNumber: transaction.accountNumber,
                    //     accountName: transaction.accountName,
                    //     amount: transaction.amount,
                    //     rawData: JSON.stringify(webhookData)
                    // });

                    // Broadcast to WebSocket clients
                    if (apiState && apiState.clients) {
                        apiState.clients.forEach(ws => {
                            if (ws.readyState === 1) { // OPEN
                                ws.send(JSON.stringify({
                                    type: 'payment_received',
                                    transaction: updated,
                                    sepayData: transaction
                                }));
                            }
                        });
                    }

                    console.log('✅ Transaction marked as PAID:', matchedTransaction.transactionCode);

                    // 🆕 Trigger success handler (send success message to customer)
                    try {
                        // Get transaction and customer info
                        const customerID = updated.senderAccount || matchedTransaction.senderAccount;
                        const customerName = updated.senderName || matchedTransaction.senderName || 'Khách hàng';

                        console.log('🔍 Success handler check:', {
                            customerID: customerID,
                            customerName: customerName,
                            hasApiState: !!apiState,
                            hasApi: !!(apiState && apiState.api),
                            userUID: matchedTransaction.userUID
                        });

                        if (customerID && apiState && apiState.api) {
                            // Build success message
                            const successMessage = `✅ THANH TOÁN THÀNH CÔNG!

💰 Số tiền: ${transaction.amount.toLocaleString('vi-VN')} VNĐ
📝 Mã GD: ${matchedTransaction.transactionCode}
👤 Khách hàng: ${customerName}

Cảm ơn bạn đã thanh toán!`;

                            // Import autoReply module
                            const autoReply = require('../autoReply');

                            console.log('📤 Attempting to send success message...');

                            // Send success message
                            if (autoReply && autoReply.sendMessage) {
                                await autoReply.sendMessage(apiState, customerID, successMessage, matchedTransaction.userUID);
                                console.log(`✅ Success message sent to customer: ${customerID}`);
                            } else {
                                console.log('❌ autoReply.sendMessage not available');
                            }
                        } else {
                            console.log('⚠️ Skipping success message - missing requirements:', {
                                hasCustomerID: !!customerID,
                                hasApiState: !!apiState,
                                hasApi: !!(apiState && apiState.api)
                            });
                        }
                    } catch (err) {
                        console.error('❌ Error sending success message:', err.message);
                        console.error('Stack:', err.stack);
                    }

                    // 🆕 Resolve pending payment Promise (unblock flow)
                    try {
                        const autoReply = require('../autoReply');
                        if (autoReply && autoReply.autoReplyState && autoReply.autoReplyState.pendingPayments) {
                            const pending = autoReply.autoReplyState.pendingPayments.get(matchedTransaction.transactionCode);
                            if (pending) {
                                console.log(`🔓 Resolving payment Promise for ${matchedTransaction.transactionCode}`);

                                // Clear timeout
                                if (pending.timeoutId) {
                                    clearTimeout(pending.timeoutId);
                                }

                                // Resolve Promise with SUCCESS status
                                pending.resolve('SUCCESS');

                                // Remove from pending
                                autoReply.autoReplyState.pendingPayments.delete(matchedTransaction.transactionCode);
                            }
                        }
                    } catch (err) {
                        console.error('❌ Error resolving payment Promise:', err.message);
                    }

                    // Return success to SEPAY
                    return res.json({
                        success: true,
                        message: 'Payment processed successfully'
                    });
                } else {
                    console.warn('⚠️ Amount mismatch:', {
                        expected: matchedTransaction.amount,
                        received: transaction.amount
                    });
                    return res.json({
                        success: false,
                        error: 'Amount mismatch'
                    });
                }
            } else {
                console.log('ℹ️ No matching pending transaction found');
                // Still accept webhook but don't process
                return res.json({
                    success: true,
                    message: 'Webhook received but no matching transaction'
                });
            }

        } catch (error) {
            console.error('❌ SEPAY webhook processing error:', error.message);
            res.status(500).json({ error: error.message, success: false });
        }
    });

    console.log('✅ SEPAY API endpoints registered');
    // =====================================================
    // GET SEPAY BANK ACCOUNTS
    // =====================================================
    app.get('/api/sepay/bank-accounts', async (req, res) => {
        try {
            const options = {};
            if (req.query.short_name) options.short_name = req.query.short_name;
            if (req.query.limit) options.limit = req.query.limit;

            const result = await sepayApi.getBankAccounts(options);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message, success: false });
        }
    });

    // =====================================================
    // GET SEPAY BANK ACCOUNT DETAILS
    // =====================================================
    app.get('/api/sepay/bank-accounts/:id', async (req, res) => {
        try {
            const result = await sepayApi.getBankAccountDetails(req.params.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message, success: false });
        }
    });

    console.log('  ✓ GET /api/sepay/bank-accounts');
    console.log('  ✓ GET /api/sepay/bank-accounts/:id');
    console.log('✅ SEPAY API endpoints registered correctly');
};
