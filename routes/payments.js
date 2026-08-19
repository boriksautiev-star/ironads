const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { YooCheckout } = require('@yookassa/sdk');
const pool = require('../db/pool');
const { auth } = require('../middleware/auth');
const { getPrice, getPeriod } = require('../services/settingsService');

const router = express.Router();

let checkout = null;

function getCheckout() {
    if (!checkout && process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY) {
        checkout = new YooCheckout({
            shopId: process.env.YOOKASSA_SHOP_ID,
            secretKey: process.env.YOOKASSA_SECRET_KEY,
        });
    }
    return checkout;
}

async function getPriceForUser(userId, type, planId = null) {
    if (planId) {
        const result = await pool.query(
            `SELECT price_renewal, price_autobump FROM partner_plans WHERE id = $1 AND is_active = true`,
            [planId]
        );
        if (result.rows.length > 0) {
            return type === 'renewal' ? result.rows[0].price_renewal : result.rows[0].price_autobump;
        }
    }
    const key = type === 'renewal' ? 'price_renewal' : 'price_autobump';
    return await getPrice(key);
}

// ===== ИСПРАВЛЕННАЯ ФУНКЦИЯ АКТИВАЦИИ (исправлено дублирование) =====
async function activateSubscription(userId, packageType, listingIds, period, maxSlots = 5, planId = null) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Проверяем объявления, если они есть
        if (listingIds.length > 0) {
            if (listingIds.length > maxSlots) {
                throw new Error(`В пакете может быть не более ${maxSlots} объявлений`);
            }
            const checkResult = await client.query(
                `SELECT id FROM listings
                 WHERE id = ANY($1::int[]) AND user_id = $2 AND deleted_at IS NULL`,
                [listingIds, userId]
            );
            if (checkResult.rows.length !== listingIds.length) {
                throw new Error('Некоторые объявления не найдены или не принадлежат вам');
            }
        }

        // Если это партнёрский тариф (planId не null)
        if (planId) {
            // Для listing
            const existingListing = await client.query(
                `SELECT id FROM user_subscriptions
                 WHERE user_id = $1 AND package_type = 'listing' AND plan_id = $2`,
                [userId, planId]
            );
            let listingSubId;
            if (existingListing.rows.length > 0) {
                listingSubId = existingListing.rows[0].id;
                await client.query(
                    `UPDATE user_subscriptions
                     SET end_date = NOW() + INTERVAL '${period} days',
                         start_date = NOW(),
                         updated_at = NOW(),
                         is_active = true,
                         max_slots = $1,
                         plan_id = $2
                     WHERE id = $3`,
                    [maxSlots, planId, listingSubId]
                );
                await client.query('DELETE FROM subscription_listings WHERE subscription_id = $1', [listingSubId]);
                console.log(`🔄 Обновлена подписка listing (план ${planId}) для пользователя ${userId}, ID ${listingSubId}`);
            } else {
                const result = await client.query(
                    `INSERT INTO user_subscriptions (user_id, package_type, max_slots, start_date, end_date, is_active, plan_id)
                     VALUES ($1, 'listing', $2, NOW(), NOW() + INTERVAL '${period} days', true, $3)
                     RETURNING id`,
                    [userId, maxSlots, planId]
                );
                listingSubId = result.rows[0].id;
                console.log(`✅ Создана подписка listing (план ${planId}) для пользователя ${userId}, ID ${listingSubId}`);
            }

            // Для autobump
            const existingAutobump = await client.query(
                `SELECT id FROM user_subscriptions
                 WHERE user_id = $1 AND package_type = 'autobump' AND plan_id = $2`,
                [userId, planId]
            );
            let autobumpSubId;
            if (existingAutobump.rows.length > 0) {
                autobumpSubId = existingAutobump.rows[0].id;
                await client.query(
                    `UPDATE user_subscriptions
                     SET end_date = NOW() + INTERVAL '${period} days',
                         start_date = NOW(),
                         updated_at = NOW(),
                         is_active = true,
                         max_slots = $1,
                         plan_id = $2
                     WHERE id = $3`,
                    [maxSlots, planId, autobumpSubId]
                );
                await client.query('DELETE FROM subscription_listings WHERE subscription_id = $1', [autobumpSubId]);
                console.log(`🔄 Обновлена подписка autobump (план ${planId}) для пользователя ${userId}, ID ${autobumpSubId}`);
            } else {
                const result = await client.query(
                    `INSERT INTO user_subscriptions (user_id, package_type, max_slots, start_date, end_date, is_active, plan_id)
                     VALUES ($1, 'autobump', $2, NOW(), NOW() + INTERVAL '${period} days', true, $3)
                     RETURNING id`,
                    [userId, maxSlots, planId]
                );
                autobumpSubId = result.rows[0].id;
                console.log(`✅ Создана подписка autobump (план ${planId}) для пользователя ${userId}, ID ${autobumpSubId}`);
            }

            // Добавляем объявления в обе подписки (если есть)
            for (const listingId of listingIds) {
                await client.query(
                    `INSERT INTO subscription_listings (subscription_id, listing_id)
                     VALUES ($1, $2)`,
                    [listingSubId, listingId]
                );
                await client.query(
                    `INSERT INTO subscription_listings (subscription_id, listing_id)
                     VALUES ($1, $2)`,
                    [autobumpSubId, listingId]
                );
                await client.query(
                    `UPDATE listings SET autobump_enabled = true, autobump_expires_at = NOW() + INTERVAL '${period} days'
                     WHERE id = $1`,
                    [listingId]
                );
            }

        } else {
            // Обычная логика (без planId)
            const existing = await client.query(
                `SELECT id FROM user_subscriptions
                 WHERE user_id = $1 AND package_type = $2`,
                [userId, packageType]
            );
            let subscriptionId;
            if (existing.rows.length > 0) {
                subscriptionId = existing.rows[0].id;
                await client.query(
                    `UPDATE user_subscriptions
                     SET end_date = NOW() + INTERVAL '${period} days',
                         start_date = NOW(),
                         updated_at = NOW(),
                         is_active = true,
                         max_slots = $1,
                         plan_id = NULL
                     WHERE id = $2`,
                    [maxSlots, subscriptionId]
                );
                await client.query('DELETE FROM subscription_listings WHERE subscription_id = $1', [subscriptionId]);
                console.log(`🔄 Обновлена обычная подписка ID ${subscriptionId}`);
            } else {
                const result = await client.query(
                    `INSERT INTO user_subscriptions (user_id, package_type, max_slots, start_date, end_date, is_active, plan_id)
                     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '${period} days', true, NULL)
                     RETURNING id`,
                    [userId, packageType, maxSlots]
                );
                subscriptionId = result.rows[0].id;
                console.log(`✅ Создана обычная подписка ID ${subscriptionId}`);
            }

            for (const listingId of listingIds) {
                await client.query(
                    `INSERT INTO subscription_listings (subscription_id, listing_id)
                     VALUES ($1, $2)`,
                    [subscriptionId, listingId]
                );
                if (packageType === 'autobump') {
                    await client.query(
                        `UPDATE listings SET autobump_enabled = true, autobump_expires_at = NOW() + INTERVAL '${period} days'
                         WHERE id = $1`,
                        [listingId]
                    );
                }
            }
        }

        await client.query('UPDATE users SET is_trial = false, trial_expires_at = NULL WHERE id = $1', [userId]);

        await client.query('COMMIT');
        console.log(`✅ Подписки активированы для пользователя ${userId}`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ========== СОЗДАНИЕ ПЛАТЕЖА ==========
router.post('/create', auth, async (req, res) => {
    const { subscriptionType, listingIds, planId } = req.body;
    const userId = req.userId;

    if (!listingIds || !Array.isArray(listingIds)) {
        return res.status(400).json({ error: 'Неверный формат списка объявлений' });
    }
    if (listingIds.length === 0 && !planId) {
        return res.status(400).json({ error: 'Выберите хотя бы одно объявление или укажите тариф' });
    }

    const ids = listingIds.map(id => parseInt(id, 10));

    let amount = 0;
    let description = '';
    let packageType = '';
    let period = 30;
    let maxSlots = 5;
    let finalPlanId = null;

    let isPartner = false;
    let partnerPlan = null;
    if (planId) {
        const userCheck = await pool.query('SELECT is_partner FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length > 0 && userCheck.rows[0].is_partner) {
            isPartner = true;
        }
    }

    if (isPartner && planId) {
        const planResult = await pool.query(
            `SELECT max_listings, price_renewal, price_autobump, period_days, name
             FROM partner_plans
             WHERE id = $1 AND is_active = true`,
            [planId]
        );
        if (planResult.rows.length === 0) {
            return res.status(400).json({ error: 'Неверный или неактивный тариф' });
        }
        partnerPlan = planResult.rows[0];
        maxSlots = partnerPlan.max_listings;
        period = partnerPlan.period_days;
        finalPlanId = planId;
        if (ids.length > maxSlots) {
            return res.status(400).json({ error: `Тариф позволяет не более ${maxSlots} объявлений` });
        }
        const price = partnerPlan.price_renewal;
        amount = price * 100;
        packageType = 'listing';
        description = `Партнёрский тариф "${partnerPlan.name}" (${ids.length} объявлений, ${period} дней)`;
    } else {
        if (subscriptionType === 'renewal') {
            const price = await getPrice('price_renewal');
            period = await getPeriod('price_renewal_period');
            amount = price * 100;
            description = `Продление пакета (+${ids.length} объявлений, ${period} дней)`;
            packageType = 'listing';
        } else if (subscriptionType === 'autobump') {
            const price = await getPrice('price_autobump');
            period = await getPeriod('price_autobump_period');
            amount = price * 100;
            description = `Автопилот (+${ids.length} объявлений, ${period} дней)`;
            packageType = 'autobump';
        } else {
            return res.status(400).json({ error: 'Неверный тип подписки' });
        }
    }

    if (amount === 0) {
        try {
            await activateSubscription(userId, packageType, ids, period, maxSlots, finalPlanId);
            res.json({
                success: true,
                message: `Подписка активирована бесплатно на ${period} дней, добавлено ${ids.length} слотов`,
                free: true
            });
        } catch (error) {
            console.error('Ошибка бесплатной активации:', error);
            res.status(500).json({ error: 'Ошибка активации подписки: ' + error.message });
        }
        return;
    }

    if (!getCheckout()) {
        return res.status(500).json({ error: 'Платёжная система не настроена. Обратитесь к администратору.' });
    }

    const idempotenceKey = uuidv4();
    try {
        const payment = await getCheckout().createPayment(
            {
                amount: {
                    value: (amount / 100).toFixed(2),
                    currency: 'RUB',
                },
                payment_method_data: {
                    type: 'bank_card',
                },
                confirmation: {
                    type: 'redirect',
                    return_url: process.env.YOOKASSA_RETURN_URL || 'https://ironads.ru/profile',
                },
                description: description,
                metadata: {
                    user_id: userId,
                    subscription_type: subscriptionType,
                    package_type: packageType,
                    listing_ids: ids.join(','),
                    period: period,
                    plan_id: finalPlanId || null,
                    max_slots: maxSlots,
                },
            },
            idempotenceKey
        );

        await pool.query(
            `INSERT INTO payments (user_id, payment_id, amount, currency, status, metadata, created_at)
             VALUES ($1, $2, $3, 'RUB', 'pending', $4, NOW())`,
            [userId, payment.id, amount, JSON.stringify({ subscriptionType, packageType, ids, period, planId: finalPlanId, maxSlots })]
        );

        res.json({
            paymentId: payment.id,
            confirmationUrl: payment.confirmation.confirmation_url,
        });
    } catch (error) {
        console.error('Ошибка создания платежа:', error);
        res.status(500).json({ error: 'Ошибка создания платежа' });
    }
});

// ========== WEBHOOK ==========
router.post('/webhook', async (req, res) => {
    try {
        const event = req.body;
        const paymentId = event.object.id;
        const status = event.object.status;

        const updated = await pool.query(
            `UPDATE payments SET status = $1, updated_at = NOW()
             WHERE payment_id = $2
             RETURNING user_id, metadata`,
            [status, paymentId]
        );

        if (status === 'succeeded' && updated.rows.length > 0) {
            const { user_id, metadata } = updated.rows[0];
            const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
            const packageType = meta.package_type || 'listing';
            const listingIds = meta.ids || meta.listing_ids || [];
            const period = meta.period || 30;
            const maxSlots = meta.max_slots || 5;
            const planId = meta.plan_id || null;

            if (listingIds.length > 0) {
                await activateSubscription(user_id, packageType, listingIds, period, maxSlots, planId);
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Ошибка обработки webhook:', error);
        res.sendStatus(500);
    }
});

// ========== СТАТУС ПОДПИСОК ==========
router.get('/status', auth, async (req, res) => {
    const userId = req.userId;
    try {
        const subs = await pool.query(`
            SELECT s.id, s.package_type, s.max_slots, s.end_date, s.is_active, s.plan_id,
                   json_agg(sl.listing_id) as listing_ids,
                   p.name as plan_name
            FROM user_subscriptions s
            LEFT JOIN subscription_listings sl ON s.id = sl.subscription_id
            LEFT JOIN partner_plans p ON p.id = s.plan_id
            WHERE s.user_id = $1 AND s.is_active = true AND s.end_date > NOW()
            GROUP BY s.id, p.name
        `, [userId]);
        const result = {};
        for (const row of subs.rows) {
            const key = row.package_type;
            if (!result[key]) result[key] = [];
            result[key].push({
                id: row.id,
                end_date: row.end_date,
                max_slots: row.max_slots || 0,
                listing_ids: row.listing_ids || [],
                plan_name: row.plan_name || null,
                plan_id: row.plan_id || null,
                start_date: row.start_date,
                is_active: row.is_active,
            });
        }
        const trial = await pool.query(
            'SELECT is_trial, trial_expires_at FROM users WHERE id = $1',
            [userId]
        );
        if (trial.rows.length > 0 && trial.rows[0].is_trial && new Date(trial.rows[0].trial_expires_at) > new Date()) {
            result.trial = {
                active: true,
                expires_at: trial.rows[0].trial_expires_at,
            };
        }
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения статуса' });
    }
});

// ========== УПРАВЛЕНИЕ СОСТАВОМ ПОДПИСКИ ==========
// Получить список объявлений в подписке (с пагинацией и поиском)
router.get('/subscriptions/:id/listings', auth, async (req, res) => {
    const { id } = req.params;
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    console.log(`📥 GET /subscriptions/${id}/listings, user=${req.userId}`);

    try {
        const subCheck = await pool.query(
            'SELECT user_id, max_slots FROM user_subscriptions WHERE id = $1',
            [id]
        );
        if (subCheck.rows.length === 0) {
            console.warn(`❌ Подписка ${id} не найдена`);
            return res.status(404).json({ error: 'Подписка не найдена' });
        }
        if (subCheck.rows[0].user_id !== req.userId) {
            console.warn(`❌ Доступ запрещён: пользователь ${req.userId} не владелец подписки ${id}`);
            return res.status(403).json({ error: 'Доступ запрещён' });
        }

        const maxSlots = subCheck.rows[0].max_slots;

        let query = `
            SELECT l.id, l.title, l.price, l.created_at,
                   EXISTS(SELECT 1 FROM subscription_listings sl WHERE sl.subscription_id = $1 AND sl.listing_id = l.id) as in_package
            FROM listings l
            WHERE l.user_id = $2 AND l.deleted_at IS NULL
        `;
        const params = [id, req.userId];
        let idx = 3;

        if (search) {
            query += ` AND l.title ILIKE $${idx}`;
            params.push(`%${search}%`);
            idx++;
        }

        const countQuery = `SELECT COUNT(*) FROM (${query}) AS sub`;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        query += ` ORDER BY l.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`;
        params.push(parseInt(limit), offset);

        const result = await pool.query(query, params);

        console.log(`✅ Успешно загружено ${result.rows.length} объявлений для подписки ${id}`);

        res.json({
            listings: result.rows,
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit),
            max_slots: maxSlots
        });
    } catch (err) {
        console.error('❌ Ошибка в GET /subscriptions/:id/listings:', err);
        res.status(500).json({ error: 'Ошибка загрузки списка объявлений: ' + err.message });
    }
});

// Обновить состав подписки (заменить все объявления)
router.put('/subscriptions/:id/listings', auth, async (req, res) => {
    const { id } = req.params;
    const { listingIds } = req.body;

    if (!Array.isArray(listingIds)) {
        return res.status(400).json({ error: 'Ожидается массив listingIds' });
    }

    try {
        const sub = await pool.query(
            'SELECT user_id, package_type, max_slots FROM user_subscriptions WHERE id = $1',
            [id]
        );
        if (sub.rows.length === 0) {
            return res.status(404).json({ error: 'Подписка не найдена' });
        }
        if (sub.rows[0].user_id !== req.userId) {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }

        const maxSlots = sub.rows[0].max_slots;
        if (listingIds.length > maxSlots) {
            return res.status(400).json({ error: `Не более ${maxSlots} объявлений` });
        }

        if (listingIds.length > 0) {
            const check = await pool.query(
                `SELECT id FROM listings WHERE id = ANY($1::int[]) AND user_id = $2 AND deleted_at IS NULL`,
                [listingIds, req.userId]
            );
            if (check.rows.length !== listingIds.length) {
                return res.status(400).json({ error: 'Некоторые объявления не найдены или не принадлежат вам' });
            }
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query('DELETE FROM subscription_listings WHERE subscription_id = $1', [id]);

            for (const lid of listingIds) {
                await client.query(
                    'INSERT INTO subscription_listings (subscription_id, listing_id) VALUES ($1, $2)',
                    [id, lid]
                );
            }

            if (sub.rows[0].package_type === 'autobump') {
                await client.query(
                    `UPDATE listings SET autobump_enabled = false, autobump_expires_at = NULL
                     WHERE user_id = $1 AND autobump_enabled = true`,
                    [req.userId]
                );
                if (listingIds.length > 0) {
                    const subEnd = await client.query(
                        'SELECT end_date FROM user_subscriptions WHERE id = $1',
                        [id]
                    );
                    const endDate = subEnd.rows[0].end_date;
                    await client.query(
                        `UPDATE listings SET autobump_enabled = true, autobump_expires_at = $1
                         WHERE id = ANY($2::int[])`,
                        [endDate, listingIds]
                    );
                }
            }

            await client.query('COMMIT');
            res.json({ message: 'Состав подписки обновлён', count: listingIds.length });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка обновления состава подписки' });
    }
});

router.delete('/subscriptions/:id/listings/:listingId', auth, async (req, res) => {
    const { id, listingId } = req.params;
    
    if (listingId === 'null' || listingId === 'undefined' || isNaN(listingId) || listingId === '') {
        console.warn(`⚠️ Получен некорректный listingId: "${listingId}" для подписки ${id}`);
        return res.status(400).json({ error: 'Неверный ID объявления' });
    }

    try {
        const sub = await pool.query('SELECT user_id, package_type FROM user_subscriptions WHERE id = $1', [id]);
        if (sub.rows.length === 0) {
            console.warn(`❌ Подписка ${id} не найдена`);
            return res.status(404).json({ error: 'Подписка не найдена' });
        }
        if (sub.rows[0].user_id !== req.userId) {
            console.warn(`❌ Доступ запрещён: пользователь ${req.userId} не владелец подписки ${id}`);
            return res.status(403).json({ error: 'Доступ запрещён' });
        }

        await pool.query('DELETE FROM subscription_listings WHERE subscription_id = $1 AND listing_id = $2', [id, listingId]);

        if (sub.rows[0].package_type === 'autobump') {
            await pool.query('UPDATE listings SET autobump_enabled = false, autobump_expires_at = NULL WHERE id = $1', [listingId]);
        }
        res.json({ message: 'Объявление удалено из подписки' });
    } catch (err) {
        console.error('Ошибка при удалении объявления из подписки:', err);
        res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
    }
});

router.delete('/subscriptions/:id/listings/clear', auth, async (req, res) => {
    const { id } = req.params;
    
    if (!id || id === 'null' || id === 'undefined') {
        console.warn(`⚠️ Получен некорректный id подписки: "${id}"`);
        return res.status(400).json({ error: 'Неверный ID подписки' });
    }

    console.log(`🗑️ Запрос на очистку подписки ID: ${id}, пользователь: ${req.userId}`);

    try {
        const sub = await pool.query('SELECT user_id, package_type FROM user_subscriptions WHERE id = $1', [id]);
        if (sub.rows.length === 0) {
            console.warn(`❌ Подписка ${id} не найдена`);
            return res.status(404).json({ error: 'Подписка не найдена' });
        }
        if (sub.rows[0].user_id !== req.userId) {
            console.warn(`❌ Доступ запрещён: пользователь ${req.userId} не владелец подписки ${id}`);
            return res.status(403).json({ error: 'Доступ запрещён' });
        }

        console.log(`✅ Подписка найдена, удаляем все объявления...`);
        await pool.query('DELETE FROM subscription_listings WHERE subscription_id = $1', [id]);

        if (sub.rows[0].package_type === 'autobump') {
            console.log(`🔄 Сбрасываем флаг автопилота для пользователя ${req.userId}`);
            await pool.query('UPDATE listings SET autobump_enabled = false, autobump_expires_at = NULL WHERE user_id = $1 AND autobump_enabled = true', [req.userId]);
        }
        console.log(`✅ Все объявления удалены из подписки ${id}`);
        res.json({ message: 'Все объявления удалены из подписки' });
    } catch (err) {
        console.error('Ошибка при очистке подписки:', err);
        res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
    }
});

module.exports = router;