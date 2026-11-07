const { Expo } = require('expo-server-sdk');
const pool = require('../db/pool');

class PushService {
    constructor() {
        this.expo = new Expo();
    }

    async sendToUser(userId, notification) {
        console.log(`📤 sendToUser вызван для user ${userId} с notification:`, notification);
        const result = await pool.query(
            'SELECT token FROM push_tokens WHERE user_id = $1',
            [userId]
        );
        console.log(`🔍 Найдено ${result.rows.length} токенов для user ${userId}`);
        if (result.rows.length === 0) {
            console.log(`⚠️ Нет токенов для user ${userId}, уведомление не отправлено`);
            return;
        }

        // ----- РАСЧЁТ BADGE (количество непрочитанных) -----
        const unreadResult = await pool.query(
            `SELECT COUNT(*) as count FROM messages m 
             JOIN chats c ON m.chat_id = c.id 
             WHERE (c.buyer_id = $1 OR c.seller_id = $1) 
             AND m.sender_id != $1 AND m.is_read = false`,
            [userId]
        );
        const badge = parseInt(unreadResult.rows[0]?.count) || 0;
        console.log(`🔴 Badge для user ${userId}: ${badge}`);
        // ---------------------------------------------------

        const tokens = result.rows.map(row => row.token);
        const validTokens = tokens.filter(token => Expo.isExpoPushToken(token));
        console.log(`✅ Валидных токенов: ${validTokens.length} из ${tokens.length}`);
        if (validTokens.length === 0) return;

        const messages = validTokens.map(token => ({
            to: token,
            sound: 'default',
            badge: badge,  // <-- добавлено
            ...notification,
        }));

        const chunks = this.expo.chunkPushNotifications(messages);
        const tickets = [];
        for (const chunk of chunks) {
            try {
                console.log(`📦 Отправка чанка с ${chunk.length} уведомлениями...`);
                const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
                console.log(`✅ Чанк отправлен, получено ${ticketChunk.length} билетов`);
            } catch (error) {
                console.error('❌ Ошибка отправки чанка:', error);
            }
        }

        await this._handleTickets(tickets, validTokens);
    }

    async _handleTickets(tickets, tokens) {
        const invalidTokens = [];
        for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            if (ticket?.error) {
                console.warn(`⚠️ Ошибка билета ${i}:`, ticket.error);
                if (ticket.error === 'DeviceNotRegistered' || ticket.error === 'InvalidToken') {
                    invalidTokens.push(tokens[i]);
                }
            }
        }
        if (invalidTokens.length > 0) {
            await pool.query(
                'DELETE FROM push_tokens WHERE token = ANY($1)',
                [invalidTokens]
            );
            console.log(`🗑️ Удалено ${invalidTokens.length} невалидных токенов`);
        }
    }
}

module.exports = new PushService();