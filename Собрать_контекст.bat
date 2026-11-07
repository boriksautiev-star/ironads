@echo off
cd /d "%~dp0"
echo ====================================================
echo Building context for AI...
echo ====================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make_context.ps1"

echo.
echo ====================================================
echo Done! File context_for_ai.txt created.
echo Press any key to close this window...
pause >nul