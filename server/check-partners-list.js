require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function checkAllPartners() {
    try {
        console.log('🔍 Проверка всех пользователей со статусом партнера...\n');
        
        const res = await pool.query(`
            SELECT u.id, u.username, u.email, u.is_partner, p.name as plan_name, p.max_listings 
            FROM users u
            LEFT JOIN partner_plans p ON u.partner_plan_id = p.id
            WHERE u.is_partner = true
            ORDER BY u.id ASC
        `);

        if (res.rows.length === 0) {
            console.log('❌ Пользователей со статусом партнера не найдено.');
            return;
        }

        console.log(`✅ Найдено партнеров: ${res.rows.length}\n`);
        console.table(res.rows.map(r => ({
            ID: r.id,
            'Имя': r.username,
            'Email': r.email || '—',
            'Статус': r.is_partner ? 'Да' : 'Нет',
            'Тариф': r.plan_name || 'Не выбран',
            'Слотов': r.max_listings || 0
        })));

    } catch (err) {
        console.error('❌ Ошибка:', err.message);
    } finally {
        pool.end();
    }
}
checkAllPartners();