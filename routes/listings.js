const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pool = require('../db/pool');
const { auth } = require('../middleware/auth');
const { logUserAction } = require('../utils/audit');
const router = express.Router();

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const allowedImageTypes = [
    'image/jpeg', 'image/jpg', 'image/png',
    'image/gif', 'image/webp',
    'image/heic', 'image/heif'
];
const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg'];

const fileFilter = (req, file, cb) => {
    const mimeType = file.mimetype.toLowerCase();
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedImageTypes.includes(mimeType) || allowedVideoTypes.includes(mimeType)) {
        cb(null, true);
    } else if (['.heic', '.heif'].includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Неподдерживаемый формат файла. Разрешены: JPEG, PNG, GIF, WebP, HEIC, HEIF, MP4, WebM, OGG.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 100 * 1024 * 1024, files: 15 }
});

const multerErrorHandler = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Файл слишком большой. Максимум 100 МБ.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Можно загрузить не более 15 файлов.' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: 'Неожиданное поле файла. Проверьте имя поля.' });
        }
        return res.status(400).json({ error: 'Ошибка загрузки файла: ' + err.message });
    }
    if (err) {
        return res.status(400).json({ error: err.message || 'Ошибка загрузки' });
    }
    next();
};

async function processImage(filePath, originalName) {
    try {
        const outputPath = filePath.replace(/\.[^.]+$/, '.webp');
        console.log(`🔄 Обработка изображения: ${originalName} → ${path.basename(outputPath)}`);
        const pipeline = sharp(filePath);
        pipeline.withMetadata(false);
        pipeline.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true });
        await pipeline.webp({ quality: 75, effort: 4 }).toFile(outputPath);
        fs.unlinkSync(filePath);
        const newFileName = path.basename(outputPath);
        const newSize = fs.statSync(outputPath).size / 1024 / 1024;
        console.log(`✅ Обработано: ${newFileName}, размер: ${newSize.toFixed(2)} МБ`);
        return {
            path: outputPath,
            filename: newFileName,
            originalname: originalName.replace(/\.[^.]+$/, '.webp'),
            mimetype: 'image/webp'
        };
    } catch (err) {
        console.error('⚠️ Ошибка обработки изображения:', err.message);
        return {
            path: filePath,
            filename: path.basename(filePath),
            originalname: originalName,
            mimetype: 'image/jpeg'
        };
    }
}

function fillContactsFromProfile(listing, user) {
    if (!listing.phone && user.phone) {
        listing.phone = user.phone;
    }
    if (!listing.whatsapp && user.whatsapp) {
        listing.whatsapp = user.whatsapp;
    }
    if (!listing.telegram && user.telegram) {
        listing.telegram = user.telegram;
    }
    if (listing.phone && listing.show_phone === undefined) {
        listing.show_phone = true;
    }
    if (listing.whatsapp && listing.show_whatsapp === undefined) {
        listing.show_whatsapp = true;
    }
    if (listing.telegram && listing.show_telegram === undefined) {
        listing.show_telegram = true;
    }
    return listing;
}

async function getAllDescendantCategoryIds(categoryId) {
    if (!categoryId) return [];
    const result = await pool.query(`
        WITH RECURSIVE descendants AS (
            SELECT id FROM categories WHERE id = $1
            UNION ALL
            SELECT c.id FROM categories c
            JOIN descendants d ON c.parent_id = d.id
            WHERE c.is_active = true
        )
        SELECT id FROM descendants
    `, [categoryId]);
    return result.rows.map(row => row.id);
}

// ========== ПУБЛИЧНЫЙ МАРШРУТ ДЛЯ ПРОСМОТРОВ ==========
router.get('/:id/views', async (req, res) => {
    const listingId = req.params.id;
    try {
        const listingCheck = await pool.query(
            'SELECT id FROM listings WHERE id = $1 AND deleted_at IS NULL AND (status = \'active\' OR status IS NULL)',
            [listingId]
        );
        if (listingCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Объявление не найдено' });
        }
        const viewsTotal = await pool.query(
            'SELECT COUNT(*) FROM view_history WHERE listing_id = $1',
            [listingId]
        );
        res.json({
            listing_id: listingId,
            views: parseInt(viewsTotal.rows[0].count)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения просмотров' });
    }
});

// ========== ПРИВАТНАЯ СТАТИСТИКА (ТОЛЬКО ДЛЯ ВЛАДЕЛЬЦА) ==========
router.get('/:id/stats', auth, async (req, res) => {
    const listingId = req.params.id;
    const userId = req.userId;

    try {
        const listingCheck = await pool.query(
            'SELECT id FROM listings WHERE id = $1 AND user_id = $2',
            [listingId, userId]
        );
        if (listingCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Нет доступа к статистике этого объявления' });
        }

        // 1. Просмотры
        const viewsTotal = await pool.query(
            'SELECT COUNT(*) FROM view_history WHERE listing_id = $1',
            [listingId]
        );
        const viewsWeek = await pool.query(
            `SELECT COUNT(*) FROM view_history 
             WHERE listing_id = $1 AND viewed_at >= NOW() - INTERVAL '7 days'`,
            [listingId]
        );
        const viewsMonth = await pool.query(
            `SELECT COUNT(*) FROM view_history 
             WHERE listing_id = $1 AND viewed_at >= NOW() - INTERVAL '30 days'`,
            [listingId]
        );
        const viewsDaily = await pool.query(
            `SELECT DATE(viewed_at) as date, COUNT(*) as count
             FROM view_history
             WHERE listing_id = $1 AND viewed_at >= NOW() - INTERVAL '7 days'
             GROUP BY DATE(viewed_at)
             ORDER BY date ASC`,
            [listingId]
        );

        // 2. Контакты (с разделением на show/copy)
        const contacts = await pool.query(
            `SELECT contact_type, action, COUNT(*) as count
             FROM contact_requests
             WHERE listing_id = $1
             GROUP BY contact_type, action`,
            [listingId]
        );
        const contactsMap = {
            phone: { show: 0, copy: 0 },
            whatsapp: 0,
            telegram: 0
        };
        contacts.rows.forEach(row => {
            if (row.contact_type === 'phone') {
                if (row.action === 'show') contactsMap.phone.show = parseInt(row.count);
                else if (row.action === 'copy') contactsMap.phone.copy = parseInt(row.count);
            } else if (row.contact_type === 'whatsapp') {
                contactsMap.whatsapp = parseInt(row.count);
            } else if (row.contact_type === 'telegram') {
                contactsMap.telegram = parseInt(row.count);
            }
        });

        // 3. Избранное
        const favoritesCount = await pool.query(
            'SELECT COUNT(*) FROM favorites WHERE listing_id = $1',
            [listingId]
        );

        // 4. Сообщения (если есть таблица)
        let messagesCount = 0;
        try {
            const messagesRes = await pool.query(
                `SELECT COUNT(*) FROM messages 
                 WHERE chat_id IN (SELECT id FROM chats WHERE listing_id = $1)`,
                [listingId]
            );
            messagesCount = parseInt(messagesRes.rows[0].count);
        } catch (e) {}

        res.json({
            listing_id: listingId,
            views: {
                total: parseInt(viewsTotal.rows[0].count),
                week: parseInt(viewsWeek.rows[0].count),
                month: parseInt(viewsMonth.rows[0].count),
                daily: viewsDaily.rows.map(row => ({ date: row.date, count: parseInt(row.count) }))
            },
            contacts: contactsMap,
            favorites: parseInt(favoritesCount.rows[0].count),
            messages: messagesCount
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// ========== ОСТАЛЬНЫЕ МАРШРУТЫ (БЕЗ ИЗМЕНЕНИЙ) ==========

router.get('/filter', async (req, res) => {
    const {
        category_id,
        min_price,
        max_price,
        search,
        city_id,
        region_id,
        type,
        lat,
        lng,
        radius,
        sort,
        page = 1,
        limit = 12
    } = req.query;

    let categoryIds = [];
    if (category_id && category_id !== 'all') {
        categoryIds = await getAllDescendantCategoryIds(category_id);
        if (categoryIds.length === 0) {
            return res.json({ listings: [], pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 } });
        }
    }

    let countQuery = `
        SELECT COUNT(*) as total
        FROM listings l
        JOIN users u ON l.user_id = u.id
        WHERE (l.status = 'active' OR l.status IS NULL)
          AND u.is_blocked = false
          AND u.deleted_at IS NULL
          AND l.deleted_at IS NULL
    `;

    let dataQuery = `
        SELECT l.*,
               u.username,
               u.phone as user_phone,
               u.whatsapp as user_whatsapp,
               u.telegram as user_telegram,
               (EXTRACT(EPOCH FROM NOW() - u.last_seen) < 300) as is_online,
               c.name as category_name,
               c.icon as category_icon,
               cit.name as city_name,
               ST_X(l.coordinates::geometry) as lng,
               ST_Y(l.coordinates::geometry) as lat,
               (SELECT json_build_object('id', m.id, 'file_path', m.file_path, 'file_type', m.file_type)
                FROM listing_media m
                WHERE m.listing_id = l.id
                ORDER BY CASE WHEN m.is_main THEN 0 ELSE 1 END, m.file_order
                LIMIT 1) as first_media
        FROM listings l
        JOIN users u ON l.user_id = u.id
        LEFT JOIN categories c ON l.category_id = c.id
        LEFT JOIN cities cit ON l.city_id = cit.id
        WHERE (l.status = 'active' OR l.status IS NULL)
          AND u.is_blocked = false
          AND u.deleted_at IS NULL
          AND l.deleted_at IS NULL
    `;

    const params = [];
    let paramIndex = 1;

    if (categoryIds.length > 0) {
        const placeholders = categoryIds.map((_, i) => `$${paramIndex + i}`).join(',');
        const cond = ` AND l.category_id IN (${placeholders})`;
        countQuery += cond;
        dataQuery += cond;
        params.push(...categoryIds);
        paramIndex += categoryIds.length;
    }

    if (min_price) {
        const cond = ` AND (l.price_max IS NULL OR l.price_max >= $${paramIndex})`;
        countQuery += cond;
        dataQuery += cond;
        params.push(min_price);
        paramIndex++;
    }
    if (max_price) {
        const cond = ` AND l.price <= $${paramIndex}`;
        countQuery += cond;
        dataQuery += cond;
        params.push(max_price);
        paramIndex++;
    }
    if (search) {
        const cond = ` AND (l.title ILIKE $${paramIndex++} OR l.description ILIKE $${paramIndex++})`;
        countQuery += cond;
        dataQuery += cond;
        params.push(`%${search}%`, `%${search}%`);
    }
    if (city_id && city_id !== 'all' && city_id !== 'undefined') {
        const cond = ` AND l.city_id = $${paramIndex++}`;
        countQuery += cond;
        dataQuery += cond;
        params.push(city_id);
    } else if (region_id && region_id !== 'all' && region_id !== 'undefined') {
        const cond = ` AND l.city_id IN (SELECT id FROM cities WHERE region_id = $${paramIndex++})`;
        countQuery += cond;
        dataQuery += cond;
        params.push(region_id);
    }
    if (type && type !== 'all' && type !== 'undefined') {
        const cond = ` AND l.type = $${paramIndex++}`;
        countQuery += cond;
        dataQuery += cond;
        params.push(type);
    }
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        const radiusKm = parseFloat(radius) || 10;
        const cond = ` AND ST_DWithin(l.coordinates, ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex+1}), 4326)::geography, $${paramIndex+2} * 1000)`;
        countQuery += cond;
        dataQuery += cond;
        params.push(parseFloat(lng), parseFloat(lat), radiusKm);
        paramIndex += 3;
    }

    let total = 0;
    try {
        const countResult = await pool.query(countQuery, params);
        total = parseInt(countResult.rows[0]?.total) || 0;
    } catch (err) {
        console.error('❌ Ошибка подсчёта объявлений:', err);
        return res.status(500).json({ error: 'Ошибка подсчёта объявлений' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let orderClause = '';
    const validSorts = {
        'date_desc': 'ORDER BY COALESCE(l.updated_at, l.created_at) DESC',
        'date_asc': 'ORDER BY COALESCE(l.updated_at, l.created_at) ASC',
        'price_asc': 'ORDER BY l.price ASC NULLS LAST',
        'price_desc': 'ORDER BY l.price DESC NULLS LAST',
        'distance': ''
    };

    if (lat && lng && !isNaN(lat) && !isNaN(lng) && sort === 'distance') {
        orderClause = `ORDER BY ST_Distance(l.coordinates, ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex+1}), 4326)::geography) ASC`;
        params.push(parseFloat(lng), parseFloat(lat));
        paramIndex += 2;
    } else if (sort && validSorts[sort]) {
        orderClause = validSorts[sort];
    } else {
        orderClause = validSorts['date_desc'];
    }

    dataQuery += ` ${orderClause} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), offset);

    try {
        const result = await pool.query(dataQuery, params);
        const listings = result.rows.map(row => {
            const user = {
                phone: row.user_phone,
                whatsapp: row.user_whatsapp,
                telegram: row.user_telegram
            };
            delete row.user_phone;
            delete row.user_whatsapp;
            delete row.user_telegram;
            return fillContactsFromProfile(row, user);
        });
        res.json({
            listings,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('❌ Ошибка выполнения запроса объявлений:', err);
        res.status(500).json({ error: 'Ошибка загрузки объявлений' });
    }
});

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT l.*, u.username, u.phone as user_phone, u.whatsapp as user_whatsapp, u.telegram as user_telegram,
                   (EXTRACT(EPOCH FROM NOW() - u.last_seen) < 300) as is_online,
                   c.name as category_name, c.icon as category_icon,
                   cit.name as city_name,
                   ST_X(l.coordinates::geometry) as lng,
                   ST_Y(l.coordinates::geometry) as lat
            FROM listings l
            JOIN users u ON l.user_id = u.id
            LEFT JOIN categories c ON l.category_id = c.id
            LEFT JOIN cities cit ON l.city_id = cit.id
            WHERE (l.status = 'active' OR l.status IS NULL)
              AND u.deleted_at IS NULL
              AND l.deleted_at IS NULL
            ORDER BY COALESCE(l.updated_at, l.created_at) DESC
        `);
        const listings = result.rows.map(row => {
            const user = {
                phone: row.user_phone,
                whatsapp: row.user_whatsapp,
                telegram: row.user_telegram
            };
            delete row.user_phone;
            delete row.user_whatsapp;
            delete row.user_telegram;
            return fillContactsFromProfile(row, user);
        });
        res.json(listings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/my', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT l.*, c.name as category_name, c.icon as category_icon,
                   cit.name as city_name,
                   b.last_bump_at, b.bump_count,
                   ST_X(l.coordinates::geometry) as lng,
                   ST_Y(l.coordinates::geometry) as lat,
                   (SELECT json_build_object('id', m.id, 'file_path', m.file_path, 'file_type', m.file_type)
                    FROM listing_media m
                    WHERE m.listing_id = l.id
                    ORDER BY CASE WHEN m.is_main THEN 0 ELSE 1 END, m.file_order
                    LIMIT 1) as first_media
            FROM listings l
            LEFT JOIN categories c ON l.category_id = c.id
            LEFT JOIN cities cit ON l.city_id = cit.id
            LEFT JOIN listing_bumps b ON l.id = b.listing_id
            WHERE l.user_id = $1
              AND (l.status = 'active' OR l.status IS NULL)
              AND l.deleted_at IS NULL
            ORDER BY l.updated_at DESC
        `, [req.userId]);
        const userProfile = await pool.query('SELECT phone, whatsapp, telegram FROM users WHERE id = $1', [req.userId]);
        const user = userProfile.rows[0] || {};
        const listings = result.rows.map(row => fillContactsFromProfile(row, user));
        res.json(listings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/my/archived', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT l.*, c.name as category_name, c.icon as category_icon,
                   cit.name as city_name
            FROM listings l
            LEFT JOIN categories c ON l.category_id = c.id
            LEFT JOIN cities cit ON l.city_id = cit.id
            WHERE l.user_id = $1
              AND l.status = 'archived'
              AND l.deleted_at IS NULL
            ORDER BY l.updated_at DESC
        `, [req.userId]);
        const userProfile = await pool.query('SELECT phone, whatsapp, telegram FROM users WHERE id = $1', [req.userId]);
        const user = userProfile.rows[0] || {};
        const listings = result.rows.map(row => fillContactsFromProfile(row, user));
        res.json(listings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        let isModerator = false;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded.userId;
                const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
                if (userResult.rows.length && (userResult.rows[0].role === 'admin' || userResult.rows[0].role === 'moderator')) {
                    isModerator = true;
                }
            } catch(e) { }
        }

        let query = `
            SELECT l.*, u.username, u.last_seen, u.is_blocked,
                   u.phone as user_phone, u.whatsapp as user_whatsapp, u.telegram as user_telegram,
                   (EXTRACT(EPOCH FROM NOW() - u.last_seen) < 300) as is_online,
                   c.name as category_name, c.icon as category_icon,
                   cit.name as city_name,
                   ST_X(l.coordinates::geometry) as lng,
                   ST_Y(l.coordinates::geometry) as lat
            FROM listings l
            JOIN users u ON l.user_id = u.id
            LEFT JOIN categories c ON l.category_id = c.id
            LEFT JOIN cities cit ON l.city_id = cit.id
            WHERE l.id = $1
              AND u.deleted_at IS NULL
              AND l.deleted_at IS NULL
        `;
        if (!isModerator) {
            query += ` AND (l.status = 'active' OR l.status IS NULL) AND u.is_blocked = false`;
        }
        const result = await pool.query(query, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Объявление не найдено' });

        const mediaResult = await pool.query(`
            SELECT id, file_path, file_type, file_order, is_main
            FROM listing_media
            WHERE listing_id = $1
            ORDER BY CASE WHEN is_main THEN 0 ELSE 1 END, file_order
        `, [req.params.id]);
        const listing = result.rows[0];
        listing.media = mediaResult.rows;

        const user = {
            phone: listing.user_phone,
            whatsapp: listing.user_whatsapp,
            telegram: listing.user_telegram
        };
        delete listing.user_phone;
        delete listing.user_whatsapp;
        delete listing.user_telegram;
        fillContactsFromProfile(listing, user);

        res.json(listing);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/', auth, upload.array('media', 12), async (req, res) => {
    console.log('📥 POST /listings - начало обработки');
    const { 
        title, price, price_max, description, 
        category_id, city_id, type, lat, lng,
        phone, whatsapp, telegram,
        show_phone, show_whatsapp, show_telegram
    } = req.body;
    const userId = req.userId;
    if (!title || !price) return res.status(400).json({ error: 'Название и цена (от) обязательны' });
    const listingType = type || 'sell';

    if (price_max && parseFloat(price_max) < parseFloat(price)) {
        return res.status(400).json({ error: 'Максимальная цена не может быть меньше минимальной' });
    }
    const priceMax = price_max && price_max !== '' ? parseFloat(price_max) : null;

    let coordinates = null;
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        coordinates = `ST_SetSRID(ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)}), 4326)`;
    }

    let finalPhone = phone || null;
    let finalWhatsapp = whatsapp || null;
    let finalTelegram = telegram || null;
    let finalShowPhone = (show_phone === 'true' || show_phone === true);
    let finalShowWhatsapp = (show_whatsapp === 'true' || show_whatsapp === true);
    let finalShowTelegram = (show_telegram === 'true' || show_telegram === true);

    if (!finalPhone && !finalWhatsapp && !finalTelegram) {
        try {
            const userProfile = await pool.query('SELECT phone, whatsapp, telegram FROM users WHERE id = $1', [userId]);
            if (userProfile.rows.length > 0) {
                const u = userProfile.rows[0];
                finalPhone = finalPhone || u.phone;
                finalWhatsapp = finalWhatsapp || u.whatsapp;
                finalTelegram = finalTelegram || u.telegram;
                if (u.phone) finalShowPhone = true;
                if (u.whatsapp) finalShowWhatsapp = true;
                if (u.telegram) finalShowTelegram = true;
            }
        } catch(err) { console.warn('Не удалось получить контакты профиля:', err); }
    }

    const processedFiles = [];
    if (req.files && req.files.length > 0) {
        console.log(`📎 Получено ${req.files.length} файлов`);
        for (const file of req.files) {
            const ext = path.extname(file.originalname).toLowerCase();
            const mime = file.mimetype.toLowerCase();
            if (allowedImageTypes.includes(mime) || ['.heic', '.heif'].includes(ext)) {
                const processed = await processImage(file.path, file.originalname);
                processedFiles.push(processed);
            } else {
                processedFiles.push({
                    path: file.path,
                    filename: file.filename,
                    originalname: file.originalname,
                    mimetype: file.mimetype
                });
            }
        }
    }

    try {
        const result = await pool.query(`
            INSERT INTO listings (
                title, price, price_max, description, category_id, user_id, city_id, type, status,
                coordinates, created_at, updated_at,
                phone, whatsapp, telegram, show_phone, show_whatsapp, show_telegram
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 'active',
                ${coordinates || 'NULL'}, NOW(), NOW(),
                $9, $10, $11, $12, $13, $14
            )
            RETURNING id
        `, [
            title, price, priceMax, description, category_id || null, userId, city_id || null, listingType,
            finalPhone, finalWhatsapp, finalTelegram,
            finalShowPhone, finalShowWhatsapp, finalShowTelegram
        ]);
        const listingId = result.rows[0].id;
        if (processedFiles.length > 0) {
            for (let i = 0; i < processedFiles.length; i++) {
                const file = processedFiles[i];
                const fileType = file.mimetype.startsWith('image/') ? 'image' : 'video';
                const isMain = (i === 0);
                await pool.query(`
                    INSERT INTO listing_media (listing_id, file_path, file_type, file_order, is_main)
                    VALUES ($1, $2, $3, $4, $5)
                `, [listingId, `/uploads/${file.filename}`, fileType, i, isMain]);
            }
        }
        await logUserAction(userId, 'create_listing', { listingId, type: listingType }, req);
        console.log(`✅ Объявление создано: ${listingId}`);
        res.status(201).json({ id: listingId, message: 'Объявление создано' });
    } catch (err) {
        console.error('❌ Ошибка создания:', err);
        res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
    }
}, multerErrorHandler);

router.post('/:id/archive', auth, async (req, res) => {
    const userId = req.userId;
    const listingId = req.params.id;
    try {
        const listing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [listingId]);
        if (listing.rows.length === 0) return res.status(404).json({ error: 'Объявление не найдено' });
        if (listing.rows[0].user_id !== userId) return res.status(403).json({ error: 'Нет прав' });
        await pool.query(`UPDATE listings SET status = 'archived', updated_at = NOW() WHERE id = $1`, [listingId]);
        await logUserAction(userId, 'archive_listing', { listingId }, req);
        res.json({ message: 'Объявление перемещено в архив' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/:id/restore', auth, async (req, res) => {
    const userId = req.userId;
    const listingId = req.params.id;
    try {
        const listing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [listingId]);
        if (listing.rows.length === 0) return res.status(404).json({ error: 'Объявление не найдено' });
        if (listing.rows[0].user_id !== userId) return res.status(403).json({ error: 'Нет прав' });
        await pool.query(`UPDATE listings SET status = 'active', updated_at = NOW() WHERE id = $1`, [listingId]);
        await logUserAction(userId, 'restore_listing', { listingId }, req);
        res.json({ message: 'Объявление восстановлено' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.put('/:id', auth, (req, res, next) => {
    upload.array('media', 10)(req, res, (err) => {
        if (err) {
            return multerErrorHandler(err, req, res, next);
        }
        next();
    });
}, async (req, res) => {
    console.log(`📥 PUT /listings/${req.params.id} - начало обработки`);
    const { 
        title, price, price_max, description, 
        category_id, city_id, type, lat, lng,
        phone, whatsapp, telegram,
        show_phone, show_whatsapp, show_telegram
    } = req.body;
    const userId = req.userId;
    const listingId = req.params.id;
    try {
        const listing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [listingId]);
        if (listing.rows.length === 0) return res.status(404).json({ error: 'Объявление не найдено' });
        if (listing.rows[0].user_id !== userId) return res.status(403).json({ error: 'Нет прав на редактирование' });

        if (price_max && parseFloat(price_max) < parseFloat(price)) {
            return res.status(400).json({ error: 'Максимальная цена не может быть меньше минимальной' });
        }
        const priceMax = price_max && price_max !== '' ? parseFloat(price_max) : null;

        const listingType = type || 'sell';
        let coordinates = null;
        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
            coordinates = `ST_SetSRID(ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)}), 4326)`;
        }

        const finalPhone = phone !== undefined ? phone : null;
        const finalWhatsapp = whatsapp !== undefined ? whatsapp : null;
        const finalTelegram = telegram !== undefined ? telegram : null;
        const finalShowPhone = show_phone !== undefined ? (show_phone === 'true' || show_phone === true) : null;
        const finalShowWhatsapp = show_whatsapp !== undefined ? (show_whatsapp === 'true' || show_whatsapp === true) : null;
        const finalShowTelegram = show_telegram !== undefined ? (show_telegram === 'true' || show_telegram === true) : null;

        await pool.query(`
            UPDATE listings
            SET 
                title = $1, 
                price = $2, 
                price_max = $3, 
                description = $4, 
                category_id = $5, 
                city_id = $6, 
                type = $7,
                coordinates = ${coordinates || 'NULL'},
                updated_at = NOW(),
                phone = COALESCE($9, phone),
                whatsapp = COALESCE($10, whatsapp),
                telegram = COALESCE($11, telegram),
                show_phone = COALESCE($12, show_phone),
                show_whatsapp = COALESCE($13, show_whatsapp),
                show_telegram = COALESCE($14, show_telegram)
            WHERE id = $8
        `, [
            title, price, priceMax, description, 
            category_id || null, city_id || null, listingType, 
            listingId,
            finalPhone, finalWhatsapp, finalTelegram,
            finalShowPhone, finalShowWhatsapp, finalShowTelegram
        ]);

        if (req.files && req.files.length > 0) {
            console.log(`📎 Получено ${req.files.length} файлов для обновления`);
            const mediaResult = await pool.query('SELECT COUNT(*) as count FROM listing_media WHERE listing_id = $1', [listingId]);
            let order = parseInt(mediaResult.rows[0].count);
            const processedFiles = [];
            for (const file of req.files) {
                const ext = path.extname(file.originalname).toLowerCase();
                const mime = file.mimetype.toLowerCase();
                if (allowedImageTypes.includes(mime) || ['.heic', '.heif'].includes(ext)) {
                    const processed = await processImage(file.path, file.originalname);
                    processedFiles.push(processed);
                } else {
                    processedFiles.push({
                        path: file.path,
                        filename: file.filename,
                        originalname: file.originalname,
                        mimetype: file.mimetype
                    });
                }
            }
            for (const file of processedFiles) {
                const fileType = file.mimetype.startsWith('image/') ? 'image' : 'video';
                await pool.query(`
                    INSERT INTO listing_media (listing_id, file_path, file_type, file_order, is_main)
                    VALUES ($1, $2, $3, $4, $5)
                `, [listingId, `/uploads/${file.filename}`, fileType, order++, false]);
            }
        }

        await logUserAction(userId, 'edit_listing', { listingId }, req);
        console.log(`✅ Объявление обновлено: ${listingId}`);
        res.json({ message: 'Объявление обновлено' });
    } catch (err) {
        console.error('❌ Ошибка обновления:', err);
        res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
    }
});

router.delete('/media/:mediaId', auth, async (req, res) => {
    const mediaId = req.params.mediaId;
    const userId = req.userId;
    try {
        const media = await pool.query(`
            SELECT m.*, l.user_id
            FROM listing_media m
            JOIN listings l ON m.listing_id = l.id
            WHERE m.id = $1
        `, [mediaId]);
        if (media.rows.length === 0) return res.status(404).json({ error: 'Файл не найден' });
        if (media.rows[0].user_id !== userId) return res.status(403).json({ error: 'Нет прав на удаление' });
        const filePath = path.join(__dirname, '../public', media.rows[0].file_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        await pool.query('DELETE FROM listing_media WHERE id = $1', [mediaId]);
        await logUserAction(userId, 'delete_media', { mediaId }, req);
        res.json({ message: 'Файл удалён' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.put('/media/:mediaId/main', auth, async (req, res) => {
    const mediaId = req.params.mediaId;
    const userId = req.userId;
    try {
        const media = await pool.query(`
            SELECT m.listing_id, l.user_id
            FROM listing_media m
            JOIN listings l ON m.listing_id = l.id
            WHERE m.id = $1
        `, [mediaId]);
        if (media.rows.length === 0) return res.status(404).json({ error: 'Файл не найден' });
        if (media.rows[0].user_id !== userId) return res.status(403).json({ error: 'Нет прав' });
        const listingId = media.rows[0].listing_id;
        await pool.query(`UPDATE listing_media SET is_main = FALSE WHERE listing_id = $1`, [listingId]);
        await pool.query(`UPDATE listing_media SET is_main = TRUE WHERE id = $1`, [mediaId]);
        await logUserAction(userId, 'set_main_photo', { mediaId }, req);
        res.json({ message: 'Главное фото установлено' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/favorites/toggle', auth, async (req, res) => {
    const { listing_id } = req.body;
    const userId = req.userId;
    try {
        const exists = await pool.query('SELECT id FROM favorites WHERE user_id = $1 AND listing_id = $2', [userId, listing_id]);
        if (exists.rows.length > 0) {
            await pool.query('DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2', [userId, listing_id]);
            res.json({ favorited: false });
        } else {
            await pool.query('INSERT INTO favorites (user_id, listing_id) VALUES ($1, $2)', [userId, listing_id]);
            res.json({ favorited: true });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/favorites/my', auth, async (req, res) => {
    const userId = req.userId;
    try {
        const result = await pool.query(`
            SELECT l.*, c.name as category_name,
                   cit.name as city_name,
                   ST_X(l.coordinates::geometry) as lng,
                   ST_Y(l.coordinates::geometry) as lat,
                   (SELECT json_build_object('id', m.id, 'file_path', m.file_path, 'file_type', m.file_type)
                    FROM listing_media m
                    WHERE m.listing_id = l.id
                    ORDER BY CASE WHEN m.is_main THEN 0 ELSE 1 END
                    LIMIT 1) as first_media
            FROM favorites f
            JOIN listings l ON f.listing_id = l.id
            LEFT JOIN categories c ON l.category_id = c.id
            LEFT JOIN cities cit ON l.city_id = cit.id
            WHERE f.user_id = $1
              AND (l.status = 'active' OR l.status IS NULL)
              AND l.deleted_at IS NULL
            ORDER BY f.created_at DESC
        `, [userId]);
        const userProfile = await pool.query('SELECT phone, whatsapp, telegram FROM users WHERE id = $1', [userId]);
        const user = userProfile.rows[0] || {};
        const listings = result.rows.map(row => fillContactsFromProfile(row, user));
        res.json(listings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/favorites/check/:listingId', auth, async (req, res) => {
    const userId = req.userId;
    const listingId = req.params.listingId;
    try {
        const result = await pool.query('SELECT id FROM favorites WHERE user_id = $1 AND listing_id = $2', [userId, listingId]);
        res.json({ favorited: result.rows.length > 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/:id/view', auth, async (req, res) => {
    const userId = req.userId;
    const listingId = req.params.id;
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const existing = await pool.query(`
            SELECT id FROM view_history
            WHERE user_id = $1 AND listing_id = $2 AND viewed_at >= $3
        `, [userId, listingId, today]);
        if (existing.rows.length === 0) {
            await pool.query(`
                INSERT INTO view_history (user_id, listing_id, viewed_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (user_id, listing_id) DO NOTHING
            `, [userId, listingId]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/history/my', auth, async (req, res) => {
    const userId = req.userId;
    try {
        const result = await pool.query(`
            SELECT l.*, v.id as view_id, v.viewed_at, c.name as category_name,
                   cit.name as city_name,
                   ST_X(l.coordinates::geometry) as lng,
                   ST_Y(l.coordinates::geometry) as lat,
                   (SELECT json_build_object('id', m.id, 'file_path', m.file_path, 'file_type', m.file_type)
                    FROM listing_media m
                    WHERE m.listing_id = l.id
                    ORDER BY CASE WHEN m.is_main THEN 0 ELSE 1 END, m.file_order
                    LIMIT 1) as first_media
            FROM view_history v
            JOIN listings l ON v.listing_id = l.id
            LEFT JOIN categories c ON l.category_id = c.id
            LEFT JOIN cities cit ON l.city_id = cit.id
            WHERE v.user_id = $1 AND l.deleted_at IS NULL
            ORDER BY v.viewed_at DESC
            LIMIT 20
        `, [userId]);
        const userProfile = await pool.query('SELECT phone, whatsapp, telegram FROM users WHERE id = $1', [userId]);
        const user = userProfile.rows[0] || {};
        const listings = result.rows.map(row => fillContactsFromProfile(row, user));
        res.json(listings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.delete('/history/:viewId', auth, async (req, res) => {
    const userId = req.userId;
    const viewId = req.params.viewId;
    try {
        const result = await pool.query('DELETE FROM view_history WHERE id = $1 AND user_id = $2 RETURNING id', [viewId, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Запись не найдена' });
        res.json({ message: 'Запись удалена' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.delete('/history/clear', auth, async (req, res) => {
    const userId = req.userId;
    try {
        await pool.query('DELETE FROM view_history WHERE user_id = $1', [userId]);
        res.json({ message: 'История очищена' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/:id/complaint', auth, async (req, res) => {
    const complainantId = req.userId;
    const listingId = req.params.id;
    const { reason } = req.body;
    if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: 'Укажите причину жалобы' });
    }
    try {
        const listing = await pool.query('SELECT user_id FROM listings WHERE id = $1 AND deleted_at IS NULL', [listingId]);
        if (listing.rows.length === 0) return res.status(404).json({ error: 'Объявление не найдено' });
        if (listing.rows[0].user_id === complainantId) return res.status(403).json({ error: 'Нельзя жаловаться на своё объявление' });
        const existing = await pool.query('SELECT id FROM complaints WHERE complainant_id = $1 AND listing_id = $2 AND status = $3', [complainantId, listingId, 'pending']);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Вы уже отправили жалобу на это объявление' });
        await pool.query('INSERT INTO complaints (complainant_id, listing_id, reason) VALUES ($1, $2, $3)', [complainantId, listingId, reason]);
        await logUserAction(complainantId, 'complaint_listing', { listingId }, req);
        res.json({ message: 'Жалоба отправлена. Спасибо, мы рассмотрим.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.delete('/my/:id/permanent', auth, async (req, res) => {
    const userId = req.userId;
    const listingId = req.params.id;
    try {
        const listing = await pool.query(
            'SELECT user_id, status FROM listings WHERE id = $1 AND deleted_at IS NULL',
            [listingId]
        );
        if (listing.rows.length === 0) {
            return res.status(404).json({ error: 'Объявление не найдено' });
        }
        if (listing.rows[0].user_id !== userId) {
            return res.status(403).json({ error: 'Нет прав на удаление этого объявления' });
        }
        if (listing.rows[0].status !== 'archived') {
            return res.status(400).json({ error: 'Удалить навсегда можно только из архива' });
        }

        const media = await pool.query('SELECT file_path FROM listing_media WHERE listing_id = $1', [listingId]);
        for (const m of media.rows) {
            const filePath = path.join(__dirname, '../public', m.file_path);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await pool.query('DELETE FROM listing_media WHERE listing_id = $1', [listingId]);
        await pool.query('DELETE FROM favorites WHERE listing_id = $1', [listingId]);
        await pool.query('DELETE FROM view_history WHERE listing_id = $1', [listingId]);
        await pool.query('DELETE FROM complaints WHERE listing_id = $1', [listingId]);
        await pool.query('DELETE FROM listings WHERE id = $1', [listingId]);
        await logUserAction(userId, 'delete_listing_permanent', { listingId }, req);
        res.json({ message: 'Объявление удалено навсегда' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/:id/bump', auth, async (req, res) => {
    const listingId = req.params.id;
    const userId = req.userId;

    try {
        const listing = await pool.query(
            `SELECT user_id, status FROM listings WHERE id = $1 AND deleted_at IS NULL`,
            [listingId]
        );
        if (listing.rows.length === 0) {
            return res.status(404).json({ error: 'Объявление не найдено' });
        }
        if (listing.rows[0].user_id !== userId) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        if (listing.rows[0].status !== 'active') {
            return res.status(400).json({ error: 'Можно поднимать только активные объявления' });
        }

        const bump = await pool.query(
            `SELECT last_bump_at FROM listing_bumps WHERE listing_id = $1`,
            [listingId]
        );

        const now = new Date();
        if (bump.rows.length > 0) {
            const lastBump = new Date(bump.rows[0].last_bump_at);
            const hoursDiff = (now - lastBump) / (1000 * 60 * 60);
            if (hoursDiff < 3) {
                const nextBump = new Date(lastBump.getTime() + 3 * 60 * 60 * 1000);
                const minutesLeft = Math.ceil((nextBump - now) / (1000 * 60));
                return res.status(429).json({
                    error: `Поднимать можно раз в 3 часа. Следующее поднятие через ${minutesLeft} минут.`,
                    next_bump_at: nextBump.toISOString()
                });
            }
            await pool.query(
                `UPDATE listing_bumps SET last_bump_at = NOW(), bump_count = bump_count + 1 WHERE listing_id = $1`,
                [listingId]
            );
        } else {
            await pool.query(
                `INSERT INTO listing_bumps (listing_id, last_bump_at, bump_count) VALUES ($1, NOW(), 1)`,
                [listingId]
            );
        }

        await pool.query(
            `UPDATE listings SET updated_at = NOW() WHERE id = $1`,
            [listingId]
        );

        await logUserAction(userId, 'bump_listing', { listingId }, req);
        res.json({ message: 'Объявление поднято!', next_bump_at: new Date(Date.now() + 3*60*60*1000).toISOString() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== МАРШРУТЫ ДЛЯ КОНТАКТОВ (С ПОДДЕРЖКОЙ ACTION) ==========

router.get('/:id/contacts', auth, async (req, res) => {
    const listingId = req.params.id;
    const userId = req.userId;

    try {
        const listing = await pool.query(`
            SELECT l.user_id, l.phone, l.whatsapp, l.telegram,
                   l.show_phone, l.show_whatsapp, l.show_telegram,
                   u.phone as user_phone, u.whatsapp as user_whatsapp, u.telegram as user_telegram
            FROM listings l
            JOIN users u ON l.user_id = u.id
            WHERE l.id = $1
        `, [listingId]);

        if (listing.rows.length === 0) {
            return res.status(404).json({ error: 'Объявление не найдено' });
        }

        const data = listing.rows[0];

        if (data.user_id === userId) {
            const phone = data.phone || data.user_phone || null;
            const whatsapp = data.whatsapp || data.user_whatsapp || null;
            const telegram = data.telegram || data.user_telegram || null;

            return res.json({
                is_owner: true,
                phone: phone,
                whatsapp: whatsapp,
                telegram: telegram,
                show_phone: data.show_phone !== undefined ? data.show_phone : !!phone,
                show_whatsapp: data.show_whatsapp !== undefined ? data.show_whatsapp : !!whatsapp,
                show_telegram: data.show_telegram !== undefined ? data.show_telegram : !!telegram,
            });
        }

        const phone = data.show_phone ? (data.phone || data.user_phone || null) : null;
        const whatsapp = data.show_whatsapp ? (data.whatsapp || data.user_whatsapp || null) : null;
        const telegram = data.show_telegram ? (data.telegram || data.user_telegram || null) : null;

        res.json({
            is_owner: false,
            phone: phone,
            whatsapp: whatsapp,
            telegram: telegram,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/:id/contact-log', auth, async (req, res) => {
    const listingId = req.params.id;
    const userId = req.userId;
    const { contact_type, action } = req.body;

    if (!['phone', 'whatsapp', 'telegram'].includes(contact_type)) {
        return res.status(400).json({ error: 'Неверный тип контакта' });
    }

    const finalAction = (action && ['show', 'copy'].includes(action)) ? action : 'show';

    try {
        const listing = await pool.query('SELECT id FROM listings WHERE id = $1', [listingId]);
        if (listing.rows.length === 0) {
            return res.status(404).json({ error: 'Объявление не найдено' });
        }

        const ip = req.ip || req.connection.remoteAddress;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM contact_requests 
             WHERE listing_id = $1 AND ip_address = $2 AND created_at >= $3`,
            [listingId, ip, today]
        );
        if (parseInt(countResult.rows[0].count) >= 5) {
            return res.status(429).json({ error: 'Превышен лимит запросов контактов на сегодня' });
        }

        await pool.query(
            `INSERT INTO contact_requests (listing_id, user_id, contact_type, action, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [listingId, userId, contact_type, finalAction, ip, req.headers['user-agent'] || null]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.put('/:id/contacts-settings', auth, async (req, res) => {
    const listingId = req.params.id;
    const userId = req.userId;
    const { phone, whatsapp, telegram, show_phone, show_whatsapp, show_telegram } = req.body;

    try {
        const listing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [listingId]);
        if (listing.rows.length === 0) {
            return res.status(404).json({ error: 'Объявление не найдено' });
        }
        if (listing.rows[0].user_id !== userId) {
            return res.status(403).json({ error: 'Нет прав на изменение этого объявления' });
        }

        await pool.query(
            `UPDATE listings SET 
                phone = COALESCE($1, phone),
                whatsapp = COALESCE($2, whatsapp),
                telegram = COALESCE($3, telegram),
                show_phone = COALESCE($4, show_phone),
                show_whatsapp = COALESCE($5, show_whatsapp),
                show_telegram = COALESCE($6, show_telegram)
             WHERE id = $7`,
            [phone, whatsapp, telegram, show_phone, show_whatsapp, show_telegram, listingId]
        );

        res.json({ message: 'Настройки контактов обновлены' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;