@echo off
echo ========================================
echo  Scarif - Stopping Services
echo ========================================
echo.

cd /d "%~dp0"

:: Stop Docker containers
echo Stopping PostgreSQL...
docker-compose down

echo.
echo ========================================
echo  Services stopped!
echo ========================================
echo.
echo  Note: Close the API and Web terminal
echo  windows manually if still open.
echo.
pause
