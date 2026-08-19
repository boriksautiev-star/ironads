const axios = require('axios');
const { sendCaptchaErrorAlert } = require('./email');

/**
 * Проверяет токен hCaptcha
 * @param {string} token - Токен от клиента
 * @param {string} secretKey - Секретный ключ
 * @param {object} context - Контекст для уведомлений { username, ip }
 * @returns {Promise<boolean>}
 */
async function verifyToken(token, secretKey, context = {}) {
    if (!token) {
        // Токен отсутствует – уведомляем администратора
        await sendCaptchaErrorAlert(
            context.username || 'неизвестно',
            context.ip || 'неизвестно',
            'Токен отсутствует'
        );
        return false;
    }
    try {
        const response = await axios.post('https://hcaptcha.com/siteverify', null, {
            params: {
                secret: secretKey,
                response: token,
            },
            timeout: 5000,
        });
        if (response.data.success === true) {
            return true;
        }
        // Ошибка проверки – собираем коды ошибок
        const errorCodes = response.data['error-codes'] || ['unknown_error'];
        const errorMessage = errorCodes.join(', ');
        await sendCaptchaErrorAlert(
            context.username || 'неизвестно',
            context.ip || 'неизвестно',
            errorMessage
        );
        return false;
    } catch (err) {
        // Ошибка сети или таймаут
        await sendCaptchaErrorAlert(
            context.username || 'неизвестно',
            context.ip || 'неизвестно',
            `Network error: ${err.message}`
        );
        return false;
    }
}

module.exports = { verifyToken };