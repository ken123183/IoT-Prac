package com.battery.core.controller;

import com.battery.core.model.Battery;
import com.battery.core.repository.BatteryRepository;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
@CrossOrigin(origins = "*") // 確保前端重置按鈕可以點擊
public class AdminController {

    @Autowired
    private BatteryRepository batteryRepository;

    @Autowired
    private RedissonClient redissonClient;

    /**
     * 重置所有電池狀態（測試用）
     */
    @PostMapping("/reset")
    public String resetSystem() {
        List<Battery> batteries = batteryRepository.findAll();
        for (Battery b : batteries) {
            b.setStatus(Battery.Status.AVAILABLE.name());
            b.setCapacity(100.0);
            b.setCurrentUserId(null);
        }
        batteryRepository.saveAll(batteries); // 批次儲存
        
        // 強力同步：直接清空 Redis 中的所有電池快照，強制全系統重新讀取新鮮數據
        redissonClient.getKeys().deleteByPattern("battery:*");
        
        // 發送全局重置事件，讓前端與模擬器同步清空記憶
        String resetEvent = "{\"type\":\"SYSTEM_RESET\"}";
        redissonClient.getTopic("battery-events", StringCodec.INSTANCE).publish(resetEvent);
        
        return "✅ System Reset Success - 1000+ nodes recalibrated & Redis flushed.";
    }

    @GetMapping("/status")
    public String getStatus() {
        return "Admin Service Active";
    }
}
