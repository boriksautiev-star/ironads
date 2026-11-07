const cron = require('node-cron');
const pool = require('../db/pool');

// Запуск каждые 3 часа
cron.schedule('0 */3 * * *', async () => {
    console.log('🔄 Запуск автоподнятия...');
    try {
        // Находим все объявления, у которых есть активный пакет автопилота
        const listings = await pool.query(
            `SELECT l.id
             FROM listings l
             JOIN subscription_listings sl ON l.id = sl.listing_id
             JOIN user_subscriptions s ON sl.subscription_id = s.id
             WHERE s.package_type = 'autobump'
               AND s.is_active = true
               AND s.end_date > NOW()
               AND l.deleted_at IS NULL`
        );
        if (listings.rows.length === 0) {
            console.log('ℹ️ Нет объявлений для автоподнятия');
            return;
        }

        for (const row of listings.rows) {
            await pool.query('UPDATE listings SET updated_at = NOW() WHERE id = $1', [row.id]);
            console.log(`🤖 Автоподнятие для объявления #${row.id}`);
        }
        console.log(`✅ Автоподнятие выполнено для ${listings.rows.length} объявлений`);
    } catch (error) {
        console.error('❌ Ошибка автоподнятия:', error);
    }
});