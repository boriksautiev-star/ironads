const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// ===== 1. Получить города с фильтрацией =====
router.get('/', async (req, res) => {
    const { search, popular, region_id, limit = 100 } = req.query;
    let query = `
        SELECT c.id, c.name, c.is_popular, c.sort_order, 
               r.id as region_id, r.name as region_name
        FROM cities c
        LEFT JOIN regions r ON c.region_id = r.id
        WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (search) {
        query += ` AND c.name ILIKE $${idx++}`;
        params.push(`%${search}%`);
    }
    if (popular === 'true') {
        query += ` AND c.is_popular = true`;
    }
    if (region_id) {
        query += ` AND c.region_id = $${idx++}`;
        params.push(region_id);
    }
    query += ` ORDER BY c.is_popular DESC, c.sort_order, c.name LIMIT $${idx++}`;
    params.push(parseInt(limit));

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== 2. Получить город по ID =====
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, r.name as region_name 
            FROM cities c
            LEFT JOIN regions r ON c.region_id = r.id
            WHERE c.id = $1
        `, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Город не найден' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== 3. Получить все регионы =====
router.get('/regions/all', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name FROM regions ORDER BY sort_order, name');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== 4. (НОВОЕ) Получить города по ID региона =====
router.get('/by-region/:regionId', async (req, res) => {
    const { regionId } = req.params;
    try {
        const result = await pool.query(`
            SELECT c.id, c.name, c.is_popular, c.sort_order, 
                   r.id as region_id, r.name as region_name
            FROM cities c
            LEFT JOIN regions r ON c.region_id = r.id
            WHERE c.region_id = $1
            ORDER BY c.is_popular DESC, c.sort_order, c.name
        `, [regionId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== 5. (НОВОЕ) Получить все города (на всякий случай) =====
router.get('/all', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.id, c.name, c.region_id, r.name as region_name
            FROM cities c
            LEFT JOIN regions r ON c.region_id = r.id
            ORDER BY c.name
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== 6. Получить данные для страницы города по slug =====
router.get('/slug/:slug', async (req, res) => {
    const { slug } = req.params;
    try {
        const result = await pool.query(`
            SELECT 
                cp.title, 
                cp.description, 
                cp.seo_title, 
                cp.seo_description,
                c.id as city_id,
                c.name as city_name
            FROM city_pages cp
            JOIN cities c ON cp.city_id = c.id
            WHERE cp.slug = $1
        `, [slug]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Город не найден' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;