const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 25,
  idleTimeoutMillis: 60000,          // увеличено с 30000
  connectionTimeoutMillis: 20000,     // увеличено с 10000
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  error: (err) => {
    console.error('❌ Неожиданная ошибка пула БД:', err);
  }
});

pool.on('error', (err) => {
  console.error('❌ Ошибка пула БД:', err);
  setTimeout(() => {
    console.log('🔄 Переподключение к БД...');
    pool.connect().catch(e => console.error('Ошибка переподключения:', e));
  }, 5000);
});

module.exports = pool;