const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Нет токена' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Неверный или просроченный токен' });
    }
}

async function checkModerator(req, res, next) {
    try {
        const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
        if (result.rows.length === 0) return res.status(403).json({ error: 'Доступ запрещён' });
        const role = result.rows[0].role;
        if (role !== 'admin' && role !== 'moderator') {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }
        next();
    } catch(err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

async function isAdmin(req, res, next) {
    try {
        const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
        if (result.rows.length === 0) return res.status(403).json({ error: 'Доступ запрещён' });
        if (result.rows[0].role !== 'admin') {
            return res.status(403).json({ error: 'Требуются права администратора' });
        }
        next();
    } catch(err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

module.exports = { auth, checkModerator, isAdmin };