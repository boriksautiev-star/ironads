// utils/uploadHandler.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Функция для проверки, является ли файл HEIC/HEIF
function isHeicFile(file) {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();
    return ['.heic', '.heif'].includes(ext) || mime.includes('heic') || mime.includes('heif');
}

// Функция конвертации HEIC → JPEG
async function convertHeicToJpeg(filePath) {
    try {
        const outputPath = filePath.replace(/\.[^.]+$/, '.jpg');
        await sharp(filePath)
            .jpeg({ quality: 85 })
            .toFile(outputPath);
        fs.unlinkSync(filePath);
        return outputPath;
    } catch (err) {
        console.warn('⚠️ Не удалось конвертировать HEIC/HEIF:', err.message);
        return filePath;
    }
}

// Расширенный fileFilter (разрешаем по расширению)
function fileFilter(req, file, cb) {
    const allowedMime = [
        'image/jpeg', 'image/jpg', 'image/png',
        'image/gif', 'image/webp',
        'image/heic', 'image/heif'
    ];
    const allowedVideo = ['video/mp4', 'video/webm', 'video/ogg'];
    const allowedExt = ['.heic', '.heif'];

    const mime = file.mimetype.toLowerCase();
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMime.includes(mime) || allowedVideo.includes(mime) || allowedExt.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Неподдерживаемый формат файла. Разрешены: JPEG, PNG, GIF, WebP, HEIC, HEIF, MP4, WebM, OGG.'), false);
    }
}

module.exports = {
    isHeicFile,
    convertHeicToJpeg,
    fileFilter
};