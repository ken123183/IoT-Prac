# 🤝 團隊協作與工程開發規範 (Team Collaboration & Engineering Best Practices)

在面試中，面試官除了技術硬實力，也非常看重你如何與他人合作、如何維持代碼品質。這份文件整理了本專案中隱含的開發規範與未來可導入的優良實踐。

---

## 1. API 接口規範 (API Standards)

### 📌 RESTful 與 Swagger
*   **實測**：在本專案中，我們使用了 `Swagger (SpringDoc)` 來自動生成 API 報告。
*   **面試語彈**：「我認為合約先行 (Contract First) 是微服務開發的基礎。透過自動化的 Open API 文檔，前端與後端可以在開發初期就達成協議，減少溝通成本。未來我們還可以導入 **Postman / Newman** 來進行 API 自動化測試。」

---

## 2. 代碼品質保證 (Code Quality)

### 🧪 單元測試與集成測試 (Testing)
*   **建議實踐**：
    *   **JUnit 5 & Mockito**：在 `core-service` 中，我們可以 Mock 掉資料庫，專注測試「租借邏輯」中是否有正確判斷電量與狀態。
    *   **Testcontainers**：這是 Java 圈非常流行的技術。它可以在測試跑起來時，自動在 Docker 啟動一個「真實的 PostgreSQL」，確保 JPA 的 SQL 語法在真實環境下是正確的。
*   **面試語彈**：「我非常重視測試覆蓋率。針對租借歸還這種核心資產交易，我會確保每一種 Edge Case（例如：斷電、用戶重複扣款）都有對應的 Integration Test 覆蓋。」

---

## 3. 持續整合與佈署 (CI/CD)

### 🤖 用自動化代替手動
*   **本專案經驗**：雖然我們目前使用手動 `gcloud` 與 `npx` 指令，但目前的架構已經完全具備「容器化」特性。
*   **未來藍圖**：
    *   **Cloud Build / GitHub Actions**：當我們推送代碼到 GitHub，自動觸發 `mvn clean package`、Docker Build、最後自動發布新版到 Cloud Run。
    *   **Rollback 策略**：Cloud Run 原生支持「流量分配 (Traffic Splitting)」，我們可以先佈署新版本但不外放流量，人工測試完成後再慢慢把 100% 流量轉過去。

---

## 4. 版本控制與流程 (Git Flow)

### 🌿 Git 提交規範
*   **規範推薦**：使用 **Conventional Commits** (如 `feat:`, `fix:`, `docs:`, `perf:`)。
*   **心得**：良好的 Commit Message 能讓團隊快速了解這筆更動是為了解決什麼問題，也方便未來產生自動化的變更日誌 (Changelog)。

---

## 5. 異常處理與監控 (Observability)

### 🚨 結構化日誌 (Structured Logging)
*   **重要性**：不要只寫 `System.out.println("Error!")`。
*   **建議**：使用 `Logback` 或 `SLF4J` 並輸出成 JSON 格式，這讓雲端的 **GCP Log Explorer** 可以輕鬆解析、過濾關鍵錯誤資訊。
*   **面試語彈**：「在分散式系統中，追蹤一個請求的生命週期非常困難。我會導入 **Trace ID (Sleuth/Zipkin)**，讓這組 ID 穿梭在網關、RabbitMQ 到核心服務之間，實現全鏈路追蹤。」
