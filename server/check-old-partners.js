require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function checkOldPartners() {
    try {
        console.log('🔍 Проверка статуса старых партнеров...');

        // 1. Находим всех, у кого is_partner = true
        const partnersRes = await pool.query(`
            SELECT u.id, u.username, u.partner_plan_id, p.name as plan_name, p.max_listings 
            FROM users u
            LEFT JOIN partner_plans p ON u.partner_plan_id = p.id
            WHERE u.is_partner = true
        `);

        console.log(`\n👥 Всего пользователей со статусом "Партнер": ${partnersRes.rows.length}\n`);

        for (const user of partnersRes.rows) {
            console.log(`--------------------------------------------------`);
            console.log(`👤 Пользователь: ${user.username} (ID: ${user.id})`);
            console.log(`   Текущий тариф в профиле: ${user.plan_name || 'НЕ ВЫБРАН'} (Слотов: ${user.max_listings || 0})`);

            // 2. Смотрим его подписки
            const subsRes = await pool.query(`
                SELECT id, package_type, max_slots, is_active, plan_id,
                       (SELECT COUNT(*) FROM subscription_listings sl WHERE sl.subscription_id = us.id) as listings_count
                FROM user_subscriptions us
                WHERE user_id = $1 AND package_type = 'listing'
                ORDER BY is_active DESC, id DESC
            `, [user.id]);

            if (subsRes.rows.length === 0) {
                console.log('   ⚠️ ВНИМАНИЕ: У партнера нет ни одной подписки в БД!');
            } else {
                console.log(`   📦 Подписки в БД (всего: ${subsRes.rows.length}):`);
                subsRes.rows.forEach(sub => {
                    const status = sub.is_active ? '🟢 АКТИВНА' : '🔴 Неактивна (архив)';
                    console.log(`      - ID: ${sub.id} | Слотов: ${sub.max_slots} | Занято: ${sub.listings_count} | Plan ID: ${sub.plan_id || 'null'} | ${status}`);
                });

                // 3. Проверяем, нет ли объявлений в неактивных подписках
                const inactiveWithListings = subsRes.rows.filter(s => !s.is_active && s.listings_count > 0);
                if (inactiveWithListings.length > 0) {
                    console.log(`   🚨 ВНИМАНИЕ: Есть объявления в неактивных подписках! Их нужно перенести в активную:`);
                    inactiveWithListings.forEach(s => console.log(`      - Старая подписка ID ${s.id} содержит ${s.listings_count} объявлений.`));
                }
            }
        }

        // 4. Отдельно проверяем партнеров без выбранного тарифа
        const noPlanRes = await pool.query(`
            SELECT id, username FROM users WHERE is_partner = true AND partner_plan_id IS NULL
        `);
        if (noPlanRes.rows.length > 0) {
            console.log(`\n⚠️ Найдены партнеры без выбранного тарифа (partner_plan_id = null):`);
            noPlanRes.rows.forEach(u => console.log(`   - ${u.username} (ID: ${u.id})`));
        }

        console.log('\n✅ Проверка завершена.');
    } catch (err) {
        console.error('❌ Ошибка:', err.message);
    } finally {
        pool.end();
    }
}

checkOldPartners();