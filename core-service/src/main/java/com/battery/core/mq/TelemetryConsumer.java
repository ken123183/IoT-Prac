package com.battery.core.mq;

import com.battery.core.config.RabbitConfig;
import com.battery.core.model.Battery;
import com.battery.core.repository.BatteryRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class TelemetryConsumer {

    @Autowired
    private BatteryRepository batteryRepository;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 監聽電池遙測數據並寫回資料庫
     */
    @RabbitListener(queues = RabbitConfig.TELEMETRY_QUEUE)
    public void receiveTelemetry(String message) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> data = objectMapper.readValue(message, Map.class);
            
            // 修正：相容新舊欄位名稱 (id 或 batteryId)
            String batteryId = (String) data.get("id");
            if (batteryId == null) {
                batteryId = (String) data.get("batteryId");
            }
            
            Number capacity = (Number) data.get("capacity");
            
            // 這裡我們只更新 Capacity，其他的資訊（如 Status）由業務邏輯控制
            batteryRepository.findById(batteryId).ifPresent(battery -> {
                battery.setCapacity(capacity.doubleValue());
                batteryRepository.save(battery);
            });
            
        } catch (Exception e) {
            // 在實際生產環境中，這裡應該有更好的錯誤紀錄邏輯
            System.err.println("解析遙測數據失敗: " + e.getMessage());
        }
    }
}
