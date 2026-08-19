// cleanup.js – удаление осиротевших медиафайлов с ротацией логов (хранение 90 дней)
const fs = require('fs').promises;
const path = require('path');
const pool = require('./db/pool');

const UPLOADS_DIR = path.join(__dirname, 'public/uploads');
const CHAT_MEDIA_DIR = path.join(__dirname, 'public/chat_media');
const LOG_DIR = path.join(__dirname, 'logs'); // отдельная папка для логов

// Гарантируем, что папка для логов существует
async function ensureLogDir() {
    try {
        await fs.access(LOG_DIR);
    } catch {
        await fs.mkdir(LOG_DIR, { recursive: true });
    }
}

// Получаем имя лог-файла с текущей датой внутри папки logs
function getLogFileName() {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(LOG_DIR, `cleanup_${date}.log`);
}

// Запись в лог (в файл с датой)
async function writeLog(level, message) {
    await ensureLogDir(); // убеждаемся, что папка существует
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${level}: ${message}\n`;
    const logFile = getLogFileName();
    try {
        await fs.appendFile(logFile, logLine, 'utf8');
    } catch (err) {
        console.error(`Не удалось записать в лог-файл: ${err.message}`);
    }
    // Дублируем в консоль для ручных запусков
    console.log(logLine.trim());
}

// Удаление старых логов (старше 90 дней)
async function deleteOldLogs() {
    await ensureLogDir();
    const now = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    try {
        const files = await fs.readdir(LOG_DIR);
        for (const file of files) {
            if (file.startsWith('cleanup_') && file.endsWith('.log')) {
                const filePath = path.join(LOG_DIR, file);
                const stats = await fs.stat(filePath);
                if (now - stats.mtimeMs > ninetyDays) {
                    await fs.unlink(filePath);
                    // Можно не писать в лог факт удаления старого лога, чтобы не засорять
                    // console.log(`Удалён старый лог: ${file}`);
                }
            }
        }
    } catch (err) {
        console.error('Ошибка при удалении старых логов:', err.message);
    }
}

async function getFilesInDir(dir) {
    try {
        const files = await fs.readdir(dir);
        const fullPaths = files.map(f => path.join(dir, f));
        const stats = await Promise.all(fullPaths.map(fp => fs.stat(fp)));
        return fullPaths.filter((_, i) => stats[i].isFile());
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

async function getValidMediaPaths() {
    const listingMedia = await pool.query(`
        SELECT file_path FROM listing_media
        WHERE file_path IS NOT NULL AND file_path != ''
    `);
    const messagesMedia = await pool.query(`
        SELECT file_path FROM messages
        WHERE file_path IS NOT NULL AND file_path != ''
    `);

    const validPaths = new Set();
    for (const row of listingMedia.rows) {
        const relative = row.file_path.startsWith('/') ? row.file_path.slice(1) : row.file_path;
        validPaths.add(path.join(process.cwd(), 'public', relative));
    }
    for (const row of messagesMedia.rows) {
        const relative = row.file_path.startsWith('/') ? row.file_path.slice(1) : row.file_path;
        validPaths.add(path.join(process.cwd(), 'public', relative));
    }
    return validPaths;
}

async function cleanDirectory(dir, validPaths) {
    const files = await getFilesInDir(dir);
    let deletedCount = 0;
    for (const file of files) {
        if (!validPaths.has(file)) {
            try {
                await fs.unlink(file);
                await writeLog('INFO', `Удалён: ${file}`);
                deletedCount++;
            } catch (err) {
                await writeLog('ERROR', `Ошибка удаления ${file}: ${err.message}`);
            }
        }
    }
    return deletedCount;
}

async function cleanup() {
    await writeLog('INFO', '=== Начало очистки медиафайлов IronAds ===');
    await deleteOldLogs(); // удаляем логи старше 90 дней

    try {
        const validPaths = await getValidMediaPaths();
        await writeLog('INFO', `Найдено валидных файлов в БД: ${validPaths.size}`);

        await writeLog('INFO', `Проверка папки: ${UPLOADS_DIR}`);
        const deletedUploads = await cleanDirectory(UPLOADS_DIR, validPaths);

        await writeLog('INFO', `Проверка папки: ${CHAT_MEDIA_DIR}`);
        const deletedChat = await cleanDirectory(CHAT_MEDIA_DIR, validPaths);

        await writeLog('INFO', `Удалено файлов: ${deletedUploads + deletedChat}`);
        await writeLog('INFO', '=== Очистка завершена успешно ===');
    } catch (err) {
        await writeLog('ERROR', `Критическая ошибка: ${err.message}`);
        await writeLog('ERROR', err.stack || '');
    } finally {
        await pool.end();
    }
}

cleanup();