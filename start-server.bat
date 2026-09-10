@echo off
chcp 65001 >nul
title Q版换装小游戏 - 本地服务器
cd /d "%~dp0"
set PORT=8080

echo.
echo   ============================================
echo    Q版换装小游戏 · 本地服务器
echo    浏览器会自动打开 http://localhost:%PORT%
echo    关闭本窗口 = 关闭服务器
echo   ============================================
echo.

where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/index.html
  python serve.py
  goto END
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/index.html
  py serve.py
  goto END
)

where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%/index.html
  node serve.js
  goto END
)

echo   [!] 没检测到 python / node。
echo       请安装 Python 或 Node.js 后重试，
echo       或者直接双击 src\index.html （部分功能会受限）。
echo.
pause

:END
