@echo off
echo.
echo ========================================
echo  Scarif - Setup Script
echo ========================================
echo.

:: Get the directory where this script is located
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo [1/4] Installing API dependencies...
cd /d "%PROJECT_DIR%apps\api"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install API dependencies
    pause
    exit /b 1
)

echo.
echo [2/4] Installing Web dependencies...
cd /d "%PROJECT_DIR%apps\web"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Web dependencies
    pause
    exit /b 1
)

echo.
echo [3/4] Generating Prisma client...
cd /d "%PROJECT_DIR%apps\api"
call npx prisma generate
if %errorlevel% neq 0 (
    echo ERROR: Failed to generate Prisma client
    pause
    exit /b 1
)

echo.
echo [4/4] Pushing database schema...
cd /d "%PROJECT_DIR%apps\api"
call npx prisma db push
if %errorlevel% neq 0 (
    echo ERROR: Failed to push database schema
    echo Make sure PostgreSQL is running and the database exists
    pause
    exit /b 1
)

cd /d "%PROJECT_DIR%"

echo.
echo ========================================
echo  Setup Complete!
echo ========================================
echo.
echo You can now run start.bat to start the servers.
echo.
pause
