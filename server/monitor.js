const https = require('https');
const { exec } = require('child_process');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ========== НАСТРОЙКИ ==========
const CHECK_INTERVAL = 10000;          // 10 секунд
const RESTART_COOLDOWN = 5000;        // 5 секунд после перезапуска
const MAX_FAILS = 3;                  // Количество сбоев для перезапуска
const CRITICAL_RESTART_LIMIT = 5;     // Лимит перезапусков перед критическим уведомлением
const RETRY_INTERVAL = 10000;         // Интервал повторных проверок после сбоя

// ========== ВРЕМЯ ==========
function getLocalTimestamp() {
    const now = new Date();
    const offset = 3;
    const local = new Date(now.getTime() + offset * 60 * 60 * 1000);
    return local.toISOString().replace('T', ' ').slice(0, 19);
}

// ========== ЛОГИ ==========
const LOG_DIR = path.join(__dirname, 'monitor_logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function getLogFileName() {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(LOG_DIR, `monitor_${date}.log`);
}

function writeLog(level, message) {
    const timestamp = getLocalTimestamp();
    const logLine = `[${timestamp}] ${level}: ${message}\n`;
    const logFile = getLogFileName();
    fs.appendFile(logFile, logLine, 'utf8', (err) => {
        if (err) console.error('❌ Ошибка записи в лог-файл:', err.message);
    });
}

// ========== EMAIL ==========
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

async function sendEmail(subject, body) {
    try {
        const info = await transporter.sendMail({
            from: `"IronAds Monitor" <${process.env.EMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
            subject: subject,
            text: body,
        });
        console.log(`📧 Email отправлен: ${info.messageId}`);
        writeLog('INFO', `Email отправлен: ${subject}`);
    } catch (error) {
        console.error('❌ Ошибка отправки email:', error.message);
        writeLog('ERROR', `Ошибка отправки email: ${error.message}`);
    }
}

// ========== МОНИТОРИНГ ==========
let failCount = 0;
let restartCount = 0;
let lastRestart = 0;
let isDown = false;
let downStartTime = null;
let recoveryTimer = null;
let cooldownTimer = null;

function clearTimers() {
    if (recoveryTimer) {
        clearTimeout(recoveryTimer);
        recoveryTimer = null;
    }
    if (cooldownTimer) {
        clearTimeout(cooldownTimer);
        cooldownTimer = null;
    }
}

function scheduleRecoveryCheck() {
    clearTimers();
    recoveryTimer = setTimeout(() => {
        if (isDown) {
            writeLog('ACTION', 'Истекло время ожидания восстановления, повторный перезапуск...');
            console.log('🔄 Истекло время ожидания, перезапускаем снова...');
            performRestart();
            if (isDown && restartCount < CRITICAL_RESTART_LIMIT) {
                scheduleRecoveryCheck();
            }
        }
    }, RETRY_INTERVAL);
}

function performRestart() {
    writeLog('INFO', '=== НАЧАЛО ПЕРЕЗАПУСКА ===');
    
    // Перезапуск ironads через PM2
    exec('pm2 restart ironads', (error, stdout, stderr) => {
        if (error) {
            const msg = `Ошибка перезапуска ironads: ${error.message}\nSTDERR: ${stderr || 'нет'}`;
            console.error(`❌ ${msg}`);
            writeLog('ERROR', msg);
            sendEmail('❌ Ошибка перезапуска ironads', msg);
        } else {
            writeLog('INFO', `ironads перезапущен: ${stdout || 'успешно'}`);
        }
    });

    // Перезапуск Nginx с полными путями
    const nginxCmd = 'C:\\nginx\\nginx.exe -p C:\\nginx -c C:\\nginx\\conf\\nginx.conf';
    exec(`${nginxCmd} -s stop`, { cwd: 'C:\\nginx' }, (error, stdout, stderr) => {
        if (error) {
            const msg = `Ошибка остановки Nginx: ${error.message}\nSTDERR: ${stderr || 'нет'}`;
            console.error(`❌ ${msg}`);
            writeLog('ERROR', msg);
            // Пытаемся запустить даже если остановка не удалась
            exec(nginxCmd, { cwd: 'C:\\nginx' }, (err, out, errOut) => {
                if (err) {
                    writeLog('ERROR', `Ошибка запуска Nginx: ${err.message}\nSTDERR: ${errOut || 'нет'}`);
                } else {
                    writeLog('INFO', `Nginx запущен: ${out || 'успешно'}`);
                }
            });
        } else {
            writeLog('INFO', `Nginx остановлен: ${stdout || 'успешно'}`);
            exec(nginxCmd, { cwd: 'C:\\nginx' }, (err, out, errOut) => {
                if (err) {
                    writeLog('ERROR', `Ошибка запуска Nginx: ${err.message}\nSTDERR: ${errOut || 'нет'}`);
                } else {
                    writeLog('INFO', `Nginx запущен: ${out || 'успешно'}`);
                }
            });
        }
    });

    lastRestart = Date.now();
    failCount = 0;
    isDown = true;
    restartCount++;
    writeLog('INFO', `Перезапуск #${restartCount} выполнен`);

    clearTimers();
    cooldownTimer = setTimeout(() => {
        writeLog('INFO', 'Cooldown истёк, выполняем принудительную проверку...');
        checkSite();
    }, RESTART_COOLDOWN);

    if (restartCount >= CRITICAL_RESTART_LIMIT) {
        const msg = `КРИТИЧЕСКИЙ СБОЙ: достигнут лимит перезапусков (${restartCount}). Требуется ручное вмешательство.`;
        writeLog('CRITICAL', msg);
        sendEmail('🚨 КРИТИЧЕСКИЙ СБОЙ', `ironads.ru недоступен после ${restartCount} перезапусков. Проверьте сервер вручную.`);
        clearTimers();
    } else {
        scheduleRecoveryCheck();
    }
}

function checkSite() {
    const now = Date.now();
    if (now - lastRestart < RESTART_COOLDOWN) return;

    const startTime = Date.now();
    const req = https.get('https://ironads.ru', (res) => {
        const statusCode = res.statusCode;
        const elapsed = (Date.now() - startTime) / 1000;
        let logMsg = `Ответ: ${statusCode}, время: ${elapsed}s`;

        if (statusCode >= 200 && statusCode < 400) {
            writeLog('OK', logMsg);
            if (isDown) {
                const downtime = Math.round((now - downStartTime) / 1000);
                const msg = `Сайт восстановлен. Простой: ${downtime} сек. Последний ответ: ${statusCode}`;
                writeLog('INFO', msg);
                sendEmail('✅ Сайт восстановлен', msg);
                isDown = false;
                restartCount = 0;
                clearTimers();
            }
            failCount = 0;
        } else {
            // Код ответа вне допустимого диапазона
            writeLog('WARN', `Некорректный код ответа: ${statusCode} (${logMsg})`);
            handleFailure(`HTTP ${statusCode} (${logMsg})`);
        }
        res.resume();
    });

    req.on('error', (err) => {
        const elapsed = (Date.now() - startTime) / 1000;
        const errorMsg = `Ошибка проверки: ${err.message} (код: ${err.code || 'нет'}), время: ${elapsed}s`;
        writeLog('ERROR', errorMsg);
        handleFailure(errorMsg);
    });

    req.setTimeout(2000, () => {
        req.destroy();
        const elapsed = (Date.now() - startTime) / 1000;
        const errorMsg = `Таймаут проверки (${elapsed}s)`;
        writeLog('ERROR', errorMsg);
        handleFailure(errorMsg);
    });
}

function handleFailure(detail) {
    failCount++;
    const msg = `Сбой #${failCount}: ${detail || 'без дополнительной информации'}`;
    writeLog('WARN', msg);
    if (failCount >= MAX_FAILS && !isDown) {
        isDown = true;
        downStartTime = Date.now();
        const actionMsg = `Обнаружен сбой (${failCount} последовательных ошибок), выполняем перезапуск. Последняя ошибка: ${detail}`;
        console.log('🔄', actionMsg);
        writeLog('ACTION', actionMsg);
        sendEmail('🔄 Перезапуск сервисов', `Причина: ${detail || 'неизвестная'}\nСайт перезапущен автоматически.`);
        performRestart();
        failCount = 0;
    }
}

// ========== ЗАПУСК ==========
console.log(`🚀 Запущен мониторинг в реальном времени (интервал ${CHECK_INTERVAL/1000}с, cooldown ${RESTART_COOLDOWN/1000}с)`);
writeLog('INFO', `🚀 Мониторинг запущен (интервал ${CHECK_INTERVAL/1000}с, перезапуск после ${MAX_FAILS} сбоя)`);
setInterval(checkSite, CHECK_INTERVAL);
checkSite();