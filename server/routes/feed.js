const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// ===== ПОДКЛЮЧЕНИЕ К БД =====
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ironmarket_db',
    password: process.env.DB_PASSWORD,
    port: 5432,
});

if (!process.env.DB_PASSWORD) {
    console.error('❌ DB_PASSWORD не задан в .env');
    process.exit(1);
}

// Список email агентства "Семья"
const AGENCY_EMAILS = [
    '1001_kniga@mail.ru',
    'fatima.oganesyants@bk.ru',
    'cool.gayka.91@mail.ru',
    'efimkinan@mail.ru',
    'fatimkat20@gmail.com',
    'tomaeva.madina@icloud.com',
    'vanieva.sofya@mail.ru',
    'larisa_butaeva1966@mail.ru',
    'Dzusoevruslan0414@mail.ru',
    'Olga.1887@mail.ru',
    's_vataeva@mail.ru',
    'z.elkanova@gmail.com',
    'khatunasemyahv@bk.ru'
];

// Генерация фида (с таймингом)
async function generateFeed() {
    const startTime = Date.now();
    console.log('🔄 Генерация фида...');

    try {
        // Оптимизированный запрос с использованием COALESCE
        const result = await pool.query(`
            SELECT 
                l.id,
                l.title,
                l.description,
                l.price,
                l.currency,
                l.region,
                l.city,
                l.address,
                l.latitude,
                l.longitude,
                l.type,
                l.created_at,
                l.updated_at,
                l.extra_data,
                u.email,
                u.phone,
                u.username,
                COALESCE(
                    (SELECT json_agg(
                        json_build_object('path', lm.file_path, 'order', lm.file_order)
                        ORDER BY lm.file_order
                    ) FROM listing_media lm WHERE lm.listing_id = l.id),
                    '[]'::json
                ) as media
            FROM listings l
            JOIN users u ON l.user_id = u.id
            WHERE u.email = ANY($1)
              AND l.status = 'active'
            ORDER BY l.created_at DESC
        `, [AGENCY_EMAILS]);

        const listings = result.rows;
        console.log(`📊 Найдено ${listings.length} объявлений для фида`);

        // Формируем XML
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<realty-feed xmlns="http://webmaster.yandex.ru/schemas/feed/realty/2010-06">\n`;
        xml += `  <generation-date>${new Date().toISOString()}</generation-date>\n`;

        for (const listing of listings) {
            let extra = {};
            if (listing.extra_data) {
                try {
                    extra = typeof listing.extra_data === 'string' ? JSON.parse(listing.extra_data) : listing.extra_data;
                } catch (e) {
                    console.warn(`⚠️ Ошибка парсинга extra_data для ${listing.id}:`, e.message);
                }
            }

            const media = listing.media || [];

            xml += `  <offer internal-id="${listing.id}">\n`;
            xml += `    <type>${listing.type === 'sell' ? 'продажа' : listing.type === 'rent' ? 'аренда' : 'покупка'}</type>\n`;
            xml += `    <property-type>жилая</property-type>\n`;
            xml += `    <category>${escapeXml(extra.category || 'квартира')}</category>\n`;
            xml += `    <creation-date>${new Date(listing.created_at).toISOString()}</creation-date>\n`;
            xml += `    <last-update-date>${new Date(listing.updated_at).toISOString()}</last-update-date>\n`;
            xml += `    <manually-added>1</manually-added>\n`;

            // Локация
            xml += `    <location>\n`;
            xml += `      <country>Россия</country>\n`;
            xml += `      <region>${escapeXml(listing.region || '')}</region>\n`;
            xml += `      <locality-name>${escapeXml(listing.city || '')}</locality-name>\n`;
            if (listing.address) xml += `      <address>${escapeXml(listing.address)}</address>\n`;
            if (listing.latitude && listing.longitude) {
                xml += `      <latitude>${listing.latitude}</latitude>\n`;
                xml += `      <longitude>${listing.longitude}</longitude>\n`;
            }
            xml += `    </location>\n`;

            // Фото
            for (let i = 0; i < Math.min(media.length, 10); i++) {
                const m = media[i];
                const photoUrl = `https://ironads.ru${m.path}`;
                xml += `    <image>${escapeXml(photoUrl)}</image>\n`;
            }
            xml += `    <is-image-order-change-allowed>нет</is-image-order-change-allowed>\n`;

            // Агент
            xml += `    <sales-agent>\n`;
            xml += `      <name>${escapeXml(listing.username || 'АН Семья')}</name>\n`;
            if (listing.phone) xml += `      <phone>${escapeXml(listing.phone)}</phone>\n`;
            xml += `      <category>агентство</category>\n`;
            xml += `      <organization>АН Семья</organization>\n`;
            xml += `      <email>${escapeXml(listing.email || '')}</email>\n`;
            xml += `    </sales-agent>\n`;

            // Цена
            xml += `    <price>\n`;
            xml += `      <value>${listing.price || 0}</value>\n`;
            xml += `      <currency>${listing.currency || 'RUR'}</currency>\n`;
            xml += `    </price>\n`;
            xml += `    <haggle>0</haggle>\n`;
            xml += `    <deal-status>прямая продажа</deal-status>\n`;

            // Описание
            if (listing.description) {
                const desc = listing.description.replace(/<br\s*\/?>/gi, '<br />');
                xml += `    <description>${escapeXml(desc)}</description>\n`;
            }

            // Дополнительные поля недвижимости
            if (extra.area) {
                xml += `    <area>\n      <value>${extra.area}</value>\n      <unit>кв.м.</unit>\n    </area>\n`;
            }
            if (extra.living_space) {
                xml += `    <living-space>\n      <value>${extra.living_space}</value>\n      <unit>кв.м.</unit>\n    </living-space>\n`;
            }
            if (extra.rooms) {
                xml += `    <rooms>${extra.rooms}</rooms>\n`;
            }
            if (extra.floor !== undefined && extra.floor !== null) {
                xml += `    <floor>${extra.floor}</floor>\n`;
            }
            if (extra.floors_total) {
                xml += `    <floors-total>${extra.floors_total}</floors-total>\n`;
            }
            if (extra.building_type) {
                xml += `    <building-type>${escapeXml(extra.building_type)}</building-type>\n`;
            }
            if (extra.bathroom_unit) {
                xml += `    <bathroom-unit>${escapeXml(extra.bathroom_unit)}</bathroom-unit>\n`;
            }
            if (extra.renovation) {
                xml += `    <renovation>${escapeXml(extra.renovation)}</renovation>\n`;
            }
            if (extra.lot_area) {
                xml += `    <lot-area>\n      <value>${extra.lot_area}</value>\n      <unit>сотка</unit>\n    </lot-area>\n`;
            }
            if (extra.lot_type) {
                xml += `    <lot-type>${escapeXml(extra.lot_type)}</lot-type>\n`;
            }

            xml += `    <disable-flat-plan-guess>1</disable-flat-plan-guess>\n`;
            xml += `  </offer>\n`;
        }

        xml += `</realty-feed>`;

        // Сохраняем файл
        const feedPath = path.join(__dirname, '../public/feed/realty.xml');
        const feedDir = path.dirname(feedPath);
        if (!fs.existsSync(feedDir)) fs.mkdirSync(feedDir, { recursive: true });
        fs.writeFileSync(feedPath, xml, 'utf8');

        const elapsed = Date.now() - startTime;
        console.log(`✅ Фид сохранён (${listings.length} объявлений) за ${elapsed} мс`);
        return true;
    } catch (err) {
        console.error('❌ Ошибка генерации фида:', err.message);
        console.error(err.stack);
        return false;
    }
}

function escapeXml(str) {
    if (!str) return '';
    return str.replace(/[<>&'"]/g, function(m) {
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '&') return '&amp;';
        if (m === "'") return '&apos;';
        if (m === '"') return '&quot;';
        return m;
    });
}

// Маршрут для доступа к фиду
router.get('/realty.xml', (req, res) => {
    const feedPath = path.join(__dirname, '../public/feed/realty.xml');
    if (fs.existsSync(feedPath)) {
        res.set('Content-Type', 'application/xml');
        res.sendFile(feedPath);
    } else {
        res.status(404).send('Фид ещё не сгенерирован');
    }
});

// Маршрут для принудительной генерации (только для админов)
router.post('/realty/generate', async (req, res) => {
    const result = await generateFeed();
    if (result) {
        res.json({ success: true, message: 'Фид обновлён' });
    } else {
        res.status(500).json({ success: false, message: 'Ошибка генерации' });
    }
});

module.exports = router;
module.exports.generateFeed = generateFeed;