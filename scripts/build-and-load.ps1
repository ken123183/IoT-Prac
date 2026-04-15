Write-Host "🚀 Starting Build and Load Process..." -ForegroundColor Cyan

$IMAGES = @(
    @{ Name = "battery-gateway"; Path = "./iot-gateway" },
    @{ Name = "battery-core"; Path = "./core-service" },
    @{ Name = "battery-frontend"; Path = "./frontend-admin" }
)

foreach ($img in $IMAGES) {
    Write-Host "📦 Building $($img.Name)..." -ForegroundColor Yellow
    docker build -t "$($img.Name):latest" "$($img.Path)"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "🚚 Loading $($img.Name) into Kind cluster..." -ForegroundColor Green
        kind load docker-image "$($img.Name):latest" --name battery-twin
    } else {
        Write-Host "❌ Build failed for $($img.Name)" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ All images loaded successfully into battery-twin cluster!" -ForegroundColor Cyan
