// transaction-stats-routes.js - Statistics API for Bank Manager
// =============================================================

module.exports = function (app, triggerDB) {
    console.log('🔧 Registering transaction statistics endpoints...');

    // Get summary statistics
    app.get('/api/transactions/stats/summary', (req, res) => {
        try {
            const summary = triggerDB.getTransactionSummary();
            res.json({
                success: true,
                data: summary
            });
        } catch (error) {
            res.status(500).json({ error: error.message, success: false });
        }
    });

    // Get top users by payment amount
    app.get('/api/transactions/stats/top-users', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const month = req.query.month || null; // Format: YYYY-MM

            const topUsers = triggerDB.getTopUsersByAmount(limit, month);
            res.json({
                success: true,
                data: topUsers
            });
        } catch (error) {
            res.status(500).json({ error: error.message, success: false });
        }
    });

    // Get monthly transaction statistics
    app.get('/api/transactions/stats/monthly', (req, res) => {
        try {
            const year = parseInt(req.query.year) || new Date().getFullYear();
            const months = parseInt(req.query.months) || 12;

            const monthlyStats = triggerDB.getMonthlyTransactionStats(year, months);
            res.json({
                success: true,
                data: monthlyStats
            });
        } catch (error) {
            res.status(500).json({ error: error.message, success: false });
        }
    });

    console.log('  ✓ GET /api/transactions/stats/summary');
    console.log('  ✓ GET /api/transactions/stats/top-users');
    console.log('  ✓ GET /api/transactions/stats/monthly');
    console.log('✅ Transaction statistics endpoints registered');
};
