@echo off
set BACKUP_DIR=C:\Yandex.Disk\IronMarket_Backups
set TIMESTAMP=%date:~6,4%-%date:~3,2%-%date:~0,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

set BACKUP_FILE=%BACKUP_DIR%\backup_%TIMESTAMP%.zip

echo Creating backup archive...
powershell -Command "Compress-Archive -Path 'C:\IronMarket' -DestinationPath '%BACKUP_FILE%' -Force"

if %errorlevel% equ 0 (
    echo SUCCESS: Backup created: %BACKUP_FILE%
) else (
    echo ERROR: Backup failed
)

pause