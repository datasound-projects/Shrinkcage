@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Install Node.js 22.13+ and npm, then try again. & exit /b 1)
node scripts/start.mjs %*
exit /b %errorlevel%
