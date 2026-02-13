# Scarif - Start Script
# Right-click and "Run with PowerShell" or run from Windows Terminal

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Scarif - Starting Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "[1/5] Checking Docker..." -ForegroundColor Yellow
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  Docker is running." -ForegroundColor Green

# Start PostgreSQL
Write-Host "[2/5] Starting PostgreSQL database..." -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to start PostgreSQL." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  PostgreSQL started." -ForegroundColor Green

# Wait for PostgreSQL
Write-Host "[3/5] Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
Write-Host "  Ready." -ForegroundColor Green

# Check for node_modules and install if needed
Write-Host "[4/5] Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "apps/api/node_modules")) {
    Write-Host "  Installing API dependencies..." -ForegroundColor Gray
    Set-Location "$ProjectDir/apps/api"
    npm install
    Set-Location $ProjectDir
}
if (-not (Test-Path "apps/web/node_modules")) {
    Write-Host "  Installing Web dependencies..." -ForegroundColor Gray
    Set-Location "$ProjectDir/apps/web"
    npm install
    Set-Location $ProjectDir
}
Write-Host "  Dependencies ready." -ForegroundColor Green

# Generate Prisma client and push schema
Write-Host "[5/5] Setting up database..." -ForegroundColor Yellow
Set-Location "$ProjectDir/apps/api"
npx prisma generate
npx prisma db push
Set-Location $ProjectDir
Write-Host "  Database ready." -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Starting Application Servers" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Windows Terminal is available
$wtPath = Get-Command wt.exe -ErrorAction SilentlyContinue

if ($wtPath) {
    Write-Host "Opening servers in Windows Terminal tabs..." -ForegroundColor Yellow

    # Start Windows Terminal with two tabs
    & wt.exe -w 0 `
        new-tab --title "API Server (3001)" -d "$ProjectDir\apps\api" cmd /k "npx tsx watch src/index.ts" `; `
        new-tab --title "Web Server (5173)" -d "$ProjectDir\apps\web" cmd /k "npx vite --host"

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " Servers starting in new tabs!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "Windows Terminal not found. Starting in separate windows..." -ForegroundColor Yellow

    Start-Process cmd -ArgumentList "/k", "cd /d `"$ProjectDir\apps\api`" && npx tsx watch src/index.ts"
    Start-Process cmd -ArgumentList "/k", "cd /d `"$ProjectDir\apps\web`" && npx vite --host"

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " Servers starting in new windows!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
}

Write-Host ""
Write-Host "  API Server:  http://localhost:3001" -ForegroundColor White
Write-Host "  Web App:     http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "  Waiting for servers to start..." -ForegroundColor Gray

# Wait for servers to be ready
Start-Sleep -Seconds 5

# Open browser
Write-Host "  Opening browser..." -ForegroundColor Gray
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "  Done! Your browser should open shortly." -ForegroundColor Green
Write-Host ""
