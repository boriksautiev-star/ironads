require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const helmet = require('helmet');
const pool = require('./db/pool');

// ===== ПОДКЛЮЧЕНИЕ REDIS =====
const redis = require('redis');
const RedisStore = require('connect-redis')(session);

const redisClient = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379
    },
    password: process.env.REDIS_PASSWORD || undefined
});

redisClient.on('error', (err) => {
    console.error('❌ Redis Client Error:', err);
});

redisClient.connect().catch(err => {
    console.error('❌ Не удалось подключиться к Redis:', err.message);
    console.warn('⚠️ Сессии будут использовать MemoryStore (временное решение)');
});

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
                "https://yastatic.net"          // ДОБАВЛЕНО для Яндекс.Карт
            ],
            scriptSrcAttr: [
                "'unsafe-inline'"               // ДОБАВЛЕНО для inline-обработчиков (onclick и др.)
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
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
                "https://api-maps.yandex.ru"
            ],
            connectSrc: [
                "'self'",
                "https://api-maps.yandex.ru",
                "https://js.hcaptcha.com",
                "https://cdnjs.cloudflare.com",
                "https://*.hcaptcha.com"        // ДОБАВЛЕНО для hCaptcha (логотипы, API)
            ],
            frameSrc: [
                "'self'",
                "https://js.hcaptcha.com"
            ]
        }
    }
}));

// ===== НАСТРОЙКА ДОВЕРИЯ ПРОКСИ =====
app.set('trust proxy', false);

// ===== CORS (разрешаем только ваш домен) =====
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
app.use(express.static(path.join(__dirname, 'public')));
app.use(passport.initialize());

// ===== SESSION (RedisStore) =====
let sessionStore;
let useRedis = true;
try {
    sessionStore = new RedisStore({ client: redisClient });
    console.log('✅ RedisStore для сессий инициализирован');
} catch (err) {
    console.error('❌ Ошибка создания RedisStore, используем MemoryStore:', err.message);
    sessionStore = new session.MemoryStore();
    useRedis = false;
}

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'fallback_secret_key_for_vk_oauth',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

if (useRedis) {
    console.log('✅ Сессии хранятся в Redis');
} else {
    console.warn('⚠️ Сессии хранятся в MemoryStore (Redis недоступен)');
}

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
        const settings = {
            siteName: 'IronAds',
            contactEmail: 'support@ironads.ru',
            contactPhone: '+7 (123) 456-78-90',
            registrationEnabled: true,
            popularCities: ['Москва', 'Санкт-Петербург', 'Казань', 'Новосибирск', 'Екатеринбург'],
            priceMin: 0,
            priceMax: 100000000,
            currency: 'RUB',
            listingPrice: 0,
            renewalPrice: 0,
            autobumpPrice: 0,
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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    if (topnlabEnabled && importTopnlab) {
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

// ===== CRON =====
if (cron) {
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
    console.log('ℹ️ Cron не доступен, расписания не настроены');
}