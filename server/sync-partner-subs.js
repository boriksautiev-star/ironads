require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function syncPartnerSubscriptions() {
    try {
        console.log('🔄 Поиск партнеров для синхронизации подписок...');
        
        // 1. Находим всех партнеров с назначенным тарифом
        const usersRes = await pool.query(`
            SELECT u.id, u.username, u.partner_plan_id, p.name as plan_name, p.max_listings, p.period_days 
            FROM users u
            JOIN partner_plans p ON u.partner_plan_id = p.id
            WHERE u.is_partner = true AND u.partner_plan_id IS NOT NULL
        `);

        if (usersRes.rows.length === 0) {
            console.log('ℹ️ Партнеры с тарифами не найдены.');
            return;
        }

        for (const user of usersRes.rows) {
            console.log(`\n👤 Обработка пользователя: ${user.username} (ID: ${user.id}) | Тариф: ${user.plan_name}`);

            // 2. Проверяем, есть ли уже активная подписка на этот тариф
            const subCheck = await pool.query(`
                SELECT id FROM user_subscriptions 
                WHERE user_id = $1 AND plan_id = $2 AND is_active = true
            `, [user.id, user.partner_plan_id]);

            if (subCheck.rows.length > 0) {
                console.log(`   ✅ Активная подписка на этот тариф уже существует (ID: ${subCheck.rows[0].id}). Пропускаем.`);
                continue;
            }

            // 3. Если нет — деактивируем старые подписки 'listing' этого пользователя
            await pool.query(`
                UPDATE user_subscriptions 
                SET is_active = false 
                WHERE user_id = $1 AND package_type = 'listing'
            `, [user.id]);

            // 4. Создаем новую реальную подписку
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + (user.period_days || 30));

            const insertRes = await pool.query(`
                INSERT INTO user_subscriptions 
                (user_id, package_type, listings_count, start_date, end_date, is_active, max_slots, plan_id) 
                VALUES ($1, 'listing', 0, $2, $3, true, $4, $5)
                RETURNING id
            `, [user.id, startDate, endDate, user.max_listings, user.partner_plan_id]);

            console.log(`   🎉 Создана новая подписка (ID: ${insertRes.rows[0].id}) на ${user.max_listings} слотов.`);
        }

        console.log('\n✅ Синхронизация завершена!');
    } catch (err) {
        console.error('❌ Ошибка:', err.message);
    } finally {
        pool.end();
    }
}

syncPartnerSubscriptions();