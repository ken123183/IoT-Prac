package com.battery.core.controller;

import com.battery.core.service.RentalService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/rental")
@CrossOrigin(origins = "*")
public class RentalController {

    @Autowired
    private RentalService rentalService;

    @PostMapping("/rent")
    public ResponseEntity<String> rent(@RequestBody Map<String, String> request) {
        String batteryId = request.get("batteryId");
        String userId = request.get("userId");

        try {
            String result = rentalService.rentBattery(batteryId, userId);
            return ResponseEntity.ok(result);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("伺服器錯誤: " + e.getMessage());
        }
    }

    @PostMapping("/return")
    public ResponseEntity<String> returnBattery(@RequestBody Map<String, String> request) {
        String batteryId = request.get("batteryId");
        return processReturn(batteryId);
    }

    // [NEW] 支援路徑變數，解決前端 404
    @PostMapping("/return/{batteryId}")
    public ResponseEntity<String> returnBatteryById(@PathVariable String batteryId) {
        return processReturn(batteryId);
    }

    private ResponseEntity<String> processReturn(String batteryId) {
        try {
            String result = rentalService.returnBattery(batteryId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("歸還失敗: " + e.getMessage());
        }
    }
}
