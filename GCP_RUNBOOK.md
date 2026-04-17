# 🌩️ GCP SRE 雲端維運標準程序 (Runbook)

這份手冊彙整了將「都市電池數位孿生系統」部署至 **Google Cloud Platform (GCP)** 的標準作業流程 (SOP)。無論是未來要重新啟動火力展示，或是火力展示結束後要銷毀資源，皆可依循此文件進行操作。

---

## 🟢 第一部分：完整啟動流程 (Start-up / Provisioning)

如果您下次要在一片空白的專案上重新站起全套雲端架構，請依照以下順序執行。所有的操作建議使用本地終端內的 `gcloud` CLI 完成。

### Phase 1: 基礎網通與權限設定
系統需要 Serverless VPC Access 連接器才能讓 Cloud Run 存取私有網路資源。
```bash
# 1. 建立 VPC Serverless 連接器 (確保 Cloud Run 可存取內網)
gcloud compute networks vpc-access connectors create battery-connector `
  --network=default `
  --region=asia-east1 `
  --range=10.8.0.0/28

# 2. 設定內網防火牆規則 (允許連接器訪問資料庫與 MQ)
gcloud compute firewall-rules create allow-vpc-access-connector `
  --network=default `
  --action=ALLOW `
  --direction=INGRESS `
  --source-ranges=10.8.0.0/28 `
  --rules="tcp:5672,tcp:6379,tcp:8080"
```

### Phase 2: 託管資源建置 (Managed Services)
建立 Redis、PostgreSQL 與 RabbitMQ (架構在虛擬機上)。
```bash
# 1. 建立 Redis 快取 (大約需時 3-5 分鐘)
gcloud redis instances create battery-redis `
  --size=1 `
  --region=asia-east1 `
  --network=default
# 佈署完成後需取得 Redis IP (例如: 10.236.x.x)

# 2. 建立 Cloud SQL 資料庫 (無外部 IP)
gcloud sql instances create battery-postgres-instance `
  --database-version=POSTGRES_15 `
  --cpu=1 --memory=3840MB `
  --region=asia-east1 `
  --root-password=battery_pass `
  --network=default `
  --no-assign-ip
# 隨後建立資料庫
gcloud sql databases create battery_db --instance=battery-postgres-instance

# 3. 建立 RabbitMQ 虛擬機 (Compute Engine)
gcloud compute instances create battery-rabbitmq `
  --zone=asia-east1-a `
  --machine-type=e2-medium `
  --image-family=debian-12 `
  --image-project=debian-cloud `
  --network=default
# 建立後需進入 VM 安裝 RabbitMQ 並開啟管理員權限 (battery_rmq / battery_pass)
# 確認並記錄本虛擬機的內網 IP (例如: 10.140.0.3)
```

### Phase 3: 雲端服務部署 (Serverless Microservices)
請確保專案已打包成 Docker Image 並推送至 Artifact Registry 後，再執行以下指令。

```bash
# ==========================================
# 1. 佈署 Core Service (核心 API)
# ==========================================
gcloud run deploy battery-core `
  --image=asia-east1-docker.pkg.dev/[PROJECT_ID]/battery-repo/battery-core:v1 `
  --region=asia-east1 `
  --vpc-connector=battery-connector `
  --vpc-egress=private-ranges-only `
  --set-env-vars="SPRING_DATASOURCE_URL=jdbc:postgresql:///battery_db?cloudSqlInstance=[INSTANCE_CONNECTION_NAME]&socketFactory=com.google.cloud.sql.postgres.SocketFactory&user=postgres&password=battery_pass" `
  --set-env-vars="AMQP_URL=amqp://battery_rmq:battery_pass@[RABBITMQ_INTERNAL_IP]:5672" `
  --set-env-vars="REDIS_URL=redis://[REDIS_INTERNAL_IP]:6379" `
  --port=8080 `
  --allow-unauthenticated
  
# 等待佈署完成後，取得 Core_URL (例如 https://battery-core-xxx.run.app)

# ==========================================
# 2. 佈署 IoT Gateway (物聯網網關)
# ==========================================
gcloud run deploy battery-gateway `
  --image=asia-east1-docker.pkg.dev/[PROJECT_ID]/battery-repo/battery-gateway:v1 `
  --region=asia-east1 `
  --vpc-connector=battery-connector `
  --vpc-egress=private-ranges-only `
  --set-env-vars="REDIS_URL=redis://[REDIS_INTERNAL_IP]:6379" `
  --set-env-vars="AMQP_URL=amqp://battery_rmq:battery_pass@[RABBITMQ_INTERNAL_IP]:5672" `
  --port=3001 `
  --no-session-affinity ` # 避免 WebSocket 負載不均
  --concurrency=1000 `    # 提升 Socket.io 單點承載極限
  --allow-unauthenticated

# 等待佈署完成後，取得 Gateway_URL
```

> **注意！** 於佈署 Frontend 之前，必須將 React 源碼 (`App.tsx`) 內的 API 端點更新為上述取得的 `Core_URL` 與 `Gateway_URL`，確保強制開啟 WebSocket 傳輸 `transports: ['websocket']`，並重新打包 Image 推送。

```bash
# ==========================================
# 3. 佈署 Frontend Admin (數位孿生儀表板)
# ==========================================
gcloud run deploy battery-frontend `
  --image=asia-east1-docker.pkg.dev/[PROJECT_ID]/battery-repo/battery-frontend:v2 `
  --region=asia-east1 `
  --allow-unauthenticated
```
部署完成！現在即可開啟壓測腳本 (`k6 run city-ops.js`) 見證奇蹟。

---

## 🔴 第二部分：環境終結令 (Tear-down / Cleanup)

展示結束後，為了避免 GCP 收取無用的託管費，請果斷執行下列清理程序，將基礎設施夷為平地：

```powershell
# 1. 刪除運算資源 (Cloud Run: 網關、核心、前端)
gcloud run services delete battery-frontend battery-core battery-gateway --region=asia-east1 --quiet

# 2. 刪除託管記憶體體快取 (Memorystore)
gcloud redis instances delete battery-redis --region=asia-east1 --quiet

# 3. 刪除關聯式資料庫執行個體 (Cloud SQL) [成本最重！]
gcloud sql instances delete battery-postgres-instance --quiet

# 4. 刪除非同步訊息處理虛擬機 (Compute Engine)
gcloud compute instances delete battery-rabbitmq --zone=asia-east1-a --quiet

# 5. 刪除無伺服器網路穿透橋樑 (VPC Connector)
# => 若未來很快會再次展示，此項可保留。因為重建 Connector 有時會在 GCP 內部耗時較久。
gcloud compute networks vpc-access connectors delete battery-connector --region=asia-east1 --quiet
```
