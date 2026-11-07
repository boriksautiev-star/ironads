const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { auth, isAdmin } = require('../middleware/auth');

// ========== ПУБЛИЧНЫЕ МАРШРУТЫ (ДЛЯ ПАРТНЁРОВ) ==========

// Получить доступные тарифы для партнёра
router.get('/plans', auth, async (req, res) => {
    try {
        const userResult = await pool.query(
            'SELECT is_partner FROM users WHERE id = $1',
            [req.userId]
        );
        if (!userResult.rows[0]?.is_partner) {
            return res.status(403).json({ error: 'Доступно только для партнёров' });
        }
        const result = await pool.query(
            `SELECT id, name, max_listings, price_renewal, price_autobump, period_days
             FROM partner_plans
             WHERE is_active = true
             ORDER BY max_listings ASC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка загрузки тарифов:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== АДМИНСКИЕ МАРШРУТЫ ==========

// Получить все тарифы (включая неактивные)
router.get('/admin/plans', auth, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM partner_plans ORDER BY id'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка загрузки тарифов' });
    }
});

// Создать тариф
router.post('/admin/plans', auth, isAdmin, async (req, res) => {
    const { name, max_listings, price_renewal, price_autobump, period_days } = req.body;
    if (!name || !max_listings) {
        return res.status(400).json({ error: 'Название и лимит обязательны' });
    }
    if (max_listings < 1) {
        return res.status(400).json({ error: 'Лимит должен быть больше 0' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO partner_plans (name, max_listings, price_renewal, price_autobump, period_days)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                name,
                max_listings,
                price_renewal || 0,
                price_autobump || 0,
                period_days || 30
            ]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка создания тарифа' });
    }
});

// Обновить тариф
router.put('/admin/plans/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, max_listings, price_renewal, price_autobump, period_days, is_active } = req.body;
    try {
        const result = await pool.query(
            `UPDATE partner_plans SET
                name = COALESCE($1, name),
                max_listings = COALESCE($2, max_listings),
                price_renewal = COALESCE($3, price_renewal),
                price_autobump = COALESCE($4, price_autobump),
                period_days = COALESCE($5, period_days),
                is_active = COALESCE($6, is_active),
                updated_at = NOW()
             WHERE id = $7
             RETURNING *`,
            [name, max_listings, price_renewal, price_autobump, period_days, is_active, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Тариф не найден' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка обновления тарифа' });
    }
});

// Деактивировать тариф
router.delete('/admin/plans/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'UPDATE partner_plans SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Тариф не найден' });
        }
        res.json({ message: 'Тариф деактивирован' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка деактивации тарифа' });
    }
});

// Назначить партнёра пользователю (установить тариф)
router.put('/admin/users/:userId/partner', auth, isAdmin, async (req, res) => {
    const { userId } = req.params;
    const { planId } = req.body; // может быть null (снять партнёрство)
    try {
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        if (planId) {
            const planCheck = await pool.query(
                'SELECT id FROM partner_plans WHERE id = $1 AND is_active = true',
                [planId]
            );
            if (planCheck.rows.length === 0) {
                return res.status(400).json({ error: 'Тариф не найден или неактивен' });
            }
            await pool.query(
                'UPDATE users SET is_partner = true, partner_plan_id = $1 WHERE id = $2',
                [planId, userId]
            );
        } else {
            await pool.query(
                'UPDATE users SET is_partner = false, partner_plan_id = NULL WHERE id = $1',
                [userId]
            );
        }
        res.json({ message: 'Статус партнёра обновлён' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка назначения партнёра' });
    }
});

// Получить список партнёров (для админки)
router.get('/admin/partners', auth, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.email, u.phone, u.is_partner, u.partner_plan_id,
                   p.name as plan_name, p.max_listings
            FROM users u
            LEFT JOIN partner_plans p ON u.partner_plan_id = p.id
            WHERE u.is_partner = true
            ORDER BY u.id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка загрузки партнёров' });
    }
});

module.exports = router;