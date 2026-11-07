const pool = require('../db/pool');

async function getSetting(key, defaultValue = null) {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (result.rows.length === 0) return defaultValue;
    return result.rows[0].value;
}

async function getPrice(settingKey) {
    const value = await getSetting(settingKey, '0');
    return parseInt(value, 10) || 0;
}

async function getPeriod(settingKey) {
    const value = await getSetting(settingKey, '30');
    return parseInt(value, 10) || 30;
}

async function getAllSettings() {
    const result = await pool.query('SELECT * FROM settings ORDER BY key');
    return result.rows;
}

module.exports = { getSetting, getPrice, getPeriod, getAllSettings };