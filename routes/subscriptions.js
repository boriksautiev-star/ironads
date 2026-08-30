const express = require('express');
const pool = require('../db/pool');
const { auth } = require('../middleware/auth');
const router = express.Router();

console.log('✅ subscriptions.js (суммирование слотов, поддержка партнёров, фото в пакете)');

// ========== ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ==========
async function getSettingValue(key, defaultValue) {
    try {
        const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
        if (result.rows.length === 0) return defaultValue;
        const val = result.rows[0].value;
        if (val === undefined || val === null || val === '') return defaultValue;
        const num = parseFloat(val);
        return isNaN(num) ? defaultValue : num;
    } catch (err) {
        console.error(`❌ Ошибка чтения настройки ${key}:`, err.message);
        return defaultValue;
    }
}

// ========== МАРШРУТ /plans ==========
router.get('/plans', auth, async (req, res) => {
    console.log('📥 Запрос /plans (с поддержкой партнёрских тарифов)');
    try {
        const userResult = await pool.query(
            'SELECT is_partner FROM users WHERE id = $1',
            [req.userId]
        );
        const isPartner = userResult.rows.length > 0 && userResult.rows[0].is_partner === true;

        if (isPartner) {
            const partnerPlans = await pool.query(
                `SELECT id, name, price_renewal, period_days, max_listings
                 FROM partner_plans
                 WHERE is_active = true
                 ORDER BY id`
            );
            const plans = partnerPlans.rows.map(row => ({
                id: row.id,
                name: row.name,
                price: row.price_renewal,
                duration: row.period_days,
                type: 'listing',
                description: row.name,
                max_slots: row.max_listings
            }));
            console.log(`🤝 Партнёрские тарифы (${plans.length} шт.) загружены`);
            res.json(plans);
        } else {
            const priceListing = await getSettingValue('price_listing', 0);
            const periodListing = await getSettingValue('price_listing_period', 30);
            const priceRenewal = await getSettingValue('price_renewal', 0);
            const periodRenewal = await getSettingValue('price_renewal_period', 15);
            const priceAutobump = await getSettingValue('price_autobump', 0);
            const periodAutobump = await getSettingValue('price_autobump_period', 30);

            // Логируем значения настроек для отладки
            console.log('🔧 Текущие настройки тарифов:');
            console.log(`  - Размещение: цена=${priceListing}, период=${periodListing} дней`);
            console.log(`  - Продление: цена=${priceRenewal}, период=${periodRenewal} дней`);
            console.log(`  - Автоподнятие: цена=${priceAutobump}, период=${periodAutobump} дней`);

            // ===== ДИНАМИЧЕСКИЕ ОПИСАНИЯ =====
            const plans = [
                { 
                    id: 1, 
                    name: 'Размещение', 
                    price: priceListing, 
                    duration: periodListing, 
                    type: 'listing', 
                    description: `Разместите объявление на ${periodListing} дней`, 
                    max_slots: 5 
                },
                { 
                    id: 2, 
                    name: 'Продление', 
                    price: priceRenewal, 
                    duration: periodRenewal, 
                    type: 'renewal', 
                    description: `Продлите срок размещения на ${periodRenewal} дней`, 
                    max_slots: 5 
                },
                { 
                    id: 3, 
                    name: 'Автоподнятие', 
                    price: priceAutobump, 
                    duration: periodAutobump, 
                    type: 'autobump', 
                    description: `Автоматическое поднятие объявлений на ${periodAutobump} дней`, 
                    max_slots: 0 
                },
            ];
            res.json(plans);
        }
    } catch (error) {
        console.error('❌ Ошибка получения планов:', error);
        res.status(500).json({ error: 'Ошибка загрузки тарифов' });
    }
});

// ========== ПОЛУЧИТЬ ВСЕ АКТИВНЫЕ ПОДПИСКИ ==========
router.get('/my', auth, async (req, res) => {
    const userId = req.userId;
    try {
        const result = await pool.query(
            `SELECT id, package_type, max_slots, is_active, end_date,
                    (SELECT COUNT(*) FROM subscription_listings WHERE subscription_id = user_subscriptions.id) as listings_count
             FROM user_subscriptions
             WHERE user_id = $1 AND is_active = true AND end_date > NOW()
             ORDER BY end_date ASC`,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения подписок:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ПОКУПКА ПОДПИСКИ ==========
router.post('/purchase', auth, async (req, res) => {
    console.log('📥 Запрос /purchase');
    const userId = req.userId;
    const { planId } = req.body;

    if (!planId) {
        return res.status(400).json({ error: 'Не указан ID плана' });
    }

    try {
        const planMap = {
            1: { type: 'listing', priceKey: 'price_listing', periodKey: 'price_listing_period', slots: 5 },
            2: { type: 'renewal', priceKey: 'price_renewal', periodKey: 'price_renewal_period', slots: 5 },
            3: { type: 'autobump', priceKey: 'price_autobump', periodKey: 'price_autobump_period', slots: 0 }
        };

        let planInfo = planMap[planId];
        let partnerPlan = null;

        if (!planInfo) {
            const partnerResult = await pool.query(
                `SELECT id, name, price_renewal, period_days, max_listings
                 FROM partner_plans
                 WHERE id = $1 AND is_active = true`,
                [planId]
            );
            if (partnerResult.rows.length > 0) {
                partnerPlan = partnerResult.rows[0];
                planInfo = { type: 'listing' };
            } else {
                return res.status(400).json({ error: 'Неверный ID плана' });
            }
        }

        let price, duration, slotsToAdd;
        if (partnerPlan) {
            price = partnerPlan.price_renewal;
            duration = partnerPlan.period_days;
            slotsToAdd = partnerPlan.max_listings;
        } else {
            price = await getSettingValue(planInfo.priceKey, 0);
            duration = await getSettingValue(planInfo.periodKey, 30);
            slotsToAdd = planInfo.slots;
        }

        console.log(`💰 Покупка: цена=${price}, период=${duration}, добавляется слотов=${slotsToAdd} для пользователя ${userId}`);

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + duration);

        const existing = await pool.query(
            `SELECT id, max_slots, end_date, is_active
             FROM user_subscriptions 
             WHERE user_id = $1 AND package_type = $2`,
            [userId, planInfo.type]
        );

        let subscriptionId;
        if (existing.rows.length > 0) {
            const currentMaxSlots = parseInt(existing.rows[0].max_slots) || 0;
            const isActive = existing.rows[0].is_active;
            const currentEndDate = new Date(existing.rows[0].end_date);
            const now = new Date();

            let newMaxSlots;
            let newEndDate;

            if (partnerPlan) {
                newMaxSlots = slotsToAdd;
                newEndDate = endDate;
            } else {
                if (isActive && currentEndDate > now) {
                    newMaxSlots = currentMaxSlots + slotsToAdd;
                    newEndDate = new Date(currentEndDate);
                    newEndDate.setDate(newEndDate.getDate() + duration);
                } else {
                    newMaxSlots = slotsToAdd;
                    newEndDate = endDate;
                }
            }

            const result = await pool.query(
                `UPDATE user_subscriptions 
                 SET is_active = true, 
                     start_date = $1, 
                     end_date = $2, 
                     max_slots = $3, 
                     updated_at = NOW()
                 WHERE id = $4
                 RETURNING id`,
                [startDate, newEndDate, newMaxSlots, existing.rows[0].id]
            );
            subscriptionId = result.rows[0].id;
            console.log(`✅ Обновлена подписка ID ${subscriptionId}, слотов: ${newMaxSlots}, срок до: ${newEndDate}`);
        } else {
            const newMaxSlots = partnerPlan ? slotsToAdd : slotsToAdd;
            const result = await pool.query(
                `INSERT INTO user_subscriptions (user_id, package_type, max_slots, is_active, start_date, end_date)
                 VALUES ($1, $2, $3, true, $4, $5)
                 RETURNING id`,
                [userId, planInfo.type, newMaxSlots, startDate, endDate]
            );
            subscriptionId = result.rows[0].id;
            console.log(`✅ Создана подписка ID ${subscriptionId}, слотов: ${newMaxSlots}`);
        }

        if (planInfo.type === 'autobump') {
            await pool.query(
                `UPDATE users SET is_partner = true WHERE id = $1`,
                [userId]
            );
        }

        res.status(201).json({
            success: true,
            message: 'Подписка приобретена',
            subscriptionId: subscriptionId
        });
    } catch (err) {
        console.error('❌ Ошибка покупки подписки:', err);
        if (err.code === '23505') {
            return res.status(400).json({
                error: 'У вас уже есть подписка этого типа (в том числе неактивная). Если она истекла, попробуйте позже или обратитесь в поддержку.'
            });
        }
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== ПОЛУЧИТЬ СОСТАВ ПАКЕТА С ФОТО =====
router.get('/:subscriptionId/listings', auth, async (req, res) => {
    const userId = req.userId;
    const subscriptionId = parseInt(req.params.subscriptionId);

    try {
        const subCheck = await pool.query(
            'SELECT id, package_type FROM user_subscriptions WHERE id = $1 AND user_id = $2 AND is_active = true AND end_date > NOW()',
            [subscriptionId, userId]
        );
        if (subCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Подписка не найдена или неактивна' });
        }

        const listings = await pool.query(
            `SELECT l.id, l.title, l.price,
                    (SELECT json_build_object('id', m.id, 'file_path', m.file_path, 'file_type', m.file_type)
                     FROM listing_media m
                     WHERE m.listing_id = l.id
                     ORDER BY CASE WHEN m.is_main THEN 0 ELSE 1 END, m.file_order
                     LIMIT 1) as first_media
             FROM subscription_listings sl
             JOIN listings l ON sl.listing_id = l.id
             WHERE sl.subscription_id = $1 AND l.deleted_at IS NULL`,
            [subscriptionId]
        );
        res.json(listings.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка загрузки состава пакета' });
    }
});

// ===== ДОБАВЛЕНИЕ ОБЪЯВЛЕНИЯ В ПАКЕТ =====
router.post('/:subscriptionId/listings', auth, async (req, res) => {
    const userId = req.userId;
    const subscriptionId = parseInt(req.params.subscriptionId);
    const { listingId } = req.body;
    if (!listingId) return res.status(400).json({ error: 'Не указано объявление' });

    try {
        const sub = await pool.query(
            `SELECT id, max_slots, package_type FROM user_subscriptions
             WHERE id = $1 AND user_id = $2 AND is_active = true AND end_date > NOW()`,
            [subscriptionId, userId]
        );
        if (sub.rows.length === 0) {
            return res.status(403).json({ error: 'Подписка не найдена или неактивна' });
        }
        const { max_slots, package_type } = sub.rows[0];

        const listingCheck = await pool.query(
            'SELECT id FROM listings WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
            [listingId, userId]
        );
        if (listingCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Объявление не найдено' });
        }

        const existing = await pool.query(
            'SELECT id FROM subscription_listings WHERE subscription_id = $1 AND listing_id = $2',
            [subscriptionId, listingId]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Объявление уже в этом пакете' });
        }

        const conflictQuery = `
            SELECT s.id FROM user_subscriptions s
            JOIN subscription_listings sl ON s.id = sl.subscription_id
            WHERE sl.listing_id = $1 AND s.package_type = $2 AND s.is_active = true AND s.end_date > NOW() AND s.id != $3
        `;
        const conflict = await pool.query(conflictQuery, [listingId, package_type, subscriptionId]);
        if (conflict.rows.length > 0) {
            return res.status(400).json({ error: 'Объявление уже в другом активном пакете ' + package_type });
        }

        const count = await pool.query(
            'SELECT COUNT(*) FROM subscription_listings WHERE subscription_id = $1',
            [subscriptionId]
        );
        if (parseInt(count.rows[0].count) >= max_slots) {
            return res.status(400).json({ error: 'Пакет заполнен (максимум ' + max_slots + ' объявлений)' });
        }

        await pool.query(
            'INSERT INTO subscription_listings (subscription_id, listing_id) VALUES ($1, $2)',
            [subscriptionId, listingId]
        );

        if (package_type === 'autobump') {
            const period = await getSettingValue('price_autobump_period', 30);
            await pool.query(
                `UPDATE listings SET autobump_enabled = true, autobump_expires_at = NOW() + INTERVAL '${period} days'
                 WHERE id = $1`,
                [listingId]
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка добавления объявления в пакет' });
    }
});

// ===== УДАЛЕНИЕ ОБЪЯВЛЕНИЯ ИЗ ПАКЕТА =====
router.delete('/:subscriptionId/listings/:listingId', auth, async (req, res) => {
    const userId = req.userId;
    const subscriptionId = parseInt(req.params.subscriptionId);
    const listingId = parseInt(req.params.listingId);

    try {
        const sub = await pool.query(
            `SELECT id, package_type FROM user_subscriptions
             WHERE id = $1 AND user_id = $2 AND is_active = true AND end_date > NOW()`,
            [subscriptionId, userId]
        );
        if (sub.rows.length === 0) {
            return res.status(403).json({ error: 'Подписка не найдена или неактивна' });
        }
        const { package_type } = sub.rows[0];

        const del = await pool.query(
            'DELETE FROM subscription_listings WHERE subscription_id = $1 AND listing_id = $2 RETURNING id',
            [subscriptionId, listingId]
        );
        if (del.rows.length === 0) {
            return res.status(404).json({ error: 'Объявление не найдено в пакете' });
        }

        if (package_type === 'autobump') {
            await pool.query(
                `UPDATE listings SET autobump_enabled = false, autobump_expires_at = NULL
                 WHERE id = $1 AND user_id = $2`,
                [listingId, userId]
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка удаления объявления из пакета' });
    }
});

// ===== ПРОДЛЕНИЕ ПАКЕТА =====
router.post('/:subscriptionId/renew', auth, async (req, res) => {
    const userId = req.userId;
    const subscriptionId = parseInt(req.params.subscriptionId);
    const { listingIds } = req.body;

    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
        return res.status(400).json({ error: 'Выберите хотя бы одно объявление' });
    }

    const sub = await pool.query(
        `SELECT id, user_id, package_type, max_slots FROM user_subscriptions
         WHERE id = $1 AND user_id = $2`,
        [subscriptionId, userId]
    );
    if (sub.rows.length === 0) {
        return res.status(403).json({ error: 'Подписка не найдена или не принадлежит вам' });
    }
    const { max_slots, package_type } = sub.rows[0];

    if (listingIds.length > max_slots) {
        return res.status(400).json({ error: `Не более ${max_slots} объявлений в пакете` });
    }

    const placeholders = listingIds.map((_, i) => `$${i+2}`).join(',');
    const checkQuery = `
        SELECT id FROM listings
        WHERE id IN (${placeholders}) AND user_id = $1 AND deleted_at IS NULL
    `;
    const checkResult = await pool.query(checkQuery, [userId, ...listingIds]);
    if (checkResult.rows.length !== listingIds.length) {
        return res.status(403).json({ error: 'Некоторые объявления не найдены или не принадлежат вам' });
    }

    const conflictQuery = `
        SELECT l.id FROM listings l
        JOIN subscription_listings sl ON l.id = sl.listing_id
        JOIN user_subscriptions s ON sl.subscription_id = s.id
        WHERE l.id IN (${placeholders})
          AND s.package_type = $1
          AND s.is_active = true
          AND s.end_date > NOW()
          AND s.id != $2
    `;
    const conflictResult = await pool.query(conflictQuery, [package_type, subscriptionId, ...listingIds]);
    if (conflictResult.rows.length > 0) {
        const conflictIds = conflictResult.rows.map(r => r.id);
        return res.status(400).json({
            error: `Объявления с ID ${conflictIds.join(', ')} уже включены в другой активный пакет ${package_type}.`
        });
    }

    if (package_type === 'autobump') {
        const renewalCheck = await pool.query(
            `SELECT l.id FROM listings l
             JOIN subscription_listings sl ON l.id = sl.listing_id
             JOIN user_subscriptions s ON sl.subscription_id = s.id
             WHERE l.id IN (${placeholders})
               AND s.package_type = 'listing'
               AND s.is_active = true
               AND s.end_date > NOW()
               AND s.user_id = $1`,
            [userId, ...listingIds]
        );
        if (renewalCheck.rows.length !== listingIds.length) {
            return res.status(400).json({ error: 'Для автопилота необходимо активное продление для всех выбранных объявлений.' });
        }
    }

    const periodKey = package_type === 'listing' ? 'price_renewal_period' : 'price_autobump_period';
    const period = await getSettingValue(periodKey, 30);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `UPDATE user_subscriptions
             SET end_date = NOW() + INTERVAL '${period} days',
                 updated_at = NOW()
             WHERE id = $1`,
            [subscriptionId]
        );

        await client.query('DELETE FROM subscription_listings WHERE subscription_id = $1', [subscriptionId]);
        for (const listingId of listingIds) {
            await client.query(
                'INSERT INTO subscription_listings (subscription_id, listing_id) VALUES ($1, $2)',
                [subscriptionId, listingId]
            );
            if (package_type === 'autobump') {
                await client.query(
                    `UPDATE listings SET autobump_enabled = true, autobump_expires_at = NOW() + INTERVAL '${period} days'
                     WHERE id = $1`,
                    [listingId]
                );
            }
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            message: `Пакет продлён до ${new Date(Date.now() + period*24*60*60*1000).toLocaleDateString()}`
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Ошибка продления пакета' });
    } finally {
        client.release();
    }
});

// ===== ОТМЕНА ПОДПИСКИ =====
router.post('/:subscriptionId/cancel', auth, async (req, res) => {
    const userId = req.userId;
    const subscriptionId = parseInt(req.params.subscriptionId);

    try {
        const check = await pool.query(
            'SELECT id FROM user_subscriptions WHERE id = $1 AND user_id = $2 AND is_active = true',
            [subscriptionId, userId]
        );
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Активная подписка не найдена' });
        }

        await pool.query(
            'UPDATE user_subscriptions SET is_active = false, updated_at = NOW() WHERE id = $1',
            [subscriptionId]
        );

        await pool.query(
            `UPDATE listings SET autobump_enabled = false, autobump_expires_at = NULL
             WHERE id IN (
                 SELECT listing_id FROM subscription_listings WHERE subscription_id = $1
             )`,
            [subscriptionId]
        );

        res.json({ success: true, message: 'Подписка отменена' });
    } catch (err) {
        console.error('Ошибка отмены подписки:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== ИНФОРМАЦИЯ О ПОДПИСКЕ =====
router.get('/:subscriptionId', auth, async (req, res) => {
    const userId = req.userId;
    const subscriptionId = parseInt(req.params.subscriptionId);
    try {
        const result = await pool.query(
            `SELECT id, package_type, max_slots, is_active, end_date
             FROM user_subscriptions
             WHERE id = $1 AND user_id = $2`,
            [subscriptionId, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Подписка не найдена' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;