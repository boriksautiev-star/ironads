const express = require('express');
const pool = require('../db/pool');
const { auth } = require('../middleware/auth');
const router = express.Router();
const jwt = require('jsonwebtoken');

// ========== ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ПРОВЕРКИ ID ==========
function parseUserId(id) {
    if (id === undefined || id === null || id === 'null') return null;
    const parsed = parseInt(id, 10);
    if (isNaN(parsed) || parsed <= 0) return null;
    return parsed;
}

// ========== ОБНОВЛЕНИЕ ПРОФИЛЯ ==========
router.put('/profile', auth, async (req, res) => {
    const userId = req.userId;
    const { username, email, phone, avatar_url } = req.body;

    if (!username && !email && !phone && !avatar_url) {
        return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    if (phone && !/^\+?\d{10,15}$/.test(phone.replace(/[\s\-()]/g, ''))) {
        return res.status(400).json({ error: 'Неверный формат номера телефона' });
    }

    try {
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const fields = [];
        const values = [];
        let paramCounter = 1;

        if (username) {
            fields.push(`username = $${paramCounter++}`);
            values.push(username);
        }
        if (email) {
            fields.push(`email = $${paramCounter++}`);
            values.push(email);
        }
        if (phone !== undefined) {
            fields.push(`phone = $${paramCounter++}`);
            values.push(phone || null);
        }
        if (avatar_url !== undefined) {
            fields.push(`avatar_url = $${paramCounter++}`);
            values.push(avatar_url || null);
        }

        fields.push(`updated_at = NOW()`);

        if (fields.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        values.push(userId);
        const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCounter} RETURNING id, username, email, phone, avatar_url`;
        const result = await pool.query(query, values);

        res.json({
            success: true,
            user: result.rows[0],
            message: 'Профиль обновлён'
        });
    } catch (err) {
        console.error('Ошибка обновления профиля:', err);
        if (err.code === '23505') {
            if (err.constraint === 'users_email_unique') {
                return res.status(400).json({ error: 'Этот email уже используется' });
            }
            if (err.constraint === 'users_username_unique') {
                return res.status(400).json({ error: 'Это имя пользователя уже занято' });
            }
        }
        res.status(500).json({ error: 'Ошибка сервера при обновлении профиля' });
    }
});

// ========== ПОЛУЧИТЬ ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (С ДОБАВЛЕННЫМИ is_partner, partner_plan_id) ==========
router.get('/:userId', async (req, res) => {
    const targetUserId = parseUserId(req.params.userId);
    if (targetUserId === null) {
        return res.status(400).json({ error: 'Неверный ID пользователя' });
    }

    let currentUserId = null;
    let currentUserRole = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            currentUserId = decoded.userId;
            const userRes = await pool.query('SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL', [currentUserId]);
            if (userRes.rows.length > 0) {
                currentUserRole = userRes.rows[0].role;
            }
        } catch (err) {
            currentUserId = null;
            currentUserRole = null;
        }
    }

    const isOwner = (currentUserId && currentUserId === targetUserId);
    const isModeratorOrAdmin = (currentUserRole === 'admin' || currentUserRole === 'moderator');
    const showPhone = (isOwner || isModeratorOrAdmin);

    let query;
    let params;
    if (showPhone) {
        query = `
            SELECT id, username, avatar_url, phone,
                   is_partner, partner_plan_id,
                   (EXTRACT(EPOCH FROM NOW() - last_seen) < 300) as is_online,
                   created_at,
                   (SELECT COALESCE(AVG(rating), 0) FROM ratings WHERE to_user_id = $1) as rating_avg,
                   (SELECT COUNT(*) FROM ratings WHERE to_user_id = $1) as rating_count
            FROM users 
            WHERE id = $1 AND deleted_at IS NULL
        `;
        params = [targetUserId];
    } else {
        query = `
            SELECT id, username, avatar_url,
                   NULL as phone,
                   is_partner, partner_plan_id,
                   (EXTRACT(EPOCH FROM NOW() - last_seen) < 300) as is_online,
                   created_at,
                   (SELECT COALESCE(AVG(rating), 0) FROM ratings WHERE to_user_id = $1) as rating_avg,
                   (SELECT COUNT(*) FROM ratings WHERE to_user_id = $1) as rating_count
            FROM users 
            WHERE id = $1 AND deleted_at IS NULL
        `;
        params = [targetUserId];
    }

    try {
        const result = await pool.query(query, params);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ПОЛУЧИТЬ ОБЪЯВЛЕНИЯ ПОЛЬЗОВАТЕЛЯ ==========
router.get('/:userId/listings', async (req, res) => {
    const userId = parseUserId(req.params.userId);
    if (userId === null) {
        return res.status(400).json({ error: 'Неверный ID пользователя' });
    }
    try {
        const result = await pool.query(`
            SELECT l.*, c.name as category_name, c.icon as category_icon,
                   (SELECT json_build_object('id', m.id, 'file_path', m.file_path, 'file_type', m.file_type) 
                    FROM listing_media m 
                    WHERE m.listing_id = l.id 
                    ORDER BY CASE WHEN m.is_main THEN 0 ELSE 1 END, m.file_order 
                    LIMIT 1) as first_media
            FROM listings l
            LEFT JOIN categories c ON l.category_id = c.id
            WHERE l.user_id = $1 AND (l.status = 'active' OR l.status IS NULL) AND l.deleted_at IS NULL
            ORDER BY l.created_at DESC
        `, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== РЕЙТИНГ ==========
router.get('/:userId/rating', async (req, res) => {
    const userId = parseUserId(req.params.userId);
    if (userId === null) {
        return res.status(400).json({ error: 'Неверный ID пользователя' });
    }
    try {
        const result = await pool.query(`
            SELECT COALESCE(AVG(rating), 0) as average, COUNT(*) as total
            FROM ratings WHERE to_user_id = $1
        `, [userId]);
        res.json({ average: parseFloat(result.rows[0].average), total: parseInt(result.rows[0].total) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ОСТАВИТЬ ОЦЕНКУ ==========
router.post('/rate', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    const token = authHeader.split(' ')[1];
    let from_user_id;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        from_user_id = decoded.userId;
    } catch (err) {
        return res.status(401).json({ error: 'Неверный токен' });
    }
    const { to_user_id, chat_id, rating, comment } = req.body;

    const toUserId = parseUserId(to_user_id);
    if (toUserId === null) return res.status(400).json({ error: 'Неверный ID пользователя' });
    const chatId = parseUserId(chat_id);
    if (chatId === null) return res.status(400).json({ error: 'Неверный ID чата' });

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Рейтинг должен быть от 1 до 5' });
    }
    if (from_user_id === toUserId) {
        return res.status(400).json({ error: 'Нельзя оценить самого себя' });
    }
    try {
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [toUserId]);
        if (userCheck.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });

        const chatCheck = await pool.query('SELECT * FROM chats WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [chatId, from_user_id]);
        if (chatCheck.rows.length === 0) return res.status(403).json({ error: 'Нет доступа к этому чату' });

        const existing = await pool.query('SELECT id FROM ratings WHERE chat_id = $1 AND from_user_id = $2', [chatId, from_user_id]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Вы уже оценили этого пользователя в данном чате' });

        await pool.query('INSERT INTO ratings (from_user_id, to_user_id, chat_id, rating, comment) VALUES ($1, $2, $3, $4, $5)',
            [from_user_id, toUserId, chatId, rating, comment || null]);
        res.json({ message: 'Спасибо за оценку!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ЖАЛОБЫ НА ПОЛЬЗОВАТЕЛЯ ==========
router.post('/:userId/complaint', auth, async (req, res) => {
    const complainantId = req.userId;
    const complainedUserId = parseUserId(req.params.userId);
    if (complainedUserId === null) {
        return res.status(400).json({ error: 'Неверный ID пользователя' });
    }
    const { reason } = req.body;
    if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: 'Укажите причину жалобы' });
    }
    if (complainedUserId === complainantId) {
        return res.status(403).json({ error: 'Нельзя жаловаться на самого себя' });
    }
    try {
        const user = await pool.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [complainedUserId]);
        if (user.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });

        const existing = await pool.query(
            'SELECT id FROM complaints WHERE complainant_id = $1 AND complained_user_id = $2 AND status = $3',
            [complainantId, complainedUserId, 'pending']
        );
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Вы уже отправили жалобу на этого пользователя' });

        await pool.query(
            'INSERT INTO complaints (complainant_id, complained_user_id, reason) VALUES ($1, $2, $3)',
            [complainantId, complainedUserId, reason]
        );
        res.json({ message: 'Жалоба отправлена. Спасибо, мы рассмотрим.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ==================== НОВЫЕ МАРШРУТЫ ДЛЯ PUSH-ТОКЕНОВ ====================

// Регистрация push-токена (сохраняем в БД)
router.post('/push-token', auth, async (req, res) => {
    try {
        const { token, device_os } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        // Upsert: если токен уже существует, обновляем user_id и device_os
        await pool.query(
            `INSERT INTO push_tokens (user_id, token, device_os)
             VALUES ($1, $2, $3)
             ON CONFLICT (token) 
             DO UPDATE SET user_id = $1, device_os = $3, updated_at = NOW()`,
            [req.userId, token, device_os || null]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Error saving push token:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Удаление push-токена (при выходе или отписке)
router.delete('/push-token', auth, async (req, res) => {
    try {
        const { token } = req.body;
        if (token) {
            // Удаляем конкретный токен только если он принадлежит текущему пользователю
            await pool.query(
                'DELETE FROM push_tokens WHERE token = $1 AND user_id = $2',
                [token, req.userId]
            );
        } else {
            // Удаляем все токены пользователя
            await pool.query('DELETE FROM push_tokens WHERE user_id = $1', [req.userId]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting push token:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;