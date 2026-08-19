const pool = require('../db/pool');

async function hasActiveSubscription(userId, packageType = 'listing') {
    const result = await pool.query(
        `SELECT id, end_date FROM user_subscriptions
         WHERE user_id = $1 AND package_type = $2 AND is_active = true AND end_date > NOW()`,
        [userId, packageType]
    );
    if (result.rows.length > 0) return true;

    const trial = await pool.query(
        `SELECT is_trial, trial_expires_at FROM users WHERE id = $1`,
        [userId]
    );
    if (trial.rows.length > 0 && trial.rows[0].is_trial && new Date(trial.rows[0].trial_expires_at) > new Date()) {
        return true;
    }
    return false;
}

async function checkSubscription(req, res, next) {
    const userId = req.userId;
    const packageType = req.query.packageType || 'listing';
    const has = await hasActiveSubscription(userId, packageType);
    if (!has) {
        return res.status(403).json({ error: 'Требуется активная подписка. Продлите пакет.' });
    }
    next();
}

module.exports = { hasActiveSubscription, checkSubscription };