const express = require('express');
const pool = require('../db/pool');
const { auth } = require('../middleware/auth');
const router = express.Router();

// ========== ПОЛУЧИТЬ СОСТАВ ПАКЕТА ==========
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
            `SELECT l.id, l.title, l.price
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

// ========== ДОБАВИТЬ ОБЪЯВЛЕНИЕ В ПАКЕТ ==========
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
            const periodQuery = await pool.query(
                'SELECT value FROM settings WHERE key = $1',
                ['price_autobump_period']
            );
            const period = periodQuery.rows.length > 0 ? parseInt(periodQuery.rows[0].value) || 30 : 30;
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

// ========== УДАЛИТЬ ОБЪЯВЛЕНИЕ ИЗ ПАКЕТА ==========
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

// ========== ПРОДЛИТЬ КОНКРЕТНЫЙ ПАКЕТ ==========
router.post('/:subscriptionId/renew', auth, async (req, res) => {
    const userId = req.userId;
    const subscriptionId = parseInt(req.params.subscriptionId);
    const { listingIds } = req.body; // массив ID объявлений, которые должны быть в пакете после продления

    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
        return res.status(400).json({ error: 'Выберите хотя бы одно объявление' });
    }

    // Проверяем подписку
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

    // Проверяем, что все выбранные объявления принадлежат пользователю и не удалены
    const placeholders = listingIds.map((_, i) => `$${i+2}`).join(',');
    const checkQuery = `
        SELECT id FROM listings
        WHERE id IN (${placeholders}) AND user_id = $1 AND deleted_at IS NULL
    `;
    const checkResult = await pool.query(checkQuery, [userId, ...listingIds]);
    if (checkResult.rows.length !== listingIds.length) {
        return res.status(403).json({ error: 'Некоторые объявления не найдены или не принадлежат вам' });
    }

    // Проверяем, что выбранные объявления не заняты в других активных пакетах того же типа (кроме текущего)
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

    // Дополнительная проверка для автопилота: требуется активное продление для каждого выбранного объявления
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

    // Получаем период из настроек
    const periodKey = package_type === 'listing' ? 'price_renewal_period' : 'price_autobump_period';
    const periodQuery = await pool.query(
        'SELECT value FROM settings WHERE key = $1',
        [periodKey]
    );
    const period = periodQuery.rows.length > 0 ? parseInt(periodQuery.rows[0].value) || 30 : 30;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Обновляем дату окончания
        await client.query(
            `UPDATE user_subscriptions
             SET end_date = NOW() + INTERVAL '${period} days',
                 updated_at = NOW()
             WHERE id = $1`,
            [subscriptionId]
        );

        // Обновляем состав пакета
        await client.query('DELETE FROM subscription_listings WHERE subscription_id = $1', [subscriptionId]);
        for (const listingId of listingIds) {
            await client.query(
                'INSERT INTO subscription_listings (subscription_id, listing_id) VALUES ($1, $2)',
                [subscriptionId, listingId]
            );
            // Если это автопилот, обновляем поля в listing
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

module.exports = router;