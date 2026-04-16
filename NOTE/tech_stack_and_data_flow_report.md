# 🔋 城市級電池數位孿生系統：技術棧解析與數據流詳解 (Tech Stack & Data Flow Extended Guide)

本文作為《架構設計與實戰白皮書》的延伸閱讀，旨在深入拆解本系統的「技術選型背後的思考」、「實戰中的關鍵調優 (Tuning)」，以及「數據如何在各微服務間流轉」。

---

## 1. 專案背景與技術選型的根本邏輯 (The "Why")

本專案模擬了 **1,000 顆位於城市各處的智慧電池**。在真實環境中，物聯網系統面臨兩大截然不同的挑戰：
1. **高頻且海量的寫入 (High-Frequency I/O)**：1,000 顆電池每秒發送 1 次心跳與電量變化，這會產生巨大的並發請求。
2. **強一致性的商業行為 (Strong Consistency)**：當用戶（或 K6 模擬器）發起「租借」請求時，系統必須保證同一顆電池不會被「超賣 (Double Booking)」。

傳統的 **單體架構 (Monolithic) + 單一關聯式資料庫** 在面對這種場景時會遭遇瓶頸：資料庫的連線池會被海量的心跳更新給榨乾，導致關鍵的租借交易被阻塞（甚至引發 Deadlock）。

為此，我們採取了 **「CQRS 概念變體與冷熱數據分離」**，並據此選擇了我們的微服務技術棧。

---

## 2. 核心技術棧：應用場景與關鍵調優 (Tech Stacks & Tuning)

### 2.1 邊緣接入層：Node.js + Express + Socket.io (IoT Gateway)
*   **應用場景**：作為系統的「前線大門」，負責承受所有實體電池（Simulator）送來的高頻 HTTP POST 請求，以及維持前端戰情室的 WebSocket 長連線。
*   **選擇理由**：Node.js 基於 V8 引擎的 **事件迴圈 (Event Loop) 與非阻塞 I/O** 模型，天生適合處理大量並發的輕量級網路請求，即使只有單一執行緒也能扛住上千 RPS。
*   **實戰調優 (Crucial Adjustments)**：
    *   **資源與探針優化**：在 1,000 RPS 壓力測試下，我們發現 Gateway 容器會無故重啟 (OOM / Pod Error)。最終的解法是將 Kubernetes 中的資源限制 (Memory Limit) 提升至 **512Mi**，並**移除過於敏感的 `readinessProbe`**。因為在高負載下，Gateway 反應會微幅延遲，導致 K8s 探針超時誤判其為死亡而強制重啟，進而引發連鎖斷線。

### 2.2 商業邏輯核心：Java 21 + Spring Boot 3 + Spring Data JPA (Core Service)
*   **應用場景**：負責驗證租借邏輯、管理電池生命週期狀態（AVAILABLE / RENTED / CHARGING），並負責資料的最終持久化。
*   **選擇理由**：Java 的強型別特性與 Spring 生態系對於處理複雜的商業邏輯、分散式事務 (Transactions) 無可挑剔。有了 Spring Data JPA，我們可以輕易利用 ORM 防護 SQL Injection 並維護關聯。
*   **實戰調優 (Crucial Adjustments)**：
    *   **RabbitMQ 消費者解碼器**：一開始發現 RabbitMQ 隊列會卡死（積壓 1860 條訊息卻不消費）。問題在於預設的 Java AMQP 轉換器無法直接將 Node.js 送來的 JSON 轉換為 Map，導致靜默崩潰。我們透過在 `RabbitConfig.java` 顯式掛載 `Jackson2JsonMessageConverter`，解決了異質系統通訊的痛點，使消費率飆升至 1000 msg/s 的瞬間秒殺狀態。

### 2.3 高速快取與鎖定：Redis + Redisson
*   **應用場景**：作為全域的最新狀態快照（Snapshot）、WebSocket 事件的廣播中心（Pub/Sub），以及防範並發競爭的守門員（Distributed Lock）。
*   **選擇理由**：Redis 在記憶體內操作，讀寫速度極快。引入 Pub/Sub 可解決多個 Gateway 副本間的 Socket 狀態同步問題；Redisson 則提供了基於 Java 的完美分散式鎖封裝。
*   **實戰調優與 Race Condition 防護實例**：
    在應對 K6 模擬的 Race Condition 攻擊時（20 個虛擬用戶同時搶租同一電池），我們必須確保「先鎖定 (Lock) -> 再開啟事務 (Transaction) -> 最後釋放鎖」。若是順序顛倒（例如直接在 `@Transactional` 方法內加鎖），Spring 的事務提交會發生在方法結束後，這時鎖已經釋放，極易引發其他執行緒趁虛而入的幻讀現象。
    
    以下是本專案 `RentalService.java` 中真正阻擋了超賣與資料庫寫入衝突的核心實作片段：

    ```java
    /**
     * 租借電池 (外層：負責分散式鎖)
     * 注意：此方法「不」標註 @Transactional，因為我們要鎖住整個事務過程
     */
    public String rentBattery(String batteryId, String userId) throws Exception {
        String lockKey = "lock:battery:" + batteryId;
        RLock lock = redissonClient.getLock(lockKey);

        // 🟢 1. 嘗試獲取鎖 (等待 3 秒，持有 15 秒)
        boolean isLocked = lock.tryLock(3, 15, TimeUnit.SECONDS);
        if (!isLocked) {
            throw new RuntimeException("🔒 系統繁忙：多人正在搶租此電池，請稍後再試。");
        }

        try {
            // 🔹 2. 透過 Spring Context 呼叫同類別內的 @Transactional 內層方法
            // 面試必考：這樣才能確保事務完全在鎖的保護下運行，且在 unlock 回圈前先完成 DB Commit
            RentalService self = applicationContext.getBean(RentalService.class);
            return self.executeRentTransaction(batteryId, userId);
        } finally {
            // 🔴 3. 只有在事務完全提交 (或回滾) 後，才釋放鎖
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    @Transactional
    public String executeRentTransaction(String batteryId, String userId) throws Exception {
        Battery battery = batteryRepository.findById(batteryId).orElseThrow();
        // 4. 狀態再次檢查 (此時在鎖的保護下，status 絕對不會發生幻讀)
        if (!Battery.Status.AVAILABLE.name().equals(battery.getStatus())) {
            throw new RuntimeException("❌ 搶租失敗：電池已被優先租走！");
        }
        
        battery.setStatus(Battery.Status.RENTED.name());
        batteryRepository.saveAndFlush(battery);
        return "✅ 租借成功";
    }
    ```
    這段看似基礎卻極易犯錯的 AOP (Aspect-Oriented Programming) 繞道設計 (`applicationContext.getBean()`)，正是我們防護 1000 顆電池在 K6 壓力測試中零超賣的終極武器。

### 2.4 非同步緩衝通道：RabbitMQ
*   **應用場景**：負責接收所有「不需要立即給予回應」的物理數據（電量損耗百分比）。
*   **選擇理由**：削峰填谷 (Load Leveling)。將遙測寫入動作從「同步 HTTP」轉變為「非同步 Queue」，讓 Core Service 可以按照資料庫 (PostgreSQL) 能承受的步調來慢慢消化數據，防止資料庫因為寫入風暴而被鎖死。

### 2.5 應用部署與編排：Kubernetes (Kind)
*   **選擇理由**：容器化部署 (Docker) 使開發環境統一。Kubernetes 則幫助我們跨越單機限制，輕易實現 Core Service 的多副本擴展 (ReplicaSet)，並且內建 Service 基礎的服務發現機制，讓 Gateway 不用寫死 Core 的 IP。

---

## 3. 全局數據流向解析 (The Data Pipelines)

本系統將數據流物理性地分為三條大動脈，確保業務互不干擾。

### 🌊 1. 熱數據流 (Hot Path) - 毫秒級實時戰情室
這條路徑追求**極致的速度與低延遲**，不進行耗時的磁碟讀寫。

1. **電池端 (Simulator)**：每秒發出 HTTP POST 遙測心跳 (包含 `capacity = 99.5`) 抵達 **Gateway**。
2. **Gateway (快照)**：直接在 **Redis** 覆寫該電池的 Hash 值 (`HSET`)，保持最新電量狀態。
3. **Gateway (廣播)**：同時將數據丟入 Redis 的 Pub/Sub Channel。
4. **WebSocket**：另一個 Gateway 實例（或同一個）收到 Pub/Sub 廣播，將數據過 Socket.io 推播。
5. **瀏覽器前端 (React)**：綠色電量條瞬間扣減。

### 🧊 2. 冷數據流 (Cold Path) - 持久化與歷史溯源
這條路徑追求**可靠性與資源保護**，它發生在背景，容許有延遲。

1. **Gateway**：在走完熱路徑後，同一支程式將遙測訊息打包，丟進 **RabbitMQ** (`battery_telemetry` Queue) 然後立刻向模擬器回傳 `200 OK`，毫不留戀。
2. **RabbitMQ**：靜靜等待直至被讀取。
3. **Core Service (監聽)**：背後的 `TelemetryConsumer` 偵測到新訊息，一筆一筆（或批次）讀取出來。
4. **PostgreSQL**：執行 `UPDATE battery SET capacity = 99.5`，完成長久儲存。即使此刻 Core Service 崩潰重啟，未處理的數據依然還在 Queue 裡，無一流失。

### ⚡ 3. 交易數據流 (Transactional Path) - 強一致性資產調度
這條路徑追求** ACID 與絕對的準確度**，不容許任何資料競爭。

1. **管理員/使用者 (Admin/K6)**：透過 HTTP PUT 從前端發起租借請求直達 **Core Service**。
2. **Core Service (鎖與檢驗)**：
   - 向 **Redis** 申請針對該電池的分散式互斥鎖 (`lock.tryLock`)。
   - 讀取 **PostgreSQL**，檢查當下是否真的是 `AVAILABLE`。
3. **Core Service (狀態變更)**：
   - 修改實體狀態為 `RENTED` 並保存入 PostgreSQL。
   - 解除 Redis 鎖。
   - （可選）透過內部通訊或 RabbitMQ 通知 Gateway，並由 Gateway 更新 Redis 快取與推播 Socket，讓前端的「Rent」按鈕瞬間失效反灰，完成交易閉環。

---

## 總結
本專案透過精確搭配 **Node.js (快/高頻通訊)** 與 **Spring Boot (穩/商業邏輯)**，在不需要提升高昂硬體成本的狀況下，利用 **RabbitMQ 阻擋寫入風暴**，並利用 **Redis Redisson 解決平行擴展帶來的 Race Condition**，示範了一個高穩定、高可用且職責分明的經典物聯網（IoT）後端解決方案。
