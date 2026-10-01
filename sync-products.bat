@echo off
cd /d "%~dp0"
node scripts\sync-products.mjs
if errorlevel 1 exit /b %errorlevel%
node scripts\normalize-catalog.mjs
pause
