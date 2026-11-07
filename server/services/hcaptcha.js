const axios = require('axios');

/**
 * Проверяет токен hCaptcha
 * @param {string} token - токен от виджета
 * @param {string} secretKey - секретный ключ из БД
 * @returns {Promise<boolean>} - true, если капча пройдена
 */
async function verifyToken(token, secretKey) {
    // Очищаем от случайных пробелов в начале и конце
    token = (token || '').trim();
    secretKey = (secretKey || '').trim();

    if (!token) {
        console.error('❌ Токен капчи отсутствует');
        return false;
    }
    if (!secretKey) {
        console.error('❌ Секретный ключ hCaptcha отсутствует');
        return false;
    }

    try {
        console.log(`📤 Отправка токена в hCaptcha (${token.substring(0, 10)}...)`);
        
        // Отправляем данные как form-data (application/x-www-form-urlencoded)
        const response = await axios.post('https://hcaptcha.com/siteverify', 
            new URLSearchParams({
                secret: secretKey,
                response: token
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 5000
            }
        );

        console.log('📥 Ответ hCaptcha:', JSON.stringify(response.data));

        if (response.data.success === true) {
            console.log('✅ Капча пройдена успешно');
            return true;
        } else {
            const errorCodes = response.data['error-codes'] || [];
            console.error('❌ Ошибка проверки капчи:', errorCodes.join(', '));
            return false;
        }
    } catch (err) {
        console.error('❌ Исключение при проверке капчи:', err.message);
        if (err.response) {
            console.error('Ответ hCaptcha с ошибкой:', err.response.data);
        }
        return false;
    }
}

module.exports = { verifyToken };