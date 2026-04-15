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
    public void receiveTelemetry(Map<String, Object> data) {
        try {
            // 修正：因為使用了 Jackson2JsonMessageConverter，直接處理 Map 即可
            String batteryId = (String) data.get("id");
            Number capacity = (Number) data.get("capacity");
            
            if (batteryId != null && capacity != null) {
                batteryRepository.findById(batteryId).ifPresent(battery -> {
                    battery.setCapacity(capacity.doubleValue());
                    batteryRepository.save(battery);
                });
            }
            
        } catch (Exception e) {
            // 在實際生產環境中，這裡應該有更好的錯誤紀錄邏輯
            System.err.println("解析遙測數據失敗: " + e.getMessage());
        }
    }
}
