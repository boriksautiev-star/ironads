# backup.ps1 – backup client app to Yandex.Disk
$projectRoot = Get-Location
$backupDir = "C:\Yandex.Disk\IronMarket_Backups\Клиент приложение"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupName = "IronAdsAppNew_backup_$timestamp.zip"
$backupPath = Join-Path $backupDir $backupName

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Write-Host "Created backup folder: $backupDir" -ForegroundColor Cyan
}

Write-Host "Creating backup..." -ForegroundColor Cyan

$excludeItems = @(
    "node_modules",
    ".expo",
    ".git",
    "backups",
    "android",
    "ios",
    ".env",
    ".env.local",
    "*.log",
    "*.tmp"
)

$allItems = Get-ChildItem -Path $projectRoot -Force
$filteredItems = $allItems | Where-Object {
    $name = $_.Name
    $exclude = $false
    foreach ($ex in $excludeItems) {
        if ($name -eq $ex) { $exclude = $true; break }
        if ($name -like $ex) { $exclude = $true; break }
    }
    -not $exclude
}

if ($filteredItems.Count -gt 0) {
    $tempFileList = Join-Path $env:TEMP "backup_filelist.txt"
    $filteredItems | ForEach-Object { $_.FullName } | Out-File -FilePath $tempFileList -Encoding UTF8

    Compress-Archive -Path (Get-Content $tempFileList) -DestinationPath $backupPath -Force -CompressionLevel Optimal

    Remove-Item $tempFileList -Force

    Write-Host "Backup created: $backupName" -ForegroundColor Green
    Write-Host "Size: $([math]::Round((Get-Item $backupPath).Length / 1MB, 2)) MB" -ForegroundColor Yellow
    Write-Host "Path: $backupPath" -ForegroundColor Cyan
} else {
    Write-Host "No files found for backup" -ForegroundColor Red
}