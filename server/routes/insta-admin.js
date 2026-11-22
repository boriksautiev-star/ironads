/**
 * Маршруты админ-панели для Instagram-агента.
 * Подключение в app.js: app.use('/api/admin', require('./routes/insta-admin'));
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let db;
try { db = require('../db/pool'); } catch (e) { db = null; }
const pool = db && (db.pool || db);

let authMw;
try { authMw = require('../middleware/auth'); } catch (e) { authMw = {}; }
const auth = authMw.auth || ((req, res, next) => next());
const isAdmin = authMw.isAdmin || ((req, res, next) => next());

const SERVER_DIR = path.join(__dirname, '..');
const LOCK_FILE = path.join(SERVER_DIR, 'tmp', 'insta-agent.lock');
const LOG_FILE = path.join(SERVER_DIR, 'logs', 'insta-generator.log');
const GEN_SCRIPT = path.join(SERVER_DIR, 'insta-generator.js');

// настройки агента
router.get('/insta/settings', auth, isAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT key, value, description FROM settings WHERE key LIKE 'insta%' ORDER BY key");
    res.json({ settings: rows });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/insta/settings', auth, isAdmin, async (req, res) => {
  try {
    const entries = Object.entries(req.body || {}).filter(([k]) => k.startsWith('insta_'));
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO settings (key, value, type, description, updated_at)
         VALUES ($1, $2, 'string', 'Instagram-агент', NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, String(value)]);
    }
    res.json({ message: 'Настройки агента сохранены' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// очередь черновиков
router.get('/insta/queue', auth, isAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.listing_id, p.caption, p.created_at, l.title, l.city, l.price
       FROM insta_posts p
       LEFT JOIN listings l ON l.id = p.listing_id
       WHERE p.status = 'pending'
       ORDER BY p.id DESC`);
    res.json({ queue: rows });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// статус: работает ли сейчас + хвост лога
router.get('/insta/status', auth, isAdmin, async (req, res) => {
  let logTail = '';
  try {
    if (fs.existsSync(LOG_FILE)) {
      logTail = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-60).join('\n');
    }
  } catch (e) {}
  res.json({ running: agentRunning(), log: logTail });
});

// ручной запуск
router.post('/insta/run', auth, isAdmin, async (req, res) => {
  try {
    if (agentRunning()) {
      return res.status(409).json({ message: 'Агент уже запущен, дождитесь завершения' });
    }
    const child = spawn(process.execPath, [GEN_SCRIPT], { cwd: SERVER_DIR, stdio: 'ignore', detached: true });
    child.unref();
    res.json({ message: 'Агент запущен. Обновите статус через минуту.' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

function agentRunning() {
  try {
    return fs.existsSync(LOCK_FILE) &&
      (Date.now() - fs.statSync(LOCK_FILE).mtimeMs) < 30 * 60 * 1000;
  } catch (e) { return false; }
}

module.exports = router;
