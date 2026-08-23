require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { Pool } = require('pg');

// ===== ПОДКЛЮЧЕНИЕ К БД =====
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ironmarket_db',
    password: process.env.DB_PASSWORD,
    port: 5432,
    max: 20,
    idleTimeoutMillis: 30000,
});

if (!process.env.DB_PASSWORD) {
    console.error('❌ DB_PASSWORD не задан в .env');
    process.exit(1);
}

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
        return 'sell';
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

const cityCache = new Map();

async function findOrCreateCity(cityName, regionName) {
    if (!cityName) return null;
    const normalizedCity = normalizeCityName(cityName);
    if (!normalizedCity) return null;

    const regionKey = regionName ? regionName.trim() : '';
    const cacheKey = `${normalizedCity}|${regionKey}`;
    if (cityCache.has(cacheKey)) {
        return cityCache.get(cacheKey);
    }

    let result = await pool.query(
        `SELECT id FROM cities WHERE LOWER(name) = LOWER($1)`,
        [normalizedCity]
    );
    if (result.rows.length > 0) {
        const id = result.rows[0].id;
        cityCache.set(cacheKey, id);
        return id;
    }

    let regionId = null;
    if (regionKey) {
        const regionResult = await pool.query(
            `SELECT id FROM regions WHERE LOWER(name) = LOWER($1)`,
            [regionKey]
        );
        if (regionResult.rows.length === 0) {
            const newRegion = await pool.query(
                `INSERT INTO regions (name, sort_order) VALUES ($1, 0) RETURNING id`,
                [regionKey]
            );
            regionId = newRegion.rows[0].id;
            console.log(`➕ Создан новый регион: "${regionKey}" (ID ${regionId})`);
        } else {
            regionId = regionResult.rows[0].id;
        }
    }

    const newCity = await pool.query(
        `INSERT INTO cities (name, region_id, is_popular, sort_order)
         VALUES ($1, $2, false, 0)
         RETURNING id`,
        [normalizedCity, regionId]
    );
    const id = newCity.rows[0].id;
    cityCache.set(cacheKey, id);
    console.log(`➕ Создан новый город: "${normalizedCity}" (регион: ${regionKey || 'без региона'}, ID ${id})`);
    return id;
}

const FINAL_DIR = path.join(__dirname, '../public/uploads/topnlab');

async function ensureDirs() {
    await fsPromises.mkdir(FINAL_DIR, { recursive: true });
}

async function downloadImageWithRetry(url, filename, retries = 2) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                timeout: 30000,
            });
            const filePath = path.join(FINAL_DIR, filename);
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            return true;
        } catch (err) {
            if (attempt === retries) {
                console.warn(`⚠️ Не удалось загрузить ${url} после ${retries} попыток:`, err.message);
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    return false;
}

// ===== ФУНКЦИЯ ЗАГРУЗКИ ФОТО (С ТРАНЗАКЦИЕЙ) =====
async function downloadPhotosInParallel(items, concurrency = 5) {
    for (const item of items) {
        const { externalId, images, listingId } = item;
        const imageUrls = Array.isArray(images) ? images : (images ? [images] : []);
        const limited = imageUrls.slice(0, 10);
        const downloaded = [];

        for (let i = 0; i < limited.length; i++) {
            const url = limited[i];
            const filename = `${externalId}_${i}.jpg`;
            const success = await downloadImageWithRetry(url, filename);
            if (success) {
                downloaded.push({ filename, url });
            }
        }

        if (downloaded.length === 0) {
            continue;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM listing_media WHERE listing_id = $1', [listingId]);

            for (let i = 0; i < downloaded.length; i++) {
                const filePath = `/uploads/topnlab/${downloaded[i].filename}`;
                const check = await client.query(
                    `SELECT id FROM listing_media WHERE listing_id = $1 AND file_path = $2`,
                    [listingId, filePath]
                );
                if (check.rows.length === 0) {
                    await client.query(
                        `INSERT INTO listing_media (listing_id, file_path, file_order, media_type, file_type, created_at)
                         VALUES ($1, $2, $3, $4, $5, NOW())`,
                        [listingId, filePath, i, 'image', 'image']
                    );
                } else {
                    console.warn(`⚠️ Файл ${filePath} уже существует для объявления ${listingId}, пропускаем вставку`);
                }
            }

            await client.query('COMMIT');
            console.log(`✅ Фото обновлены для ${listingId} (${downloaded.length} шт.)`);
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(`❌ Ошибка обновления фото для ${listingId}:`, err.message);
        } finally {
            client.release();
        }
    }
}

// ===== ОСНОВНАЯ ФУНКЦИЯ ИМПОРТА (ИСПРАВЛЕННАЯ) =====
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

        const userProfile = await pool.query(
            'SELECT phone, whatsapp, telegram FROM users WHERE id = $1',
            [PARTNER_USER_ID]
        );
        const userContacts = userProfile.rows[0] || {};

        const externalIds = [];
        const processedOffers = [];

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
            const categoryId = getCategoryId(offer);

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

            processedOffers.push({
                externalId: internalId,
                title,
                description,
                price: priceValue,
                currency,
                region: regionName,
                city: cityName,
                address,
                lat,
                lng,
                type,
                categoryId,
                cityId,
                phone: finalPhone,
                whatsapp: finalWhatsapp,
                telegram: finalTelegram,
                showPhone,
                showWhatsapp,
                showTelegram,
                extraFields: JSON.stringify(extraFields),
                images,
            });
        }

        if (externalIds.length === 0) {
            console.warn('⚠️ Нет объявлений с internal-id, пропускаем');
            return;
        }

        const existingResult = await pool.query(
            `SELECT external_id, id FROM listings WHERE source = 'topnlab' AND external_id = ANY($1)`,
            [externalIds]
        );
        const existingMap = new Map();
        existingResult.rows.forEach(row => {
            existingMap.set(row.external_id, row.id);
        });

        const newOffers = [];
        const updateOffers = [];
        for (const offer of processedOffers) {
            if (existingMap.has(offer.externalId)) {
                offer.listingId = existingMap.get(offer.externalId);
                updateOffers.push(offer);
            } else {
                newOffers.push(offer);
            }
        }

        console.log(`🆕 Новых: ${newOffers.length}, 🔄 Обновляемых: ${updateOffers.length}`);

        // ---- Массовое обновление (без изменения updated_at) ----
        if (updateOffers.length > 0) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                await client.query(`
                    CREATE TEMP TABLE tmp_listings_update (
                        external_id VARCHAR(255) PRIMARY KEY,
                        title TEXT,
                        description TEXT,
                        price NUMERIC,
                        currency VARCHAR(10),
                        region VARCHAR(255),
                        city VARCHAR(255),
                        address TEXT,
                        latitude NUMERIC,
                        longitude NUMERIC,
                        type VARCHAR(20),
                        category_id INTEGER,
                        city_id INTEGER,
                        phone VARCHAR(20),
                        whatsapp VARCHAR(20),
                        telegram VARCHAR(20),
                        show_phone BOOLEAN,
                        show_whatsapp BOOLEAN,
                        show_telegram BOOLEAN,
                        extra_data JSONB
                    )
                `);

                const values = updateOffers.map(o => [
                    o.externalId,
                    o.title,
                    o.description,
                    o.price,
                    o.currency,
                    o.region,
                    o.city,
                    o.address,
                    o.lat,
                    o.lng,
                    o.type,
                    o.categoryId,
                    o.cityId,
                    o.phone,
                    o.whatsapp,
                    o.telegram,
                    o.showPhone,
                    o.showWhatsapp,
                    o.showTelegram,
                    o.extraFields,
                ]);

                const placeholders = values.map((_, i) => 
                    `($${i * 20 + 1}, $${i * 20 + 2}, $${i * 20 + 3}, $${i * 20 + 4}, $${i * 20 + 5}, $${i * 20 + 6}, $${i * 20 + 7}, $${i * 20 + 8}, $${i * 20 + 9}, $${i * 20 + 10}, $${i * 20 + 11}, $${i * 20 + 12}, $${i * 20 + 13}, $${i * 20 + 14}, $${i * 20 + 15}, $${i * 20 + 16}, $${i * 20 + 17}, $${i * 20 + 18}, $${i * 20 + 19}, $${i * 20 + 20})`
                ).join(',');

                const flatValues = values.flat();
                await client.query(`
                    INSERT INTO tmp_listings_update (
                        external_id, title, description, price, currency, region, city, address,
                        latitude, longitude, type, category_id, city_id, phone, whatsapp, telegram,
                        show_phone, show_whatsapp, show_telegram, extra_data
                    ) VALUES ${placeholders}
                `, flatValues);

                await client.query(`
                    UPDATE listings AS l
                    SET
                        title = tmp.title,
                        description = tmp.description,
                        price = tmp.price,
                        currency = tmp.currency,
                        region = tmp.region,
                        city = tmp.city,
                        address = tmp.address,
                        latitude = tmp.latitude,
                        longitude = tmp.longitude,
                        type = tmp.type,
                        category_id = tmp.category_id,
                        city_id = tmp.city_id,
                        phone = tmp.phone,
                        whatsapp = tmp.whatsapp,
                        telegram = tmp.telegram,
                        show_phone = tmp.show_phone,
                        show_whatsapp = tmp.show_whatsapp,
                        show_telegram = tmp.show_telegram,
                        extra_data = tmp.extra_data,
                        status = 'active',
                        archived_at = NULL
                    FROM tmp_listings_update AS tmp
                    WHERE l.external_id = tmp.external_id AND l.source = 'topnlab'
                `);

                await client.query('COMMIT');
                stats.updated = updateOffers.length;
                console.log(`✅ Обновлено ${stats.updated} объявлений (массово, без изменения updated_at)`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error('❌ Ошибка массового обновления:', err.message);
                stats.errors += updateOffers.length;
            } finally {
                client.release();
            }
        }

        // ---- Массовая вставка новых (ИСПРАВЛЕНА) ----
        if (newOffers.length > 0) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                const values = newOffers.map(o => [
                    o.externalId,
                    o.title,
                    o.description,
                    o.price,
                    o.currency,
                    o.region,
                    o.city,
                    o.address,
                    o.lat,
                    o.lng,
                    o.type,
                    PARTNER_USER_ID,
                    'topnlab',
                    o.categoryId,
                    o.cityId,
                    o.phone,
                    o.whatsapp,
                    o.telegram,
                    o.showPhone,
                    o.showWhatsapp,
                    o.showTelegram,
                    o.extraFields,
                    'active',              // status
                    new Date(),            // created_at
                    new Date()             // updated_at
                ]);

                // 25 параметров на запись
                const placeholders = values.map((_, i) => 
                    `($${i * 25 + 1}, $${i * 25 + 2}, $${i * 25 + 3}, $${i * 25 + 4}, $${i * 25 + 5}, $${i * 25 + 6}, $${i * 25 + 7}, $${i * 25 + 8}, $${i * 25 + 9}, $${i * 25 + 10}, $${i * 25 + 11}, $${i * 25 + 12}, $${i * 25 + 13}, $${i * 25 + 14}, $${i * 25 + 15}, $${i * 25 + 16}, $${i * 25 + 17}, $${i * 25 + 18}, $${i * 25 + 19}, $${i * 25 + 20}, $${i * 25 + 21}, $${i * 25 + 22}, $${i * 25 + 23}, $${i * 25 + 24}, $${i * 25 + 25})`
                ).join(',');

                const flatValues = values.flat();
                const insertResult = await client.query(`
                    INSERT INTO listings (
                        external_id, title, description, price, currency, region, city, address,
                        latitude, longitude, type, user_id, source,
                        category_id, city_id,
                        phone, whatsapp, telegram,
                        show_phone, show_whatsapp, show_telegram,
                        extra_data, status, created_at, updated_at
                    ) VALUES ${placeholders}
                    RETURNING id, external_id
                `, flatValues);

                for (const row of insertResult.rows) {
                    const offer = newOffers.find(o => o.externalId === row.external_id);
                    if (offer) offer.listingId = row.id;
                }

                await client.query('COMMIT');
                stats.added = newOffers.length;
                console.log(`✅ Добавлено ${stats.added} новых объявлений (массово)`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error('❌ Ошибка массовой вставки:', err.message);
                stats.errors += newOffers.length;
            } finally {
                client.release();
            }
        }

        // ---- Архивация ----
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

        // ---- Фоновая загрузка фото ----
        const photoTasks = [];
        for (const offer of [...newOffers, ...updateOffers]) {
            if (offer.listingId && offer.images && offer.images.length > 0) {
                photoTasks.push({
                    externalId: offer.externalId,
                    listingId: offer.listingId,
                    images: offer.images,
                });
            }
        }

        if (photoTasks.length > 0) {
            console.log(`📷 Начинаем фоновую загрузку фото для ${photoTasks.length} объявлений...`);
            downloadPhotosInParallel(photoTasks, 5)
                .then(() => console.log('✅ Фото загружены успешно'))
                .catch(err => console.error('❌ Ошибка при загрузке фото:', err.message));
        }

        console.log(`[${new Date().toISOString()}] ✅ Импорт TopNLab завершён (текстовые данные)`);
        console.log(`📊 Статистика: добавлено ${stats.added}, обновлено ${stats.updated}, заархивировано ${stats.archived}, ошибок ${stats.errors}`);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Ошибка импорта TopNLab:`, error.message);
        console.error(error.stack);
    } finally {
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