const express = require('express');
const pool = require('../db/pool');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pushService = require('../services/pushService');
const router = express.Router();

// Настройка multer для медиафайлов
const mediaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../public/chat_media');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});
const mediaUpload = multer({ 
    storage: mediaStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'audio/webm', 'audio/mp3', 'audio/mpeg'];
        allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Неподдерживаемый формат'));
    }
});

// Вспомогательная функция: получить ID пользователя поддержки
async function getSupportUserId() {
    let supportUser = await pool.query(`SELECT id FROM users WHERE username = 'support' LIMIT 1`);
    if (supportUser.rows.length > 0) return supportUser.rows[0].id;
    const bcrypt = require('bcryptjs');
    const randomPass = Math.random().toString(36).slice(-12);
    const hashedPass = await bcrypt.hash(randomPass, 10);
    const fakePhone = '0000000000';
    const newSupport = await pool.query(
        `INSERT INTO users (username, password_hash, role, phone, created_at)
         VALUES ('support', $1, 'admin', $2, NOW()) RETURNING id`,
        [hashedPass, fakePhone]
    );
    return newSupport.rows[0].id;
}

// Получить все активные чаты пользователя
router.get('/', auth, async (req, res) => {
    const userId = req.userId;
    try {
        const userRoleRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        const role = userRoleRes.rows[0]?.role;
        const isStaff = (role === 'admin' || role === 'moderator');
        let query = `
            SELECT c.*, 
                   l.title as listing_title,
                   u_seller.username as seller_name,
                   u_buyer.username as buyer_name,
                   (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.sender_id != $1 AND m.is_read = false) as unread_count,
                   (EXTRACT(EPOCH FROM NOW() - 
                       CASE WHEN c.seller_id = $1 THEN u_buyer.last_seen ELSE u_seller.last_seen END) < 300) as other_is_online
            FROM chats c
            LEFT JOIN listings l ON c.listing_id = l.id
            JOIN users u_seller ON c.seller_id = u_seller.id AND u_seller.deleted_at IS NULL
            JOIN users u_buyer ON c.buyer_id = u_buyer.id AND u_buyer.deleted_at IS NULL
            WHERE (c.buyer_id = $1 AND c.status_buyer = 'active') 
               OR (c.seller_id = $1 AND c.status_seller = 'active')
        `;
        if (!isStaff) {
            query += ` AND c.listing_id IS NOT NULL`;
        }
        query += ` ORDER BY c.updated_at DESC`;
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить архивные чаты
router.get('/archived', auth, async (req, res) => {
    const userId = req.userId;
    try {
        const userRoleRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        const role = userRoleRes.rows[0]?.role;
        const isStaff = (role === 'admin' || role === 'moderator');
        let query = `
            SELECT c.*, 
                   l.title as listing_title,
                   u_seller.username as seller_name,
                   u_buyer.username as buyer_name,
                   (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.sender_id != $1 AND m.is_read = false) as unread_count,
                   (EXTRACT(EPOCH FROM NOW() - 
                       CASE WHEN c.seller_id = $1 THEN u_buyer.last_seen ELSE u_seller.last_seen END) < 300) as other_is_online
            FROM chats c
            LEFT JOIN listings l ON c.listing_id = l.id
            JOIN users u_seller ON c.seller_id = u_seller.id AND u_seller.deleted_at IS NULL
            JOIN users u_buyer ON c.buyer_id = u_buyer.id AND u_buyer.deleted_at IS NULL
            WHERE (c.buyer_id = $1 AND c.status_buyer = 'archived') 
               OR (c.seller_id = $1 AND c.status_seller = 'archived')
        `;
        if (!isStaff) {
            query += ` AND c.listing_id IS NOT NULL`;
        }
        query += ` ORDER BY c.updated_at DESC`;
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить информацию о чате
router.get('/:chatId', auth, async (req, res) => {
    const userId = req.userId;
    const chatId = req.params.chatId;
    try {
        const userRoleRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        const role = userRoleRes.rows[0]?.role;
        const isStaff = (role === 'admin' || role === 'moderator');
        
        let query = `
            SELECT c.*, 
                   l.id as listing_id,
                   l.title as listing_title,
                   l.price as listing_price,
                   u_seller.id as seller_id,
                   u_seller.username as seller_name,
                   (EXTRACT(EPOCH FROM NOW() - u_seller.last_seen) < 300) as seller_is_online,
                   u_buyer.id as buyer_id,
                   u_buyer.username as buyer_name,
                   (EXTRACT(EPOCH FROM NOW() - u_buyer.last_seen) < 300) as buyer_is_online
            FROM chats c
            LEFT JOIN listings l ON c.listing_id = l.id
            JOIN users u_seller ON c.seller_id = u_seller.id AND u_seller.deleted_at IS NULL
            JOIN users u_buyer ON c.buyer_id = u_buyer.id AND u_buyer.deleted_at IS NULL
            WHERE c.id = $1
        `;
        const params = [chatId];
        if (!isStaff) {
            query += ` AND (c.buyer_id = $2 OR c.seller_id = $2)`;
            params.push(userId);
        }
        const result = await pool.query(query, params);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить сообщения чата
router.get('/:chatId/messages', auth, async (req, res) => {
    const userId = req.userId;
    const chatId = req.params.chatId;
    try {
        const userRoleRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        const role = userRoleRes.rows[0]?.role;
        const isStaff = (role === 'admin' || role === 'moderator');
        
        let chatQuery = 'SELECT * FROM chats WHERE id = $1';
        const chatParams = [chatId];
        if (!isStaff) {
            chatQuery += ' AND (buyer_id = $2 OR seller_id = $2)';
            chatParams.push(userId);
        }
        const chat = await pool.query(chatQuery, chatParams);
        if (chat.rows.length === 0) return res.status(403).json({ error: 'Нет доступа к этому чату' });
        
        await pool.query('UPDATE messages SET is_read = true, status = \'read\' WHERE chat_id = $1 AND sender_id != $2 AND is_read = false', [chatId, userId]);
        const messages = await pool.query(`
            SELECT m.*, u.username as sender_name,
                   json_build_object('id', m2.id, 'message', m2.message, 'sender_name', u2.username) as reply_to
            FROM messages m
            JOIN users u ON m.sender_id = u.id AND u.deleted_at IS NULL
            LEFT JOIN messages m2 ON m.reply_to_id = m2.id
            LEFT JOIN users u2 ON m2.sender_id = u2.id
            WHERE m.chat_id = $1
            ORDER BY m.created_at ASC
        `, [chatId]);
        res.json(messages.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Архивация, восстановление, удаление
router.post('/:chatId/archive', auth, async (req, res) => {
    const userId = req.userId;
    const chatId = req.params.chatId;
    try {
        const chat = await pool.query('SELECT buyer_id, seller_id FROM chats WHERE id = $1', [chatId]);
        if (chat.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
        if (chat.rows[0].buyer_id === userId) {
            await pool.query('UPDATE chats SET status_buyer = $1 WHERE id = $2', ['archived', chatId]);
        } else if (chat.rows[0].seller_id === userId) {
            await pool.query('UPDATE chats SET status_seller = $1 WHERE id = $2', ['archived', chatId]);
        } else return res.status(403).json({ error: 'Нет доступа к чату' });
        const otherUserId = chat.rows[0].buyer_id === userId ? chat.rows[0].seller_id : chat.rows[0].buyer_id;
        res.json({ message: 'Чат архивирован', showRating: true, otherUserId, chatId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/:chatId/restore', auth, async (req, res) => {
    const userId = req.userId;
    const chatId = req.params.chatId;
    try {
        const chat = await pool.query('SELECT buyer_id, seller_id FROM chats WHERE id = $1', [chatId]);
        if (chat.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
        if (chat.rows[0].buyer_id === userId) {
            await pool.query('UPDATE chats SET status_buyer = $1 WHERE id = $2', ['active', chatId]);
        } else if (chat.rows[0].seller_id === userId) {
            await pool.query('UPDATE chats SET status_seller = $1 WHERE id = $2', ['active', chatId]);
        } else return res.status(403).json({ error: 'Нет доступа' });
        res.json({ message: 'Чат восстановлен' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.delete('/:chatId', auth, async (req, res) => {
    const userId = req.userId;
    const chatId = req.params.chatId;
    try {
        const chat = await pool.query('SELECT buyer_id, seller_id FROM chats WHERE id = $1', [chatId]);
        if (chat.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
        if (chat.rows[0].buyer_id === userId) {
            await pool.query('UPDATE chats SET status_buyer = $1 WHERE id = $2', ['deleted', chatId]);
        } else if (chat.rows[0].seller_id === userId) {
            await pool.query('UPDATE chats SET status_seller = $1 WHERE id = $2', ['deleted', chatId]);
        } else return res.status(403).json({ error: 'Нет доступа' });
        res.json({ message: 'Чат удалён' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== СОЗДАНИЕ ЧАТА (С ПОДРОБНЫМИ ЛОГАМИ) ==========
router.post('/create', auth, async (req, res) => {
    const { listing_id } = req.body;
    const buyerId = req.userId;
    console.log(`🔍 Создание чата: listing_id=${listing_id}, buyerId=${buyerId}`);
    try {
        if (!listing_id) {
            console.log('❌ listing_id не указан');
            return res.status(400).json({ error: 'Не указано объявление' });
        }
        const listing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [listing_id]);
        if (listing.rows.length === 0) {
            console.log(`❌ Объявление ${listing_id} не найдено`);
            return res.status(404).json({ error: 'Объявление не найдено' });
        }
        const sellerId = listing.rows[0].user_id;
        console.log(`👤 Продавец: ${sellerId}`);
        if (buyerId === sellerId) {
            console.log('❌ Попытка создать чат с самим собой');
            return res.status(400).json({ error: 'Нельзя начать чат с самим собой' });
        }

        // Проверяем существующий чат (любой статус)
        let chat = await pool.query(
            'SELECT * FROM chats WHERE listing_id = $1 AND buyer_id = $2 AND seller_id = $3',
            [listing_id, buyerId, sellerId]
        );
        console.log(`🔎 Найдено чатов: ${chat.rows.length}`);
        if (chat.rows.length === 0) {
            console.log('🆕 Создаём новый чат');
            const newChat = await pool.query(`
                INSERT INTO chats (listing_id, buyer_id, seller_id, created_at, updated_at, status_buyer, status_seller)
                VALUES ($1, $2, $3, NOW(), NOW(), 'active', 'active')
                RETURNING *
            `, [listing_id, buyerId, sellerId]);
            chat = newChat;
            console.log(`✅ Новый чат создан с ID ${chat.rows[0].id}`);
        } else {
            console.log(`♻️ Обновляем существующий чат ID ${chat.rows[0].id}`);
            await pool.query(`
                UPDATE chats 
                SET status_buyer = 'active', status_seller = 'active', updated_at = NOW() 
                WHERE id = $1
            `, [chat.rows[0].id]);
            // Перезапрашиваем данные, чтобы вернуть обновлённый объект
            const updated = await pool.query('SELECT * FROM chats WHERE id = $1', [chat.rows[0].id]);
            chat = updated;
            console.log(`✅ Чат обновлён, возвращаем ID ${chat.rows[0].id}`);
        }
        res.json(chat.rows[0]);
    } catch (err) {
        console.error('❌ Ошибка создания чата:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Создать чат с поддержкой
router.post('/support/create', auth, async (req, res) => {
    const userId = req.userId;
    try {
        const supportId = await getSupportUserId();
        const existingChat = await pool.query(`
            SELECT id FROM chats 
            WHERE ((buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1))
            AND (status_buyer != 'deleted' OR status_seller != 'deleted')
            LIMIT 1
        `, [userId, supportId]);
        if (existingChat.rows.length > 0) {
            return res.json({ chatId: existingChat.rows[0].id });
        }
        const newChat = await pool.query(`
            INSERT INTO chats (listing_id, buyer_id, seller_id, created_at, updated_at, status_buyer, status_seller)
            VALUES (NULL, $1, $2, NOW(), NOW(), 'active', 'active')
            RETURNING id
        `, [userId, supportId]);
        res.json({ chatId: newChat.rows[0].id });
    } catch (err) {
        console.error('Ошибка создания чата поддержки:', err);
        res.status(500).json({ error: 'Не удалось создать чат с поддержкой' });
    }
});

// ========== ОСНОВНОЙ МАРШРУТ ОТПРАВКИ СООБЩЕНИЯ ==========
router.post('/:chatId/messages', auth, async (req, res) => {
    const userId = req.userId;
    const chatId = req.params.chatId;
    const { message, replyToId } = req.body;
    if (!message || message.trim() === '') return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    try {
        const userRoleRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        const role = userRoleRes.rows[0]?.role;
        const isStaff = (role === 'admin' || role === 'moderator');
        
        let chat;
        if (isStaff) {
            const chatRes = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
            if (chatRes.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
            chat = chatRes.rows[0];
        } else {
            const chatRes = await pool.query('SELECT * FROM chats WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [chatId, userId]);
            if (chatRes.rows.length === 0) return res.status(403).json({ error: 'Нет доступа к этому чату' });
            chat = chatRes.rows[0];
        }
        
        await pool.query(`UPDATE chats SET status_buyer = 'active', status_seller = 'active', updated_at = NOW() WHERE id = $1`, [chatId]);
        const result = await pool.query(`
            INSERT INTO messages (chat_id, sender_id, message, reply_to_id, created_at, status, is_read)
            VALUES ($1, $2, $3, $4, NOW(), 'sent', false) RETURNING *
        `, [chatId, userId, message, replyToId || null]);
        const messageId = result.rows[0].id;
        const messageText = result.rows[0].message;

        // Отправка push
        const recipientId = (chat.buyer_id === userId) ? chat.seller_id : chat.buyer_id;
        console.log(`🔔 Определён получатель: ${recipientId}, отправитель: ${userId}`);
        if (recipientId) {
            const senderRes = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
            const senderName = senderRes.rows[0]?.username || 'Пользователь';
            console.log(`📨 Отправка push для user ${recipientId} от ${senderName}`);
            try {
                await pushService.sendToUser(recipientId, {
                    title: `Новое сообщение от ${senderName}`,
                    body: messageText.length > 100 ? messageText.slice(0, 100) + '…' : messageText,
                    data: {
                        chatId: chatId,
                        messageId: messageId,
                        senderId: userId,
                    },
                });
                console.log(`✅ Push успешно отправлен (функция завершена)`);
            } catch (err) {
                console.error(`❌ Ошибка при вызове pushService.sendToUser:`, err);
            }
        } else {
            console.log(`⚠️ Получатель не определён (отправитель = получатель?)`);
        }

        const messageWithSender = await pool.query(`
            SELECT m.*, u.username as sender_name,
                   json_build_object('id', m2.id, 'message', m2.message, 'sender_name', u2.username) as reply_to
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            LEFT JOIN messages m2 ON m.reply_to_id = m2.id
            LEFT JOIN users u2 ON m2.sender_id = u2.id
            WHERE m.id = $1
        `, [messageId]);
        res.json(messageWithSender.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Отправить медиафайл
router.post('/:chatId/media', auth, mediaUpload.single('file'), async (req, res) => {
    const userId = req.userId;
    const chatId = req.params.chatId;
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    try {
        const userRoleRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        const role = userRoleRes.rows[0]?.role;
        const isStaff = (role === 'admin' || role === 'moderator');
        
        if (!isStaff) {
            const chatRes = await pool.query('SELECT * FROM chats WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [chatId, userId]);
            if (chatRes.rows.length === 0) return res.status(403).json({ error: 'Нет доступа к чату' });
        } else {
            const chatRes = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
            if (chatRes.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
        }
        
        const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'audio';
        const filePath = `/chat_media/${req.file.filename}`;
        const result = await pool.query(`
            INSERT INTO messages (chat_id, sender_id, message, file_path, file_type, created_at, status, is_read)
            VALUES ($1, $2, $3, $4, $5, NOW(), 'sent', false) RETURNING *
        `, [chatId, userId, '', filePath, fileType]);
        await pool.query(`UPDATE chats SET updated_at = NOW() WHERE id = $1`, [chatId]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Редактировать сообщение
router.put('/messages/:messageId', auth, async (req, res) => {
    const userId = req.userId;
    const messageId = req.params.messageId;
    const { message } = req.body;
    if (!message || message.trim() === '') return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    try {
        const msgResult = await pool.query(`
            SELECT m.*, c.buyer_id, c.seller_id 
            FROM messages m JOIN chats c ON m.chat_id = c.id
            WHERE m.id = $1
        `, [messageId]);
        if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
        const msg = msgResult.rows[0];
        if (msg.sender_id !== userId) return res.status(403).json({ error: 'Нельзя редактировать чужие сообщения' });
        const diffMinutes = (new Date() - new Date(msg.created_at)) / (1000 * 60);
        if (diffMinutes > 15) return res.status(403).json({ error: 'Редактирование возможно только в течение 15 минут' });
        await pool.query(`UPDATE messages SET message = $1, edited = TRUE, edited_at = NOW() WHERE id = $2`, [message, messageId]);
        const updated = await pool.query(`
            SELECT m.*, u.username as sender_name
            FROM messages m JOIN users u ON m.sender_id = u.id
            WHERE m.id = $1
        `, [messageId]);
        res.json(updated.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновить статус сообщения
router.put('/messages/:messageId/status', auth, async (req, res) => {
    const userId = req.userId;
    const messageId = req.params.messageId;
    const { status } = req.body;
    try {
        const message = await pool.query(`
            SELECT m.*, c.buyer_id, c.seller_id
            FROM messages m JOIN chats c ON m.chat_id = c.id
            WHERE m.id = $1
        `, [messageId]);
        if (message.rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
        if (message.rows[0].sender_id === userId) return res.status(403).json({ error: 'Нельзя обновить статус своего сообщения' });
        await pool.query('UPDATE messages SET status = $1 WHERE id = $2', [status, messageId]);
        res.json({ message: 'Статус обновлён' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Экспорт чата
router.get('/:chatId/export', auth, async (req, res) => {
    const userId = req.userId;
    const chatId = req.params.chatId;
    try {
        const chat = await pool.query('SELECT * FROM chats WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [chatId, userId]);
        if (chat.rows.length === 0) return res.status(403).json({ error: 'Нет доступа' });
        const messages = await pool.query(`
            SELECT m.*, u.username as sender_name
            FROM messages m JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = $1 ORDER BY m.created_at ASC
        `, [chatId]);
        const listing = await pool.query('SELECT title FROM listings WHERE id = $1', [chat.rows[0].listing_id]);
        const exportData = {
            chatId, listing_title: listing.rows[0]?.title || 'Чат поддержки', created_at: chat.rows[0].created_at,
            messages: messages.rows.map(msg => ({ from: msg.sender_name, date: msg.created_at, message: msg.message, file_path: msg.file_path, file_type: msg.file_type, edited: msg.edited }))
        };
        res.json(exportData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Количество непрочитанных
router.get('/unread/count', auth, async (req, res) => {
    const userId = req.userId;
    try {
        const userRoleRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        const role = userRoleRes.rows[0]?.role;
        const isStaff = (role === 'admin' || role === 'moderator');
        let query = `
            SELECT COUNT(*) as count
            FROM messages m JOIN chats c ON m.chat_id = c.id
            WHERE ((c.buyer_id = $1 AND c.status_buyer = 'active') OR (c.seller_id = $1 AND c.status_seller = 'active'))
            AND m.sender_id != $1 AND m.is_read = false
        `;
        if (!isStaff) {
            query += ` AND c.listing_id IS NOT NULL`;
        }
        const result = await pool.query(query, [userId]);
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Отметить прочитанные
router.post('/:chatId/read', auth, async (req, res) => {
    const userId = req.userId;
    const chatId = req.params.chatId;
    try {
        const chat = await pool.query(
            'SELECT id FROM chats WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)',
            [chatId, userId]
        );
        if (chat.rows.length === 0) {
            return res.status(403).json({ error: 'Нет доступа к этому чату' });
        }
        await pool.query(
            'UPDATE messages SET is_read = true WHERE chat_id = $1 AND sender_id != $2 AND is_read = false',
            [chatId, userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка отметки прочитанных:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить другого участника чата для оценки
router.get('/:chatId/other-user', auth, async (req, res) => {
    const userId = req.userId;
    const chatId = req.params.chatId;
    try {
        const chat = await pool.query('SELECT buyer_id, seller_id FROM chats WHERE id = $1', [chatId]);
        if (chat.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
        if (chat.rows[0].buyer_id !== userId && chat.rows[0].seller_id !== userId) return res.status(403).json({ error: 'Нет доступа' });
        const otherId = chat.rows[0].buyer_id === userId ? chat.rows[0].seller_id : chat.rows[0].buyer_id;
        const userInfo = await pool.query('SELECT id, username, avatar_url FROM users WHERE id = $1 AND deleted_at IS NULL', [otherId]);
        if (userInfo.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
        res.json({ userId: otherId, username: userInfo.rows[0].username, avatar_url: userInfo.rows[0].avatar_url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;