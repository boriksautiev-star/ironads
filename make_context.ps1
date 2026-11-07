# Переходим в папку, где лежит скрипт
Set-Location $PSScriptRoot

$outputFile = "full_project_context.md"
if (Test-Path $outputFile) { Remove-Item $outputFile }

Write-Host "Сборка полного контекста проекта..." -ForegroundColor Cyan

# Добавляем дерево проекта
Add-Content -Path $outputFile -Value "# ПОЛНАЯ СТРУКТУРА ПРОЕКТА"
Add-Content -Path $outputFile -Value "``````text"
$treeServer = cmd /c "tree /F /A server 2>nul"
$treeMobile = cmd /c "tree /F /A mobile 2>nul"
$treeServer | Add-Content -Path $outputFile
$treeMobile | Add-Content -Path $outputFile
Add-Content -Path $outputFile -Value "``````"
Add-Content -Path $outputFile -Value ""

# Ищем все нужные файлы
$extensions = @("*.js", "*.jsx", "*.json", "*.html", "*.css", "*.sql")

# ИСКЛЮЧЕНИЯ (без звездочек, просто названия папок)
$excludeDirs = @("node_modules", "build", ".git", ".expo", "android", "ios")

$files = Get-ChildItem -Path "server", "mobile" -Recurse -File -Include $extensions | 
         Where-Object { $_.FullName -notmatch ($excludeDirs -join '|') }

$count = 0
foreach ($file in $files) {
    $relativePath = $file.FullName.Replace($PSScriptRoot + "\", "")
    $ext = $file.Extension.Replace(".", "")
    
    if ($ext -eq "js" -or $ext -eq "jsx") { $lang = "javascript" }
    elseif ($ext -eq "json") { $lang = "json" }
    elseif ($ext -eq "html") { $lang = "html" }
    elseif ($ext -eq "css") { $lang = "css" }
    elseif ($ext -eq "sql") { $lang = "sql" }
    else { $lang = "text" }

    Add-Content -Path $outputFile -Value "`n## ФАЙЛ: $relativePath"
    Add-Content -Path $outputFile -Value "``````$lang"
    Get-Content $file.FullName | Add-Content -Path $outputFile
    Add-Content -Path $outputFile -Value "``````"
    
    $count++
    Write-Host "✅ Добавлен: $relativePath" -ForegroundColor Green
}

Write-Host "`nУспешно! Собрано файлов: $count" -ForegroundColor Cyan
Write-Host "Весь код находится в файле: $outputFile" -ForegroundColor Yellow