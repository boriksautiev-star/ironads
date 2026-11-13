require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function migratePartners() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('🚀 Начинаем миграцию партнерских подписок...');

        // 1. Получаем всех партнеров с их тарифами
        const usersRes = await client.query(`
            SELECT u.id, u.username, u.partner_plan_id, p.name as plan_name, p.max_listings, p.period_days 
            FROM users u
            JOIN partner_plans p ON u.partner_plan_id = p.id
            WHERE u.is_partner = true
        `);

        for (const user of usersRes.rows) {
            console.log(`\n👤 Обработка: ${user.username} (ID: ${user.id}) | Тариф: ${user.plan_name} (${user.max_listings} слотов)`);

            // 2. Находим ВСЕ подписки этого пользователя (и активные, и старые)
            const subsRes = await client.query(`
                SELECT id, is_active, max_slots, plan_id FROM user_subscriptions 
                WHERE user_id = $1 AND package_type = 'listing'
            `, [user.id]);

            let activeSub = subsRes.rows.find(s => s.is_active === true);
            let subIdToUse;

            if (activeSub) {
                // Если есть активная, но лимиты не совпадают — обновляем её
                if (activeSub.max_slots !== user.max_listings || activeSub.plan_id !== user.partner_plan_id) {
                    console.log(`   🔄 Обновляем лимиты активной подписки ID ${activeSub.id} (было ${activeSub.max_slots}, стало ${user.max_listings})`);
                    await client.query(`
                        UPDATE user_subscriptions 
                        SET max_slots = $1, plan_id = $2 
                        WHERE id = $3
                    `, [user.max_listings, user.partner_plan_id, activeSub.id]);
                } else {
                    console.log(`   ✅ Активная подписка ID ${activeSub.id} уже настроена верно.`);
                }
                subIdToUse = activeSub.id;
            } else {
                // Если активной нет, создаем новую
                const startDate = new Date();
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + (user.period_days || 30));

                const insertRes = await client.query(`
                    INSERT INTO user_subscriptions 
                    (user_id, package_type, listings_count, start_date, end_date, is_active, max_slots, plan_id) 
                    VALUES ($1, 'listing', 0, $2, $3, true, $4, $5)
                    RETURNING id
                `, [user.id, startDate, endDate, user.max_listings, user.partner_plan_id]);
                
                subIdToUse = insertRes.rows[0].id;
                console.log(`   🎉 Создана новая активная подписка ID ${subIdToUse}`);
            }

            // 3. Собираем все ID объявлений из старых подписок (включая неактивные)
            const oldSubIds = subsRes.rows.map(s => s.id).filter(id => id !== subIdToUse);
            if (oldSubIds.length > 0) {
                const listingsRes = await client.query(`
                    SELECT listing_id FROM subscription_listings 
                    WHERE subscription_id = ANY($1::int[])
                `, [oldSubIds]);

                if (listingsRes.rows.length > 0) {
                    console.log(`   📦 Найдено ${listingsRes.rows.length} объявлений в старых подписках. Переносим...`);
                    
                    // Переносим их в новую активную подписку
                    for (const row of listingsRes.rows) {
                        // Проверяем, нет ли уже такой связи в новой подписке (чтобы не было дублей)
                        const checkDup = await client.query(`
                            SELECT 1 FROM subscription_listings 
                            WHERE subscription_id = $1 AND listing_id = $2
                        `, [subIdToUse, row.listing_id]);
                        
                        if (checkDup.rows.length === 0) {
                            await client.query(`
                                INSERT INTO subscription_listings (subscription_id, listing_id) 
                                VALUES ($1, $2)
                            `, [subIdToUse, row.listing_id]);
                        }
                    }
                    
                    // Удаляем старые связи
                    await client.query(`
                        DELETE FROM subscription_listings 
                        WHERE subscription_id = ANY($1::int[])
                    `, [oldSubIds]);
                    console.log(`   ✅ Объявления успешно перенесены в подписку ${subIdToUse}`);
                }

                // Деактивируем старые подписки, чтобы не путались в интерфейсе
                await client.query(`
                    UPDATE user_subscriptions 
                    SET is_active = false 
                    WHERE id = ANY($1::int[])
                `, [oldSubIds]);
            }
        }

        await client.query('COMMIT');
        console.log('\n🎉 Миграция успешно завершена! Все объявления на месте.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Ошибка миграции (изменения отменены):', err.message);
    } finally {
        client.release();
        pool.end();
    }
}

migratePartners();