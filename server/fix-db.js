require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function fixDB() {
    try {
        console.log('Исправляем данные для пользователя Борик (ID 24)...');
        // 1. Убеждаемся, что он партнер и у него тариф Бизнес (ID 2, 100 слотов)
        await pool.query('UPDATE users SET is_partner = true, partner_plan_id = 2 WHERE id = 24');
        // 2. Обновляем его активную подписку в базе до 100 слотов
        await pool.query('UPDATE user_subscriptions SET max_slots = 100, plan_id = 2 WHERE user_id = 24 AND is_active = true');
        console.log('✅ База данных обновлена: 100 слотов!');
    } catch(e) { console.error(e); } finally { pool.end(); }
}
fixDB();