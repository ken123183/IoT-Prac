package com.battery.core.config;

import com.battery.core.model.Battery;
import com.battery.core.repository.BatteryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class DataInitializer implements CommandLineRunner {

    @Autowired
    private BatteryRepository batteryRepository;

    @Override
    public void run(String... args) throws Exception {
        long currentCount = batteryRepository.count();
        if (currentCount > 0) {
            System.out.println("✅ Database already has records (" + currentCount + "). Skipping seeding to prevent race conditions.");
            return;
        }

        System.out.println("🚀 Starting City-Scale Data Initialization (" + (1000 - currentCount) + " more batteries needed)...");
        
        List<Battery> batch = new ArrayList<>();
        for (int i = 1; i <= 1000; i++) {
            Battery battery = new Battery();
            battery.setId(String.format("BATT-%04d", i));
            battery.setCapacity(90.0 + Math.random() * 10); // 隨機初始電量 90-100%
            battery.setStatus(Battery.Status.AVAILABLE.name());
            batch.add(battery);

            if (batch.size() >= 100) {
                batteryRepository.saveAll(batch);
                batch.clear();
                System.out.println("   > Progress: " + i + "/1000 batteries seeded.");
            }
        }
        
        if (!batch.isEmpty()) {
            batteryRepository.saveAll(batch);
        }

        System.out.println("✅ Database precisely initialized with 1,000 batteries.");
    }
}
