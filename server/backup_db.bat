@echo off
chcp 65001 >nul
set BACKUP_DIR=C:\Yandex.Disk\IronMarket_Backups\db
set DB_NAME=ironmarket_db
set DB_USER=postgres
set DB_HOST=localhost

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: Формируем временную метку
for /f "tokens=1-6 delims=/:,. " %%a in ("%date% %time%") do (
    set YYYY=%%c
    set MM=%%b
    set DD=%%a
    set HH=%%d
    set MI=%%e
)
set TIMESTAMP=%YYYY%-%MM%-%DD%_%HH%-%MI%
set BACKUP_FILE=%BACKUP_DIR%\ironads_db_%TIMESTAMP%.dump

:: Определяем путь к pg_dump.exe (кавычки вокруг всего пути)
set "PGDUMP=C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
if not exist "%PGDUMP%" (
    echo ERROR: pg_dump.exe not found at %PGDUMP%
    pause
    exit /b 1
)

echo Using: %PGDUMP%
echo Backup to: %BACKUP_FILE%

"%PGDUMP%" -U %DB_USER% -h %DB_HOST% -d %DB_NAME% -F c -b -f "%BACKUP_FILE%"

if %errorlevel% equ 0 (
    echo SUCCESS: Backup created.
) else (
    echo ERROR: Backup failed. Check connection and password.
    pause
    exit /b 1
)

:: Удаление файлов старше 3 дней
powershell -Command "Get-ChildItem '%BACKUP_DIR%\*.dump' | Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-3) } | Remove-Item"

echo Old backups deleted.
echo Done.
pause