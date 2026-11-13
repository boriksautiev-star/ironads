const ExcelJS = require('exceljs');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

async function generateTemplate() {
    const workbook = new ExcelJS.Workbook();
    
    // ==========================================
    // ЛИСТ 1: Форма для заполнения
    // ==========================================
    const sheet = workbook.addWorksheet('Объявления');
    
    // Убрали колонки для фото, оставили только данные
    sheet.columns = [
        { header: 'Внешний ID (Артикул)*', key: 'id', width: 20 },
        { header: 'Название*', key: 'title', width: 30 },
        { header: 'Цена*', key: 'price', width: 15 },
        { header: 'Тип (sell/buy)*', key: 'type', width: 15 },
        { header: 'Описание', key: 'desc', width: 40 },
        { header: 'Группа*', key: 'group', width: 20 },
        { header: 'Подгруппа*', key: 'subgroup', width: 20 },
        { header: 'Категория*', key: 'category', width: 25 },
        { header: 'Регион*', key: 'region', width: 25 },
        { header: 'Город*', key: 'city', width: 20 },
        { header: 'Точный адрес (ул, дом)', key: 'address', width: 30 }
    ];

    // Оформление заголовков
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } }; 
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Пример строки
    sheet.addRow({
        id: 'auto-101',
        title: 'Kia Rio, 2020',
        price: '1200000',
        type: 'sell',
        desc: 'Отличное состояние, 1 владелец',
        group: 'Транспорт',
        subgroup: 'Автомобили',
        category: 'Легковые',
        region: 'Северная Осетия - Алания',
        city: 'Владикавказ',
        address: 'ул. Мира, 5'
    });

    // ==========================================
    // ЛИСТ 2: Справочник категорий
    // ==========================================
    const refSheet = workbook.addWorksheet('Справочник категорий');
    refSheet.columns = [
        { header: 'Группа', key: 'group', width: 30 },
        { header: 'Подгруппа', key: 'subgroup', width: 30 },
        { header: 'Категория', key: 'category', width: 30 }
    ];
    refSheet.getRow(1).font = { bold: true };
    refSheet.addRow({ group: 'Транспорт', subgroup: 'Автомобили', category: 'Легковые' });
    refSheet.addRow({ group: 'Недвижимость', subgroup: 'Квартиры', category: 'Вторичка' });

    // Сохраняем Excel
    const excelPath = path.join(__dirname, 'Шаблон_объявлений.xlsx');
    await workbook.xlsx.writeFile(excelPath);

    // ==========================================
    // ШАГ 3: Упаковка в ZIP с правильной структурой
    // ==========================================
    const zip = new AdmZip();
    
    // Создаем временную папку photos и пример папки для объявления auto-101
    const photosDir = path.join(__dirname, 'temp_photos');
    const exampleFolder = path.join(photosDir, 'auto-101');
    if (!fs.existsSync(exampleFolder)) fs.mkdirSync(exampleFolder, { recursive: true });
    
    // Создаем текстовую инструкцию внутри папки photos
    fs.writeFileSync(path.join(photosDir, 'ВАЖНО_ПРОЧТИ.txt'), 
        'В этой папке создайте подпапки с названиями, как в колонке "Внешний ID (Артикул)".\n' +
        'Например, если Артикул = auto-101, создайте папку "auto-101" и поместите туда фотографии этого автомобиля.'
    );
    
    // Создаем пустой файл в примере папки (чтобы она не удалялась при упаковке)
    fs.writeFileSync(path.join(exampleFolder, 'положите_сюда_фото.txt'), 'Фото 1, Фото 2 и т.д.');

    // Добавляем Excel и папку photos в архив
    zip.addLocalFile(excelPath);
    zip.addLocalFolder(photosDir, 'photos');

    const templatesDir = path.join(__dirname, 'public', 'templates');
    if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });
    const zipPath = path.join(templatesDir, 'Partner_Template.zip');
    
    zip.writeZip(zipPath);

    // Убираем за собой временные файлы
    fs.unlinkSync(excelPath);
    fs.rmSync(photosDir, { recursive: true, force: true });

    console.log('✅ ZIP-архив с новой структурой папок создан: public/templates/Partner_Template.zip');
}

generateTemplate().catch(console.error);