const axios = require('axios');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ironmarket_db',
    password: process.env.DB_PASSWORD || 'Sautievshau22$',
    port: 5432,
    max: 20,
    idleTimeoutMillis: 30000,
});

const PARTNER_USER_ID = 56;
const FEED_URL = 'https://feed-p.topnlab.ru/export/superxata/bFZxQUY3ckxtYXFiaWIvSw,,/feed.xml';

// ===== БЛОКИРОВКА =====
const LOCK_FILE = path.join(__dirname, '../tmp/import.lock');

async function acquireLock() {
    try {
        await fsPromises.mkdir(path.dirname(LOCK_FILE), { recursive: true });
        try {
            const stat = await fsPromises.stat(LOCK_FILE);
            const age = Date.now() - stat.mtimeMs;
            if (age < 10 * 60 * 1000) {
                return false;
            } else {
                await fsPromises.unlink(LOCK_FILE);
            }
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }
        await fsPromises.writeFile(LOCK_FILE, JSON.stringify({ pid: process.pid, time: Date.now() }));
        return true;
    } catch (err) {
        console.warn('⚠️ Не удалось создать блокировку:', err.message);
        return false;
    }
}

async function releaseLock() {
    try {
        await fsPromises.unlink(LOCK_FILE);
    } catch (err) {
        if (err.code !== 'ENOENT') console.warn('⚠️ Не удалось удалить блокировку:', err.message);
    }
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function safeString(value) {
    return value && typeof value === 'string' ? value.trim() : null;
}

function safeNumber(value) {
    if (value === undefined || value === null) return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}

function cleanDescription(text) {
    if (!text) return '';
    let cleaned = text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ');
    cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/\s{2,}/g, ' ');
    return cleaned.trim();
}

function buildTitle(offer, location) {
    const categoryRaw = safeString(offer.category) || '';
    const propertyTypeRaw = safeString(offer['property-type']) || '';
    const buildingType = safeString(offer['building-type']) || '';
    const rooms = safeNumber(offer.rooms);
    const area = safeNumber(offer.area?.value);
    const lotArea = safeNumber(offer['lot-area']?.value);
    const city = safeString(location['locality-name']) || '';
    const lotType = safeString(offer['lot-type']) || '';

    let typeName = 'Объект';
    const catLower = categoryRaw.toLowerCase();
    const propLower = propertyTypeRaw.toLowerCase();

    const apartmentSynonyms = ['квартира', 'квартиры', 'квартир', 'комната', 'комнаты', 'студия', 'апартамент', 'апартаменты'];
    const houseSynonyms = ['дом', 'дома', 'домов', 'дача', 'дачи', 'таунхаус', 'коттедж', 'особняк', 'дача'];
    const landSynonyms = ['участок', 'участки', 'земельный участок', 'земля', 'сотка', 'садовый участок', 'снт', 'днп', 'ижс'];
    const commercialSynonyms = ['коммерческая', 'коммерческий', 'торговая', 'торговый', 'офис', 'склад', 'производство', 'бизнес'];

    if (apartmentSynonyms.some(s => catLower.includes(s) || propLower.includes(s))) {
        typeName = 'квартира';
    } else if (houseSynonyms.some(s => catLower.includes(s) || propLower.includes(s))) {
        typeName = 'дом';
    } else if (landSynonyms.some(s => catLower.includes(s) || propLower.includes(s) || lotType)) {
        typeName = 'участок';
    } else if (commercialSynonyms.some(s => catLower.includes(s) || propLower.includes(s))) {
        typeName = 'коммерческая недвижимость';
    } else {
        typeName = categoryRaw || propertyTypeRaw || 'Объект';
    }

    let material = buildingType ? buildingType + ' ' : '';
    const isLand = (typeName === 'участок');
    let parts = [];
    if (rooms && !isLand) {
        parts.push(`${rooms}-комн.`);
    }
    if (isLand) {
        const landArea = lotArea || area;
        if (landArea) parts.push(`${landArea} сот.`);
    } else {
        if (area) parts.push(`${area} м²`);
    }
    const cityPart = city ? `, ${city}` : '';
    let title = `${material}${typeName}`.trim();
    if (parts.length > 0) {
        title += `, ${parts.join(', ')}`;
    }
    if (cityPart) {
        title += cityPart;
    }
    return title;
}

// ===== ОПРЕДЕЛЕНИЕ ТИПА (приоритет описанию) =====
function determineType(offer) {
    const offerType = safeString(offer.type) || '';
    const dealStatus = safeString(offer['deal-status']) || '';
    const description = safeString(offer.description) || '';

    const offerLower = offerType.toLowerCase();
    const dealLower = dealStatus.toLowerCase();
    const descLower = description.toLowerCase();

    const rentStrong = ['сдаётся', 'сдаю', 'сдам', 'аренда', 'арендую', 'сниму', 'снимет', 'посуточно', 'арендодатель', 'за месяц', 'в месяц', 'мес'];
    const sellStrong = ['продам', 'продаю', 'продаётся', 'sale', 'куплю', 'покупка'];

    if (rentStrong.some(kw => descLower.includes(kw))) {
        return 'rent';
    }
    if (sellStrong.some(kw => descLower.includes(kw))) {
        return 'sell';
    }

    if (offerLower.includes('аренд') || dealLower.includes('rent')) {
        return 'rent';
    }
    if (offerLower.includes('продаж') || dealLower.includes('sale') || dealLower.includes('продажа')) {
        return 'sell';
    }
    if (offerLower.includes('обмен') || dealLower.includes('exchange')) {
        return 'sell'; // маппим обмен в продажу
    }

    const rentWeak = ['аренд', 'сдач', 'наём', 'наем', 'rent', 'lease'];
    const sellWeak = ['продаж', 'buy', 'sell'];
    if (rentWeak.some(kw => descLower.includes(kw))) {
        return 'rent';
    }
    if (sellWeak.some(kw => descLower.includes(kw))) {
        return 'sell';
    }

    return 'sell';
}

// ===== ОПРЕДЕЛЕНИЕ КАТЕГОРИИ =====
function getCategoryId(offer) {
    const propertyType = safeString(offer['property-type']) || '';
    const category = safeString(offer.category) || '';
    const lotType = safeString(offer['lot-type']) || '';
    const offerType = safeString(offer.type) || '';
    const description = safeString(offer.description) || '';

    const catLower = category.toLowerCase();
    const propLower = propertyType.toLowerCase();
    const combined = (offerType + ' ' + category + ' ' + propertyType + ' ' + description).toLowerCase();

    const apartmentSynonyms = ['квартира', 'квартиры', 'квартир', 'комната', 'комнаты', 'студия', 'апартамент', 'апартаменты'];
    const houseSynonyms = ['дом', 'дома', 'домов', 'дача', 'дачи', 'таунхаус', 'коттедж', 'особняк'];
    const landSynonyms = ['участок', 'участки', 'земельный участок', 'земля', 'сотка', 'садовый участок', 'снт', 'днп'];
    const commercialSynonyms = ['коммерческая', 'коммерческий', 'торговая', 'торговый', 'офис', 'склад', 'производство', 'бизнес'];
    const garageSynonyms = ['гараж', 'гаражи', 'машиноместо', 'паркинг'];

    if (commercialSynonyms.some(s => catLower.includes(s) || propLower.includes(s))) {
        return 38;
    }
    if (houseSynonyms.some(s => catLower.includes(s) || propLower.includes(s))) {
        return 37;
    }
    if (landSynonyms.some(s => catLower.includes(s) || propLower.includes(s)) || lotType) {
        return 39;
    }
    if (garageSynonyms.some(s => catLower.includes(s) || propLower.includes(s))) {
        return 40;
    }
    if (apartmentSynonyms.some(s => catLower.includes(s) || propLower.includes(s))) {
        const rentKeywords = ['аренд', 'сдач', 'наём', 'наем', 'rent', 'lease', 'снять', 'снимет', 'посуточно', 'арендодатель'];
        if (rentKeywords.some(kw => combined.includes(kw))) {
            return 36;
        } else {
            return 35;
        }
    }
    return 5;
}

// ===== НОРМАЛИЗАЦИЯ НАЗВАНИЯ ГОРОДА =====
function normalizeCityName(name) {
    if (!name) return '';
    let normalized = name
        .trim()
        .replace(/^г\.?\s*/i, '')
        .replace(/^город\s*/i, '')
        .replace(/^посёлок\s*/i, '')
        .replace(/^п\.?\s*/i, '')
        .replace(/^с\.?\s*/i, '')
        .replace(/^деревня\s*/i, '')
        .replace(/^д\.?\s*/i, '')
        .replace(/\s*\([^)]*\)$/, '')
        .trim();
    return normalized;
}

// ===== ПОИСК ИЛИ СОЗДАНИЕ ГОРОДА =====
async function findOrCreateCity(cityName, regionName) {
    if (!cityName) return null;

    const normalizedCity = normalizeCityName(cityName);
    if (!normalizedCity) return null;

    let result = await pool.query(
        `SELECT id, region_id FROM cities WHERE LOWER(name) = LOWER($1)`,
        [normalizedCity]
    );
    if (result.rows.length > 0) {
        return result.rows[0].id;
    }

    if (regionName) {
        const normalizedRegion = regionName.trim();
        let regionResult = await pool.query(
            `SELECT id FROM regions WHERE LOWER(name) = LOWER($1)`,
            [normalizedRegion]
        );
        let regionId = null;
        if (regionResult.rows.length === 0) {
            const newRegion = await pool.query(
                `INSERT INTO regions (name, sort_order) VALUES ($1, 0) RETURNING id`,
                [normalizedRegion]
            );
            regionId = newRegion.rows[0].id;
            console.log(`➕ Создан новый регион: "${normalizedRegion}" (ID ${regionId})`);
        } else {
            regionId = regionResult.rows[0].id;
        }

        result = await pool.query(
            `SELECT id FROM cities WHERE LOWER(name) = LOWER($1) AND region_id = $2`,
            [normalizedCity, regionId]
        );
        if (result.rows.length > 0) {
            return result.rows[0].id;
        }

        const newCity = await pool.query(
            `INSERT INTO cities (name, region_id, is_popular, sort_order)
             VALUES ($1, $2, false, 0)
             RETURNING id`,
            [normalizedCity, regionId]
        );
        console.log(`➕ Создан новый город: "${normalizedCity}" (регион: ${normalizedRegion}, ID ${newCity.rows[0].id})`);
        return newCity.rows[0].id;
    } else {
        const newCity = await pool.query(
            `INSERT INTO cities (name, region_id, is_popular, sort_order)
             VALUES ($1, NULL, false, 0)
             RETURNING id`,
            [normalizedCity]
        );
        console.log(`➕ Создан новый город без региона: "${normalizedCity}" (ID ${newCity.rows[0].id})`);
        return newCity.rows[0].id;
    }
}

// ===== ЗАГРУЗКА И СОХРАНЕНИЕ ФОТО =====
const TEMP_DIR = path.join(__dirname, '../public/uploads/topnlab/temp');
const FINAL_DIR = path.join(__dirname, '../public/uploads/topnlab');

async function ensureDirs() {
    await fsPromises.mkdir(TEMP_DIR, { recursive: true });
    await fsPromises.mkdir(FINAL_DIR, { recursive: true });
}

// Скачивание одного изображения
async function downloadImage(url, filename) {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        timeout: 30000,
    });
    const tempPath = path.join(TEMP_DIR, filename);
    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function cleanTempDir() {
    try {
        const files = await fsPromises.readdir(TEMP_DIR);
        for (const file of files) {
            await fsPromises.unlink(path.join(TEMP_DIR, file));
        }
    } catch (err) {
        if (err.code !== 'ENOENT') console.warn('⚠️ Не удалось очистить temp:', err.message);
    }
}

// ===== ОСНОВНАЯ ФУНКЦИЯ ИМПОРТА (С ИСПРАВЛЕННОЙ ЛОГИКОЙ ОБНОВЛЕНИЯ) =====
async function importTopnlab() {
    if (!await acquireLock()) {
        console.log('⏳ Импорт уже выполняется другим процессом, пропускаем');
        return;
    }

    let stats = {
        added: 0,
        updated: 0,
        archived: 0,
        errors: 0,
    };

    try {
        await ensureDirs();
        await cleanTempDir();

        console.log(`[${new Date().toISOString()}] 📥 Начинаем импорт фида TopNLab...`);

        const response = await axios.get(FEED_URL, { timeout: 60000 });
        const xmlData = response.data;

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '_',
            textNodeName: '_text',
            parseTagValue: true,
            trimValues: true,
            removeNSPrefix: true,
        });
        const parsed = parser.parse(xmlData);

        if (!parsed['realty-feed']) {
            console.warn('⚠️ Корневой элемент realty-feed не найден');
            return;
        }

        let offers = parsed['realty-feed']['offer'];
        if (!Array.isArray(offers)) {
            offers = offers ? [offers] : [];
        }

        if (offers.length === 0) {
            console.warn('⚠️ В фиде нет объявлений');
            return;
        }

        console.log(`📦 Найдено ${offers.length} объявлений`);

        const externalIds = [];

        const userProfile = await pool.query(
            'SELECT phone, whatsapp, telegram FROM users WHERE id = $1',
            [PARTNER_USER_ID]
        );
        const userContacts = userProfile.rows[0] || {};

        for (const offer of offers) {
            const internalId = offer['_internal-id'];
            if (!internalId) continue;
            externalIds.push(internalId);

            const location = offer.location || {};
            const price = offer.price || {};
            const agent = offer['sales-agent'] || {};

            const title = buildTitle(offer, location);
            const description = cleanDescription(safeString(offer.description) || '');
            const priceValue = safeNumber(price.value) || 0;
            const currency = safeString(price.currency) || 'RUR';
            const regionName = safeString(location.region) || '';
            const cityName = safeString(location['locality-name']) || '';
            const address = safeString(location.address) || '';
            const lat = safeNumber(location.latitude);
            const lng = safeNumber(location.longitude);

            let cityId = null;
            if (cityName) {
                try {
                    cityId = await findOrCreateCity(cityName, regionName);
                } catch (err) {
                    console.warn(`⚠️ Ошибка поиска/создания города для "${cityName}":`, err.message);
                }
            }

            const type = determineType(offer);
            console.log(`🔍 Объявление ${internalId}: тип = ${type} (offerType=${safeString(offer.type) || '?'}, dealStatus=${safeString(offer['deal-status']) || '?'})`);

            const phoneFromFeed = safeString(agent.phone) || null;
            const finalPhone = phoneFromFeed || userContacts.phone || null;
            const finalWhatsapp = userContacts.whatsapp || null;
            const finalTelegram = userContacts.telegram || null;
            const showPhone = !!finalPhone;
            const showWhatsapp = !!finalWhatsapp;
            const showTelegram = !!finalTelegram;

            const images = Array.isArray(offer.image) ? offer.image : (offer.image ? [offer.image] : []);

            const extraFields = {
                area: safeNumber(offer.area?.value),
                living_space: safeNumber(offer['living-space']?.value),
                rooms: safeNumber(offer.rooms),
                floor: safeNumber(offer.floor),
                floors_total: safeNumber(offer['floors-total']),
                building_type: safeString(offer['building-type']),
                bathroom_unit: safeString(offer['bathroom-unit']),
                renovation: safeString(offer.renovation),
                lot_area: safeNumber(offer['lot-area']?.value),
                lot_type: safeString(offer['lot-type']),
                property_type: safeString(offer['property-type']),
                category: safeString(offer.category),
                deal_status: safeString(offer['deal-status']),
                haggle: safeString(offer.haggle) === '1',
                mortgage: safeString(offer.mortgage) === '1',
                gas_supply: safeString(offer['gas-supply']) === '1',
                electricity_supply: safeString(offer['electricity-supply']) === '1',
                sewerage_supply: safeString(offer['sewerage-supply']) === '1',
                heating_supply: safeString(offer['heating-supply']) === '1',
                water_supply: safeString(offer['water-supply']) === '1',
                room_furniture: safeString(offer['room-furniture']) === '1',
                sauna: safeString(offer.sauna) === '1',
            };

            const categoryId = getCategoryId(offer);

            const existing = await pool.query(
                'SELECT id FROM listings WHERE external_id = $1 AND source = $2',
                [internalId, 'topnlab']
            );

            let listingId;

            // ===== ОБРАБОТКА СУЩЕСТВУЮЩЕГО ОБЪЯВЛЕНИЯ =====
            if (existing.rows.length > 0) {
                listingId = existing.rows[0].id;
                console.log(`🔄 Обновление объявления ID ${listingId} (${internalId})`);

                // 1. Обновляем текстовые данные (в транзакции)
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    await client.query(
                        `UPDATE listings SET
                            title = $1,
                            description = $2,
                            price = $3,
                            currency = $4,
                            region = $5,
                            city = $6,
                            address = $7,
                            latitude = $8,
                            longitude = $9,
                            type = $10,
                            extra_data = $11,
                            category_id = $12,
                            city_id = $13,
                            status = 'active',
                            archived_at = NULL
                        WHERE id = $14`,
                        [title, description, priceValue, currency, regionName, cityName, address, lat, lng, type, JSON.stringify(extraFields), categoryId, cityId, listingId]
                    );
                    await client.query('COMMIT');
                    stats.updated++;
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`❌ Ошибка обновления текстовых данных для ${internalId}:`, err.message);
                    stats.errors++;
                    continue; // пропускаем обновление фото, если данные не обновились
                } finally {
                    client.release();
                }

                // 2. Обновляем фото (вне транзакции, чтобы ошибки фото не мешали)
                const imageCount = Math.min(images.length, 10);
                const downloadedPaths = [];
                for (let i = 0; i < imageCount; i++) {
                    const imgUrl = images[i];
                    const filename = `${internalId}_${i}.jpg`;
                    try {
                        await downloadImage(imgUrl, filename);
                        downloadedPaths.push(filename);
                    } catch (err) {
                        console.warn(`⚠️ Не удалось загрузить фото ${i+1} для ${internalId}:`, err.message);
                    }
                }

                if (downloadedPaths.length > 0) {
                    // Удаляем старые файлы и записи
                    const oldMedia = await pool.query(
                        'SELECT file_path FROM listing_media WHERE listing_id = $1',
                        [listingId]
                    );
                    for (const row of oldMedia.rows) {
                        const filePath = path.join(FINAL_DIR, path.basename(row.file_path));
                        try {
                            await fsPromises.unlink(filePath);
                        } catch (err) {
                            if (err.code !== 'ENOENT') {
                                console.warn(`⚠️ Не удалось удалить файл ${filePath}:`, err.message);
                            }
                        }
                    }
                    await pool.query('DELETE FROM listing_media WHERE listing_id = $1', [listingId]);

                    // Перемещаем новые файлы и вставляем записи
                    for (let i = 0; i < downloadedPaths.length; i++) {
                        const tempFile = path.join(TEMP_DIR, downloadedPaths[i]);
                        const finalFile = path.join(FINAL_DIR, downloadedPaths[i]);
                        await fsPromises.rename(tempFile, finalFile);
                        const filePath = `/uploads/topnlab/${downloadedPaths[i]}`;
                        await pool.query(
                            `INSERT INTO listing_media (listing_id, file_path, file_order, media_type, file_type, created_at)
                             VALUES ($1, $2, $3, $4, $5, NOW())`,
                            [listingId, filePath, i, 'image', 'image']
                        );
                    }
                    console.log(`✅ Фото обновлены для ${listingId} (${downloadedPaths.length} шт.)`);
                } else {
                    console.warn(`⚠️ Фото не загружены для ${listingId}, оставлены старые`);
                }

            // ===== СОЗДАНИЕ НОВОГО ОБЪЯВЛЕНИЯ =====
            } else {
                // Сначала загружаем фото (для нового объявления фото обязательны)
                const imageCount = Math.min(images.length, 10);
                const downloadedPaths = [];
                for (let i = 0; i < imageCount; i++) {
                    const imgUrl = images[i];
                    const filename = `${internalId}_${i}.jpg`;
                    try {
                        await downloadImage(imgUrl, filename);
                        downloadedPaths.push(filename);
                    } catch (err) {
                        console.warn(`⚠️ Не удалось загрузить фото ${i+1} для ${internalId}:`, err.message);
                    }
                }

                if (downloadedPaths.length === 0 && images.length > 0) {
                    console.warn(`⚠️ Не удалось загрузить ни одного фото для ${internalId}, пропускаем`);
                    continue;
                }

                // Вставляем запись в БД
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    const result = await client.query(
                        `INSERT INTO listings (
                            title, description, price, currency, region, city, address,
                            latitude, longitude, type, user_id, external_id, source,
                            extra_data, category_id, city_id,
                            phone, whatsapp, telegram,
                            show_phone, show_whatsapp, show_telegram,
                            status, created_at, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'active', NOW(), NOW())
                        RETURNING id`,
                        [
                            title, description, priceValue, currency, regionName, cityName, address,
                            lat, lng, type, PARTNER_USER_ID, internalId, 'topnlab',
                            JSON.stringify(extraFields), categoryId, cityId,
                            finalPhone, finalWhatsapp, finalTelegram,
                            showPhone, showWhatsapp, showTelegram
                        ]
                    );
                    listingId = result.rows[0].id;
                    stats.added++;

                    // Сохраняем фото
                    for (let i = 0; i < downloadedPaths.length; i++) {
                        const tempFile = path.join(TEMP_DIR, downloadedPaths[i]);
                        const finalFile = path.join(FINAL_DIR, downloadedPaths[i]);
                        await fsPromises.rename(tempFile, finalFile);
                        const filePath = `/uploads/topnlab/${downloadedPaths[i]}`;
                        await client.query(
                            `INSERT INTO listing_media (listing_id, file_path, file_order, media_type, file_type, created_at)
                             VALUES ($1, $2, $3, $4, $5, NOW())`,
                            [listingId, filePath, i, 'image', 'image']
                        );
                    }
                    await client.query('COMMIT');
                    console.log(`✅ Добавлено новое объявление ID ${listingId} (${internalId}) (${downloadedPaths.length} фото)`);
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`❌ Ошибка создания объявления ${internalId}:`, err.message);
                    stats.errors++;
                    // Удаляем уже загруженные временные файлы
                    for (const f of downloadedPaths) {
                        try {
                            await fsPromises.unlink(path.join(TEMP_DIR, f));
                        } catch (_) {}
                    }
                } finally {
                    client.release();
                }
            }
        }

        // ---- Архивация отсутствующих ----
        if (externalIds.length > 0) {
            const placeholders = externalIds.map((_, i) => `$${i+1}`).join(',');
            const result = await pool.query(
                `UPDATE listings
                 SET status = 'archived', archived_at = NOW()
                 WHERE source = 'topnlab'
                   AND external_id NOT IN (${placeholders})
                   AND status != 'archived'`,
                externalIds
            );
            stats.archived = result.rowCount;
            if (result.rowCount > 0) {
                console.log(`📦 Заархивировано ${result.rowCount} объявлений (пропали из фида)`);
            }
        } else {
            const result = await pool.query(
                `UPDATE listings SET status = 'archived', archived_at = NOW()
                 WHERE source = 'topnlab' AND status != 'archived'`
            );
            stats.archived = result.rowCount;
            if (result.rowCount > 0) {
                console.log(`📦 Заархивировано ${result.rowCount} объявлений (фид пуст)`);
            }
        }

        console.log(`[${new Date().toISOString()}] ✅ Импорт TopNLab завершён`);
        console.log(`📊 Статистика: добавлено ${stats.added}, обновлено ${stats.updated}, заархивировано ${stats.archived}, ошибок ${stats.errors}`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Ошибка импорта TopNLab:`, error.message);
        console.error(error.stack);
    } finally {
        await cleanTempDir();
        await releaseLock();
        console.log('🔓 Блокировка импорта снята');
    }
}

module.exports = importTopnlab;

if (require.main === module) {
    importTopnlab().then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
}