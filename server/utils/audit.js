const pool = require('../db/pool');

async function logUserAction(userId, action, details = null, req = null) {
    try {
        const ip = req ? req.ip || req.connection.remoteAddress : null;
        const ua = req ? req.headers['user-agent'] : null;
        await pool.query(
            `INSERT INTO user_actions (user_id, action, details, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, action, details ? JSON.stringify(details) : null, ip, ua]
        );
    } catch(err) {
        console.error('Ошибка записи аудита:', err);
    }
}

module.exports = { logUserAction };