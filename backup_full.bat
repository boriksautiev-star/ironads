@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ===== НАСТРОЙКИ =====
set BACKUP_DIR=C:\Yandex.Disk\IronMarket_Backups\Full
set PROJECT_DIR=C:\IronMarket
set DB_NAME=ironmarket_db
set DB_USER=postgres
set DB_HOST=localhost
set PGPASSWORD=Sautievshau22$

:: ===== СОЗДАЁМ ПАПКУ ДЛЯ БЭКАПОВ =====
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: ===== ФОРМИРУЕМ ВРЕМЕННУЮ МЕТКУ =====
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do set dd=%%a
for /f "tokens=2-4 delims=/. " %%a in ('date /t') do set mm=%%b
for /f "tokens=2-4 delims=/. " %%a in ('date /t') do set yyyy=%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set hh=%%a
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set mi=%%b
if "%hh:~0,1%"==" " set hh=0%hh:~1%
if "%mi:~0,1%"==" " set mi=0%mi:~1%
set TIMESTAMP=%yyyy%-%mm%-%dd%_%hh%-%mi%

:: ===== ВРЕМЕННАЯ ПАПКА ДЛЯ ДАМПА =====
set TEMP_DIR=%PROJECT_DIR%\backup_temp
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"
set DUMP_FILE=%TEMP_DIR%\db_dump_%TIMESTAMP%.dump

:: ===== 1. ДАМП БАЗЫ ДАННЫХ =====
echo 📦 Создание дампа базы данных...
"%PROGRAMFILES%\PostgreSQL\18\bin\pg_dump" -U %DB_USER% -h %DB_HOST% -d %DB_NAME% -F c -b -f "%DUMP_FILE%"
if errorlevel 1 (
    echo ❌ Ошибка создания дампа БД!
    pause
    exit /b 1
)
echo ✅ Дамп создан: %DUMP_FILE%

:: ===== 2. АРХИВАЦИЯ ВСЕЙ ПАПКИ ПРОЕКТА (включая дамп) =====
echo 📦 Создание полного архива проекта...
set BACKUP_FILE=%BACKUP_DIR%\full_backup_%TIMESTAMP%.zip
powershell -Command "Compress-Archive -Path '%PROJECT_DIR%' -DestinationPath '%BACKUP_FILE%' -Force"
if errorlevel 1 (
    echo ❌ Ошибка создания архива!
    pause
    exit /b 1
)
echo ✅ Архив создан: %BACKUP_FILE%

:: ===== 3. УДАЛЕНИЕ ВРЕМЕННОЙ ПАПКИ =====
rmdir /s /q "%TEMP_DIR%"
echo 🗑️ Временные файлы удалены.

:: ===== 4. УДАЛЕНИЕ СТАРЫХ АРХИВОВ (старше 7 дней) =====
echo 🧹 Удаление архивов старше 7 дней...
forfiles /p "%BACKUP_DIR%" /m "full_backup_*.zip" /d -7 /c "cmd /c del @file"
if errorlevel 1 (
    echo Старых архивов нет или ошибка удаления.
) else (
    echo ✅ Старые архивы удалены.
)

echo ✅ Полный бэкап завершён!
echo 📁 Архив сохранён: %BACKUP_FILE%
pause