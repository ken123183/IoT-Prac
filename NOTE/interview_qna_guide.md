# 🎯 面試戰鬥手冊：都市電池數位孿生專案 (Interview Q&A Guide)

這份文件總結了此專案「**Urban Battery Digital Twin**」所涵蓋的技術棧，並整理了面試官在面試中高級軟體工程師、後端工程師或 SRE 時最常深挖的「系統設計與底層原理」考題。所有的解答皆**緊密圍繞您在此專案的實作經驗**，讓您在面試時言之有物、具備說服力。

---

## 1. 系統架構與設計理念 (System Architecture)

### Q1: 這個數位孿生系統為什麼要同時使用 Redis, RabbitMQ 和 PostgreSQL？直接把遙測數據寫進 DB 不行嗎？
**💡 回答要點：揭示你對「讀寫分離」與「削峰填谷」的理解。**
如果把 IoT 高頻遙測訊號 (每秒數千次更新) 直接寫入關聯式資料庫 (PostgreSQL)，會迅速耗盡連線池 (Connection Pool)，並造成嚴重的鎖等待與磁碟 I/O 瓶頸，最終拖垮負責主要交易（如：電池租借）的業務邏輯。
*   **Redis 作為「狀態快照層」**：利用記憶體極高的讀寫效能，承載高頻的設備心跳更新，使前端儀表板能以毫秒級延遲讀取最新熱點狀態。
*   **RabbitMQ 作為「異步緩衝層 (削峰填谷)」**：將歷史軌跡封裝成事件 (Event) 放進訊息佇列，讓 Java 後端根據自身處理能力「平滑」地消費並寫入資料庫，徹底防止大流量沖垮 DB。
*   **PostgreSQL 作為「持久與交易層」**：負責 ACID 強一致性的資產管理與交易。

### Q2: 為什麼架構規劃上，網關 (Gateway) 是用 Node.js，而核心服務 (Core) 卻用 Java Spring Boot？
**💡 回答要點：多語系微服務 (Polyglot Microservices) 的場景適配。**
*   **Node.js 的優勢**：Node.js 是單執行緒非阻塞 I/O (Event-driven, Non-blocking I/O)，在處理「大量、高併發但運算量小的長連線」時非常強大。因此非常適合用來架設 Socket.io 與處理 IoT 大量湧入的 HTTP POST 遙測請求。
*   **Java Spring Boot 的優勢**：Java 在企業級交易處理 (Transaction Management)、關聯式物件映射 (ORM/JPA)、靜態型別安全與多執行緒並發控制上非常穩健。因此處理「租借、歸還、扣款」這種絕對不容許資產錯誤的核心業務時，是最佳選擇。

---

## 2. 後端核心邏輯 (Java Spring Boot)

### Q3: 在同時有很多人想租借「同一顆剩餘電量的電池」時，你們如何解決資源競爭 (Race Condition)？
**💡 回答要點：展現對資料庫鎖 (Database Locks) 與並發控制的掌握。**
在這個專案中，我們使用了資料庫層級的 **悲觀鎖 (Pessimistic Lock)** 控制。
*   **實作方式**：我們在 JPA Repository 裡針對租借方法加入了 `@Lock(LockModeType.PESSIMISTIC_WRITE)`。
*   **運作原理**：當 `User A` 進入租借方法 (Rent) 時，會產生一條帶著 `FOR UPDATE`的 SQL 查詢。這會將該電池行的紀錄「上鎖」。若此時 K6 壓測產生的 `User B` 也要查詢同一顆電池，他必須等待 `User A` 的 Transaction 完成（成功或 Rollback）後釋放鎖，才能繼續。
*   *(加分題)*：如果系統跨及多國多中心，我可能會考慮升級為基於 Redis 的 **分散式鎖 (Distributed Lock, 開源方案如 Redisson)** 來進一步減少對單一關聯庫的壓力。

### Q4: Spring Data JPA 裡的 Transaction 是怎麼運作的？如果拋出了 Exception，一定會 Rollback 嗎？
**💡 回答要點：`@Transactional` 運作機制的理解。**
Spring 的事務管理底層是利用 AOP (Aspect-Oriented Programming) 動態代理。只有當拋出 **RuntimeException (非受檢例外)** 或 **Error** 時，預設才會觸發交易中斷並 Rollback 復原資料。如果拋出的是 checked exception (如 IOException)，系統預設並不會 Rollback。這也是我們在自訂 `BatteryNotFoundException` 時，確保它繼承自 `RuntimeException` 的原因。

---

## 3. 即時通訊與閘道器 (Node.js & Socket.io)

### Q5: 在從本地部署到 GCP Cloud Run 時，Socket.io 噴發了大量 `400 Bad Request`，發生了什麼事？你如何排解？
**💡 回答要點：這絕對是面試的高光時刻，展現 Troubleshooting 能力深不可測。**
這跟 Cloud Run 無狀態 (Stateless) 及 Load Balancer 機制有關：
1.  **根本原因**：Socket.io 預設建立連線的第一階段是 **HTTP Long Polling (長輪詢)**，連線成功後才會 Upgrade 成 WebSocket。
2.  **迷航現象**：Cloud Run 的負載平衡器在短輪詢期間，可能將第二個輪詢請求打到了*另一個實例 (Instance B)*，但 Session ID 是儲存在原本的*實例 A* 上，因此出現認證失敗的 `400 Bad Request`。
3.  **解決方法**：我在客戶端強硬指定 `transports: ['websocket']`，直接跳過輪詢階段建立 TCP 長連線；同時捨棄不適合高併發的 Session Affinity，徹底解決此災難。

---

## 4. 訊息中介軟體 (RabbitMQ)

### Q6: 為什麼要用 RabbitMQ 而不是 Kafka？
**💡 回答要點：展現工具選擇上的架構哲學 (Trade-off)。**
*   **RabbitMQ 架構**：偏向傳統的訊息代理 (Broker)，強調**路由靈活性 (Routing)** 與 **訊息可靠傳遞 (ACK機制)**。對於設備狀態日誌這種需要即拿即放、且需確認後端 DB 正確處理後才從隊列刪除的短暫緩衝，RabbitMQ 既直觀又容易維護。
*   **Kafka 架構**：偏向分散式的事件流日誌 (Commit Log)，特長是「超高吞吐、事件溯源重播 (Event Replay)」。如果我們的專案後期擴展到「巨量大數據分析模型即時演算」，會評估改用 Kafka。

### Q7: 如果 Java Consumer 處理訊息到一半突然死機重開，訊息會遺失嗎？
**💡 面試官想聽的：訊息確認 (Acknowledgement) 機制。**
不會。因為我們使用了 RabbitMQ 的工作佇列模式 (Work Queues)，預設開啟了 **手動確認機制 (Manual ACK)** 或 Spring Rabbit 綁定的事務行為。只要 Consumer 沒有順利處理完畢並回傳 `ACK` 訊號給 Broker，一旦 RabbitMQ 發現 TCP 連線斷開，它會把該筆訊息「重新放回佇列等待區」，轉交給其他的 Consumer 或等服務重生後再發。

---

## 5. 雲端平台與基礎設施 (GCP SRE)

### Q8: Cloud Run 裡的微服務，是如何安全地存取沒有公開對外 IP 的 Cloud SQL 的？
**💡 回答要點：VPC 安全隔離實踐。**
為了防範來自全球公網的暴力破解，我們絕不給資料庫分配外部 IP。
在連線策略上，我導入了 Google 提供的 `Cloud SQL SocketFactory` 庫整合進 JDBC 字串。它利用了 Cloud Run 服務帳號 (Service Account) 的 IAM 角色權限，建立了一個底層 Unix Domain Socket 到 GCP 的私人網路內部，完成既高安全性又不失連線效能的安全橋接。

### Q9: 把系統丟到 Serverless 架構 (Cloud Run) 有遇到什麼「冷啟動 (Cold Start)」問題嗎？
**💡 回答要點：展現 Serverless 維運的眉角。**
當 Cloud Run 長時間沒有 Request 進入時，容器會縮容至 0。一旦突然有 Request (比如開啟前端儀表板)，GCP 必須重新建立 Container、載入 Java Spring Boot 或 Node 環境，這可能耗時 3~5 秒，導致第一筆請求出現高延遲。
*解法*：針對高規格場景，可以在 Cloud Run 部署時設定 `--min-instances=1`，確保永遠有一台熱機在待命，換取優異的響應速度 (這也是架構與預算成本間的權衡)。

---

## 6. 其他加分項目 (進階技術討論)

### Q10: 針對 Redis 記憶體快取，你有聽過「快取穿透 (Cache Penetration)」、「快取擊穿 (Cache Breakdown)」與「快取雪崩 (Cache Avalanche)」嗎？
*面試官常拿這三座山來考驗你對 Redis 生命週期的熟悉度：*
*   **1. 快取穿透**：黑客大量查詢一個「一定不存在的電池 ID」。因為 Redis 查無資料，Request 就會全部貫穿砸進 DB 造成崩潰。
    *   *解法*：使用布隆過濾器 (Bloom Filter)，或把「空值 (null)」也進行短暫的快取。
*   **2. 快取擊穿**：一顆「極端熱門」被上萬人觀看的電池，它的 Redis 快取突然過期 (TTL)，導致萬筆 Request 瞬間查 DB。
    *   *解法*：給 DB 查詢上 Mutex Lock，只有第一個查 DB 的人能過，其他人等待他查完更新 Redis 後，再直接拿熱騰騰的 Redis 資料。
*   **3. 快取雪崩**：大量的電池快取「在同一個瞬間」到期，導致所有 Request 大量湧入 DB。
    *   *解法*：設定 TTL (存活時間) 時，加上一段隨機的亂數時間 (Jitter)，錯開所有鍵值的過期時間。
