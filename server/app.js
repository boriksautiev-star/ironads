require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const pool = require('./db/pool');

// ===== ПРОВЕРКА ИНСТАНСА ДЛЯ CRON (чтобы не дублировать задачи) =====
const isPrimaryInstance = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

// ===== ИНИЦИАЛИЗАЦИЯ EMAIL-ТРАНСПОРТА =====
const { initTransporter } = require('./services/email');
initTransporter();

// ===== ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ ОШИБОК =====
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

// ===== ПОДКЛЮЧАЕМ МАРШРУТЫ =====
const authRoutes = require('./routes/auth');
const listingsRoutes = require('./routes/listings');
const chatsRoutes = require('./routes/chats');
const usersRoutes = require('./routes/users');
const categoriesRoutes = require('./routes/categories');
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const citiesRoutes = require('./routes/cities');
const contactRoutes = require('./routes/contact');
const paymentsRoutes = require('./routes/payments');
const subscriptionsRoutes = require('./routes/subscriptions');
const partnerRoutes = require('./routes/partner');

const { getPrice, getPeriod } = require('./services/settingsService');

// ===== БЕЗОПАСНОЕ ПОДКЛЮЧЕНИЕ ФИДА =====
let feedRoutes = null;
let updateFeed = null;
let feedEnabled = false;
try {
    const fs = require('fs');
    const feedPath = path.join(__dirname, 'routes', 'feed.js');
    if (fs.existsSync(feedPath)) {
        feedRoutes = require('./routes/feed');
        updateFeed = require('./cron/feed-cron');
        feedEnabled = true;
        console.log('✅ Модуль фида загружен');
    } else {
        console.log('ℹ️ Файл feed.js не найден, фид отключён');
    }
} catch (err) {
    console.warn('⚠️ Ошибка загрузки фида:', err.message);
}

// ===== БЕЗОПАСНОЕ ПОДКЛЮЧЕНИЕ TOPNLAB =====
let importTopnlab = null;
let deleteOldArchived = null;
let topnlabEnabled = false;
try {
    const fs = require('fs');
    const importPath = path.join(__dirname, 'routes', 'import-topnlab.js');
    const deletePath = path.join(__dirname, 'cron', 'delete-archived.js');
    if (fs.existsSync(importPath) && fs.existsSync(deletePath)) {
        importTopnlab = require('./routes/import-topnlab');
        deleteOldArchived = require('./cron/delete-archived');
        topnlabEnabled = true;
        console.log('✅ Модули импорта TopNLab загружены');
    } else {
        console.log('ℹ️ Файлы TopNLab не найдены, импорт отключён');
    }
} catch (err) {
    console.warn('⚠️ Ошибка загрузки модулей TopNLab:', err.message);
}

// ===== CRON =====
let cron = null;
try {
    cron = require('node-cron');
    console.log('✅ node-cron загружен');
} catch (err) {
    console.warn('⚠️ node-cron не установлен, расписание отключено');
}

// ===== ИНИЦИАЛИЗАЦИЯ APP =====
const app = express();
const server = http.createServer(app);

// ===== УВЕЛИЧИВАЕМ ТАЙМАУТ =====
server.timeout = 600000;

// ===== БЕЗОПАСНОСТЬ: HELMET С НАСТРОЙКОЙ CSP =====
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "'unsafe-eval'",
                "https://api-maps.yandex.ru",
                "https://js.hcaptcha.com",
                "https://yastatic.net", "https://cdn.jsdelivr.net"
            , "https://yandex.ru", "https://*.yandex.ru", "https://*.yandex.net", "https://*.maps.yandex.ru", "https://*.maps.yandex.net", "https://*.yandex.com"],
            scriptSrcAttr: [
                "'unsafe-inline'"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com", "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com"
            ],
            imgSrc: [
                "'self'",
                "data:",
                "https://api-maps.yandex.ru",
                "https://yastatic.net", "https://cdn.jsdelivr.net"
            , "https://*.maps.yandex.net", "https://*.yandex.ru", "https://yandex.ru", "https://*.yandex.ru", "https://*.yandex.net", "https://*.maps.yandex.ru", "https://*.maps.yandex.net", "https://*.yandex.com"],
            connectSrc: [
                "'self'",
                "https://api-maps.yandex.ru",
                "https://js.hcaptcha.com",
                "https://cdnjs.cloudflare.com",
                "https://*.hcaptcha.com"
            , "https://yandex.ru", "https://*.yandex.ru", "https://*.yandex.net", "https://*.maps.yandex.ru", "https://*.maps.yandex.net", "https://*.yandex.com"],
            frameSrc: [
                "'self'",
                "https://js.hcaptcha.com",
                "https://newassets.hcaptcha.com",
                "https://vk.com",
                "https://id.vk.com"
            , "https://yandex.ru", "https://*.yandex.ru", "https://*.yandex.net", "https://*.maps.yandex.ru", "https://*.maps.yandex.net", "https://*.yandex.com"]
        }
    }
}));

// ===== НАСТРОЙКА ДОВЕРИЯ ПРОКСИ =====
app.set('trust proxy', false);

// ===== CORS =====
app.use(cors({
    origin: process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ===== MIDDLEWARE =====
app.use(cookieParser());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));









// ========== SEO: SITEMAP, ROBOTS, МИКРОРАЗМЕТКА ==========
app.get('/sitemap.xml', async (req, res) => {
    try {
        const result = await pool.query("SELECT id, updated_at FROM listings WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50000");
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
        xml += '  <url>\n    <loc>https://ironads.ru/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n';
        result.rows.forEach(row => {
            xml += `  <url>\n    <loc>https://ironads.ru/listing.html?id=${row.id}</loc>\n    <lastmod>${new Date(row.updated_at).toISOString()}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
        });
        xml += '</urlset>';
        res.header('Content-Type', 'application/xml').send(xml);
    } catch (err) { res.status(500).send('Error'); }
});

app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n\n# Разрешаем ИИ-ботам читать сайт\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: YandexBot\nAllow: /\n\nUser-agent: Googlebot\nAllow: /\n\nSitemap: https://ironads.ru/sitemap.xml\nSitemap: https://ironads.ru/llms.txt`);
});

app.get(['/listing/:id', '/listing.html'], async (req, res, next) => {
    try {
        const listingId = req.params.id || req.query.id;
        if (!listingId || isNaN(listingId)) return next();

        const result = await pool.query('SELECT * FROM listings WHERE id = $1::int AND deleted_at IS NULL', [listingId]);
        const listing = result.rows[0];
        
        if (!listing) {
            console.log('⚠️ SEO: Объявление id=' + listingId + ' не найдено в БД');
            return next();
        }

        const indexPath = path.join(__dirname, 'public', 'listing.html');
        let html = require('fs').readFileSync(indexPath, 'utf8');

        const pageTitle = listing.title + ' - ' + (listing.price || 0) + ' руб. | IronAds';
        const pageDescription = (listing.description || "").replace(/<[^>]*>?/gm, '').substring(0, 160).replace(/"/g, '&quot;').replace(/\n/g, ' ');

        const schema = {
            "@context": "https://schema.org", "@type": "Product",
            "name": listing.title || "Объявление", "description": pageDescription,
            "offers": { "@type": "Offer", "priceCurrency": "RUB", "price": listing.price || 0, "url": 'https://ironads.ru/listing.html?id=' + listingId }
        };

        html = html.replace('</head>', () => `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>\n</head>`);
        
        const titleStart = html.indexOf('<title>');
        const titleEnd = html.indexOf('</title>');
        if (titleStart !== -1 && titleEnd !== -1) {
            html = html.substring(0, titleStart) + '<title>' + pageTitle + '</title>' + html.substring(titleEnd + 8);
        }

        const descStart = html.indexOf('<meta name="description"');
        if (descStart !== -1) {
            const descEnd = html.indexOf('>', descStart);
            if (descEnd !== -1) {
                html = html.substring(0, descStart) + '<meta name="description" content="' + pageDescription + '">' + html.substring(descEnd + 1);
            }
        } else {
            html = html.replace('</head>', () => '<meta name="description" content="' + pageDescription + '">\n</head>');
        }

        console.log('✅ SEO: Успешно отрендерено id=' + listingId);
        res.send(html);
    } catch (err) {
        console.error('SEO Error:', err);
        next();
    }
});
// ================================================
// ========== ВНЕДРЕНИЕ РАЗМЕТКИ НА ГЛАВНУЮ ==========
app.get('/', (req, res, next) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    require('fs').readFile(indexPath, 'utf8', (err, html) => {
        if (err) return next(err);
        const orgSchema = {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "IronAds",
            "url": "https://ironads.ru",
            "logo": "https://ironads.ru/logo.png",
            "description": "Бесплатная доска объявлений по всей России",
            "contactPoint": {
                "@type": "ContactPoint",
                "email": "support@ironads.ru",
                "contactType": "customer support"
            }
        };
        const finalHtml = html.replace('</head>', `<script type="application/ld+json">\n${JSON.stringify(orgSchema, null, 2)}\n</script>\n</head>`);
        res.send(finalHtml);
    });
});
// ====================================================
app.use(express.static(path.join(__dirname, 'public')));

// ===== ДОПОЛНИТЕЛЬНАЯ НАСТРОЙКА ДЛЯ APK =====
// Устанавливаем правильные заголовки для APK-файлов, чтобы они скачивались, а не открывались
app.use('/downloads', express.static(path.join(__dirname, 'public/downloads'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.apk')) {
            res.setHeader('Content-Type', 'application/vnd.android.package-archive');
            res.setHeader('Content-Disposition', 'attachment; filename="IronAds.apk"');
        }
    }
}));

app.use(passport.initialize());

// ===== SESSION (PostgreSQL) =====
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'user_sessions'
    }),
    secret: process.env.SESSION_SECRET || 'fallback_secret_key_for_vk_oauth',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));
console.log('✅ Сессии перенесены в PostgreSQL');


// ===== ОБРАБОТКА ОШИБОК РАЗРЫВА =====
app.use((err, req, res, next) => {
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.message?.includes('aborted')) {
        console.warn('⚠️ Клиент прервал соединение:', req.method, req.url);
        return;
    }
    next(err);
});

// ===== RATE LIMITING =====
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const forgotLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: { error: 'Слишком много запросов на восстановление пароля. Попробуйте через 15 минут.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/forgot', forgotLimiter);
app.use('/api/auth/reset-password', forgotLimiter);

// ===== ГЛОБАЛЬНЫЙ ЛОГГЕР ЗАПРОСОВ =====
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.url}`);
    next();
});

// ========== МАРШРУТЫ ==========
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/cities', citiesRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/auth', authRoutes);

// ===== МАРШРУТЫ ФИДА =====
if (feedEnabled && feedRoutes) {
    app.use('/api/feed', feedRoutes);
    app.use('/feed', express.static(path.join(__dirname, 'public/feed')));
    console.log('✅ Маршруты фида подключены');
} else {
    console.log('ℹ️ Маршруты фида не подключены');
}

// ========== ПУБЛИЧНЫЕ НАСТРОЙКИ ==========
app.get('/api/public-settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT key, value FROM settings');
        const settingsMap = {};
        result.rows.forEach(row => {
            settingsMap[row.key] = row.value;
        });
        const get = (key, defaultValue) => {
            const val = settingsMap[key];
            return val !== undefined && val !== null ? val : defaultValue;
        };
        const settings = {
            siteName: get('site_name', 'IronAds'),
            contactEmail: get('contact_email', 'support@ironads.ru'),
            contactPhone: get('contact_phone', '+7 (123) 456-78-90'),
            registrationEnabled: get('registration_enabled', 'true') === 'true',
            popularCities: JSON.parse(get('popular_cities', '["Москва","Санкт-Петербург","Казань","Новосибирск","Екатеринбург"]')),
            priceMin: parseFloat(get('price_min', 0)),
            priceMax: parseFloat(get('price_max', 100000000)),
            currency: get('currency', 'RUB'),
            listingPrice: parseFloat(get('price_listing', 0)),
            renewalPrice: parseFloat(get('price_renewal', 0)),
            autobumpPrice: parseFloat(get('price_autobump', 0)),
            hcaptcha_enabled: get('hcaptcha_enabled', 'false'),
            hcaptcha_site_key: get('hcaptcha_site_key', '')
        };
        res.json(settings);
    } catch (err) {
        console.error('Ошибка получения public-settings:', err.message);
        res.status(500).json({
            success: false,
            error: {
                message: 'Ошибка загрузки настроек',
                code: 'SETTINGS_ERROR'
            }
        });
    }
});

// ========== ПУБЛИЧНЫЕ ЦЕНЫ ==========
app.get('/api/public-prices', async (req, res) => {
    try {
        const prices = {
            listing: await getPrice('price_listing'),
            renewal: await getPrice('price_renewal'),
            autobump: await getPrice('price_autobump'),
            periods: {
                listing: await getPeriod('price_listing_period'),
                renewal: await getPeriod('price_renewal_period'),
                autobump: await getPeriod('price_autobump_period'),
            }
        };
        res.json(prices);
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            error: {
                message: 'Ошибка загрузки цен',
                code: 'PRICES_ERROR'
            }
        });
    }
});

// ========== ОТДАЧА HTML ==========
app.get('/city/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'city.html'));
});

// ========== ОТДАЧА HTML ==========
// ========== ОТДАЧА HTML ==========



// ========== ОТДАЧА HTML ==========

app.get('*', (req, res, next) => {
    // Если это запрос к API или статике, пропускаем
    if (req.path.startsWith('/api') || req.path.includes('.')) return next();

    const indexPath = path.join(__dirname, 'public', 'index.html');
    require('fs').readFile(indexPath, 'utf8', (err, html) => {
        if (err) return next(err);
        
        // Разметка Организации для ИИ и поисковиков
        const orgSchema = {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "IronAds",
            "url": "https://ironads.ru",
            "logo": "https://ironads.ru/logo.png",
            "description": "Бесплатная доска объявлений по всей России",
            "contactPoint": {
                "@type": "ContactPoint",
                "email": "support@ironads.ru",
                "contactType": "customer support"
            }
        };

        const finalHtml = html.replace('</head>', `<script type="application/ld+json">\n${JSON.stringify(orgSchema, null, 2)}\n</script>\n</head>`);
        res.send(finalHtml);
    });
});

// ===== ЦЕНТРАЛИЗОВАННЫЙ ОБРАБОТЧИК ОШИБОК =====
app.use((err, req, res, next) => {
    console.error(`❌ Ошибка в ${req.method} ${req.url}:`, err.message);
    if (err.stack) console.error(err.stack);
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Внутренняя ошибка сервера';
    res.status(status).json({
        success: false,
        error: {
            message,
            code: err.code || 'INTERNAL_ERROR',
        }
    });
});

// ===== ОБРАБОТКА 404 =====
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            message: 'Маршрут не найден',
            code: 'NOT_FOUND'
        }
    });
});

// ===== ЗАПУСК =====
const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
    console.log(`✅ Сервер IronAds запущен на http://localhost:${PORT}`);
    // Первичный импорт выполняем ТОЛЬКО на первом инстансе
    if (isPrimaryInstance && topnlabEnabled && importTopnlab) {
        console.log('📥 Выполнение первичного импорта TopNLab...');
        try {
            await importTopnlab();
            console.log('✅ Первичный импорт TopNLab выполнен');
        } catch (e) {
            console.error('❌ Ошибка первичного импорта TopNLab:', e.message);
        }
    }
});

pool.connect()
    .then(() => console.log('✅ PostgreSQL подключена'))
    .catch(err => console.error('❌ Ошибка подключения к БД:', err));

// Запускаем cron ТОЛЬКО на первом инстансе
if (cron && isPrimaryInstance) {
    if (feedEnabled && updateFeed) {
        cron.schedule('0 */3 * * *', () => {
            console.log('🔄 Запуск обновления фида по расписанию (каждые 3 часа)...');
            try { updateFeed(); } catch (e) { console.error('❌ Ошибка обновления фида:', e.message); }
        });
        console.log('✅ Расписание обновления фида настроено (каждые 3 часа)');
    }
    if (topnlabEnabled && importTopnlab) {
        cron.schedule('0 */6 * * *', async () => {
            console.log('🔄 Запуск автоматического импорта TopNLab...');
            try { await importTopnlab(); } catch (e) { console.error('❌ Ошибка импорта TopNLab:', e.message); }
        });
        console.log('✅ Расписание импорта TopNLab настроено (каждые 6 часов)');
    }
    if (topnlabEnabled && deleteOldArchived) {
        cron.schedule('0 3 * * *', async () => {
            console.log('🔄 Запуск удаления архивных объявлений...');
            try { await deleteOldArchived(); } catch (e) { console.error('❌ Ошибка удаления архивных:', e.message); }
        });
        console.log('✅ Расписание удаления архивных настроено (ежедневно в 3:00)');
    }
} else {
    if (!cron) console.log('ℹ️ Cron не доступен, расписания не настроены');
    if (!isPrimaryInstance) console.log('ℹ️ Инстанс не первичный (NODE_APP_INSTANCE != 0), расписания не настроены');
}