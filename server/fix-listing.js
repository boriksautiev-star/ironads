require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function fixListing() {
    try {
        // Привязываем объявление 515 к городу Москва (id: 1)
        const res = await pool.query(`UPDATE listings SET city_id = 1 WHERE id = 515 RETURNING id, title, city_id`);
        console.log('✅ Объявление обновлено:', res.rows[0]);
    } catch (err) {
        console.error('Ошибка:', err.message);
    } finally {
        pool.end();
    }
}
fixListing();