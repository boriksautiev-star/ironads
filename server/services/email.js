const nodemailer = require('nodemailer');

// Переменные из .env
const SMTP_HOST = process.env.SMTP_HOST || process.env.EMAIL_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587');
const SMTP_SECURE = (process.env.SMTP_SECURE || process.env.EMAIL_SECURE || 'false') === 'true';
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

let transporter = null;

/**
 * Инициализация SMTP-транспорта
 */
function initTransporter() {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !ADMIN_EMAIL) {
        console.warn('⚠️ SMTP или ADMIN_EMAIL не настроены. Уведомления по email отключены.');
        console.warn('   Проверьте переменные: SMTP_HOST, SMTP_USER, SMTP_PASS, ADMIN_EMAIL');
        return null;
    }
    try {
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS,
            },
            tls: {
                rejectUnauthorized: false,
            },
        });
        console.log('✅ Email-транспорт инициализирован (SMTP: %s:%s)', SMTP_HOST, SMTP_PORT);
        return transporter;
    } catch (err) {
        console.error('❌ Ошибка инициализации SMTP:', err.message);
        return null;
    }
}

/**
 * Отправить email администратору
 * @param {string} subject - Тема письма
 * @param {string} html - HTML-содержимое
 * @param {string} text - Текстовое содержимое (запасной вариант)
 */
async function sendAdminEmail(subject, html, text = '') {
    if (!transporter && !initTransporter()) {
        console.warn('⚠️ Email не отправлен: транспорт не инициализирован');
        return false;
    }
    try {
        const info = await transporter.sendMail({
            from: `"IronAds Alert" <${SMTP_USER}>`,
            to: ADMIN_EMAIL,
            subject: subject,
            text: text || html.replace(/<[^>]+>/g, ''), // fallback
            html: html,
        });
        console.log(`✅ Email отправлен: ${info.messageId}`);
        return true;
    } catch (err) {
        console.error('❌ Ошибка отправки email:', err.message);
        return false;
    }
}

/**
 * Отправить уведомление об ошибке капчи
 * @param {string} username - Имя пользователя (или 'неизвестно')
 * @param {string} ip - IP-адрес (или 'неизвестно')
 * @param {string} errorCodes - Коды ошибок от hCaptcha (или сообщение)
 */
async function sendCaptchaErrorAlert(username, ip, errorCodes) {
    const subject = '⚠️ Ошибка проверки капчи на IronAds';
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const html = `
        <h2>Ошибка капчи</h2>
        <p><strong>Время:</strong> ${timestamp}</p>
        <p><strong>Пользователь:</strong> ${username || 'неизвестно'}</p>
        <p><strong>IP-адрес:</strong> ${ip || 'неизвестно'}</p>
        <p><strong>Код ошибки от hCaptcha:</strong> ${errorCodes || 'не указан'}</p>
        <hr>
        <p>Проверьте настройки hCaptcha в базе данных (ключи sitekey/secret).</p>
        <p>Возможные причины: неверный секретный ключ, проблемы с сетью, невалидный токен.</p>
    `;
    const text = `Ошибка капчи\nВремя: ${timestamp}\nПользователь: ${username || 'неизвестно'}\nIP: ${ip || 'неизвестно'}\nОшибка: ${errorCodes || 'не указан'}`;
    await sendAdminEmail(subject, html, text);
}

module.exports = {
    initTransporter,
    sendAdminEmail,
    sendCaptchaErrorAlert,
};