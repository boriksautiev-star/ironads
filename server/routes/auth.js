const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const pool = require('../db/pool');
const { auth } = require('../middleware/auth');
const { verifyToken } = require('../services/hcaptcha');
const { logUserAction } = require('../utils/audit');

const router = express.Router();

// ===== ВРЕМЕННОЕ ХРАНИЛИЩЕ ДЛЯ CODE_VERIFIER =====
const codeVerifierStore = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [key, value] of codeVerifierStore) {
        if (value.expires && value.expires < now) {
            codeVerifierStore.delete(key);
        }
    }
}, 600000);

function storeCodeVerifier(userId, codeVerifier) {
    codeVerifierStore.set(String(userId), {
        codeVerifier,
        expires: Date.now() + 600000
    });
}

function getCodeVerifier(userId) {
    const entry = codeVerifierStore.get(String(userId));
    if (entry && entry.expires > Date.now()) {
        return entry.codeVerifier;
    }
    codeVerifierStore.delete(String(userId));
    return null;
}

function generateToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

async function getSetting(key, defaultValue = null) {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (result.rows.length === 0) return defaultValue;
    return result.rows[0].value;
}

function truncateString(str, maxLength) {
    if (!str) return null;
    if (str.length > maxLength) {
        return str.substring(0, maxLength);
    }
    return str;
}

// ===== ПРОВЕРКА И ДОБАВЛЕНИЕ НЕДОСТАЮЩИХ КОЛОНОК =====
(async function ensureProfileColumns() {
    try {
        const checkWhatsapp = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='whatsapp'
        `);
        if (checkWhatsapp.rows.length === 0) {
            await pool.query('ALTER TABLE users ADD COLUMN whatsapp VARCHAR(20)');
            console.log('✅ Колонка whatsapp добавлена');
        }

        const checkTelegram = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='telegram'
        `);
        if (checkTelegram.rows.length === 0) {
            await pool.query('ALTER TABLE users ADD COLUMN telegram VARCHAR(50)');
            console.log('✅ Колонка telegram добавлена');
        }

        const checkPhone = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='phone'
        `);
        if (checkPhone.rows.length === 0) {
            await pool.query('ALTER TABLE users ADD COLUMN phone VARCHAR(20)');
            console.log('✅ Колонка phone добавлена');
        }
    } catch (err) {
        console.warn('⚠️ Не удалось проверить/добавить колонки профиля:', err.message);
    }
})();

// ========== OAuth YANDEX ==========
router.get('/yandex', (req, res) => {
    const authUrl = `https://oauth.yandex.ru/authorize?response_type=code&client_id=${process.env.YANDEX_CLIENT_ID}&redirect_uri=${process.env.APP_URL}/auth/yandex/callback&force_confirm=yes`;
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Перенаправление на Яндекс...</title><script>window.location.href = "${authUrl}";</script></head><body><p>Перенаправление...</p></body></html>`);
});

router.get('/yandex/callback', async (req, res) => {
    console.log('📥 Яндекс OAuth callback, query:', req.query);
    const { code } = req.query;
    if (!code) return res.status(400).send('Не получен код авторизации');

    const action = req.query.action || 'login';
    const isLinking = (action === 'link');

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('client_id', process.env.YANDEX_CLIENT_ID);
        params.append('client_secret', process.env.YANDEX_CLIENT_SECRET);
        const tokenResponse = await axios.post('https://oauth.yandex.ru/token', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const accessToken = tokenResponse.data.access_token;
        const profileResponse = await axios.get('https://login.yandex.ru/info', {
            params: { format: 'json', oauth_token: accessToken },
        });
        const profile = profileResponse.data;
        const yandexId = profile.id;
        const email = profile.default_email ? profile.default_email.toLowerCase() : null;
        let username = profile.real_name || profile.display_name || (email ? email.split('@')[0] : `ya_${yandexId}`);
        username = truncateString(username, 50);

        console.log('🔹 Яндекс OAuth: email=', email, 'username=', username, 'yandexId=', yandexId);

        if (isLinking) {
            const userId = req.query.state;
            if (!userId) {
                return res.status(400).send('Не передан идентификатор пользователя');
            }
            const existing = await pool.query('SELECT id FROM users WHERE yandex_id = $1 AND id != $2', [yandexId, userId]);
            if (existing.rows.length > 0) {
                return res.status(400).send('Этот аккаунт Яндекса уже привязан к другому пользователю');
            }
            await pool.query('UPDATE users SET yandex_id = $1 WHERE id = $2', [yandexId, userId]);
            return res.redirect(process.env.APP_URL + '/settings.html?linked=yandex');
        }

        let user = await pool.query('SELECT * FROM users WHERE yandex_id = $1', [yandexId]);
        
        if (user.rows.length === 0) {
            let existingUser = null;
            if (email) {
                const emailCheck = await pool.query(
                    'SELECT id, role FROM users WHERE LOWER(email) = LOWER($1)',
                    [email]
                );
                if (emailCheck.rows.length > 0) {
                    existingUser = emailCheck.rows[0];
                }
            }
            if (existingUser) {
                await pool.query('UPDATE users SET yandex_id = $1 WHERE id = $2', [yandexId, existingUser.id]);
                user = await pool.query('SELECT * FROM users WHERE id = $1', [existingUser.id]);
            } else {
                const newUser = await pool.query(
                    `INSERT INTO users (username, email, yandex_id, is_email_verified, role, terms_accepted_at, terms_version, created_at)
                     VALUES ($1, $2, $3, true, 'user', NOW(), $4, NOW()) RETURNING *`,
                    [username, email, yandexId, '1.0']
                );
                user = newUser;
            }
        } else {
            const updates = [];
            const params = [];
            let idx = 1;
            if (email && user.rows[0].email !== email) {
                updates.push(`email = $${idx++}`);
                params.push(email);
            }
            // Обновляем username только если текущее имя пустое
            if (username && (!user.rows[0].username || user.rows[0].username.trim() === '')) {
                updates.push(`username = $${idx++}`);
                params.push(username);
            }
            if (updates.length > 0) {
                params.push(yandexId);
                await pool.query(
                    `UPDATE users SET ${updates.join(', ')} WHERE yandex_id = $${idx}`,
                    params
                );
                user = await pool.query('SELECT * FROM users WHERE yandex_id = $1', [yandexId]);
            }
        }
        
        const jwtToken = generateToken(user.rows[0].id);
        await logUserAction(user.rows[0].id, 'login', { via: 'yandex' }, req);
        res.redirect(`${process.env.APP_URL}/?token=${jwtToken}`);
    } catch (err) {
        console.error('❌ Ошибка в OAuth callback:', err.response?.data || err.message);
        res.status(500).send(`<h3>Ошибка авторизации через Яндекс</h3><pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>`);
    }
});

// ========== VK ID OAUTH ==========
(async function ensureVkIdColumn() {
    try {
        const check = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='vk_id'
        `);
        if (check.rows.length === 0) {
            await pool.query('ALTER TABLE users ADD COLUMN vk_id VARCHAR(50) UNIQUE');
            await pool.query('CREATE INDEX idx_users_vk_id ON users(vk_id)');
            console.log('✅ Поле vk_id добавлено');
        }
    } catch (err) {
        console.warn('⚠️ Не удалось проверить/добавить поле vk_id:', err.message);
    }
})();

function generateCodeVerifier() {
    const length = 64;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateCodeChallenge(codeVerifier) {
    return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

router.get('/vk', (req, res) => {
    try {
        const clientId = process.env.VK_CLIENT_ID;
        const redirectUri = process.env.VK_REDIRECT_URI;
        const scope = 'email phone';
        
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = generateCodeChallenge(codeVerifier);
        
        // Сохраняем code_verifier в Map, используя state как ключ
        const state = crypto.randomBytes(16).toString('hex');
        storeCodeVerifier(state, codeVerifier);
        console.log('🔑 Сохраняем code_verifier для state:', state);
        
        const authUrl = `https://id.vk.com/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}`;
        console.log('🔄 VK OAuth: редирект на', authUrl);
        res.redirect(authUrl);
    } catch (err) {
        console.error('❌ Ошибка в /auth/vk:', err);
        res.status(500).send('Ошибка инициализации входа через ВКонтакте');
    }
});

router.get('/vk/callback', async (req, res) => {
    console.log('📥 VK OAuth callback, query:', req.query);
    console.log('📥 Сессия (vk_code_verifier):', req.session?.vk_code_verifier);
    try {
        const { code, device_id, state } = req.query;
        const action = req.query.action || 'login';
        const isLinking = (action === 'link');

        if (!code) {
            return res.status(400).json({ error: 'Не получен код авторизации' });
        }

        let codeVerifier = null;

        if (isLinking) {
            if (!state) {
                return res.status(400).send('Не передан идентификатор пользователя');
            }
            codeVerifier = getCodeVerifier(state);
            if (!codeVerifier) {
                return res.status(400).send('Код верификации истёк или не найден. Попробуйте снова.');
            }
        } else {
            // Берем codeVerifier из нашего хранилища по state
            if (!state) {
                return res.status(400).json({ error: 'Отсутствует параметр state' });
            }
            codeVerifier = getCodeVerifier(state);
            if (!codeVerifier) {
                console.error('❌ code_verifier отсутствует или истек!');
                return res.status(400).json({ error: 'Код верификации истёк или не найден. Попробуйте снова.' });
            }
        }
        
        const params = new URLSearchParams();
        params.append('client_id', process.env.VK_CLIENT_ID);
        params.append('service_token', process.env.VK_CLIENT_SECRET);
        params.append('redirect_uri', process.env.VK_REDIRECT_URI);
        params.append('code', code);
        params.append('grant_type', 'authorization_code');
        params.append('code_verifier', codeVerifier);
        if (device_id) {
            params.append('device_id', device_id);
        }
        
        const tokenResponse = await axios.post('https://id.vk.com/oauth2/auth', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            validateStatus: false
        });
        
        if (tokenResponse.status !== 200) {
            throw new Error(`VK вернул ошибку: ${tokenResponse.status} - ${JSON.stringify(tokenResponse.data)}`);
        }
        
        const tokenData = tokenResponse.data;
        const accessToken = tokenData.access_token;
        const userId = tokenData.user_id;
        const email = tokenData.email ? tokenData.email.toLowerCase() : null;
        
        const userInfoResponse = await axios.get('https://api.vk.com/method/users.get', {
            params: {
                user_ids: userId,
                fields: 'first_name,last_name,photo_100,phone',
                access_token: accessToken,
                v: '5.131'
            }
        });
        const userData = userInfoResponse.data.response?.[0];
        if (!userData) {
            throw new Error('Не удалось получить данные пользователя');
        }
        
        const firstName = userData.first_name || '';
        const lastName = userData.last_name || '';
        let username = (firstName + ' ' + lastName).trim() || `vk_${userId}`;
        username = truncateString(username, 50);
        
        const phone = userData.phone || null;
        let avatar = userData.photo_100 || null;
        avatar = truncateString(avatar, 255);
        const truncatedEmail = truncateString(email, 254);
        const truncatedPhone = truncateString(phone, 20);

        console.log('🔹 VK OAuth: email=', truncatedEmail, 'username=', username, 'vkId=', userId);

        if (isLinking) {
            const linkUserId = state;
            if (!linkUserId) {
                return res.status(400).send('Не передан идентификатор пользователя');
            }
            const existing = await pool.query('SELECT id FROM users WHERE vk_id = $1 AND id != $2', [String(userId), linkUserId]);
            if (existing.rows.length > 0) {
                return res.status(400).send('Этот аккаунт VK уже привязан к другому пользователю');
            }
            await pool.query('UPDATE users SET vk_id = $1 WHERE id = $2', [String(userId), linkUserId]);
            codeVerifierStore.delete(String(linkUserId));
            return res.redirect(process.env.APP_URL + '/settings.html?linked=vk');
        }

        let user = await pool.query('SELECT * FROM users WHERE vk_id = $1', [String(userId)]);
        
        if (user.rows.length === 0) {
            let existingUser = null;
            if (truncatedEmail) {
                const emailCheck = await pool.query(
                    'SELECT id, role FROM users WHERE LOWER(email) = LOWER($1)',
                    [truncatedEmail]
                );
                if (emailCheck.rows.length > 0) {
                    existingUser = emailCheck.rows[0];
                }
            }
            if (existingUser) {
                await pool.query('UPDATE users SET vk_id = $1 WHERE id = $2', [String(userId), existingUser.id]);
                user = await pool.query('SELECT * FROM users WHERE id = $1', [existingUser.id]);
            } else {
                let finalUsername = username;
                const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
                if (usernameCheck.rows.length > 0) {
                    finalUsername = `${username}_${userId}`;
                    finalUsername = truncateString(finalUsername, 50);
                }
                const newUser = await pool.query(
                    `INSERT INTO users (username, email, phone, vk_id, avatar_url, is_email_verified, role, terms_accepted_at, terms_version, created_at)
                     VALUES ($1, $2, $3, $4, $5, true, 'user', NOW(), $6, NOW())
                     RETURNING *`,
                    [finalUsername, truncatedEmail, truncatedPhone, String(userId), avatar, '1.0']
                );
                user = newUser;
            }
        } else {
            const updates = [];
            const params = [];
            let idx = 1;
            if (truncatedEmail && user.rows[0].email !== truncatedEmail) {
                updates.push(`email = $${idx++}`);
                params.push(truncatedEmail);
            }
            if (truncatedPhone && user.rows[0].phone !== truncatedPhone) {
                updates.push(`phone = $${idx++}`);
                params.push(truncatedPhone);
            }
            if (avatar && user.rows[0].avatar_url !== avatar) {
                updates.push(`avatar_url = $${idx++}`);
                params.push(avatar);
            }
            // Обновляем username только если текущее имя пустое
            if (username && (!user.rows[0].username || user.rows[0].username.trim() === '')) {
                const existingUsername = await pool.query('SELECT id FROM users WHERE username = $1 AND vk_id != $2', [username, String(userId)]);
                if (existingUsername.rows.length === 0) {
                    updates.push(`username = $${idx++}`);
                    params.push(username);
                }
            }
            if (updates.length > 0) {
                params.push(String(userId));
                await pool.query(
                    `UPDATE users SET ${updates.join(', ')} WHERE vk_id = $${idx}`,
                    params
                );
                user = await pool.query('SELECT * FROM users WHERE vk_id = $1', [String(userId)]);
            }
        }
        
        const jwtToken = generateToken(user.rows[0].id);
        await logUserAction(user.rows[0].id, 'login', { via: 'vk_id' }, req);
        
        req.session.vk_code_verifier = null;
        req.session.save(err => {
            if (err) console.error('❌ Ошибка очистки сессии VK:', err);
            res.redirect(`${process.env.APP_URL || 'https://ironads.ru'}?token=${jwtToken}`);
        });
        
    } catch (error) {
        console.error('❌ Ошибка VK ID OAuth callback:', error);
        res.status(500).json({
            error: 'Ошибка авторизации через ВКонтакте',
            message: error.message
        });
    }
});

// ========== ПРИВЯЗКА VK ==========
router.get('/link/vk', async (req, res) => {
    try {
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.userId;
            } catch(e) {}
        }
        if (!userId && req.query.token) {
            try {
                const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
                userId = decoded.userId;
            } catch(e) {}
        }
        if (!userId) {
            return res.status(401).send('Требуется авторизация. Закройте это окно и попробуйте снова.');
        }

        const clientId = process.env.VK_CLIENT_ID;
        const redirectUri = process.env.VK_REDIRECT_URI;
        const redirectWithAction = redirectUri + (redirectUri.includes('?') ? '&' : '?') + 'action=link';
        const scope = 'email phone';
        
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = generateCodeChallenge(codeVerifier);
        
        storeCodeVerifier(userId, codeVerifier);
        
        const authUrl = `https://id.vk.com/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectWithAction)}&response_type=code&scope=${encodeURIComponent(scope)}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${userId}`;
        
        res.redirect(authUrl);
    } catch (err) {
        console.error('❌ Ошибка привязки VK:', err);
        res.status(500).send('Ошибка инициализации привязки VK');
    }
});

// ========== ПРИВЯЗКА ЯНДЕКС ==========
router.get('/link/yandex', async (req, res) => {
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.userId;
        } catch(e) {}
    }
    if (!userId && req.query.token) {
        try {
            const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
            userId = decoded.userId;
        } catch(e) {}
    }
    if (!userId) {
        return res.status(401).send('Требуется авторизация. Закройте это окно и попробуйте снова.');
    }

    const redirectUri = process.env.APP_URL + '/auth/yandex/callback?action=link';
    const authUrl = `https://oauth.yandex.ru/authorize?response_type=code&client_id=${process.env.YANDEX_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&force_confirm=yes&state=${userId}`;
    res.redirect(authUrl);
});

// ========== ОТВЯЗКА VK ==========
router.post('/unlink/vk', auth, async (req, res) => {
    try {
        await pool.query('UPDATE users SET vk_id = NULL WHERE id = $1', [req.userId]);
        await logUserAction(req.userId, 'unlink_vk', null, req);
        res.json({ message: 'VK отвязан' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка отвязки VK' });
    }
});

// ========== ОТВЯЗКА ЯНДЕКС ==========
router.post('/unlink/yandex', auth, async (req, res) => {
    try {
        await pool.query('UPDATE users SET yandex_id = NULL WHERE id = $1', [req.userId]);
        await logUserAction(req.userId, 'unlink_yandex', null, req);
        res.json({ message: 'Яндекс отвязан' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка отвязки Яндекса' });
    }
});

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ OAuth (привязка/отвязка через API)
// ============================================================

/**
 * Обменять код Яндекса на данные пользователя
 */
async function exchangeYandexCode(code) {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', process.env.YANDEX_CLIENT_ID);
    params.append('client_secret', process.env.YANDEX_CLIENT_SECRET);
    const tokenResponse = await axios.post('https://oauth.yandex.ru/token', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const accessToken = tokenResponse.data.access_token;
    const profileResponse = await axios.get('https://login.yandex.ru/info', {
        params: { format: 'json', with_email: true },
        headers: { Authorization: `OAuth ${accessToken}` },
    });
    const profile = profileResponse.data;
    return {
        yandexId: profile.id,
        email: profile.default_email || profile.email,
        username: profile.display_name || profile.real_name || 'Пользователь Яндекса',
    };
}

/**
 * Обменять код ВКонтакте на данные пользователя
 */
async function exchangeVkCode(code) {
    const tokenUrl = 'https://oauth.vk.com/access_token';
    const tokenResponse = await axios.get(tokenUrl, {
        params: {
            client_id: process.env.VK_CLIENT_ID,
            client_secret: process.env.VK_CLIENT_SECRET,
            redirect_uri: process.env.VK_REDIRECT_URI || 'https://ironads.ru/auth/vk/callback',
            code: code,
        },
    });
    const { access_token, user_id, email } = tokenResponse.data;
    const userInfoResponse = await axios.get('https://api.vk.com/method/users.get', {
        params: {
            user_ids: user_id,
            fields: 'first_name,last_name',
            access_token: access_token,
            v: '5.131',
        },
    });
    const vkUser = userInfoResponse.data.response[0];
    const fullName = `${vkUser.first_name} ${vkUser.last_name}`.trim();
    return {
        vkId: user_id,
        email: email || null,
        username: fullName || 'Пользователь ВКонтакте',
    };
}

// ============================================================
// МАРШРУТЫ ДЛЯ ПРИВЯЗКИ/ОТВЯЗКИ ЧЕРЕЗ API (для мобильного приложения)
// ============================================================

/**
 * Привязка Яндекса (через API)
 * POST /auth/yandex/link
 * Тело: { code: string }
 */
router.post('/yandex/link', auth, async (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'Не передан код авторизации' });
    }

    try {
        const yandexData = await exchangeYandexCode(code);
        const { yandexId, email, username } = yandexData;

        const existing = await pool.query('SELECT id FROM users WHERE yandex_id = $1 AND id != $2', [yandexId, req.userId]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Этот аккаунт Яндекса уже привязан к другому пользователю' });
        }

        const currentUser = await pool.query('SELECT username FROM users WHERE id = $1', [req.userId]);
        const currentUsername = currentUser.rows[0]?.username;

        let updateQuery = 'UPDATE users SET yandex_id = $1, email = COALESCE($2, email)';
        const params = [yandexId, email];
        let paramIndex = 3;

        if (!currentUsername || currentUsername.trim() === '') {
            updateQuery += `, username = $${paramIndex++}`;
            params.push(username);
        }

        updateQuery += ` WHERE id = $${paramIndex}`;
        params.push(req.userId);

        await pool.query(updateQuery, params);

        const userResult = await pool.query('SELECT id, username, email, phone, yandex_id, vk_id FROM users WHERE id = $1', [req.userId]);
        await logUserAction(req.userId, 'link_yandex', { yandexId }, req);
        res.json({ success: true, user: userResult.rows[0] });
    } catch (error) {
        console.error('Ошибка привязки Яндекса:', error);
        res.status(500).json({ error: 'Не удалось привязать Яндекс' });
    }
});

/**
 * Привязка ВКонтакте (через API)
 * POST /auth/vk/link
 * Тело: { code: string }
 */
router.post('/vk/link', auth, async (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'Не передан код авторизации' });
    }

    try {
        const vkData = await exchangeVkCode(code);
        const { vkId, email, username } = vkData;

        const existing = await pool.query('SELECT id FROM users WHERE vk_id = $1 AND id != $2', [vkId, req.userId]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Этот аккаунт ВКонтакте уже привязан к другому пользователю' });
        }

        const currentUser = await pool.query('SELECT username FROM users WHERE id = $1', [req.userId]);
        const currentUsername = currentUser.rows[0]?.username;

        let updateQuery = 'UPDATE users SET vk_id = $1, email = COALESCE($2, email)';
        const params = [vkId, email];
        let paramIndex = 3;

        if (!currentUsername || currentUsername.trim() === '') {
            updateQuery += `, username = $${paramIndex++}`;
            params.push(username);
        }

        updateQuery += ` WHERE id = $${paramIndex}`;
        params.push(req.userId);

        await pool.query(updateQuery, params);

        const userResult = await pool.query('SELECT id, username, email, phone, yandex_id, vk_id FROM users WHERE id = $1', [req.userId]);
        await logUserAction(req.userId, 'link_vk', { vkId }, req);
        res.json({ success: true, user: userResult.rows[0] });
    } catch (error) {
        console.error('Ошибка привязки ВКонтакте:', error);
        res.status(500).json({ error: 'Не удалось привязать ВКонтакте' });
    }
});

/**
 * Отвязка Яндекса (через API)
 * DELETE /auth/yandex/unlink
 */
router.delete('/yandex/unlink', auth, async (req, res) => {
    try {
        await pool.query('UPDATE users SET yandex_id = NULL WHERE id = $1', [req.userId]);
        const userResult = await pool.query('SELECT id, username, email, phone, yandex_id, vk_id FROM users WHERE id = $1', [req.userId]);
        await logUserAction(req.userId, 'unlink_yandex', null, req);
        res.json({ success: true, user: userResult.rows[0] });
    } catch (error) {
        console.error('Ошибка отвязки Яндекса:', error);
        res.status(500).json({ error: 'Не удалось отвязать Яндекс' });
    }
});

/**
 * Отвязка ВКонтакте (через API)
 * DELETE /auth/vk/unlink
 */
router.delete('/vk/unlink', auth, async (req, res) => {
    try {
        await pool.query('UPDATE users SET vk_id = NULL WHERE id = $1', [req.userId]);
        const userResult = await pool.query('SELECT id, username, email, phone, yandex_id, vk_id FROM users WHERE id = $1', [req.userId]);
        await logUserAction(req.userId, 'unlink_vk', null, req);
        res.json({ success: true, user: userResult.rows[0] });
    } catch (error) {
        console.error('Ошибка отвязки ВКонтакте:', error);
        res.status(500).json({ error: 'Не удалось отвязать ВКонтакте' });
    }
});

// ========== ИЗМЕНЕНИЕ ИМЕНИ ==========
router.put('/username', auth, async (req, res) => {
    let { newUsername } = req.body;
    if (!newUsername || newUsername.trim().length < 3) return res.status(400).json({ error: 'Минимум 3 символа' });
    newUsername = truncateString(newUsername.trim(), 50);
    if (!newUsername || newUsername.length < 3) return res.status(400).json({ error: 'Минимум 3 символа' });
    try {
        const existing = await pool.query('SELECT id FROM users WHERE username = $1 AND id != $2', [newUsername, req.userId]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Имя уже существует' });
        await pool.query('UPDATE users SET username = $1 WHERE id = $2', [newUsername, req.userId]);
        await logUserAction(req.userId, 'change_username', { newUsername }, req);
        res.json({ message: 'Имя изменено' });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ========== ИЗМЕНЕНИЕ ПАРОЛЯ ==========
router.put('/change-password', auth, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Заполните поля' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Пароль не менее 6 символов' });
    try {
        const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
        const user = result.rows[0];
        if (!user.password_hash) return res.status(400).json({ error: 'Аккаунт через соцсеть, пароля нет' });
        const valid = await bcrypt.compare(oldPassword, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Неверный старый пароль' });
        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashed, req.userId]);
        await logUserAction(req.userId, 'change_password', null, req);
        res.json({ message: 'Пароль изменён' });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ========== РЕГИСТРАЦИЯ ==========
router.post('/register', async (req, res) => {
    const { username, email, phone, password, acceptTerms, city_id, hcaptchaToken, security_question, security_answer } = req.body;
    if (!username || !password || !email) return res.status(400).json({ error: 'Имя, email и пароль обязательны' });
    if (!acceptTerms) return res.status(400).json({ error: 'Примите соглашение' });
    if (!security_question || !security_answer) return res.status(400).json({ error: 'Выберите контрольный вопрос и ответ' });
    if (security_answer.length < 3) return res.status(400).json({ error: 'Ответ минимум 3 символа' });

    const finalUsername = truncateString(username.trim(), 50);
    const finalEmail = truncateString(email.trim().toLowerCase(), 254);
    const finalPhone = truncateString(phone ? phone.trim() : null, 20);
    const finalQuestion = truncateString(security_question, 255);
    const finalAnswer = truncateString(security_answer, 255);

    if (!finalUsername || finalUsername.length < 3) return res.status(400).json({ error: 'Имя должно быть от 3 до 50 символов' });
    if (!finalEmail) return res.status(400).json({ error: 'Email обязателен' });

    const hcaptchaEnabled = await getSetting('hcaptcha_enabled', 'false') === 'true';
    if (hcaptchaEnabled) {
        const secretKey = await getSetting('hcaptcha_secret_key', '');
        if (!secretKey) {
            console.error('❌ Секретный ключ hCaptcha не найден в БД');
            return res.status(500).json({ error: 'Ошибка конфигурации капчи' });
        }
        console.log(`🔍 Регистрация: токен капчи получен: ${hcaptchaToken ? hcaptchaToken.substring(0, 15) + '...' : 'ОТСУТСТВУЕТ'}`);
        console.log(`🔍 Секретный ключ (первые 20 символов): ${secretKey.substring(0, 20)}`);
        try {
            const context = {
                username: finalUsername,
                ip: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'неизвестно'
            };
            const isValid = await verifyToken(hcaptchaToken, secretKey, context);
            console.log(`🔍 Результат проверки капчи: ${isValid}`);
            if (!isValid) {
                return res.status(400).json({ error: 'Пожалуйста, подтвердите, что вы не робот' });
            }
        } catch (err) {
            console.error('❌ Исключение при проверке капчи:', err.message);
            return res.status(500).json({ error: 'Ошибка проверки капчи', details: err.message });
        }
    } else {
        console.log('ℹ️ Капча отключена, проверка пропущена');
    }

    try {
        const existing = await pool.query('SELECT id FROM users WHERE username = $1 OR LOWER(email) = LOWER($2) OR phone = $3', [finalUsername, finalEmail, finalPhone]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Пользователь уже существует' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const hashedAnswer = await bcrypt.hash(finalAnswer.toLowerCase().trim(), 10);
        const result = await pool.query(
            `INSERT INTO users (username, email, phone, password_hash, role, is_email_verified, terms_accepted_at, terms_version, city_id, security_question, security_answer_hash, created_at)
             VALUES ($1, $2, $3, $4, $5, true, NOW(), $6, $7, $8, $9, NOW())
             RETURNING id, username, email, phone, role`,
            [finalUsername, finalEmail, finalPhone, hashedPassword, 'user', '1.0', city_id || null, finalQuestion, hashedAnswer]
        );
        const user = result.rows[0];
        const token = generateToken(user.id);
        await logUserAction(user.id, 'register', { username: finalUsername }, req);
        res.status(201).json({ message: 'Регистрация успешна!', token, user: { id: user.id, username: user.username, email: user.email, phone: user.phone, role: user.role } });
    } catch (err) {
        console.error('❌ Ошибка регистрации:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ВХОД ==========
router.post('/login', async (req, res) => {
    console.log('📥 Получен запрос /login, body:', JSON.stringify(req.body));

    const { username, password, hcaptchaToken } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Введите имя и пароль' });

    const hcaptchaEnabled = await getSetting('hcaptcha_enabled', 'false') === 'true';
    if (hcaptchaEnabled) {
        const secretKey = await getSetting('hcaptcha_secret_key', '');
        if (!secretKey) {
            console.error('❌ Секретный ключ hCaptcha не найден в БД');
            return res.status(500).json({ error: 'Ошибка конфигурации капчи' });
        }
        console.log(`🔍 Вход: токен капчи получен: ${hcaptchaToken ? hcaptchaToken.substring(0, 15) + '...' : 'ОТСУТСТВУЕТ'}`);
        console.log(`🔍 Секретный ключ (первые 20 символов): ${secretKey.substring(0, 20)}`);
        try {
            const context = {
                username: username,
                ip: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'неизвестно'
            };
            const isValid = await verifyToken(hcaptchaToken, secretKey, context);
            console.log(`🔍 Результат проверки капчи: ${isValid}`);
            if (!isValid) {
                return res.status(400).json({ error: 'Пожалуйста, подтвердите, что вы не робот' });
            }
        } catch (err) {
            console.error('❌ Исключение при проверке капчи:', err.message);
            return res.status(500).json({ error: 'Ошибка проверки капчи', details: err.message });
        }
    } else {
        console.log('ℹ️ Капча отключена, проверка пропущена');
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL AND is_blocked = false', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Неверное имя или пароль' });
        const user = result.rows[0];
        if (!user.password_hash) return res.status(401).json({ error: 'Используйте вход через соцсети' });
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Неверное имя или пароль' });
        const token = generateToken(user.id);
        await logUserAction(user.id, 'login', null, req);
        res.json({ token, user: { id: user.id, username: user.username, email: user.email, phone: user.phone, role: user.role, is_blocked: user.is_blocked, avatar_url: user.avatar_url, city_id: user.city_id, whatsapp: user.whatsapp, telegram: user.telegram } });
    } catch (err) {
        console.error('❌ Ошибка входа:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ВОССТАНОВЛЕНИЕ ПАРОЛЯ ==========
router.post('/forgot', async (req, res) => {
    try {
        const { identifier } = req.body;
        if (!identifier) {
            return res.status(400).json({ error: 'Введите имя пользователя или email' });
        }
        const user = await pool.query(
            `SELECT id, username, security_question FROM users WHERE (username = $1 OR LOWER(email) = LOWER($1)) AND deleted_at IS NULL AND password_hash IS NOT NULL`,
            [identifier]
        );
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден или не имеет пароля' });
        }
        const u = user.rows[0];
        if (!u.security_question) {
            return res.status(400).json({ error: 'У этого аккаунта не задан контрольный вопрос. Обратитесь к администратору.' });
        }
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 15 * 60 * 1000);
        
        await pool.query('DELETE FROM password_resets WHERE user_id = $1', [u.id]);
        await pool.query(
            `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)`,
            [u.id, resetToken, expires]
        );
        
        res.json({
            userId: u.id,
            username: u.username,
            security_question: u.security_question,
            resetToken: resetToken,
            expires: expires
        });
    } catch (err) {
        console.error('ОШИБКА в /forgot:', err);
        res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
    }
});

// ========== СБРОС ПАРОЛЯ ==========
router.post('/reset-password', async (req, res) => {
    const { resetToken, security_answer, newPassword } = req.body;
    if (!resetToken || !security_answer || !newPassword) return res.status(400).json({ error: 'Не все данные предоставлены' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    try {
        const reset = await pool.query(`SELECT user_id, expires_at FROM password_resets WHERE token = $1 AND expires_at > NOW()`, [resetToken]);
        if (reset.rows.length === 0) return res.status(400).json({ error: 'Ссылка сброса недействительна или истекла' });
        const userId = reset.rows[0].user_id;
        const user = await pool.query(`SELECT security_answer_hash FROM users WHERE id = $1`, [userId]);
        if (user.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
        const isValidAnswer = await bcrypt.compare(security_answer.toLowerCase().trim(), user.rows[0].security_answer_hash);
        if (!isValidAnswer) return res.status(403).json({ error: 'Неверный ответ на контрольный вопрос' });
        const newHashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHashedPassword, userId]);
        await pool.query(`DELETE FROM password_resets WHERE token = $1`, [resetToken]);
        await logUserAction(userId, 'reset_password', null, req);
        res.json({ message: 'Пароль успешно изменён. Теперь вы можете войти.' });
    } catch (err) {
        console.error('Ошибка в /reset-password:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ (исправлено – добавлены is_partner, partner_plan_id) ==========
router.get('/me', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, username, email, phone, role, is_blocked, created_at, avatar_url, city_id,
                   whatsapp, telegram, vk_id, yandex_id,
                   is_partner, partner_plan_id
            FROM users
            WHERE id = $1
        `, [req.userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка получения профиля:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ОБНОВЛЕНИЕ ПРОФИЛЯ ==========
router.put('/profile', auth, async (req, res) => {
    try {
        console.log('📥 Получен запрос на обновление профиля, body:', req.body);

        let { email, phone, city_id, whatsapp, telegram } = req.body;

        email = truncateString(email, 254);
        phone = truncateString(phone, 20);
        whatsapp = truncateString(whatsapp, 20);
        telegram = truncateString(telegram, 50);
        city_id = city_id ? parseInt(city_id, 10) : null;
        if (city_id && isNaN(city_id)) city_id = null;

        if (phone) {
            const cleaned = phone.replace(/[\s\-()]/g, '');
            if (!/^\+?\d{10,15}$/.test(cleaned)) {
                return res.status(400).json({ error: 'Неверный формат телефона. Допустимы цифры, +, скобки и пробелы.' });
            }
        }

        const currentUser = await pool.query('SELECT phone FROM users WHERE id = $1', [req.userId]);
        if (currentUser.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        const currentPhone = currentUser.rows[0].phone;

        if (phone !== undefined && phone !== currentPhone) {
            if (phone) {
                const existing = await pool.query('SELECT id FROM users WHERE phone = $1 AND id != $2', [phone, req.userId]);
                if (existing.rows.length > 0) {
                    return res.status(400).json({ error: 'Этот номер телефона уже используется другим пользователем.' });
                }
            }
        }

        const updates = [];
        const params = [];
        let idx = 1;

        if (email !== undefined) {
            updates.push(`email = $${idx++}`);
            params.push(email ? email.toLowerCase() : null);
        }
        if (phone !== undefined) {
            updates.push(`phone = $${idx++}`);
            params.push(phone);
        }
        if (city_id !== undefined) {
            updates.push(`city_id = $${idx++}`);
            params.push(city_id);
        }
        if (whatsapp !== undefined) {
            updates.push(`whatsapp = $${idx++}`);
            params.push(whatsapp);
        }
        if (telegram !== undefined) {
            updates.push(`telegram = $${idx++}`);
            params.push(telegram);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет полей для обновления' });
        }

        params.push(req.userId);
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`;
        console.log('🔄 SQL запрос:', query);
        console.log('📦 Параметры:', params);

        await pool.query(query, params);
        await logUserAction(req.userId, 'update_profile', { email, phone, city_id, whatsapp, telegram }, req);

        const updated = await pool.query(
            'SELECT id, username, email, phone, role, city_id, whatsapp, telegram, avatar_url FROM users WHERE id = $1',
            [req.userId]
        );
        res.json({ message: 'Профиль обновлён', user: updated.rows[0] });

    } catch (err) {
        console.error('❌ Ошибка обновления профиля:', err);
        res.status(500).json({ error: 'Ошибка сервера при обновлении профиля', details: err.message });
    }
});

// ========== УДАЛЕНИЕ АККАУНТА ==========
router.delete('/delete-account', auth, async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [req.userId]);
        await logUserAction(req.userId, 'delete_account', null, req);
        res.json({ message: 'Аккаунт удалён' });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ========== ВЫХОД ==========
router.post('/logout', auth, async (req, res) => {
    await logUserAction(req.userId, 'logout', null, req);
    res.json({ message: 'Выход выполнен' });
});

module.exports = router;