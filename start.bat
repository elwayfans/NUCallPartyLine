@echo off
echo.
echo ========================================
echo  Scarif - Starting Services
echo ========================================
echo.

:: Get the directory where this script is located
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

:: Check if node_modules exists and install
echo [1/3] Checking dependencies...
if not exist "apps\api\node_modules" (
    echo   Installing API dependencies...
    cd /d "%PROJECT_DIR%\apps\api"
    call npm install
    cd /d "%PROJECT_DIR%"
)
if not exist "apps\web\node_modules" (
    echo   Installing Web dependencies...
    cd /d "%PROJECT_DIR%\apps\web"
    call npm install
    cd /d "%PROJECT_DIR%"
)
echo   Dependencies ready.

:: Run database setup
echo [2/3] Setting up database...
cd /d "%PROJECT_DIR%\apps\api"
call npx prisma generate
call npx prisma db push
cd /d "%PROJECT_DIR%"
echo   Database ready.

echo.
echo ========================================
echo  Starting Application Servers
echo ========================================
echo.

:: Check if Windows Terminal exists
echo [3/3] Starting servers...
where wt >nul 2>&1
if %errorlevel%==0 (
    echo   Opening in Windows Terminal tabs...
    wt -w 0 new-tab --title "API Server (3001)" -d "%PROJECT_DIR%\apps\api" cmd /k "npx tsx watch src/index.ts" ; new-tab --title "Web Server (5173)" -d "%PROJECT_DIR%\apps\web" cmd /k "npx vite --host"
) else (
    echo   Starting in new windows...
    start "API Server" cmd /k "cd /d "%PROJECT_DIR%\apps\api" && npx tsx watch src/index.ts"
    timeout /t 2 /nobreak >nul
    start "Web Server" cmd /k "cd /d "%PROJECT_DIR%\apps\web" && npx vite --host"
)

echo.
echo ========================================
echo  All services starting!
echo ========================================
echo.
echo   API Server:  http://localhost:3001
echo   Web App:     http://localhost:5173
echo.
echo   Waiting for servers to start...
timeout /t 5 /nobreak >nul

:: Open browser
echo   Opening browser...
start http://localhost:5173

echo.
echo   Done!
echo.
