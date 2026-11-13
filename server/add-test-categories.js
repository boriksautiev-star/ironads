require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function addTestCategories() {
    try {
        // Добавляем категории 3-го уровня для "Легковые автомобили" (parent_id = 29)
        const newCats = [
            { name: 'Седаны', slug: 'sedans', parent_id: 29, level: 3, sort_order: 1 },
            { name: 'Хэтчбеки', slug: 'hatchbacks', parent_id: 29, level: 3, sort_order: 2 },
            { name: 'Внедорожники', slug: 'suvs', parent_id: 29, level: 3, sort_order: 3 },
            { name: 'Универсалы', slug: 'station-wagons', parent_id: 29, level: 3, sort_order: 4 }
        ];

        for (const cat of newCats) {
            // Проверяем, нет ли уже такой категории, чтобы не дублировать
            const check = await pool.query('SELECT id FROM categories WHERE name = $1 AND parent_id = $2', [cat.name, cat.parent_id]);
            if (check.rows.length === 0) {
                // Добавляем slug и дефолтные значения для остальных возможных NOT NULL полей
                await pool.query(
                    `INSERT INTO categories (name, slug, parent_id, level, sort_order, is_active, icon, description, seo_title, seo_description) 
                     VALUES ($1, $2, $3, $4, $5, true, '', '', '', '')`,
                    [cat.name, cat.slug, cat.parent_id, cat.level, cat.sort_order]
                );
                console.log(`✅ Добавлена категория: ${cat.name} (slug: ${cat.slug})`);
            } else {
                console.log(`ℹ️ Категория уже существует: ${cat.name}`);
            }
        }
        console.log('\nГотово! Теперь запустите скрипт generate-partner-template.js заново.');
    } catch (e) {
        console.error('Ошибка:', e.message);
    } finally {
        pool.end();
    }
}

addTestCategories();