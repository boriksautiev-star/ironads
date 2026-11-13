require('dotenv').config();
const ExcelJS = require('exceljs');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function generatePerfectTemplate() {
    try {
        console.log('Загрузка категорий...');
        const catRes = await pool.query('SELECT id, name, parent_id, level, sort_order FROM categories');
        const cats = catRes.rows;
        
        const groups = cats.filter(c => c.level === 1).sort((a, b) => a.id - b.id);
        const subgroups = cats.filter(c => c.level === 2).sort((a, b) => a.parent_id - b.parent_id || a.sort_order - b.sort_order);
        const categories = cats.filter(c => c.level === 3).sort((a, b) => a.parent_id - b.parent_id || a.sort_order - b.sort_order);

        const workbook = new ExcelJS.Workbook();
        workbook.calcProperties.fullCalcOnLoad = true;
        
        const sheet = workbook.addWorksheet('Объявления');
        
        sheet.columns = [
            { header: 'Внешний ID (Артикул)*', key: 'id', width: 20 },
            { header: 'Название*', key: 'title', width: 30 },
            { header: 'Цена*', key: 'price', width: 15 },
            { header: 'Тип (выберите)*', key: 'type', width: 15 },
            { header: 'Группа*', key: 'group', width: 25 },
            { header: 'Подгруппа*', key: 'subgroup', width: 25 },
            { header: 'Категория*', key: 'category', width: 25 },
            { header: 'Регион*', key: 'region', width: 25 },
            { header: 'Город*', key: 'city', width: 25 },
            { header: 'Точный адрес', key: 'address', width: 30 },
            { header: 'Папка с фото*', key: 'folder', width: 20 },
            { header: 'Описание', key: 'desc', width: 40 },
            { header: 'ID Группы (скрыто)', key: 'g_id', width: 10 }, // Колонка M
            { header: 'ID Подгруппы (скрыто)', key: 's_id', width: 10 }  // Колонка N
        ];

        // Прячем служебные колонки
        sheet.getColumn(13).hidden = true;
        sheet.getColumn(14).hidden = true;

        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };

        // СКРЫТЫЙ СПРАВОЧНИК (Только латиница в названии листа)
        const dictSheet = workbook.addWorksheet('Dict');
        dictSheet.state = 'hidden'; 

        // Таблица перевода имени группы в ID
        dictSheet.getCell('A1').value = 'GroupName';
        dictSheet.getCell('B1').value = 'GroupID';
        groups.forEach((g, i) => {
            dictSheet.getCell(`A${i+2}`).value = String(g.name).trim();
            dictSheet.getCell(`B${i+2}`).value = g.id;
        });

        // Таблица перевода имени подгруппы в ID
        dictSheet.getCell('C1').value = 'SubName';
        dictSheet.getCell('D1').value = 'SubID';
        subgroups.forEach((s, i) => {
            dictSheet.getCell(`C${i+2}`).value = String(s.name).trim();
            dictSheet.getCell(`D${i+2}`).value = s.id;
        });

        // Уникальные группы для выбора
        const uniqueGroups = [...new Set(groups.map(g => String(g.name).trim()))];
        dictSheet.getColumn(7).values = ['UniqueGroups', ...uniqueGroups];

        // Регионы и города
        const regRes = await pool.query('SELECT name FROM regions ORDER BY name');
        dictSheet.getColumn(5).values = ['Regions', ...regRes.rows.map(r => r.name)];
        
        const cityRes = await pool.query('SELECT name FROM cities ORDER BY name');
        dictSheet.getColumn(6).values = ['Cities', ...cityRes.rows.map(c => c.name)];

        // ==========================================
        // СОЗДАЕМ ИМЕНОВАННЫЕ ДИАПАЗОНЫ (Только ASCII символы!)
        // ==========================================
        let col = 8; // Начинаем с колонки H (8)
        
        // Подгруппы для каждой Группы (G_1, G_2...)
        for (const group of groups) {
            const mySubs = subgroups.filter(s => s.parent_id === group.id).map(s => String(s.name).trim());
            if (mySubs.length > 0) {
                dictSheet.getColumn(col).values = [group.name, ...mySubs];
                const L = dictSheet.getColumn(col).letter;
                workbook.definedNames.add(`G_${group.id}`, `Dict!$${L}$2:$${L}$${mySubs.length + 1}`);
                col++;
            }
        }

        // Категории для каждой Подгруппы (S_29, S_34...)
        for (const sub of subgroups) {
            const myCats = categories.filter(c => c.parent_id === sub.id).map(c => String(c.name).trim());
            if (myCats.length > 0) {
                dictSheet.getColumn(col).values = [sub.name, ...myCats];
                const L = dictSheet.getColumn(col).letter;
                workbook.definedNames.add(`S_${sub.id}`, `Dict!$${L}$2:$${L}$${myCats.length + 1}`);
                col++;
            }
        }

        // ==========================================
        // ВАЛИДАЦИЯ (СПИСКИ)
        // ==========================================
        sheet.dataValidations.add('D2:D1000', { type: 'list', formulae: ['"Продам,Куплю"'] });
        sheet.dataValidations.add('H2:H1000', { type: 'list', formulae: [`=Dict!$E$2:$E$${regRes.rows.length + 1}`] });
        sheet.dataValidations.add('I2:I1000', { type: 'list', formulae: [`=Dict!$F$2:$F$${cityRes.rows.length + 1}`] });
        sheet.dataValidations.add('E2:E1000', { type: 'list', formulae: [`=Dict!$G$2:$G$${uniqueGroups.length + 1}`] });

        // Подгруппа (использует ID из скрытой колонки M)
        sheet.dataValidations.add('F2:F1000', { 
            type: 'list', 
            formulae: [`=IFERROR(INDIRECT("G_" & $M2), "")`] 
        });

        // Категория (использует ID из скрытой колонки N)
        sheet.dataValidations.add('G2:G1000', { 
            type: 'list', 
            formulae: [`=IFERROR(INDIRECT("S_" & $N2), "")`] 
        });

        // Формулы для скрытых колонок (M и N) - ищем ID по названию
        for (let i = 2; i <= 1000; i++) {
            sheet.getCell(`M${i}`).value = { formula: `IFERROR(VLOOKUP($E${i}, Dict!$A:$B, 2, 0), 0)` };
            sheet.getCell(`N${i}`).value = { formula: `IFERROR(VLOOKUP($F${i}, Dict!$C:$D, 2, 0), 0)` };
        }

        // Пример
        sheet.getCell('A2').value = 'auto-101';
        sheet.getCell('B2').value = 'Kia Rio, 2020';
        sheet.getCell('C2').value = '1200000';
        sheet.getCell('D2').value = 'Продам';
        sheet.getCell('E2').value = 'Транспорт';
        sheet.getCell('F2').value = 'Легковые автомобили';
        sheet.getCell('G2').value = 'Седаны';
        sheet.getCell('H2').value = 'Северная Осетия - Алания';
        sheet.getCell('I2').value = 'Владикавказ';
        sheet.getCell('J2').value = 'ул. Мира, 5';
        sheet.getCell('K2').value = 'auto-101';
        sheet.getCell('L2').value = 'Отличное состояние';

        const excelPath = path.join(__dirname, 'Partner_Template.xlsx');
        await workbook.xlsx.writeFile(excelPath);

        const zip = new AdmZip();
        const photosDir = path.join(__dirname, 'temp_photos');
        const exampleFolder = path.join(photosDir, 'auto-101');
        
        if (!fs.existsSync(exampleFolder)) fs.mkdirSync(exampleFolder, { recursive: true });
        fs.writeFileSync(path.join(photosDir, 'ВАЖНО_ПРОЧТИ.txt'), 
            'Создайте папку с названием, как в колонке "Папка с фото".\nНапример, папка "auto-101".'
        );
        fs.writeFileSync(path.join(exampleFolder, '1.jpg.txt'), 'Замените на фото');

        zip.addLocalFile(excelPath);
        zip.addLocalFolder(photosDir, 'photos');

        const templatesDir = path.join(__dirname, 'public', 'templates');
        if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });
        zip.writeZip(path.join(templatesDir, 'Partner_Template.zip'));

        fs.unlinkSync(excelPath);
        fs.rmSync(photosDir, { recursive: true, force: true });

        console.log('✅ Шаблон с Named Ranges и VLOOKUP создан!');
    } catch (e) {
        console.error('Ошибка:', e.message);
    } finally {
        pool.end();
    }
}

generatePerfectTemplate();