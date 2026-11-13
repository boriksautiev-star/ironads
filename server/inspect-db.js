require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function inspectDB() {
    try {
        // 1. Получаем список всех таблиц
        const tablesRes = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        const allTables = tablesRes.rows.map(r => r.table_name);
        console.log('📦 Все таблицы в БД:', allTables.join(', '));

        // 2. Ищем таблицы, связанные с тарифами
        const planTables = allTables.filter(t => t.includes('plan') || t.includes('tariff') || t.includes('subscription'));
        console.log('\n🔍 Найдены таблицы с тарифами/подписками:', planTables);

        // 3. Выводим данные из каждой найденной таблицы
        for (const table of planTables) {
            console.log(`\n=== Данные из таблицы: ${table} ===`);
            try {
                const res = await pool.query(`SELECT * FROM ${table} LIMIT 20`);
                if (res.rows.length === 0) {
                    console.log('Таблица пустая.');
                } else {
                    console.table(res.rows);
                }
            } catch (e) {
                console.log(`Ошибка чтения ${table}:`, e.message);
            }
        }

        // 4. Смотрим структуру таблицы users (какие поля отвечают за партнера)
        console.log('\n=== Структура таблицы users (только поля с partner или plan) ===');
        const userCols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND (column_name LIKE '%partner%' OR column_name LIKE '%plan%' OR column_name LIKE '%tariff%')
        `);
        console.table(userCols.rows);

    } catch (err) {
        console.error('❌ Ошибка:', err.message);
    } finally {
        pool.end();
    }
}

inspectDB();