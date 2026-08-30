const express = require('express');
const pool = require('../db/pool');
const { auth, isAdmin } = require('../middleware/auth');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const bcrypt = require('bcryptjs');
const router = express.Router();

async function logAdminAction(adminId, action, targetType, targetId, details = null) {
    try {
        await pool.query(
            `INSERT INTO admin_logs (admin_id, action, target_type, target_id, details, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [adminId, action, targetType, targetId, details ? JSON.stringify(details) : null]
        );
    } catch (err) { console.error('Лог не записан:', err); }
}

async function computeCategoryLevel(parentId) {
    if (!parentId) return 1;
    const result = await pool.query('SELECT level FROM categories WHERE id = $1', [parentId]);
    if (result.rows.length === 0) return 1;
    return result.rows[0].level + 1;
}

async function wouldCreateCycle(categoryId, newParentId) {
    if (!newParentId) return false;
    let current = newParentId;
    while (current) {
        if (current == categoryId) return true;
        const parentRes = await pool.query('SELECT parent_id FROM categories WHERE id = $1', [current]);
        if (parentRes.rows.length === 0) break;
        current = parentRes.rows[0].parent_id;
    }
    return false;
}

// ========== СТАТИСТИКА ==========
router.get('/stats', auth, isAdmin, async (req, res) => {
    try {
        const totalUsers = await pool.query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL');
        const totalListings = await pool.query('SELECT COUNT(*) FROM listings WHERE deleted_at IS NULL');
        const totalChats = await pool.query('SELECT COUNT(*) FROM chats');
        const pendingComplaints = await pool.query('SELECT COUNT(*) FROM complaints WHERE status = $1', ['pending']);
        const blockedListings = await pool.query('SELECT COUNT(*) FROM listings WHERE status = $1 AND deleted_at IS NULL', ['blocked']);
        const blockedUsers = await pool.query('SELECT COUNT(*) FROM users WHERE is_blocked = true AND deleted_at IS NULL');
        res.json({
            totalUsers: parseInt(totalUsers.rows[0].count),
            totalListings: parseInt(totalListings.rows[0].count),
            totalChats: parseInt(totalChats.rows[0].count),
            pendingComplaints: parseInt(pendingComplaints.rows[0].count),
            blockedListings: parseInt(blockedListings.rows[0].count),
            blockedUsers: parseInt(blockedUsers.rows[0].count)
        });
    } catch(err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/stats/period', auth, isAdmin, async (req, res) => {
    const { start_date, end_date } = req.query;
    let start = start_date || new Date(Date.now() - 7 * 24 * 3600000).toISOString().split('T')[0];
    let end = end_date || new Date().toISOString().split('T')[0];
    try {
        const result = await pool.query(`
            WITH dates AS (SELECT generate_series($1::date, $2::date, '1 day'::interval)::date as day)
            SELECT d.day, COALESCE(uc.cnt, 0) as new_users, COALESCE(lc.cnt, 0) as new_listings, COALESCE(cc.cnt, 0) as new_chats
            FROM dates d
            LEFT JOIN (SELECT DATE(created_at) as dt, COUNT(*) as cnt FROM users WHERE created_at::date BETWEEN $1 AND $2 AND deleted_at IS NULL GROUP BY dt) uc ON d.day = uc.dt
            LEFT JOIN (SELECT DATE(created_at) as dt, COUNT(*) as cnt FROM listings WHERE created_at::date BETWEEN $1 AND $2 AND deleted_at IS NULL GROUP BY dt) lc ON d.day = lc.dt
            LEFT JOIN (SELECT DATE(created_at) as dt, COUNT(*) as cnt FROM chats WHERE created_at::date BETWEEN $1 AND $2 GROUP BY dt) cc ON d.day = cc.dt
            ORDER BY d.day
        `, [start, end]);
        res.json({ start, end, stats: result.rows });
    } catch(err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/backup', auth, isAdmin, async (req, res) => {
    try {
        const tables = ['users', 'listings', 'categories', 'chats', 'messages', 'complaints', 'ratings'];
        const backup = {};
        for (const table of tables) {
            const result = await pool.query(`SELECT * FROM ${table}`);
            backup[table] = result.rows;
        }
        await logAdminAction(req.userId, 'export_backup', 'system', null, { tables });
        res.setHeader('Content-Disposition', 'attachment; filename="ironmarket_backup.json"');
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(backup, null, 2));
    } catch(err) { res.status(500).json({ error: 'Ошибка создания бэкапа' }); }
});

// ========== ОБЪЯВЛЕНИЯ ==========
router.get('/listings', auth, isAdmin, async (req, res) => {
    const { page = 1, limit = 20, status = '', search = '', user_id = '', showDeleted = 'false' } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT l.*, u.username, c.name as category_name FROM listings l LEFT JOIN users u ON l.user_id = u.id LEFT JOIN categories c ON l.category_id = c.id WHERE TRUE`;
    const params = [];
    let idx = 1;
    if (showDeleted !== 'true') query += ` AND l.deleted_at IS NULL`;
    if (status) { query += ` AND l.status = $${idx++}`; params.push(status); }
    if (search) { query += ` AND (l.title ILIKE $${idx++} OR l.description ILIKE $${idx++})`; params.push(`%${search}%`, `%${search}%`); }
    if (user_id) { query += ` AND l.user_id = $${idx++}`; params.push(user_id); }
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS sub`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    query += ` ORDER BY l.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), offset);
    const result = await pool.query(query, params);
    res.json({ listings: result.rows, total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) });
});

router.post('/listings/:id/block', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    try {
        await pool.query(`UPDATE listings SET status = 'blocked', block_reason = $1, blocked_at = NOW() WHERE id = $2`, [reason || 'Заблокировано администратором', id]);
        await logAdminAction(req.userId, 'block_listing', 'listing', id, { reason });
        res.json({ message: 'Объявление заблокировано' });
    } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/listings/:id/unblock', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`UPDATE listings SET status = 'active', block_reason = NULL, blocked_at = NULL WHERE id = $1`, [id]);
        await logAdminAction(req.userId, 'unblock_listing', 'listing', id);
        res.json({ message: 'Объявление разблокировано' });
    } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

router.delete('/listings/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT deleted_at FROM listings WHERE id = $1', [id]);
        if (result.rows[0]?.deleted_at) return res.status(400).json({ error: 'Объявление уже удалено' });
        await pool.query('UPDATE listings SET deleted_at = NOW() WHERE id = $1', [id]);
        await logAdminAction(req.userId, 'soft_delete_listing', 'listing', id);
        res.json({ message: 'Объявление удалено (будет доступно для восстановления в течение 30 дней)' });
    } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/listings/:id/restore', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT deleted_at FROM listings WHERE id = $1', [id]);
        if (!result.rows[0]?.deleted_at) return res.status(400).json({ error: 'Объявление не было удалено' });
        const deletedAt = new Date(result.rows[0].deleted_at);
        const daysDiff = (new Date() - deletedAt) / (1000 * 60 * 60 * 24);
        if (daysDiff > 30) return res.status(400).json({ error: 'Прошло более 30 дней, восстановление невозможно' });
        await pool.query('UPDATE listings SET deleted_at = NULL WHERE id = $1', [id]);
        await logAdminAction(req.userId, 'restore_listing', 'listing', id);
        res.json({ message: 'Объявление восстановлено' });
    } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

// ========== КАТЕГОРИИ ==========
router.get('/categories/tree', auth, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            WITH RECURSIVE category_tree AS (
                SELECT id, name, slug, parent_id, level, icon, sort_order, is_active,
                       ARRAY[id]::INT[] AS path_ids, ARRAY[name]::VARCHAR[] AS path_names
                FROM categories WHERE parent_id IS NULL
                UNION ALL
                SELECT c.id, c.name, c.slug, c.parent_id, c.level, c.icon, c.sort_order, c.is_active,
                       ct.path_ids || c.id, ct.path_names || c.name
                FROM categories c JOIN category_tree ct ON c.parent_id = ct.id
            ) SELECT * FROM category_tree ORDER BY path_ids;
        `);
        const items = result.rows;
        const map = {};
        const roots = [];
        for (const item of items) {
            map[item.id] = { ...item, children: [] };
        }
        for (const item of items) {
            if (item.parent_id === null) roots.push(map[item.id]);
            else if (map[item.parent_id]) map[item.parent_id].children.push(map[item.id]);
        }
        res.json(roots);
    } catch (err) { res.status(500).json({ error: 'Ошибка загрузки дерева категорий: ' + err.message }); }
});

router.post('/categories', auth, isAdmin, async (req, res) => {
    const { name, slug, parent_id, icon, sort_order } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Название и slug обязательны' });
    try {
        const existing = await pool.query('SELECT id FROM categories WHERE slug = $1', [slug]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Категория с таким slug уже существует' });
        const level = await computeCategoryLevel(parent_id || null);
        const result = await pool.query(`INSERT INTO categories (name, slug, parent_id, level, icon, sort_order, is_active, created_at) VALUES ($1, $2, $3, $4, $5, $6, true, NOW()) RETURNING *`, [name, slug, parent_id || null, level, icon || null, sort_order || 0]);
        await logAdminAction(req.userId, 'create_category', 'category', result.rows[0].id, { name, slug, parent_id });
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера: ' + err.message }); }
});

router.put('/categories/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, slug, parent_id, icon, sort_order, is_active } = req.body;
    try {
        const cat = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
        if (cat.rows.length === 0) return res.status(404).json({ error: 'Категория не найдена' });
        if (slug) {
            const existing = await pool.query('SELECT id FROM categories WHERE slug = $1 AND id != $2', [slug, id]);
            if (existing.rows.length > 0) return res.status(400).json({ error: 'Категория с таким slug уже существует' });
        }
        let newParentId = (parent_id === undefined || parent_id === null) ? cat.rows[0].parent_id : parent_id;
        if (newParentId && newParentId != cat.rows[0].parent_id) {
            const cycle = await wouldCreateCycle(parseInt(id), newParentId);
            if (cycle) return res.status(400).json({ error: 'Нельзя сделать категорию потомком самой себя или её потомка' });
        }
        let newLevel = cat.rows[0].level;
        if (newParentId !== cat.rows[0].parent_id) newLevel = await computeCategoryLevel(newParentId);
        await pool.query(`UPDATE categories SET name = COALESCE($1, name), slug = COALESCE($2, slug), parent_id = $3, level = $4, icon = COALESCE($5, icon), sort_order = COALESCE($6, sort_order), is_active = COALESCE($7, is_active) WHERE id = $8`, [name, slug, newParentId, newLevel, icon, sort_order, is_active, id]);
        if (newParentId !== cat.rows[0].parent_id || newLevel !== cat.rows[0].level) {
            await pool.query(`
                WITH RECURSIVE descendants AS (
                    SELECT id, $1 as new_level FROM categories WHERE id = $2
                    UNION ALL
                    SELECT c.id, d.new_level + 1 FROM categories c JOIN descendants d ON c.parent_id = d.id
                ) UPDATE categories SET level = descendants.new_level FROM descendants WHERE categories.id = descendants.id
            `, [newLevel, id]);
        }
        await logAdminAction(req.userId, 'edit_category', 'category', id, { name, slug, parent_id, is_active });
        res.json({ message: 'Категория обновлена' });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.delete('/categories/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE categories SET is_active = false WHERE id = $1', [id]);
        await logAdminAction(req.userId, 'hide_category', 'category', id);
        res.json({ message: 'Категория скрыта' });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/categories/:id/restore', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE categories SET is_active = true WHERE id = $1', [id]);
        await logAdminAction(req.userId, 'restore_category', 'category', id);
        res.json({ message: 'Категория восстановлена' });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ========== ПОЛЬЗОВАТЕЛИ ==========
router.get('/users', auth, isAdmin, async (req, res) => {
    const { page = 1, limit = 20, search = '', role = '', blocked = '', showDeleted = 'false' } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT id, username, email, phone, role, is_blocked, created_at, deleted_at, security_question, is_partner, partner_plan_id FROM users WHERE TRUE`;
    const params = [];
    let idx = 1;
    if (showDeleted !== 'true') query += ` AND deleted_at IS NULL`;
    if (search) { query += ` AND (username ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (role) { query += ` AND role = $${idx}`; params.push(role); idx++; }
    if (blocked === 'true') query += ` AND is_blocked = true`;
    else if (blocked === 'false') query += ` AND is_blocked = false`;
    query += ` ORDER BY id DESC LIMIT $${idx} OFFSET $${idx+1}`;
    params.push(parseInt(limit), offset);
    try {
        const users = await pool.query(query, params);
        const countResult = await pool.query(`SELECT COUNT(*) FROM users WHERE deleted_at IS NULL`);
        res.json({ users: users.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
    } catch(err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.put('/users/:id/role', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    if (!['user', 'moderator', 'admin'].includes(role)) return res.status(400).json({ error: 'Некорректная роль' });
    try {
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
        await logAdminAction(req.userId, 'change_role', 'user', id, { role });
        res.json({ message: 'Роль обновлена' });
    } catch(err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ===== НОВЫЙ МАРШРУТ ДЛЯ УПРАВЛЕНИЯ СТАТУСОМ ПАРТНЁРА =====
router.put('/users/:id/partner', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { is_partner, partner_plan_id } = req.body;

    if (typeof is_partner !== 'boolean') {
        return res.status(400).json({ error: 'Поле is_partner должно быть boolean' });
    }

    try {
        await pool.query(
            'UPDATE users SET is_partner = $1, partner_plan_id = $2, updated_at = NOW() WHERE id = $3',
            [is_partner, partner_plan_id || null, id]
        );
        await logAdminAction(
            req.userId,
            is_partner ? 'set_partner' : 'remove_partner',
            'user',
            id,
            { is_partner, partner_plan_id }
        );
        res.json({
            message: is_partner ? 'Пользователь назначен партнёром' : 'Статус партнёра снят',
            is_partner
        });
    } catch (err) {
        console.error('Ошибка обновления статуса партнёра:', err);
        res.status(500).json({ error: 'Ошибка сервера при обновлении статуса партнёра' });
    }
});
// ========================================================

router.put('/users/:id/block', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { blocked } = req.body;
    try {
        await pool.query('UPDATE users SET is_blocked = $1 WHERE id = $2', [blocked, id]);
        await logAdminAction(req.userId, blocked ? 'block_user' : 'unblock_user', 'user', id);
        res.json({ message: blocked ? 'Пользователь заблокирован' : 'Пользователь разблокирован' });
    } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

router.delete('/users/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT deleted_at FROM users WHERE id = $1', [id]);
        if (result.rows[0]?.deleted_at) return res.status(400).json({ error: 'Пользователь уже удалён' });
        await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [id]);
        await logAdminAction(req.userId, 'soft_delete_user', 'user', id);
        res.json({ message: 'Пользователь удалён (будет доступен для восстановления в течение 90 дней)' });
    } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

router.post('/users/:id/restore', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT deleted_at FROM users WHERE id = $1', [id]);
        if (!result.rows[0]?.deleted_at) return res.status(400).json({ error: 'Пользователь не был удалён' });
        const deletedAt = new Date(result.rows[0].deleted_at);
        const daysDiff = (new Date() - deletedAt) / (1000 * 60 * 60 * 24);
        if (daysDiff > 90) return res.status(400).json({ error: 'Прошло более 90 дней, восстановление невозможно' });
        await pool.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [id]);
        await logAdminAction(req.userId, 'restore_user', 'user', id);
        res.json({ message: 'Пользователь восстановлен' });
    } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

router.put('/users/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { username, email, phone, role, security_question, security_answer } = req.body;

    if (!username) return res.status(400).json({ error: 'Имя пользователя обязательно' });
    if (role && !['user', 'moderator', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Некорректная роль' });
    }

    try {
        const updates = [];
        const params = [];
        let idx = 1;

        updates.push(`username = $${idx++}`);
        params.push(username);
        updates.push(`email = $${idx++}`);
        params.push(email || null);
        updates.push(`phone = $${idx++}`);
        params.push(phone || null);
        updates.push(`role = $${idx++}`);
        params.push(role || 'user');

        if (security_question !== undefined) {
            updates.push(`security_question = $${idx++}`);
            params.push(security_question === '' ? null : security_question);
        }

        if (security_answer !== undefined) {
            if (security_answer && security_answer.trim() !== '') {
                const hashedAnswer = await bcrypt.hash(security_answer.toLowerCase().trim(), 10);
                updates.push(`security_answer_hash = $${idx++}`);
                params.push(hashedAnswer);
            } else {
                updates.push(`security_answer_hash = $${idx++}`);
                params.push(null);
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        params.push(id);
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`;
        await pool.query(query, params);

        await logAdminAction(req.userId, 'edit_user', 'user', id, { username, email, phone, role });
        res.json({ message: 'Данные пользователя обновлены' });
    } catch (err) {
        console.error('Ошибка обновления пользователя:', err);
        res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
    }
});

router.post('/users/:id/reset-password', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    let { newPassword } = req.body;
    if (!newPassword) newPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    if (newPassword.length < 6) return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, id]);
        await logAdminAction(req.userId, 'reset_password', 'user', id, { autoGenerated: !req.body.newPassword });
        res.json({ message: `Новый пароль: ${newPassword}` });
    } catch(err) { res.status(500).json({ error: 'Ошибка сброса пароля' }); }
});

router.post('/users/create', auth, isAdmin, async (req, res) => {
    const { username, password, phone, email, role = 'user' } = req.body;
    if (!username || !password || !phone) return res.status(400).json({ error: 'Имя пользователя, пароль и телефон обязательны' });
    try {
        const existing = await pool.query('SELECT id FROM users WHERE username = $1 OR phone = $2 OR (email IS NOT NULL AND email = $3) AND deleted_at IS NULL', [username, phone, email || null]);
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Пользователь с таким именем, телефоном или email уже существует' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(`INSERT INTO users (username, password_hash, phone, email, role, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id, username, email, phone, role, is_blocked, created_at`, [username, hashedPassword, phone, email || null, role]);
        const newUser = result.rows[0];
        await logAdminAction(req.userId, 'create_user', 'user', newUser.id, { username, phone, email, role });
        res.status(201).json(newUser);
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/users/export', auth, isAdmin, async (req, res) => {
    const result = await pool.query('SELECT id, username, email, phone, role, is_blocked, created_at, deleted_at FROM users ORDER BY id');
    const rows = result.rows;
    let csv = 'ID;Имя пользователя;Email;Телефон;Роль;Заблокирован;Удалён;Дата регистрации\n';
    for (const row of rows) csv += `${row.id};${row.username};${row.email || ''};${row.phone || ''};${row.role};${row.is_blocked ? 'true' : 'false'};${row.deleted_at ? 'true' : 'false'};${row.created_at}\n`;
    res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send('\uFEFF' + csv);
});

const upload = multer({ storage: multer.memoryStorage() });
router.post('/users/import', auth, isAdmin, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);
    const results = [];
    bufferStream.pipe(csv({ separator: ';', mapHeaders: ({ header }) => header.trim() })).on('data', (data) => results.push(data)).on('end', async () => {
        let imported = 0, errors = 0;
        for (const row of results) {
            if (!row['Имя пользователя'] || !row['Email']) continue;
            try {
                await pool.query(`INSERT INTO users (username, email, phone, role, is_blocked, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (username) DO NOTHING`, [row['Имя пользователя'], row['Email'], row['Телефон'] || null, row['Роль'] || 'user', row['Заблокирован'] === 'true']);
                imported++;
            } catch(e) { errors++; }
        }
        await logAdminAction(req.userId, 'import_users', 'system', null, { imported, errors });
        res.json({ message: `Импорт завершён. Добавлено: ${imported}, ошибок: ${errors}` });
    });
});

// ========== ЖАЛОБЫ ==========
router.get('/complaints/all', auth, isAdmin, async (req, res) => {
    const { status = '', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT c.*, u1.username as complainant_name, l.title as listing_title, u2.username as complained_username FROM complaints c LEFT JOIN users u1 ON c.complainant_id = u1.id LEFT JOIN listings l ON c.listing_id = l.id LEFT JOIN users u2 ON c.complained_user_id = u2.id WHERE TRUE`;
    const params = [];
    let idx = 1;
    if (status) { query += ` AND c.status = $${idx++}`; params.push(status); }
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS sub`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    query += ` ORDER BY c.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    res.json({ complaints: result.rows, total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) });
});

router.post('/complaints/:id/approve', auth, isAdmin, async (req, res) => {
    const complaintId = req.params.id;
    try {
        const complaint = await pool.query('SELECT * FROM complaints WHERE id = $1', [complaintId]);
        if (complaint.rows.length === 0) return res.status(404).json({ error: 'Жалоба не найдена' });
        const comp = complaint.rows[0];
        if (comp.listing_id) await pool.query('UPDATE listings SET status = $1, block_reason = $2, blocked_at = NOW() WHERE id = $3', ['blocked', comp.reason, comp.listing_id]);
        else if (comp.complained_user_id) await pool.query('UPDATE users SET is_blocked = true WHERE id = $1', [comp.complained_user_id]);
        await pool.query('UPDATE complaints SET status = $1 WHERE id = $2', ['reviewed', complaintId]);
        await logAdminAction(req.userId, 'approve_complaint', 'complaint', complaintId);
        res.json({ message: 'Жалоба принята, меры применены' });
    } catch(err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/complaints/:id/reject', auth, isAdmin, async (req, res) => {
    const complaintId = req.params.id;
    try {
        await pool.query('UPDATE complaints SET status = $1 WHERE id = $2', ['rejected', complaintId]);
        await logAdminAction(req.userId, 'reject_complaint', 'complaint', complaintId);
        res.json({ message: 'Жалоба отклонена' });
    } catch(err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ========== ЖУРНАЛ ДЕЙСТВИЙ АДМИНИСТРАТОРОВ ==========
router.get('/logs', auth, isAdmin, async (req, res) => {
    const { page = 1, limit = 30, admin_id = '', action = '', start_date = '', end_date = '' } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT l.*, u.username as admin_name FROM admin_logs l LEFT JOIN users u ON l.admin_id = u.id WHERE TRUE`;
    const params = [];
    let idx = 1;
    if (admin_id) { query += ` AND l.admin_id = $${idx++}`; params.push(admin_id); }
    if (action) { query += ` AND l.action = $${idx++}`; params.push(action); }
    if (start_date) { query += ` AND l.created_at >= $${idx++}`; params.push(start_date); }
    if (end_date) { query += ` AND l.created_at <= $${idx++}`; params.push(end_date); }
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS sub`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    query += ` ORDER BY l.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    res.json({ logs: result.rows, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

// ========== ЖУРНАЛ ДЕЙСТВИЙ ПОЛЬЗОВАТЕЛЕЙ ==========
router.get('/user-actions', auth, isAdmin, async (req, res) => {
    const { page = 1, limit = 30, user_id = '', action = '', start_date = '', end_date = '' } = req.query;
    const offset = (page - 1) * limit;
    let query = `
        SELECT ua.*, u.username
        FROM user_actions ua
        LEFT JOIN users u ON ua.user_id = u.id
        WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (user_id) {
        query += ` AND ua.user_id = $${idx++}`;
        params.push(user_id);
    }
    if (action) {
        query += ` AND ua.action = $${idx++}`;
        params.push(action);
    }
    if (start_date) {
        query += ` AND ua.created_at >= $${idx++}`;
        params.push(start_date);
    }
    if (end_date) {
        query += ` AND ua.created_at <= $${idx++}`;
        params.push(end_date);
    }

    const countQuery = `SELECT COUNT(*) FROM (${query}) AS sub`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY ua.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);
    res.json({
        actions: result.rows,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
    });
});

// ========== НАСТРОЙКИ ==========
router.get('/settings', auth, isAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM settings ORDER BY key');
    res.json(result.rows);
});

router.put('/settings/:key', auth, isAdmin, async (req, res) => {
    const { key } = req.params;
    const { value, type, description } = req.body;
    try {
        await pool.query(`INSERT INTO settings (key, value, type, description, updated_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, type = EXCLUDED.type, description = EXCLUDED.description, updated_at = NOW()`, [key, value, type || 'string', description || '']);
        await logAdminAction(req.userId, 'update_setting', 'setting', null, { key, value });
        res.json({ message: 'Настройка сохранена' });
    } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

// ========== ПОДДЕРЖКА ==========
router.get('/support/unread-count', auth, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT COUNT(*) as total 
            FROM messages m 
            WHERE m.chat_id IN (
                SELECT chat_id 
                FROM support_tickets 
                WHERE chat_id IS NOT NULL 
                  AND status IN ('open', 'in_progress')
            ) 
            AND m.sender_id != $1 
            AND m.is_read = false
        `, [req.userId]);
        res.json({ count: parseInt(result.rows[0].total) });
    } catch (err) { 
        console.error('Ошибка подсчёта непрочитанных:', err);
        res.json({ count: 0 }); 
    }
});

// ========== УПРАВЛЕНИЕ ГОРОДАМИ ==========
router.get('/cities', auth, isAdmin, async (req, res) => {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT c.id, c.name, c.is_popular, c.sort_order, c.region_id, r.name as region_name FROM cities c LEFT JOIN regions r ON c.region_id = r.id WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (search) { query += ` AND c.name ILIKE $${idx}`; params.push(`%${search}%`); idx++; }
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS sub`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    query += ` ORDER BY r.name, c.name LIMIT $${idx} OFFSET $${idx+1}`;
    params.push(parseInt(limit), offset);
    const result = await pool.query(query, params);
    res.json({ cities: result.rows, total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) });
});

router.get('/cities/regions', auth, isAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name FROM regions ORDER BY name');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/cities', auth, isAdmin, async (req, res) => {
    const { name, region_id, is_popular, sort_order } = req.body;
    if (!name || !region_id) return res.status(400).json({ error: 'Название и регион обязательны' });
    try {
        const result = await pool.query(`INSERT INTO cities (name, region_id, is_popular, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`, [name, region_id, is_popular || false, sort_order || 0]);
        await logAdminAction(req.userId, 'create_city', 'city', result.rows[0].id, { name, region_id });
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.put('/cities/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, region_id, is_popular, sort_order } = req.body;
    if (!name || !region_id) return res.status(400).json({ error: 'Название и регион обязательны' });
    try {
        await pool.query(`UPDATE cities SET name = $1, region_id = $2, is_popular = $3, sort_order = $4 WHERE id = $5`, [name, region_id, is_popular || false, sort_order || 0, id]);
        await logAdminAction(req.userId, 'edit_city', 'city', id, { name, region_id });
        res.json({ message: 'Город обновлён' });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.delete('/cities/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const listings = await pool.query('SELECT id FROM listings WHERE city_id = $1 LIMIT 1', [id]);
        if (listings.rows.length > 0) return res.status(400).json({ error: 'Нельзя удалить город, так как есть объявления, привязанные к нему' });
        await pool.query('DELETE FROM cities WHERE id = $1', [id]);
        await logAdminAction(req.userId, 'delete_city', 'city', id);
        res.json({ message: 'Город удалён' });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/cities/regions', auth, isAdmin, async (req, res) => {
    const { name, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Название региона обязательно' });
    try {
        const result = await pool.query(`INSERT INTO regions (name, sort_order) VALUES ($1, $2) RETURNING *`, [name, sort_order || 0]);
        await logAdminAction(req.userId, 'create_region', 'region', result.rows[0].id, { name });
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.put('/cities/regions/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Название региона обязательно' });
    try {
        await pool.query(`UPDATE regions SET name = $1, sort_order = $2 WHERE id = $3`, [name, sort_order || 0, id]);
        await logAdminAction(req.userId, 'edit_region', 'region', id, { name });
        res.json({ message: 'Регион обновлён' });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.delete('/cities/regions/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM regions WHERE id = $1', [id]);
        await logAdminAction(req.userId, 'delete_region', 'region', id);
        res.json({ message: 'Регион удалён' });
    } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ========== ВЫДАЧА БЕСПЛАТНЫХ ПОДПИСОК АДМИНИСТРАТОРОМ ==========
router.post('/subscriptions/grant', auth, isAdmin, async (req, res) => {
    const { userId, packageType, durationDays = 365 } = req.body;
    if (!userId || !packageType || !['listing', 'autobump'].includes(packageType)) {
        return res.status(400).json({ error: 'Неверные параметры: требуется userId и packageType (listing/autobump)' });
    }
    if (durationDays < 1) {
        return res.status(400).json({ error: 'Срок должен быть больше 0 дней' });
    }

    try {
        const user = await pool.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const active = await pool.query(
            `SELECT id, end_date FROM user_subscriptions 
             WHERE user_id = $1 AND package_type = $2 AND is_active = true AND end_date > NOW()`,
            [userId, packageType]
        );

        if (active.rows.length > 0) {
            const newEndDate = new Date(active.rows[0].end_date);
            newEndDate.setDate(newEndDate.getDate() + durationDays);
            await pool.query(
                `UPDATE user_subscriptions 
                 SET end_date = $1, updated_at = NOW() 
                 WHERE id = $2`,
                [newEndDate, active.rows[0].id]
            );
            await logAdminAction(req.userId, 'grant_subscription_extend', 'user_subscription', active.rows[0].id, {
                userId,
                packageType,
                durationDays,
                newEndDate
            });
            return res.json({ 
                message: `Подписка продлена на ${durationDays} дней (до ${newEndDate.toISOString().split('T')[0]})`,
                subscriptionId: active.rows[0].id
            });
        } else {
            const result = await pool.query(
                `INSERT INTO user_subscriptions (user_id, package_type, max_slots, start_date, end_date, is_active, admin_created)
                 VALUES ($1, $2, 5, NOW(), NOW() + INTERVAL '1 day' * $3, true, true)
                 RETURNING id`,
                [userId, packageType, durationDays]
            );
            await logAdminAction(req.userId, 'grant_subscription', 'user_subscription', result.rows[0].id, {
                userId,
                packageType,
                durationDays
            });
            return res.json({ 
                message: `Подписка успешно выдана на ${durationDays} дней`,
                subscriptionId: result.rows[0].id
            });
        }
    } catch (error) {
        console.error('Ошибка при выдаче подписки:', error);
        res.status(500).json({ error: 'Ошибка сервера при выдаче подписки' });
    }
});

// ========== СПИСОК ПОДПИСОК ==========
router.get('/subscriptions', auth, isAdmin, async (req, res) => {
    const { page = 1, limit = 20, package_type = '', status = 'all', search = '', admin_created = '' } = req.query;
    const offset = (page - 1) * limit;

    let params = [];
    let idx = 1;
    let whereClauses = [];

    if (package_type) {
        whereClauses.push(`s.package_type = $${idx++}`);
        params.push(package_type);
    }

    if (search) {
        whereClauses.push(`(u.username ILIKE $${idx++} OR u.email ILIKE $${idx++} OR u.phone ILIKE $${idx++})`);
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status === 'active') {
        whereClauses.push(`s.end_date > NOW() AND s.is_active = true`);
    } else if (status === 'expired') {
        whereClauses.push(`s.end_date <= NOW() OR s.is_active = false`);
    }

    if (admin_created === 'true') {
        whereClauses.push(`s.admin_created = true`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `
        SELECT COUNT(*) as total
        FROM user_subscriptions s
        JOIN users u ON s.user_id = u.id
        ${whereSql}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
        SELECT 
            s.id,
            s.user_id,
            u.username,
            u.email,
            s.package_type,
            s.max_slots,
            s.start_date,
            s.end_date,
            s.is_active,
            s.admin_created,
            (SELECT COUNT(*) FROM subscription_listings WHERE subscription_id = s.id) as listing_count,
            (SELECT ARRAY_AGG(listing_id) FROM subscription_listings WHERE subscription_id = s.id) as listing_ids
        FROM user_subscriptions s
        JOIN users u ON s.user_id = u.id
        ${whereSql}
        ORDER BY s.end_date ASC
        LIMIT $${idx} OFFSET $${idx+1}
    `;
    params.push(parseInt(limit), offset);
    const result = await pool.query(dataQuery, params);

    const now = new Date();
    const subscriptions = result.rows.map(row => {
        const endDate = new Date(row.end_date);
        const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
        return {
            ...row,
            days_left: daysLeft,
            is_active: row.is_active && endDate > now
        };
    });

    res.json({
        subscriptions,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
    });
});

router.put('/subscriptions/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { endDate } = req.body;

    if (!endDate) {
        return res.status(400).json({ error: 'Не указана новая дата окончания' });
    }

    try {
        const sub = await pool.query(
            'SELECT admin_created FROM user_subscriptions WHERE id = $1',
            [id]
        );
        if (sub.rows.length === 0) {
            return res.status(404).json({ error: 'Подписка не найдена' });
        }
        if (!sub.rows[0].admin_created) {
            return res.status(403).json({ error: 'Редактировать можно только подписки, выданные администратором' });
        }

        const newEnd = new Date(endDate);
        if (isNaN(newEnd.getTime())) {
            return res.status(400).json({ error: 'Неверный формат даты' });
        }

        await pool.query(
            'UPDATE user_subscriptions SET end_date = $1, updated_at = NOW() WHERE id = $2',
            [newEnd, id]
        );
        await logAdminAction(req.userId, 'edit_subscription', 'user_subscription', id, { newEndDate: endDate });
        res.json({ message: 'Дата окончания обновлена' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.delete('/subscriptions/:id', auth, isAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const sub = await pool.query(
            'SELECT user_id, package_type, admin_created FROM user_subscriptions WHERE id = $1',
            [id]
        );
        if (sub.rows.length === 0) {
            return res.status(404).json({ error: 'Подписка не найдена' });
        }
        if (!sub.rows[0].admin_created) {
            return res.status(403).json({ error: 'Удалять можно только подписки, выданные администратором' });
        }

        const userId = sub.rows[0].user_id;
        const packageType = sub.rows[0].package_type;

        const listings = await pool.query(
            'SELECT listing_id FROM subscription_listings WHERE subscription_id = $1',
            [id]
        );
        const listingIds = listings.rows.map(r => r.listing_id);

        await pool.query('DELETE FROM subscription_listings WHERE subscription_id = $1', [id]);
        await pool.query('DELETE FROM user_subscriptions WHERE id = $1', [id]);

        if (packageType === 'autobump' && listingIds.length > 0) {
            await pool.query(
                `UPDATE listings SET autobump_enabled = false, autobump_expires_at = NULL 
                 WHERE id = ANY($1::int[])`,
                [listingIds]
            );
        }

        await logAdminAction(req.userId, 'delete_subscription', 'user_subscription', id, { userId, packageType });
        res.json({ message: 'Подписка удалена' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ПОЛНОЕ УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ (навсегда) ==========
router.delete('/users/:id/permanent', auth, isAdmin, async (req, res) => {
    const userId = req.params.id;
    try {
        const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        if (userCheck.rows[0].role === 'admin') {
            return res.status(403).json({ error: 'Нельзя удалить администратора' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query('DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE buyer_id = $1 OR seller_id = $1)', [userId]);
            await client.query('DELETE FROM chats WHERE buyer_id = $1 OR seller_id = $1', [userId]);
            await client.query('DELETE FROM favorites WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM view_history WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM complaints WHERE complainant_id = $1 OR complained_user_id = $1', [userId]);

            const listings = await client.query('SELECT id FROM listings WHERE user_id = $1', [userId]);
            const listingIds = listings.rows.map(row => row.id);
            if (listingIds.length > 0) {
                await client.query('DELETE FROM listing_media WHERE listing_id = ANY($1::int[])', [listingIds]);
                await client.query('DELETE FROM listing_bumps WHERE listing_id = ANY($1::int[])', [listingIds]);
                await client.query('DELETE FROM subscription_listings WHERE listing_id = ANY($1::int[])', [listingIds]);
                await client.query('DELETE FROM listings WHERE id = ANY($1::int[])', [listingIds]);
            }

            await client.query('DELETE FROM subscription_listings WHERE subscription_id IN (SELECT id FROM user_subscriptions WHERE user_id = $1)', [userId]);
            await client.query('DELETE FROM user_subscriptions WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM payments WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM ratings WHERE from_user_id = $1 OR to_user_id = $1', [userId]);
            await client.query('DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id = $1)', [userId]);
            await client.query('DELETE FROM support_tickets WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM user_actions WHERE user_id = $1', [userId]);
            await client.query('DELETE FROM users WHERE id = $1', [userId]);

            await client.query('COMMIT');

            await logAdminAction(req.userId, 'permanent_delete_user', 'user', userId, { deletedUserId: userId });
            res.json({ message: 'Пользователь и все его данные удалены навсегда' });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Ошибка при полном удалении пользователя:', err);
        res.status(500).json({ error: 'Ошибка сервера при удалении пользователя' });
    }
});

// ========== ВНУТРЕННЯЯ РАССЫЛКА (ЧЕРЕЗ ЧАТЫ) ==========
router.post('/newsletter', auth, isAdmin, async (req, res) => {
    const { subject, message } = req.body;
    if (!subject || !message) {
        return res.status(400).json({ error: 'Тема и сообщение обязательны' });
    }

    try {
        const users = await pool.query(
            `SELECT id FROM users 
             WHERE deleted_at IS NULL 
               AND is_blocked = false
               AND id != $1`,
            [req.userId]
        );

        if (users.rows.length === 0) {
            return res.status(400).json({ error: 'Нет активных пользователей для рассылки' });
        }

        let successCount = 0;
        let errorCount = 0;

        async function getSupportUserId() {
            let supportUser = await pool.query(`SELECT id FROM users WHERE username = 'support' LIMIT 1`);
            if (supportUser.rows.length > 0) return supportUser.rows[0].id;
            const bcrypt = require('bcryptjs');
            const randomPass = Math.random().toString(36).slice(-12);
            const hashedPass = await bcrypt.hash(randomPass, 10);
            const fakePhone = '0000000000';
            const newSupport = await pool.query(
                `INSERT INTO users (username, password_hash, role, phone, created_at)
                 VALUES ('support', $1, 'admin', $2, NOW()) RETURNING id`,
                [hashedPass, fakePhone]
            );
            return newSupport.rows[0].id;
        }

        const supportId = await getSupportUserId();

        for (const user of users.rows) {
            try {
                let chat = await pool.query(
                    `SELECT id FROM chats 
                     WHERE ((buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1))
                       AND (status_buyer != 'deleted' OR status_seller != 'deleted')
                     LIMIT 1`,
                    [user.id, supportId]
                );

                let chatId;
                if (chat.rows.length === 0) {
                    const newChat = await pool.query(
                        `INSERT INTO chats (listing_id, buyer_id, seller_id, created_at, updated_at, status_buyer, status_seller)
                         VALUES (NULL, $1, $2, NOW(), NOW(), 'active', 'active')
                         RETURNING id`,
                        [user.id, supportId]
                    );
                    chatId = newChat.rows[0].id;
                } else {
                    chatId = chat.rows[0].id;
                    await pool.query(
                        `UPDATE chats SET status_buyer = 'active', status_seller = 'active', updated_at = NOW() WHERE id = $1`,
                        [chatId]
                    );
                }

                const fullMessage = `📢 **${subject}**\n\n${message}`;
                await pool.query(
                    `INSERT INTO messages (chat_id, sender_id, message, created_at, status, is_read)
                     VALUES ($1, $2, $3, NOW(), 'sent', false)`,
                    [chatId, req.userId, fullMessage]
                );

                successCount++;
            } catch (err) {
                console.error(`Ошибка отправки пользователю ${user.id}:`, err.message);
                errorCount++;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await logAdminAction(req.userId, 'send_newsletter_internal', 'system', null, {
            subject,
            recipients: users.rows.length,
            success: successCount,
            errors: errorCount
        });

        res.json({
            message: `Внутренняя рассылка завершена. Сообщения отправлены: ${successCount}, ошибок: ${errorCount}`,
            total: users.rows.length,
            success: successCount,
            errors: errorCount
        });

    } catch (err) {
        console.error('Ошибка при внутренней рассылке:', err);
        res.status(500).json({ error: 'Ошибка сервера при рассылке: ' + err.message });
    }
});

module.exports = router;