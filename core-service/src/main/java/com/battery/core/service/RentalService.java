package com.battery.core.service;

import com.battery.core.model.Battery;
import com.battery.core.repository.BatteryRepository;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.concurrent.TimeUnit;

@Service
public class RentalService {

    @Autowired
    private BatteryRepository batteryRepository;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private ApplicationContext applicationContext;

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
            // 這個報錯代表競爭太激烈，連鎖都拿不到
            throw new RuntimeException("🔒 系統繁忙：多人正在搶租此電池，請稍後再試。");
        }

        try {
            // 🔹 關鍵點：透過 Spring Context 呼叫同類別內的 @Transactional 方法
            // 這樣才能確保事務正確啟動，且在 lock.unlock() 之前完成 Commit
            RentalService self = applicationContext.getBean(RentalService.class);
            return self.executeRentTransaction(batteryId, userId);
        } finally {
            // 🔴 2. 只有在事務完全提交 (或回滾) 後，才釋放鎖
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    /**
     * 租借核心事務 (內層：負責資料庫原子操作)
     */
    @Transactional
    public String executeRentTransaction(String batteryId, String userId) throws Exception {
        // 從資料庫重新讀取最即時的狀態 (Double-Check)
        Battery battery = batteryRepository.findById(batteryId)
                .orElseThrow(() -> new RuntimeException("找不到該電池: " + batteryId));

        // 1. 狀態再次檢查 (此時在鎖的保護下，status 絕對不會被他人篡改)
        if (!Battery.Status.AVAILABLE.name().equals(battery.getStatus())) {
            throw new RuntimeException("❌ 搶租失敗：電池 [ " + batteryId + " ] 已被用戶 " + battery.getCurrentUserId() + " 優先租走！");
        }

        if (battery.getCapacity() <= 5) {
            throw new RuntimeException("⚠️ 租借取消：該電池電量過低 (" + battery.getCapacity() + "%)，無法租借。");
        }

        // 2. 模擬支付處理 (延遲 1-2 秒以模擬真實環境)
        int paymentDelay = (int) (Math.random() * 1000) + 1000;
        Thread.sleep(paymentDelay);
        
        // 3. 寫入資料庫變更
        battery.setStatus(Battery.Status.RENTED.name());
        battery.setCurrentUserId(userId);
        batteryRepository.saveAndFlush(battery); // 強制刷入資料庫

        // 4. 同步更新 Redis 並發佈事件 (讓網關與模擬器即時收到)
        java.util.Map<String, String> updates = new java.util.HashMap<>();
        updates.put("id", batteryId);
        updates.put("status", Battery.Status.RENTED.name());
        updates.put("currentUserId", userId);
        updates.put("capacity", String.valueOf(battery.getCapacity()));
        
        redissonClient.getMap("battery:" + batteryId, org.redisson.client.codec.StringCodec.INSTANCE).putAll(updates);
        
        // 發佈 JSON 事件 (網關訂閱此頻道 battery-events)
        // 修正：使用 %.2f 精簡電量位數
        String json = String.format("{\"id\":\"%s\",\"status\":\"RENTED\",\"currentUserId\":\"%s\",\"capacity\":%.2f}", 
                        batteryId, userId, battery.getCapacity());
        redissonClient.getTopic("battery-events", org.redisson.client.codec.StringCodec.INSTANCE).publish(json);

        return "✅ 租借成功！(用戶: " + userId + ")";
    }

    /**
     * 歸還電池邏輯
     */
    @Transactional
    public String returnBattery(String batteryId) {
        Battery battery = batteryRepository.findById(batteryId)
                .orElseThrow(() -> new RuntimeException("找不到該電池: " + batteryId));
        
        battery.setStatus(Battery.Status.AVAILABLE.name());
        battery.setCurrentUserId(null);
        batteryRepository.save(battery);

        // 同步更新 Redis 並發佈歸還事件
        java.util.Map<String, String> updates = new java.util.HashMap<>();
        updates.put("id", batteryId);
        updates.put("status", Battery.Status.AVAILABLE.name());
        updates.put("currentUserId", "");
        
        redissonClient.getMap("battery:" + batteryId, org.redisson.client.codec.StringCodec.INSTANCE).putAll(updates);
        redissonClient.getMap("battery:" + batteryId, org.redisson.client.codec.StringCodec.INSTANCE).remove("currentUserId");
        
        // 修正：使用 %.2f 精簡電量位數
        String json = String.format("{\"id\":\"%s\",\"status\":\"AVAILABLE\",\"currentUserId\":\"\",\"capacity\":%.2f}", 
                        batteryId, battery.getCapacity());
        redissonClient.getTopic("battery-events", org.redisson.client.codec.StringCodec.INSTANCE).publish(json);
        
        return "📦 歸還成功！電池已重新架上。";
    }
}
