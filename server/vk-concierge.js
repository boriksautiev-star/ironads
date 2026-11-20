// vk-concierge.js - ИИ-агент IronAds (v8: GigaChat вместо Groq)
require('dotenv').config();
const { VK } = require('vk-io');
const pool = require('./db/pool');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const VK_TOKEN = process.env.VK_TOKEN || '';
const GIGA_KEY = process.env.GIGACHAT_API_KEY || '';
const GIGA_MODEL = process.env.GIGACHAT_MODEL || 'GigaChat';
const DEFAULT_CITY = 'Владикавказ';

const vk = new VK({ token: VK_TOKEN });

// Сберские сертификаты могут не быть в системном хранилище - отключаем строгую проверку только для API GigaChat
const gigaAgent = new https.Agent({ rejectUnauthorized: false });

let gigaToken = null;
let gigaTokenExpires = 0;

console.log('🤖 VK Concierge запускается...');

function toNum(str) {
    return parseFloat(String(str).replace(/\s/g, '').replace(',', '.')) || 0;
}

// Добавление фото с дедупликацией по owner_id + id
function makeAdder(result, seen) {
    return (p) => {
        if (!p) return;
        const oid = p.owner_id !== undefined ? p.owner_id : p.ownerId;
        const key = (oid !== undefined && (p.id !== undefined || p.pid !== undefined)) ? (oid + '_' + (p.id !== undefined ? p.id : p.pid)) : ('raw_' + result.length + '_' + Math.random());
        if (seen.has(key)) return;
        seen.add(key);
        result.push(p);
    };
}

// Сбор фото из сырых вложений {type:'photo', photo:{...}}
function photosFromRawAttachments(atts) {
    const result = [];
    const seen = new Set();
    const add = makeAdder(result, seen);
    for (const att of atts || []) {
        if (att && att.type === 'photo') {
            add(att.photo ? att.photo : att);
        }
    }
    return result;
}

// Сбор фото из оберток vk-io
function photosFromWrappers(context) {
    const result = [];
    const seen = new Set();
    const add = makeAdder(result, seen);
    for (const att of context.attachments || []) {
        if (att && att.type === 'photo') {
            add(att);
        }
    }
    return result;
}

// Полная загрузка сообщения по ID - там все вложения без купюр
async function fetchFullPhotos(messageId) {
    try {
        const res = await vk.api.messages.getById({ message_ids: String(messageId) });
        const items = (res && res.items) ? res.items : [];
        if (!items.length) return [];
        const rawAtts = items[0].attachments || [];
        console.log('🔍 getById: вложений в полном сообщении: ' + rawAtts.length + ', типы: ' + rawAtts.map(a => a.type).join(', '));
        return photosFromRawAttachments(rawAtts);
    } catch (e) {
        console.error('🔍 getById упал: ' + e.message);
        return [];
    }
}

// Вытаскиваем ссылку на самый большой размер фото
function getPhotoUrl(p) {
    try {
        const sizes = p.sizes || [];
        if (sizes.length) {
            const big = sizes[sizes.length - 1];
            if (big && big.url) return big.url;
        }
        if (p.largeSize && p.largeSize.url) return p.largeSize.url;
        if (p.url) return p.url;
    } catch (e) {}
    return null;
}

// Резервный парсер: работает без ИИ
function parseFallback(text) {
    const clean = text.replace(/\s+/g, ' ').trim();
    let price = 0;

    const range = clean.match(/(?:от|с)\s+(\d[\d\s.,]*)\s*(?:до|-|—)\s*(\d[\d\s.,]*)/i);
    if (range) {
        price = toNum(range[1]);
    }

    if (!price) {
        const pm = clean.match(/(\d[\d\s.,]*)\s*(к\b|тыс|руб|₽|р\.?\b)/i);
        if (pm) {
            price = toNum(pm[1]);
            if (/к\b|тыс/i.test(pm[2])) price *= 1000;
        }
    }

    if (!price) {
        const pd = clean.match(/(\d[\d\s.,]*)/);
        if (pd) {
            const val = toNum(pd[1]);
            if (val >= 100) price = val;
        }
    }

    let title = clean.split(/[,.;]/)[0].trim();
    if (title.length > 60) title = title.slice(0, 60).trim();
    if (title.length < 3) title = 'Объявление из ВКонтакте';
    return {
        title: title,
        price: price,
        city: DEFAULT_CITY,
        description: clean + '\n\n📌 Объявление опубликовано через бота IronAds во ВКонтакте.'
    };
}

// Токен GigaChat живет ~30 минут - кешируем с запасом
async function getGigaToken() {
    if (gigaToken && Date.now() < gigaTokenExpires) return gigaToken;
    const resp = await axios.post('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', 'scope=GIGACHAT_API_PERS', {
        headers: {
            'Authorization': 'Basic ' + GIGA_KEY,
            'RqUID': crypto.randomUUID(),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        httpsAgent: gigaAgent,
        timeout: 20000
    });
    gigaToken = resp.data.access_token;
    gigaTokenExpires = Date.now() + 25 * 60 * 1000;
    return gigaToken;
}

// Попытка получить разбор текста от GigaChat
async function askGigaChat(text) {
    if (!GIGA_KEY) throw new Error('GigaChat не настроен (нет GIGACHAT_API_KEY)');
    const token = await getGigaToken();
    const prompt = 'Ты - ИИ-помощник доски объявлений. Пользователь прислал текст: "' + text + '". ' +
        'Извлеки Название товара, Цену (только цифры; если указан диапазон "от X до Y" - верни X, минимальную цену) и Город. Если чего-то нет - придумай сам (цена 0, если не указана). ' +
        'Также напиши красивое, продающее описание (до 500 символов) с эмодзи. ' +
        'Верни строго JSON формата: {"title": "...", "price": 0, "city": "...", "description": "..."} Без лишних слов, только JSON.';
    const resp = await Promise.race([
        axios.post('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
            model: GIGA_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 512
        }, { headers: { 'Authorization': 'Bearer ' + token }, httpsAgent: gigaAgent, timeout: 20000 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('GigaChat timeout 20s')), 20000))
    ]);
    const content = resp.data.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('GigaChat вернул не JSON');
    const data = JSON.parse(jsonMatch[0]);
    if (!data.title) throw new Error('GigaChat не вернул title');
    return data;
}

// Скачивание фото с ожиданием завершения записи
async function downloadPhoto(url, filePath) {
    const response = await axios({ url: url, method: 'GET', responseType: 'stream', timeout: 30000 });
    await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(filePath);
        response.data.pipe(ws);
        response.data.on('error', reject);
        ws.on('finish', resolve);
        ws.on('error', reject);
    });
}

vk.updates.on('message_new', async (context) => {
    if (context.isOutbox) return;

    const userId = context.senderId;
    const text = (context.text || '').trim();

    // Фото из события + всегда дозапрашиваем полное сообщение по ID
    const fromEvent = photosFromWrappers(context);
    const full = await fetchFullPhotos(context.id);

    const merged = [];
    const seen = new Set();
    const add = makeAdder(merged, seen);
    for (const p of full) add(p);
    for (const p of fromEvent) add(p);

    const photos = merged;
    console.log('📷 Итоговое фото: ' + photos.length);

    if (!photos.length && !text) return;
    if (!photos.length) {
        return context.send('📸 Пожалуйста, прикрепите хотя бы одну фотографию товара и напишите текст: "Название, цена, город".');
    }
    if (!text) {
        return context.send('📝 Добавьте к фото описание: "Название, цена, город" - например: "Диван, 15000, Владикавказ".');
    }

    try {
        await context.send('⏳ Обрабатываю ваше объявление, подождите немного...');

        let aiData;
        try {
            aiData = await askGigaChat(text);
            console.log('🧠 GigaChat обработал текст успешно');
        } catch (gigaErr) {
            console.error('⚠️ GigaChat недоступен (' + gigaErr.message + '), включаю резервный парсер');
            aiData = parseFallback(text);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const vkIdStr = String(userId);
            const vkUsername = 'vk_' + userId;
            let userRes = await client.query('SELECT id FROM users WHERE vk_id = $1 OR username = $2 LIMIT 1', [vkIdStr, vkUsername]);
            let dbUserId;

            if (userRes.rows.length === 0) {
                const randomPassword = crypto.randomBytes(4).toString('hex');
                const hash = await bcrypt.hash(randomPassword, 10);
                const insertUser = await client.query(
                    'INSERT INTO users (username, password_hash, phone, vk_id, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
                    [vkUsername, hash, 'Не указан', vkIdStr]
                );
                dbUserId = insertUser.rows[0].id;
                await context.send('🔐 Ваш аккаунт на сайте IronAds создан!\nЛогин: ' + vkUsername + '\nПароль: ' + randomPassword + '\n(Рекомендуем сменить пароль в личном кабинете)');
            } else {
                dbUserId = userRes.rows[0].id;
                await client.query("UPDATE users SET vk_id = $1 WHERE id = $2 AND (vk_id IS NULL OR vk_id = '')", [vkIdStr, dbUserId]);
            }

            let cityId = null;
            const cityText = aiData.city || DEFAULT_CITY;
            if (cityText) {
                const cityRes = await client.query('SELECT id FROM cities WHERE name ILIKE $1 LIMIT 1', ['%' + cityText + '%']);
                if (cityRes.rows.length > 0) cityId = cityRes.rows[0].id;
            }

            const mediaRows = [];
            const photoList = photos.slice(0, 10);
            for (let i = 0; i < photoList.length; i++) {
                const url = getPhotoUrl(photoList[i]);
                if (!url) {
                    console.log('⚠️ Фото ' + i + ' без ссылки, пропускаю');
                    continue;
                }
                const imageFileName = 'vk_' + Date.now() + '_' + i + '.jpg';
                const imagePath = path.join(__dirname, 'public', 'uploads', imageFileName);
                await downloadPhoto(url, imagePath);
                mediaRows.push('/uploads/' + imageFileName);
            }
            console.log('🖼 Скачано фото: ' + mediaRows.length + ' из ' + photoList.length);

            const insertListing = await client.query(
                "INSERT INTO listings (user_id, title, price, description, city, city_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW()) RETURNING id",
                [dbUserId, aiData.title, aiData.price || 0, aiData.description || text, cityText, cityId]
            );
            const listingId = insertListing.rows[0].id;

            for (let i = 0; i < mediaRows.length; i++) {
                await client.query(
                    "INSERT INTO listing_media (listing_id, file_path, file_type, file_order, is_main, media_type) VALUES ($1, $2, 'image', $3, $4, 'image')",
                    [listingId, mediaRows[i], i, i === 0]
                );
            }

            await client.query('COMMIT');

            await context.send('✅ Ваше объявление опубликовано!\n\n📌 ' + aiData.title + ' за ' + aiData.price + ' ₽\n📍 ' + cityText + '\n🖼 Фото: ' + mediaRows.length + ' шт.\n\nПосмотреть на сайте: https://ironads.ru/listing.html?id=' + listingId);

        } catch (dbErr) {
            await client.query('ROLLBACK');
            console.error('Ошибка БД:', dbErr);
            await context.send('❌ Произошла ошибка при публикации. Попробуйте позже.');
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Ошибка обработки:', error);
        try { await context.send('❌ Произошла ошибка при обработке вашего сообщения.'); } catch (e) {}
    }
});

vk.updates.start().then(() => {
    console.log('✅ VK Concierge успешно запущен и слушает сообщения!');
}).catch((err) => {
    console.error('❌ Не удалось запустить Long Poll:', err.message);
    process.exit(1);
});
