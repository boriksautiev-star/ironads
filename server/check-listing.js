require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function checkListing() {
    try {
        // Ищем объявление по названию, которое вы загрузили
        const res = await pool.query(`
            SELECT l.id, l.title, l.city_id, l.address, c.name as city_name, r.name as region_name 
            FROM listings l
            LEFT JOIN cities c ON l.city_id = c.id
            LEFT JOIN regions r ON c.region_id = r.id
            WHERE l.title ILIKE '%ТЕСОВОЕ Квартира 4%' OR l.title ILIKE '%ТЕСТОВОЕ Квартира 4%'
        `);
        
        if (res.rows.length === 0) {
            console.log('❌ Объявление не найдено в БД. Проверьте название.');
        } else {
            console.table(res.rows);
        }

        // Также проверим, какие есть города со словом "Москва" в базе
        console.log('\n=== Города в БД со словом "Москва" ===');
        const cities = await pool.query(`SELECT id, name, region_id FROM cities WHERE name ILIKE '%Москва%'`);
        console.table(cities.rows);

    } catch (err) {
        console.error('Ошибка:', err.message);
    } finally {
        pool.end();
    }
}
checkListing();