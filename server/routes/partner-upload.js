const express = require('express');
const router = express.Router();
const multer = require('multer');
const AdmZip = require('adm-zip');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

// Настройка Multer для загрузки файлов (храним во временную папку)
const upload = multer({ dest: 'temp_uploads/' });

// Функция для безопасного создания папки
function ensureDirSync(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

router.post('/upload-zip', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const userId = req.body.userId; // В реальном проекте берем из токена req.user.id
    const zipPath = req.file.path;
    const extractPath = path.join(__dirname, '../temp_uploads', `extract_${Date.now()}`);

    try {
        // 1. Распаковываем ZIP
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractPath, true);

        // 2. Ищем Excel-файл в архиве
        const files = fs.readdirSync(extractPath);
        const excelFile = files.find(f => f.endsWith('.xlsx'));

        if (!excelFile) {
            throw new Error('В архиве не найден файл Excel (.xlsx)');
        }

        // 3. Читаем Excel
        const workbook = xlsx.readFile(path.join(extractPath, excelFile));
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet);

        let successCount = 0;
        let errors = [];

        // 4. Обрабатываем каждую строку
        for (const row of rows) {
            const extId = row['Внешний ID (Артикул)'];
            if (!extId) continue; // Пропускаем пустые строки

            // Извлекаем данные из Excel
            const title = row['Название'];
            const price = row['Цена'];
            const typeStr = row['Тип (Продам/Куплю)'] || 'Продам';
            const type = typeStr.toLowerCase() === 'куплю' ? 'buy' : 'sell';
            const group = row['Группа'];
            const subgroup = row['Подгруппа'];
            const category = row['Категория'];
            const region = row['Регион'];
            const address = row['Точный адрес'];
            const folderName = row['Папка с фото'] || extId; // Если папка не указана, берем ID
            const description = row['Описание'];
            const statusStr = row['Статус'] || 'Активно';
            const status = statusStr.toLowerCase() === 'продано' ? 'archived' : 'active';

            // Поиск ID категории (по 3-му уровню, если есть, иначе по 2-му)
            let categoryId = null;
            if (category) {
                const catRes = await pool.query('SELECT id FROM categories WHERE name = $1', [category]);
                if (catRes.rows.length) categoryId = catRes.rows[0].id;
            } else if (subgroup) {
                const subRes = await pool.query('SELECT id FROM categories WHERE name = $1', [subgroup]);
                if (subRes.rows.length) categoryId = subRes.rows[0].id;
            } else if (group) {
                const grpRes = await pool.query('SELECT id FROM categories WHERE name = $1', [group]);
                if (grpRes.rows.length) categoryId = grpRes.rows[0].id;
            }

            // Поиск ID региона
            let regionId = null;
            if (region) {
                const regRes = await pool.query('SELECT id FROM regions WHERE name = $1', [region]);
                if (regRes.rows.length) regionId = regRes.rows[0].id;
            }

            // Проверяем, есть ли уже такое объявление у партнера
            const existing = await pool.query(
                'SELECT id FROM listings WHERE external_id = $1 AND user_id = $2',
                [extId, userId]
            );

            let listingId;
            if (existing.rows.length > 0) {
                // Обновляем
                listingId = existing.rows[0].id;
                await pool.query(
                    `UPDATE listings SET title = $1, price = $2, type = $3, description = $4, 
                     category_id = $5, region_id = $6, address = $7, status = $8, updated_at = NOW() 
                     WHERE id = $9`,
                    [title, price, type, description, categoryId, regionId, address, status, listingId]
                );
            } else {
                // Создаем новое
                const insertRes = await pool.query(
                    `INSERT INTO listings (user_id, external_id, title, price, type, description, 
                     category_id, region_id, address, status, created_at, updated_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING id`,
                    [userId, extId, title, price, type, description, categoryId, regionId, address, status]
                );
                listingId = insertRes.rows[0].id;
            }

            // Обработка фотографий
            const photoFolder = path.join(extractPath, 'photos', String(folderName));
            if (fs.existsSync(photoFolder)) {
                const photos = fs.readdirSync(photoFolder).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
                
                // Здесь нужно сохранять фото в папку uploads и записывать в БД.
                // Для примера просто выводим в консоль (вам нужно адаптировать под вашу логику медиа)
                console.log(`Найдено ${photos.length} фото для объявления ${extId}`);
                // TODO: Сохранить фото на сервер и добавить записи в таблицу media
            }

            successCount++;
        }

        // Очистка временных файлов
        fs.unlinkSync(zipPath);
        fs.rmSync(extractPath, { recursive: true, force: true });

        res.json({ success: true, message: `Успешно обработано объявлений: ${successCount}`, errors });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;