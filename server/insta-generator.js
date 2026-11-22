#!/usr/bin/env node
/**
 * Instagram-агент IronAds.
 * Читает настройки из таблицы settings (ключи insta_*), выбирает активные объявления
 * из включённых категорий, раскладывает черновики в outbox-папку (Яндекс.Диск) и ведёт
 * журнал posted.txt: exported (выгружен, ждёт публикации) -> posted | skipped.
 * Запуск: node insta-generator.js  (или кнопкой из админ-панели / по расписанию).
 */
require('dotenv').config();

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { Pool } = require('pg');

// ---------- подключение к БД: используем общий пул проекта, при сбое — свой ----------
let pool;
try {
  const db = require('./db/pool');
  pool = db.pool || db;
  if (typeof pool.query !== 'function') throw new Error('bad pool');
} catch (e) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST || 'localhost',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'ironmarket_db'
  });
}

// ---------- путь до страницы объявления на сайте (поправьте, если другой формат) ----------
const LISTING_PATH = '/listing.html?id=';

const PHOTOS_PER_POST = 5;
const PHOTO_WIDTH = 1440;

const LOCK_FILE = path.join(__dirname, 'tmp', 'insta-agent.lock');
const LOG_FILE = path.join(__dirname, 'logs', 'insta-generator.log');

function log(msg) {
  const line = `[${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (e) { /* лог не критичен */ }
}

let cfg = null;
let catMap = new Map();
let mediaCols = null;
let postsCols = null;

let sharpLib = null;
try { sharpLib = require('sharp'); } catch (e) { log('sharp недоступен, фото копируются как есть'); }

// ---------- настройки ----------
function parseIds(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.map(Number).filter(Boolean) : [];
  } catch (e) { return []; }
}

async function loadSettings() {
  const { rows } = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'insta%'");
  const m = {};
  for (const r of rows) m[r.key] = r.value;
  return {
    enabled: (m.insta_enabled === undefined ? true : String(m.insta_enabled) === '1'),
    limit: parseInt(m.insta_limit || '10', 10) || 10,
    categories: parseIds(m.insta_categories || '[]'),
    outbox: m.insta_outbox || 'C:\\Yandex.Disk\\МОИ ПРОГРАММЫ\\IronAds\\Insta черновики',
    siteUrl: String(m.insta_site_url || 'https://ironads.ru').replace(/\/+$/, ''),
    agentPhone: (m.insta_agent_phone || '').trim(),
    priceFormat: m.insta_price_format || 'short',
    schedule: m.insta_schedule || '0 9,13,19 * * *'
  };
}

// ---------- категории ----------
async function loadCategoryMap() {
  const { rows } = await pool.query('SELECT id, parent_id, name FROM categories');
  catMap = new Map(rows.map(r => [Number(r.id), r]));
}

function catInfo(categoryId) {
  let cur = catMap.get(Number(categoryId));
  if (!cur) return null;
  let root = cur;
  while (root && root.parent_id) root = catMap.get(Number(root.parent_id));
  return { id: cur.id, name: cur.name, rootId: root ? root.id : cur.id, rootName: root ? root.name : cur.name };
}

async function expandCategoryIds(ids) {
  if (!ids.length) return null; // null = все категории
  const set = new Set(ids.map(Number));
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of catMap.values()) {
      if (r.parent_id && set.has(Number(r.parent_id)) && !set.has(Number(r.id))) { set.add(Number(r.id)); grew = true; }
    }
  }
  return [...set];
}

// ---------- самонастройка колонок ----------
async function detectColumns(table, variants) {
  const { rows } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1", [table]);
  const cols = new Set(rows.map(r => r.column_name));
  const out = {};
  for (const [role, candidates] of Object.entries(variants)) {
    out[role] = candidates.find(c => cols.has(c)) || null;
  }
  return out;
}

// ---------- журнал posted.txt ----------
function ledgerFile() { return path.join(cfg.outbox, 'posted.txt'); }

async function readLedger() {
  const map = new Map();
  try {
    const text = await fsp.readFile(ledgerFile(), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(\d+)\s*\|\s*[^|]*\|\s*(exported|skipped|posted)\s*$/);
      if (m) map.set(Number(m[1]), m[2]);
    }
  } catch (e) { /* файла ещё нет */ }
  return map;
}

async function appendLedger(listingId, status) {
  await fsp.mkdir(cfg.outbox, { recursive: true });
  const line = `${listingId} | ${new Date().toISOString().slice(0, 19).replace('T', ' ')} | ${status}\n`;
  await fsp.appendFile(ledgerFile(), line, 'utf8');
}

// ---------- подписи ----------
function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fmtPrice(value, fmt, rentSuffix) {
  if (value === null || value === undefined || value === '') return null;
  let s;
  if (fmt === 'full') s = Number(value).toLocaleString('ru-RU');
  else if (value >= 1000000) s = (Math.round(value / 100000) / 10).toString().replace('.', ',') + ' млн';
  else s = Number(value).toLocaleString('ru-RU');
  return s + ' ₽' + (rentSuffix ? '/мес' : '');
}

function firstSentence(text, maxLen) {
  const t = stripHtml(text);
  if (!t) return '';
  const m = t.match(/^[^.!?]{10,180}[.!?]/);
  const s = m ? m[0] : t.slice(0, 140);
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

function pickExtra(extra, keys) {
  if (!extra || typeof extra !== 'object') return null;
  for (const k of Object.keys(extra)) {
    const kl = k.toLowerCase();
    if (keys.some(x => kl.includes(x))) {
      const v = extra[k];
      if (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) return v;
    }
  }
  return null;
}

function buildCaption(listing, info, cfg) {
  const rootId = info ? info.rootId : 0;
  const rent = /rent|аренд/i.test(String(listing.type || '') + ' ' + String(info ? info.name : ''));
  const price = fmtPrice(listing.price, cfg.priceFormat, rent && rootId === 5);
  const link = cfg.siteUrl + LISTING_PATH + listing.id;
  const lines = [];
  const ex = listing.extra_data && typeof listing.extra_data === 'object' ? listing.extra_data : {};

  if (rootId === 5) {
    // Недвижимость
    const name = String(info ? info.name : '').toLowerCase();
    let kind = 'объект';
    if (name.includes('квартир')) kind = 'квартиру';
    else if (name.includes('дом')) kind = 'дом';
    else if (name.includes('участок')) kind = 'участок';
    else if (name.includes('гараж')) kind = 'гараж';
    else if (name.includes('коммерч')) kind = 'помещение';
    const bits = [];
    const rooms = pickExtra(ex, ['room', 'комнат']);
    const area = pickExtra(ex, ['area', 'площад']);
    if (rooms) bits.push(`${rooms}-комн.`);
    if (area && kind === 'участок') bits.push(String(area).replace('.', ',') + ' сот.');
    else if (area) bits.push(String(area).replace('.', ',') + ' м²');
    const floor = pickExtra(ex, ['floor', 'этаж']);
    const floors = pickExtra(ex, ['floors', 'этажност']);
    if (floor && floors && /\d/.test(String(floors))) bits.push(`${floor}/${floors} эт.`);
    else if (floor) bits.push(`эт. ${floor}`);
    const emoji = rent ? '🔑' : '🏠';
    const verb = rent ? 'Сдаётся' : 'Продаётся';
    lines.push(`${emoji} ${verb}: ${kind}${bits.length ? ', ' + bits.join(', ') : ''}`);
  } else if (rootId === 4) {
    // Транспорт
    const bits = [];
    const year = pickExtra(ex, ['year', 'год']);
    const mileage = pickExtra(ex, ['mileage', 'пробег']);
    const engine = pickExtra(ex, ['engine', 'двигат', 'объем', 'объём']);
    if (year) bits.push(String(year) + ' г.');
    if (mileage) {
      const digits = String(mileage).replace(/\D/g, '');
      bits.push(digits ? Number(digits).toLocaleString('ru-RU') + ' км' : String(mileage));
    }
    if (engine) bits.push(String(engine));
    lines.push(`🚗 ${stripHtml(listing.title).slice(0, 90)}${bits.length ? ', ' + bits.join(', ') : ''}`);
  } else {
    // Товары и услуги
    const cond = pickExtra(ex, ['condition', 'состояни']);
    const title = stripHtml(listing.title).slice(0, 100);
    lines.push(`📦 ${title}${cond ? ' — ' + cond : ''}`);
  }

  if (listing.city) lines.push(`📍 ${listing.city}`);
  if (price) lines.push(`💰 ${price}`);
  const desc = (() => {
    const t = stripHtml(listing.description || '').trim();
    return t;
  })();
  if (desc) lines.push(desc);
  lines.push(`🔗 ${link}`);
  if (cfg.agentPhone) lines.push(`📞 ${cfg.agentPhone}`);
  return lines.join('\n');
}

// ---------- фото ----------
async function photosFor(listingId) {
  const order = mediaCols.order
    ? `ORDER BY ${mediaCols.order} NULLS LAST, id`
    : 'ORDER BY id';
  const { rows } = await pool.query(
    `SELECT ${mediaCols.path} AS p FROM listing_media WHERE ${mediaCols.listing} = $1 ${order}`,
    [listingId]);
  return rows.map(r => r.p).filter(Boolean);
}

function resolveLocalPhoto(p) {
  const rel = String(p).replace(/\\/g, '/').replace(/^\/+/, '');
  return path.join(__dirname, 'public', rel);
}

async function savePhotos(listingId, dir) {
  const urls = await photosFor(listingId);
  let n = 0;
  for (const raw of urls) {
    if (n >= PHOTOS_PER_POST) break;
    try {
      let buf = null;
      if (/^https?:\/\//i.test(String(raw))) {
        const resp = await fetch(String(raw));
        if (resp.ok) buf = Buffer.from(await resp.arrayBuffer());
      } else {
        const file = resolveLocalPhoto(raw);
        if (fs.existsSync(file)) buf = await fsp.readFile(file);
      }
      if (!buf) { log(`⚠️ фото не найдено: ${raw} (объявление ${listingId})`); continue; }
      const dest = path.join(dir, `${String(n + 1).padStart(2, '0')}.jpg`);
      if (sharpLib) {
        await sharpLib(buf)
          .rotate()
          .resize({ width: PHOTO_WIDTH, height: PHOTO_WIDTH, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toFile(dest);
      } else {
        await fsp.writeFile(dest, buf);
      }
      n++;
    } catch (e) { log(`⚠️ фото не обработано (${raw}): ${e.message}`); }
  }
  return n;
}

// ---------- выгрузка черновика ----------
async function loadListing(id) {
  const { rows } = await pool.query(
    `SELECT l.id, l.title, l.price, l.description, l.type, l.city, l.extra_data, l.category_id,
            c.name AS category_name
     FROM listings l LEFT JOIN categories c ON c.id = l.category_id
     WHERE l.id = $1`, [id]);
  return rows[0] || null;
}

async function exportPost(listing, postId, caption) {
  const dir = path.join(cfg.outbox, `post-${postId}`);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'caption.txt'), '\uFEFF' + caption, 'utf8');
  const n = await savePhotos(listing.id, dir);
  await appendLedger(listing.id, 'exported');
  return n;
}

async function setStatus(postId, status) {
  if (!postsCols.status) return;
  await pool.query(`UPDATE insta_posts SET ${postsCols.status} = $1 WHERE id = $2`, [status, postId]);
}

async function updateCaption(postId, caption) {
  if (!postsCols.caption) return;
  await pool.query(`UPDATE insta_posts SET ${postsCols.caption} = $1 WHERE id = $2`, [caption, postId]);
}

// ---------- основной прогон ----------
async function main() {
  cfg = await loadSettings();
  await loadCategoryMap();
  await fsp.mkdir(cfg.outbox, { recursive: true });

  postsCols = await detectColumns('insta_posts', {
    listing: ['listing_id', 'listing', 'listingId'],
    caption: ['caption', 'text', 'message'],
    status: ['status', 'state']
  });
  mediaCols = await detectColumns('listing_media', {
    listing: ['listing_id', 'listingid', 'listingId'],
    path: ['url', 'path', 'file_path', 'file', 'image', 'image_url', 'media_url', 'filename', 'name'],
    order: ['sort_order', 'position', 'sort', 'order_index', 'idx']
  });
  if (!postsCols.listing) throw new Error('Не найдена колонка объявления в insta_posts');
  if (!postsCols.caption) throw new Error('Не найдена колонка подписи (caption) в insta_posts');
  if (!mediaCols.listing || !mediaCols.path) throw new Error('Не найдены колонки фото в listing_media');

  log(`Старт. Агент ${cfg.enabled ? 'включён' : 'ВЫКЛЮЧЕН (обрабатываю только прошлую очередь)'}. Outbox: ${cfg.outbox}`);

  const { rows: pending } = await pool.query(
    `SELECT id, ${postsCols.listing} AS listing_id FROM insta_posts`);
  const ledger = await readLedger();
  const pendingIds = new Set(pending.map(p => Number(p.id)));

  let markedPosted = 0, skipped = 0, reexported = 0;

  for (const p of pending) {
    const folder = path.join(cfg.outbox, `post-${p.id}`);
    const postedFolder = path.join(cfg.outbox, 'Опубликовано', `post-${p.id}`);
    const state = ledger.get(Number(p.listing_id));

    if (!state) {
      // ещё не выгружался — обновляем подпись и выгружаем с нуля
      const l = await loadListing(p.listing_id);
      if (!l) { log(`⚠️ объявление ${p.listing_id} не найдено, пост ${p.id} пропущен`); continue; }
      const caption = buildCaption(l, catInfo(l.category_id), cfg);
      await updateCaption(p.id, caption);
      await exportPost(l, p.id, caption);
      reexported++;
    } else if (state === 'exported') {
      if (fs.existsSync(folder) || fs.existsSync(postedFolder)) {
        // не опубликовали — снимаем с очереди
        if (fs.existsSync(folder)) {
          let removed = true;
          try { await fsp.rm(folder, { recursive: true, force: true }); }
          catch (e) { removed = false; log(`⚠️ папка занята — отложено на следующий прогон`); }
          if (removed) {
            await appendLedger(p.listing_id, 'skipped');
            await setStatus(p.id, 'skipped');
            skipped++;
          }
        }
      } else {
        // папка удалена или переехала в «Опубликовано» — считаем опубликованным
        await appendLedger(p.listing_id, 'posted');
        await setStatus(p.id, 'posted');
        markedPosted++;
      }
    }
  }

  // подчищаем осиротевшие папки post-*, которых нет в текущей очереди
  try {
    const entries = await fsp.readdir(cfg.outbox, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && /^post-\d+$/.test(e.name)) {
        const num = Number(e.name.slice(5));
        if (!pendingIds.has(num)) {
          try { await fsp.rm(path.join(cfg.outbox, e.name), { recursive: true, force: true }); }
          catch (err) { log(`⚠️ папка ${e.name} занята — доедем на следующем прогоне`); }
          log(`🧹 удалена осиротевшая папка ${e.name}`);
        }
      }
    }
  } catch (e) { /* outbox недоступен */ }

  log(`Очередь: выгружено заново ${reexported}, снято ${skipped}, помечено опубликованными ${markedPosted}`);

  // ---------- новая партия ----------
  if (!cfg.enabled) { log('Агент выключен — новые черновики не создаю'); return; }

  const catIds = await expandCategoryIds(cfg.categories);
  const filter = catIds ? 'AND l.category_id = ANY($1)' : '';
  const params = catIds ? [catIds] : [];

  const { rows: candidates } = await pool.query(
    `SELECT l.id, l.title, l.price, l.description, l.type, l.city, l.extra_data, l.category_id,
            c.name AS category_name, c.parent_id
     FROM listings l LEFT JOIN categories c ON c.id = l.category_id
     WHERE l.status = 'active' AND l.deleted_at IS NULL
     ${filter}
     AND NOT EXISTS (SELECT 1 FROM insta_posts p WHERE p.${postsCols.listing} = l.id AND ${postsCols.status ? `p.${postsCols.status} = 'pending'` : 'TRUE'})
     AND EXISTS (SELECT 1 FROM listing_media m WHERE m.${mediaCols.listing} = l.id)`,
    params);

  // объявления, уже упомянутые в журнале (posted/skipped), не берём
  const fresh = candidates.filter(l => !ledger.has(Number(l.id)));

  // группируем по корневой категории и перемешиваем для микса
  const groups = new Map();
  for (const l of fresh) {
    const info = catInfo(l.category_id);
    const key = info ? info.rootId : 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  for (const g of groups.values()) g.sort(() => Math.random() - 0.5);

  const queue = [];
  let added = true;
  while (queue.length < cfg.limit && added) {
    added = false;
    for (const g of groups.values()) {
      if (g.length && queue.length < cfg.limit) { queue.push(g.shift()); added = true; }
    }
  }

  for (const l of queue) {
    const caption = buildCaption(l, catInfo(l.category_id), cfg);
    const statusPart = postsCols.status ? `, ${postsCols.status}` : '';
    const statusVal = postsCols.status ? ", 'pending'" : '';
    const ins = await pool.query(
      `INSERT INTO insta_posts (${postsCols.listing}, ${postsCols.caption}${statusPart})
       VALUES ($1, $2${statusVal}) RETURNING id`,
      [l.id, caption]);
    const newId = ins.rows[0].id;
    const n = await exportPost(l, newId, caption);
    log(`✅ черновик post-${newId}: ${stripHtml(l.title).slice(0, 60)} (фото: ${n})`);
  }
  log(`Новых черновиков: ${queue.length}. Готово.`);
}

// ---------- запуск с блокировкой ----------
async function run() {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  if (fs.existsSync(LOCK_FILE)) {
    const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
    if (age < 30 * 60 * 1000) { log('Агент уже запущен (lock-файл свежий), выхожу'); return; }
    log('Убираю устаревший lock-файл');
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  try {
    await main();
  } finally {
    try { fs.unlinkSync(LOCK_FILE); } catch (e) {}
  }
}

run().catch(e => { log('❌ ' + (e.stack || e.message)); process.exitCode = 1; });
