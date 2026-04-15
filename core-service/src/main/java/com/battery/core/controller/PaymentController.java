package com.battery.core.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.HashMap;
import java.util.Random;

@RestController
@RequestMapping("/api/payment")
public class PaymentController {

    private final Random random = new Random();

    @PostMapping("/mock")
    public Map<String, Object> processMockPayment(@RequestBody Map<String, Object> request) throws InterruptedException {
        // 模擬隨機時間延遲，50 毫秒到 1000 毫秒
        int delay = 50 + random.nextInt(950);
        Thread.sleep(delay);

        Map<String, Object> response = new HashMap<>();
        response.put("status", "SUCCESS");
        response.put("transactionId", "txn_mock_" + System.currentTimeMillis());
        response.put("processTimeMs", delay);
        response.put("amount", request.getOrDefault("amount", 0));
        
        return response;
    }
}
