require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function dumpHierarchy() {
    try {
        console.log('Загрузка данных из БД...');
        const res = await pool.query('SELECT id, name, parent_id, level FROM categories ORDER BY level, sort_order');
        const cats = res.rows;

        const groups = cats.filter(c => c.level === 1);
        const subgroups = cats.filter(c => c.level === 2);
        const categories = cats.filter(c => c.level === 3);

        // Формируем плоский список для Excel
        // Формат: Группа | Подгруппа | Категория (если есть)
        const rows = [];
        
        for (const group of groups) {
            const mySubs = subgroups.filter(s => s.parent_id === group.id);
            if (mySubs.length === 0) {
                rows.push([group.name, '', '']);
            } else {
                for (const sub of mySubs) {
                    const myCats = categories.filter(c => c.parent_id === sub.id);
                    if (myCats.length === 0) {
                        rows.push([group.name, sub.name, '']);
                    } else {
                        for (const cat of myCats) {
                            rows.push([group.name, sub.name, cat.name]);
                        }
                    }
                }
            }
        }

        // Сохраняем в CSV (через точку с запятой, с BOM для Excel)
        let csvContent = '\ufeffГруппа;Подгруппа;Категория\n';
        for (const r of rows) {
            csvContent += `"${r[0]}";"${r[1]}";"${r[2]}"\n`;
        }

        const filePath = path.join(__dirname, 'categories_hierarchy.csv');
        fs.writeFileSync(filePath, csvContent, 'utf8');

        console.log(`✅ Успешно выгружено ${rows.length} строк иерархии.`);
        console.log(`📁 Файл сохранен: C:\\IronMarket\\server\\categories_hierarchy.csv`);
        console.log(`\nОткройте этот файл в Excel (или Блокноте) и скопируйте данные на ваш лист "Справочники".`);

    } catch (e) {
        console.error('Ошибка:', e.message);
    } finally {
        pool.end();
    }
}

dumpHierarchy();