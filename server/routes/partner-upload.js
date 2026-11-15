const express = require('express');
const router = express.Router();
const multer = require('multer');
const AdmZip = require('adm-zip');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

const upload = multer({ dest: 'temp_uploads/' });

function ensureDirSync(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function processPhotos(listingId, photoFolderPath) {
    if (!fs.existsSync(photoFolderPath)) return 0;
    const photos = fs.readdirSync(photoFolderPath).filter(f => /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(f));
    if (photos.length === 0) return 0;

    const oldMedia = await pool.query('SELECT file_path FROM listing_media WHERE listing_id = $1', [listingId]);
    for (const m of oldMedia.rows) {
        const oldPath = path.join(__dirname, '../public', m.file_path);
        if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch(e) {} }
    }
    await pool.query('DELETE FROM listing_media WHERE listing_id = $1', [listingId]);

    const uploadsDir = path.join(__dirname, '../public/uploads');
    ensureDirSync(uploadsDir);

    let order = 0;
    for (const photo of photos) {
        const ext = path.extname(photo);
        const uniqueName = `partner_${listingId}_${Date.now()}_${order}${ext}`;
        fs.copyFileSync(path.join(photoFolderPath, photo), path.join(uploadsDir, uniqueName));
        
        await pool.query(`
            INSERT INTO listing_media (listing_id, file_path, file_type, file_order, is_main)
            VALUES ($1, $2, $3, $4, $5)
        `, [listingId, `/uploads/${uniqueName}`, 'image', order, order === 0]);
        order++;
    }
    return photos.length;
}

router.post('/upload-zip', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const userId = req.body.userId; 
    const zipPath = req.file.path;
    const extractPath = path.join(__dirname, '../temp_uploads', `extract_${Date.now()}`);

    try {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractPath, true);

        const files = fs.readdirSync(extractPath);
        const excelFile = files.find(f => f.endsWith('.xlsx'));
        if (!excelFile) throw new Error('В архиве не найден файл Excel (.xlsx)');

        const workbook = xlsx.readFile(path.join(extractPath, excelFile));
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = xlsx.utils.sheet_to_json(sheet);

        let successCount = 0;
        let photoCount = 0;

        for (const row of rows) {
            const extId = row['Внешний ID (Артикул)'];
            if (!extId) continue; 

            const title = row['Название'] || 'Без названия';
            const price = parseFloat(row['Цена']) || 0;
            const typeStr = row['Тип (Продам/Куплю)'] || 'Продам';
            const type = typeStr.toLowerCase() === 'куплю' ? 'buy' : 'sell';
            const group = row['Группа'] ? String(row['Группа']).trim() : null;
            const subgroup = row['Подгруппа'] ? String(row['Подгруппа']).trim() : null;
            const category = row['Категория'] ? String(row['Категория']).trim() : null;
            
            // Берем город и регион, убирая лишние пробелы
            const cityName = row['Город'] ? String(row['Город']).trim() : null;
            const regionName = row['Регион'] ? String(row['Регион']).trim() : null;
            
            const address = row['Точный адрес'] || '';
            const folderName = row['Папка с фото'] || extId; 
            const description = row['Описание'] || '';
            const statusStr = row['Статус'] || 'Активно';
            const status = statusStr.toLowerCase() === 'продано' ? 'archived' : 'active';

            // Поиск категории
            let categoryId = null;
            if (category) {
                const catRes = await pool.query('SELECT id FROM categories WHERE name ILIKE $1', [category]);
                if (catRes.rows.length) categoryId = catRes.rows[0].id;
            } else if (subgroup) {
                const subRes = await pool.query('SELECT id FROM categories WHERE name ILIKE $1', [subgroup]);
                if (subRes.rows.length) categoryId = subRes.rows[0].id;
            } else if (group) {
                const grpRes = await pool.query('SELECT id FROM categories WHERE name ILIKE $1', [group]);
                if (grpRes.rows.length) categoryId = grpRes.rows[0].id;
            }

            // === УМНЫЙ ПОИСК ГОРОДА (С ЛОГАМИ) ===
            let cityId = null;
            
            if (cityName) {
                const citRes = await pool.query('SELECT id FROM cities WHERE name ILIKE $1 LIMIT 1', [`%${cityName}%`]);
                if (citRes.rows.length) cityId = citRes.rows[0].id;
            }

            if (!cityId && regionName) {
                // Пытаемся найти город с названием как у региона (например, "Москва")
                const citByName = await pool.query('SELECT id FROM cities WHERE name ILIKE $1 LIMIT 1', [`%${regionName}%`]);
                if (citByName.rows.length) {
                    cityId = citByName.rows[0].id;
                } else {
                    // Если нет, берем любой первый город из этого региона
                    const cityByRegion = await pool.query(`
                        SELECT c.id FROM cities c
                        JOIN regions r ON c.region_id = r.id
                        WHERE r.name ILIKE $1 LIMIT 1
                    `, [`%${regionName}%`]);
                    if (cityByRegion.rows.length) cityId = cityByRegion.rows[0].id;
                }
            }
            
            console.log(`[Парсер] Объявление "${title}": Город из Excel="${cityName}", Регион="${regionName}" -> Найден cityId=${cityId}`);

            // Запись в БД
            const existing = await pool.query('SELECT id FROM listings WHERE external_id = $1 AND user_id = $2', [extId, userId]);
            let listingId;
            if (existing.rows.length > 0) {
                listingId = existing.rows[0].id;
                await pool.query(
                    `UPDATE listings SET title = $1, price = $2, type = $3, description = $4, 
                     category_id = $5, city_id = $6, address = $7, status = $8, updated_at = NOW() WHERE id = $9`,
                    [title, price, type, description, categoryId, cityId, address, status, listingId]
                );
            } else {
                const insertRes = await pool.query(
                    `INSERT INTO listings (user_id, external_id, title, price, type, description, 
                     category_id, city_id, address, status, created_at, updated_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING id`,
                    [userId, extId, title, price, type, description, categoryId, cityId, address, status]
                );
                listingId = insertRes.rows[0].id;
            }

            const photoFolder = path.join(extractPath, 'photos', String(folderName));
            photoCount += await processPhotos(listingId, photoFolder);
            successCount++;
        }

        fs.unlinkSync(zipPath);
        fs.rmSync(extractPath, { recursive: true, force: true });
        res.json({ success: true, message: `Успешно обработано: ${successCount}. Фото: ${photoCount}.` });

    } catch (err) {
        console.error('Ошибка:', err);
        try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); if (fs.existsSync(extractPath)) fs.rmSync(extractPath, { recursive: true, force: true }); } catch(e) {}
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;