package com.battery.core.model;

import jakarta.persistence.*;

@Entity
@Table(name = "batteries")
public class Battery {

    @Id
    private String id; // 例如 BATT-001

    private Double capacity; // 當前電量 (%)
    
    private String status; // AVAILABLE, RENTED, MAINTENANCE

    private String currentUserId;

    public enum Status {
        AVAILABLE, RENTED, MAINTENANCE
    }

    // --- 手動實作 Getter & Setter 確保編譯成功 ---
    
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Double getCapacity() {
        return capacity;
    }

    public void setCapacity(Double capacity) {
        this.capacity = capacity;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getCurrentUserId() {
        return currentUserId;
    }

    public void setCurrentUserId(String currentUserId) {
        this.currentUserId = currentUserId;
    }
}
