# restore.ps1 – restore client app from latest backup
$projectRoot = Get-Location
$backupDir = "C:\Yandex.Disk\IronMarket_Backups\Клиент приложение"

if (-not (Test-Path $backupDir)) {
    Write-Host "Backup folder not found: $backupDir" -ForegroundColor Red
    exit 1
}

$latestBackup = Get-ChildItem -Path $backupDir -Filter "*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $latestBackup) {
    Write-Host "No backups found in $backupDir" -ForegroundColor Red
    exit 1
}

$backupPath = $latestBackup.FullName
$backupName = $latestBackup.Name

Write-Host "Found backup: $backupName" -ForegroundColor Cyan
Write-Host "Created: $($latestBackup.LastWriteTime)" -ForegroundColor Yellow

$confirm = Read-Host "Restore from this backup? (y/n)"
if ($confirm -ne 'y') {
    Write-Host "Restore cancelled" -ForegroundColor Red
    exit 0
}

Write-Host "WARNING: This will OVERWRITE all current project files!" -ForegroundColor Red
$confirm2 = Read-Host "Are you sure? (y/n)"
if ($confirm2 -ne 'y') {
    Write-Host "Restore cancelled" -ForegroundColor Red
    exit 0
}

Write-Host "Restoring..." -ForegroundColor Cyan

$tempExtract = Join-Path $env:TEMP "restore_temp_$([System.Guid]::NewGuid().ToString())"
New-Item -ItemType Directory -Path $tempExtract -Force | Out-Null

try {
    Expand-Archive -Path $backupPath -DestinationPath $tempExtract -Force

    Get-ChildItem -Path $projectRoot -Force | Where-Object {
        $_.Name -ne "backups" -and $_.Name -ne "backup.ps1" -and $_.Name -ne "restore.ps1"
    } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    Copy-Item -Path "$tempExtract\*" -Destination $projectRoot -Recurse -Force

    Write-Host "Restore completed!" -ForegroundColor Green
    Write-Host "Run 'npm install' if needed, then 'npx expo start -c'." -ForegroundColor Yellow
} catch {
    Write-Host "Restore error: $_" -ForegroundColor Red
} finally {
    if (Test-Path $tempExtract) {
        Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    }
}