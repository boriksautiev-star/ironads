// routes/categories.js
const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// ========== ПУБЛИЧНЫЕ МАРШРУТЫ ==========

// Получить всё дерево категорий (для админки или построения меню)
router.get('/tree', async (req, res) => {
    try {
        const result = await pool.query(`
            WITH RECURSIVE category_tree AS (
                SELECT id, name, slug, parent_id, level, icon, sort_order, is_active,
                       ARRAY[id] AS path_ids,
                       ARRAY[name] AS path_names
                FROM categories
                WHERE parent_id IS NULL AND is_active = true
                UNION ALL
                SELECT c.id, c.name, c.slug, c.parent_id, c.level, c.icon, c.sort_order, c.is_active,
                       ct.path_ids || c.id,
                       ct.path_names || c.name
                FROM categories c
                JOIN category_tree ct ON c.parent_id = ct.id
                WHERE c.is_active = true
            )
            SELECT * FROM category_tree ORDER BY path_ids;
        `);
        const items = result.rows;
        const map = {};
        const roots = [];
        for (const item of items) {
            map[item.id] = { ...item, children: [] };
        }
        for (const item of items) {
            if (item.parent_id === null) {
                roots.push(map[item.id]);
            } else {
                if (map[item.parent_id]) {
                    map[item.parent_id].children.push(map[item.id]);
                }
            }
        }
        res.json(roots);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить категории по parent_id (если не указан parent_id – корневые)
router.get('/', async (req, res) => {
    const { parent_id } = req.query;
    let query = 'SELECT * FROM categories WHERE is_active = true';
    const params = [];
    if (parent_id === undefined || parent_id === null || parent_id === '') {
        query += ' AND parent_id IS NULL';
    } else {
        query += ' AND parent_id = $1';
        params.push(parent_id);
    }
    query += ' ORDER BY sort_order';
    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить цепочку предков для категории (хлебные крошки)
router.get('/ancestors/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            WITH RECURSIVE ancestors AS (
                SELECT id, name, parent_id, level
                FROM categories WHERE id = $1
                UNION ALL
                SELECT c.id, c.name, c.parent_id, c.level
                FROM categories c
                JOIN ancestors a ON c.id = a.parent_id
            )
            SELECT id, name, level FROM ancestors ORDER BY level ASC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить все дочерние ID (включая все уровни) для переданного ID
router.get('/descendants/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            WITH RECURSIVE descendants AS (
                SELECT id FROM categories WHERE id = $1
                UNION ALL
                SELECT c.id FROM categories c
                JOIN descendants d ON c.parent_id = d.id
            )
            SELECT id FROM descendants
        `, [id]);
        const ids = result.rows.map(row => row.id);
        res.json({ ids });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== ВАЖНО: сначала идут более конкретные маршруты =====
// Получить описание категории по ID (для SEO)
router.get('/:id/description', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT description, seo_title, seo_description FROM categories WHERE id = $1 AND is_active = true',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Категория не найдена' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка получения описания категории:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить одну категорию по ID (публично) – этот маршрут должен быть ПОСЛЕ /:id/description
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM categories WHERE id = $1 AND is_active = true', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Категория не найдена' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;