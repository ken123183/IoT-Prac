# ============================================================
# start-dev.ps1 - Battery Digital Twin Master Launcher
# Usage: Run .\start-dev.ps1 in d:\IoT-prac\
# ============================================================

$ROOT = $PSScriptRoot

Write-Host ""
Write-Host "********************************************"
Write-Host "*  Battery Digital Twin - System Launcher  *"
Write-Host "********************************************"
Write-Host ""

# --- Step 1: Infrastructure ---
Write-Host "[1/5] Starting Docker Containers..." -ForegroundColor Yellow

docker ps > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker is NOT running!" -ForegroundColor Red
    pause
    exit 1
}

docker compose -f "$ROOT\infrastructure\docker-compose.yml" up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker Compose failed!" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "DONE: Infrastructure is ready." -ForegroundColor Green
Start-Sleep -Seconds 5

# --- Step 2: Java Service ---
Write-Host "[2/5] Launching Java Core Service..." -ForegroundColor Yellow
$javaCmd = "Write-Host '--- JAVA CORE SERVICE ---' -ForegroundColor Cyan; Set-Location '$ROOT\core-service'; .\run-app.ps1"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$javaCmd"

Write-Host "DONE: Java window opened." -ForegroundColor Green
Start-Sleep -Seconds 20

# --- Step 3: IoT Gateway ---
Write-Host "[3/5] Launching IoT Gateway..." -ForegroundColor Yellow
$gatewayCmd = "Write-Host '--- IOT GATEWAY ---' -ForegroundColor Cyan; Set-Location '$ROOT\iot-gateway'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$gatewayCmd"

Write-Host "DONE: Gateway window opened." -ForegroundColor Green
Start-Sleep -Seconds 3

# --- Step 4: Simulator ---
Write-Host "[4/5] Launching Battery Simulator..." -ForegroundColor Yellow
$simCmd = "Write-Host '--- BATTERY SIMULATOR ---' -ForegroundColor Cyan; Set-Location '$ROOT\iot-gateway'; npm run simulator"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$simCmd"

Write-Host "DONE: Simulator window opened." -ForegroundColor Green
Start-Sleep -Seconds 2

# --- Step 5: Frontend ---
Write-Host "[5/5] Launching Frontend Dashboard..." -ForegroundColor Yellow
$frontCmd = "Write-Host '--- FRONTEND DASHBOARD ---' -ForegroundColor Cyan; Set-Location '$ROOT\frontend-admin'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$frontCmd"

Write-Host "DONE: Frontend window opened." -ForegroundColor Green
Start-Sleep -Seconds 3

# --- SUCCESS ---
Write-Host ""
Write-Host "********************************************"
Write-Host "*  SYSTEM STARTED SUCCESSFULLY!            *"
Write-Host "********************************************"
Write-Host ""
Write-Host "Opening browser..." -ForegroundColor Cyan
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "To run stress tests, use:" -ForegroundColor DarkYellow
Write-Host "k6 run $ROOT\k6-tests\race-condition.js" -ForegroundColor DarkYellow
Write-Host ""
