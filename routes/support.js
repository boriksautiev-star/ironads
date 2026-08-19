const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const pool = require('../db/pool');

async function initSupportTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS support_tickets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                chat_id INTEGER NULL,
                priority TEXT DEFAULT 'medium',
                status TEXT DEFAULT 'open',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        const checkChatId = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='support_tickets' AND column_name='chat_id'`);
        if (checkChatId.rows.length === 0) await pool.query(`ALTER TABLE support_tickets ADD COLUMN chat_id INTEGER NULL`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS support_messages (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
                sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                is_staff_reply BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        const checkStaffReply = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='support_messages' AND column_name='is_staff_reply'`);
        if (checkStaffReply.rows.length === 0) await pool.query(`ALTER TABLE support_messages ADD COLUMN is_staff_reply BOOLEAN DEFAULT FALSE`);

        console.log('✅ Таблицы поддержки проверены/обновлены');
    } catch (err) { console.error('Ошибка инициализации таблиц поддержки:', err.message); }
}
initSupportTables();

async function isStaff(userId) {
    const res = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    const role = res.rows[0]?.role;
    return role === 'admin' || role === 'moderator';
}

router.get('/tickets', auth, async (req, res) => {
    try {
        const userId = req.userId;
        const staff = await isStaff(userId);
        if (!staff) {
            const result = await pool.query('SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
            return res.json(result.rows);
        }

        const ticketsResult = await pool.query(`
            SELECT t.*, u.username as user_name
            FROM support_tickets t
            JOIN users u ON t.user_id = u.id
            ORDER BY 
                CASE t.status 
                    WHEN 'open' THEN 1 
                    WHEN 'in_progress' THEN 2 
                    ELSE 3 
                END,
                t.created_at DESC
        `);
        const tickets = ticketsResult.rows;

        for (let ticket of tickets) {
            if (ticket.chat_id) {
                const unreadResult = await pool.query(`
                    SELECT COUNT(*) as count
                    FROM messages
                    WHERE chat_id = $1 AND sender_id = $2 AND is_read = false
                `, [ticket.chat_id, ticket.user_id]);
                ticket.unread_messages_count = parseInt(unreadResult.rows[0].count);
            } else {
                ticket.unread_messages_count = 0;
            }
        }

        res.json(tickets);
    } catch (err) {
        console.error('GET /tickets error:', err);
        res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
    }
});

router.post('/tickets', auth, async (req, res) => {
    const userId = req.userId;
    const { subject, message, priority = 'medium' } = req.body;
    if (!subject || !message) return res.status(400).json({ error: 'Тема и сообщение обязательны' });
    try {
        let supportUserId = null;
        const supportUserRes = await pool.query(`SELECT id FROM users WHERE username = 'support' LIMIT 1`);
        if (supportUserRes.rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const randomPass = Math.random().toString(36).slice(-12);
            const hashedPass = await bcrypt.hash(randomPass, 10);
            const fakePhone = '0000000000';
            const newSupport = await pool.query(
                `INSERT INTO users (username, password_hash, role, phone, created_at) 
                 VALUES ('support', $1, 'admin', $2, NOW()) RETURNING id`,
                [hashedPass, fakePhone]
            );
            supportUserId = newSupport.rows[0].id;
        } else {
            supportUserId = supportUserRes.rows[0].id;
        }

        let chatId = null;
        const existingChat = await pool.query(`
            SELECT id FROM chats 
            WHERE ((buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1))
            AND (status_buyer != 'deleted' OR status_seller != 'deleted')
            LIMIT 1
        `, [userId, supportUserId]);
        if (existingChat.rows.length > 0) {
            chatId = existingChat.rows[0].id;
        } else {
            const newChat = await pool.query(`
                INSERT INTO chats (listing_id, buyer_id, seller_id, created_at, updated_at, status_buyer, status_seller)
                VALUES (NULL, $1, $2, NOW(), NOW(), 'active', 'active')
                RETURNING id
            `, [userId, supportUserId]);
            chatId = newChat.rows[0].id;
        }

        const result = await pool.query(
            `INSERT INTO support_tickets (user_id, subject, message, chat_id, priority, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *`,
            [userId, subject, message, chatId, priority]
        );
        await pool.query(
            `INSERT INTO messages (chat_id, sender_id, message, created_at, status, is_read)
             VALUES ($1, $2, $3, NOW(), 'sent', false)`,
            [chatId, userId, `📢 **Обращение #${result.rows[0].id}**\nТема: ${subject}\n\n${message}`]
        );
        res.status(201).json({ ticket: result.rows[0], chatId });
    } catch (err) {
        console.error('POST /tickets error:', err);
        res.status(500).json({ error: 'Ошибка создания обращения: ' + err.message });
    }
});

router.get('/tickets/:id', auth, async (req, res) => {
    const ticketId = parseInt(req.params.id);
    const userId = req.userId;
    if (isNaN(ticketId)) return res.status(400).json({ error: 'Неверный ID обращения' });
    try {
        const ticketRes = await pool.query('SELECT * FROM support_tickets WHERE id = $1', [ticketId]);
        if (ticketRes.rows.length === 0) return res.status(404).json({ error: 'Обращение не найдено' });
        const ticket = ticketRes.rows[0];
        const staff = await isStaff(userId);
        if (!staff && ticket.user_id !== userId) return res.status(403).json({ error: 'Нет доступа' });
        const messagesRes = await pool.query(
            `SELECT m.*, u.username 
             FROM support_messages m
             JOIN users u ON m.sender_id = u.id
             WHERE m.ticket_id = $1
             ORDER BY m.created_at ASC`,
            [ticketId]
        );
        res.json({ ticket, messages: messagesRes.rows });
    } catch (err) {
        console.error('GET /tickets/:id error:', err);
        res.status(500).json({ error: 'Ошибка загрузки обращения: ' + err.message });
    }
});

router.post('/tickets/:id/messages', auth, async (req, res) => {
    const ticketId = parseInt(req.params.id);
    const userId = req.userId;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    try {
        const ticketCheck = await pool.query('SELECT user_id, status, chat_id FROM support_tickets WHERE id = $1', [ticketId]);
        if (ticketCheck.rows.length === 0) return res.status(404).json({ error: 'Обращение не найдено' });
        const ticket = ticketCheck.rows[0];
        const staff = await isStaff(userId);
        if (!staff && ticket.user_id !== userId) return res.status(403).json({ error: 'Нет прав' });
        if (ticket.status === 'closed') return res.status(400).json({ error: 'Обращение закрыто' });

        await pool.query(
            `INSERT INTO support_messages (ticket_id, sender_id, message, is_staff_reply)
             VALUES ($1, $2, $3, $4)`,
            [ticketId, userId, message, staff]
        );

        if (ticket.chat_id) {
            const prefix = staff ? '👩‍💼 Поддержка: ' : '👤 Пользователь: ';
            await pool.query(
                `INSERT INTO messages (chat_id, sender_id, message, created_at, status, is_read)
                 VALUES ($1, $2, $3, NOW(), 'sent', false)`,
                [ticket.chat_id, userId, prefix + message]
            );
            
            // Если отправитель – администратор, помечаем все сообщения от пользователя в этом чате как прочитанные
            if (staff) {
                await pool.query(
                    `UPDATE messages SET is_read = true 
                     WHERE chat_id = $1 AND sender_id = $2 AND is_read = false`,
                    [ticket.chat_id, ticket.user_id]
                );
            }
        }

        if (staff && ticket.status === 'open') {
            await pool.query(`UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [ticketId]);
        } else if (!staff && ticket.status === 'in_progress') {
            await pool.query(`UPDATE support_tickets SET status = 'open', updated_at = NOW() WHERE id = $1`, [ticketId]);
        } else {
            await pool.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);
        }

        res.status(201).json({ success: true });
    } catch (err) {
        console.error('POST /tickets/:id/messages error:', err);
        res.status(500).json({ error: 'Ошибка отправки сообщения: ' + err.message });
    }
});

router.patch('/tickets/:id/status', auth, async (req, res) => {
    const userId = req.userId;
    const staff = await isStaff(userId);
    if (!staff) return res.status(403).json({ error: 'Доступ только для персонала' });
    const { status } = req.body;
    if (!['open', 'in_progress', 'closed'].includes(status)) return res.status(400).json({ error: 'Неверный статус' });
    try {
        await pool.query(`UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('PATCH /tickets/:id/status error:', err);
        res.status(500).json({ error: 'Ошибка обновления статуса' });
    }
});

router.post('/tickets/:id/create-chat', auth, async (req, res) => {
    const userId = req.userId;
    const staff = await isStaff(userId);
    if (!staff) return res.status(403).json({ error: 'Доступ только для персонала' });
    const ticketId = parseInt(req.params.id);
    if (isNaN(ticketId)) return res.status(400).json({ error: 'Неверный ID обращения' });
    try {
        const ticketRes = await pool.query('SELECT user_id, chat_id FROM support_tickets WHERE id = $1', [ticketId]);
        if (ticketRes.rows.length === 0) return res.status(404).json({ error: 'Обращение не найдено' });
        const ticket = ticketRes.rows[0];
        if (ticket.chat_id) return res.json({ chatId: ticket.chat_id, alreadyExists: true });

        const targetUserId = ticket.user_id;
        let supportUser = await pool.query(`SELECT id FROM users WHERE username = 'support' LIMIT 1`);
        let supportId;
        if (supportUser.rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const randomPass = Math.random().toString(36).slice(-12);
            const hashedPass = await bcrypt.hash(randomPass, 10);
            const fakePhone = '0000000000';
            const newSupport = await pool.query(
                `INSERT INTO users (username, password_hash, role, phone, created_at) 
                 VALUES ('support', $1, 'admin', $2, NOW()) RETURNING id`,
                [hashedPass, fakePhone]
            );
            supportId = newSupport.rows[0].id;
        } else {
            supportId = supportUser.rows[0].id;
        }

        const existingChat = await pool.query(`
            SELECT id FROM chats 
            WHERE ((buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1))
            AND (status_buyer != 'deleted' OR status_seller != 'deleted')
            LIMIT 1
        `, [targetUserId, supportId]);
        let chatId;
        if (existingChat.rows.length > 0) {
            chatId = existingChat.rows[0].id;
        } else {
            const newChat = await pool.query(`
                INSERT INTO chats (listing_id, buyer_id, seller_id, created_at, updated_at, status_buyer, status_seller)
                VALUES (NULL, $1, $2, NOW(), NOW(), 'active', 'active')
                RETURNING id
            `, [targetUserId, supportId]);
            chatId = newChat.rows[0].id;
            await pool.query(
                `INSERT INTO messages (chat_id, sender_id, message, created_at, status, is_read)
                 VALUES ($1, $2, $3, NOW(), 'sent', false)`,
                [chatId, supportId, `👋 Чат поддержки создан по обращению #${ticketId}. Вы можете общаться здесь.`]
            );
        }
        await pool.query(`UPDATE support_tickets SET chat_id = $1, updated_at = NOW() WHERE id = $2`, [chatId, ticketId]);
        res.json({ chatId });
    } catch (err) {
        console.error('POST /tickets/:id/create-chat error:', err);
        res.status(500).json({ error: 'Ошибка создания чата: ' + err.message });
    }
});

// ========== БЫСТРОЕ ПОЛУЧЕНИЕ СЧЁТЧИКОВ НЕПРОЧИТАННЫХ ==========
router.get('/unread-counts', auth, async (req, res) => {
    try {
        const userId = req.userId;
        const staff = await isStaff(userId);
        if (!staff) return res.status(403).json({ error: 'Нет прав' });

        // Для каждого тикета считаем количество непрочитанных сообщений от пользователя, создавшего обращение
        const result = await pool.query(`
            SELECT 
                t.id,
                COALESCE(
                    (SELECT COUNT(*) FROM messages m 
                     WHERE m.chat_id = t.chat_id 
                       AND m.sender_id = t.user_id 
                       AND m.is_read = false)
                , 0) as unread_count
            FROM support_tickets t
            WHERE t.chat_id IS NOT NULL
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('GET /unread-counts error:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;