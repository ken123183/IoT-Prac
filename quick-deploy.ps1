# 🚀 Urban Battery Digital Twin - One Click Deployment Script

Write-Host "🔋 Starting Deployment for Battery Digital Twin..." -ForegroundColor Cyan

# 0. 環境自檢
if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: Docker is not installed. This is required for building images." -ForegroundColor Red
    Write-Host "Please install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    exit 1
}
$clusterName = "battery-twin"
if (!(kind get clusters | Select-String -Pattern $clusterName)) {
    Write-Host "[+] Creating Kind cluster..." -ForegroundColor Yellow
    kind create cluster --config infrastructure/kind-config.yaml
}

# 2. 編譯與載入鏡像
Write-Host "[+] Building and Loading Docker images (this may take a few minutes)..." -ForegroundColor Yellow
.\scripts\build-and-load.ps1

# 3. 部署 K8s 組件
Write-Host "[+] Applying Kubernetes manifests..." -ForegroundColor Yellow
kubectl apply -f infrastructure/k8s/infra.yaml
kubectl apply -f infrastructure/k8s/apps.yaml
kubectl apply -f infrastructure/k8s/simulator.yaml
kubectl apply -f infrastructure/k8s/k6-load.yaml

# 4. 強制刷新 Pod (確保使用 Kind 加載的新鏡像)
Write-Host "[+] Forcing rollout restart to apply new images..." -ForegroundColor Yellow
kubectl rollout restart deployment battery-core
kubectl rollout restart deployment battery-gateway
kubectl rollout restart deployment battery-simulator

# 5. 等待服務就緒
Write-Host "[+] Waiting for deployments to be ready..." -ForegroundColor Yellow
kubectl wait --for=condition=available deployment/battery-core --timeout=120s
kubectl wait --for=condition=available deployment/battery-gateway --timeout=120s
kubectl wait --for=condition=available deployment/battery-frontend --timeout=120s

Write-Host "`n✅ Deployment Complete!" -ForegroundColor Green
Write-Host "--------------------------------------------------"
Write-Host "🚀 Access Services (Run these in separate terminals):"
Write-Host "Frontend:    kubectl port-forward service/battery-frontend 80:80"
Write-Host "Core API:    kubectl port-forward service/battery-core 8080:8080"
Write-Host "Gateway:     kubectl port-forward service/battery-gateway 3001:3001"
Write-Host "RabbitMQ UI: kubectl port-forward service/battery-rabbitmq 15672:15672"
Write-Host "--------------------------------------------------"
