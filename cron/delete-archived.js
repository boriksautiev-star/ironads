const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ironads',
    password: process.env.DB_PASSWORD || 'ваш_пароль',
    port: 5432,
});

async function deleteOldArchived() {
    console.log(`[${new Date().toISOString()}] 🗑️ Удаление архивных объявлений старше 14 дней...`);
    try {
        const result = await pool.query(
            `DELETE FROM listings
             WHERE status = 'archived'
               AND archived_at < NOW() - INTERVAL '14 days'`
        );
        if (result.rowCount > 0) {
            console.log(`✅ Удалено ${result.rowCount} архивных объявлений`);
        } else {
            console.log('ℹ️ Нет объявлений для удаления');
        }
    } catch (err) {
        console.error('❌ Ошибка удаления архивных:', err.message);
    }
}

module.exports = deleteOldArchived;

if (require.main === module) {
    deleteOldArchived().then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}