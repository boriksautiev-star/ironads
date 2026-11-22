/**
 * Планировщик Instagram-агента.
 * Подключение в app.js: require('./cron/insta-cron');
 * Каждую минуту сверяет расписание из настроек (insta_schedule) и запускает
 * insta-generator.js, когда пора. Сам генератор защищён lock-файлом от повторов.
 */
const cron = require('node-cron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let db;
try { db = require('../db/pool'); } catch (e) { db = null; }
const pool = db && (db.pool || db);

const SERVER_DIR = path.join(__dirname, '..');
const LOCK_FILE = path.join(SERVER_DIR, 'tmp', 'insta-agent.lock');

let task = null;
let lastSchedule = null;

function running() {
  try {
    return fs.existsSync(LOCK_FILE) &&
      (Date.now() - fs.statSync(LOCK_FILE).mtimeMs) < 30 * 60 * 1000;
  } catch (e) { return false; }
}

function runOnce() {
  if (running()) return; // уже работает (руками или прошлый прогон)
  const child = spawn(process.execPath, [path.join(SERVER_DIR, 'insta-generator.js')], {
    cwd: SERVER_DIR, stdio: 'ignore', detached: true
  });
  child.unref();
}

async function sync() {
  try {
    const { rows } = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('insta_enabled','insta_schedule')");
    const m = {};
    for (const r of rows) m[r.key] = r.value;
    const enabled = String(m.insta_enabled === undefined ? '1' : m.insta_enabled) === '1';
    const schedule = m.insta_schedule || '0 9,13,19 * * *';

    if (!enabled || !cron.validate(schedule)) {
      if (task) { task.stop(); task = null; lastSchedule = null; }
      return;
    }
    if (schedule !== lastSchedule) {
      if (task) task.stop();
      task = cron.schedule(schedule, runOnce);
      lastSchedule = schedule;
    }
  } catch (e) { /* база ещё не готова — повторим через минуту */ }
}

sync();
setInterval(sync, 60000);

module.exports = { sync, runOnce };
