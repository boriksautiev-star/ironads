const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../services/hcaptcha');
const { auth, isAdmin } = require('../middleware/auth');

async function getSetting(key, defaultValue = null) {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (result.rows.length === 0) return defaultValue;
    return result.rows[0].value;
}

// Отправка сообщения (публичный)
router.post('/', async (req, res) => {
    const { name, email, subject, message, hcaptchaToken } = req.body;
    if (!email || !message) {
        return res.status(400).json({ error: 'Email и сообщение обязательны' });
    }
    // Проверка капчи
    const hcaptchaEnabled = await getSetting('hcaptcha_enabled', 'false') === 'true';
    if (hcaptchaEnabled) {
        const secretKey = await getSetting('hcaptcha_secret_key', '');
        if (!secretKey || !(await verifyToken(hcaptchaToken, secretKey))) {
            return res.status(400).json({ error: 'Пожалуйста, подтвердите, что вы не робот' });
        }
    }
    const ip = req.ip || req.connection.remoteAddress;
    const recent = await pool.query(
        `SELECT COUNT(*) FROM contact_messages WHERE ip_address = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [ip]
    );
    if (parseInt(recent.rows[0].count) >= 5) {
        return res.status(429).json({ error: 'Слишком много сообщений. Попробуйте позже.' });
    }
    await pool.query(
        `INSERT INTO contact_messages (name, email, subject, message, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)`,
        [name || null, email, subject || null, message, ip, req.headers['user-agent'] || null]
    );
    res.json({ message: 'Сообщение отправлено' });
});

// Получение списка сообщений (админ)
router.get('/admin/messages', auth, isAdmin, async (req, res) => {
    const { status = 'all', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT * FROM contact_messages WHERE TRUE`;
    const params = [];
    if (status !== 'all') {
        query += ` AND status = $${params.length + 1}`;
        params.push(status);
    }
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) AS sub`, params);
    const total = parseInt(countResult.rows[0].count);
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const messages = await pool.query(query, params);
    res.json({ messages: messages.rows, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

// Отметить сообщение как прочитанное
router.put('/admin/messages/:id/read', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    await pool.query(`UPDATE contact_messages SET status = 'read' WHERE id = $1`, [id]);
    res.json({ message: 'Статус обновлён' });
});

module.exports = router;