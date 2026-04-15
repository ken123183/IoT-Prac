import axios from 'axios';

const GATEWAY_BASE = process.env.GATEWAY_URL || 'http://localhost:3001';
const GATEWAY_URL = `${GATEWAY_BASE}/api/telemetry`;

// -------------------------------------------------------
// 模擬 1,000 顆城市級電池
// -------------------------------------------------------
interface BatteryState {
  id: String;
  capacity: number;
  status: 'AVAILABLE' | 'RENTED' | 'MAINTENANCE';
}

const batteries: BatteryState[] = [];

// 初始化 1,000 顆電池的記憶體狀態
for (let i = 1; i <= 1000; i++) {
  const id = `BATT-${String(i).padStart(4, '0')}`;
  batteries.push({
    id: id,
    capacity: 80 + Math.random() * 20,
    status: 'AVAILABLE'
  });
}

console.log(`🔋 Simulator: 1,000 batteries initialized. Targeting ${GATEWAY_URL}`);

async function simulate() {
  const BATCH_SIZE = 50;
  
  for (let i = 0; i < batteries.length; i += BATCH_SIZE) {
    const batch = batteries.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (battery) => {
      try {
        // 1. 同步雲端狀態
        try {
          const res = await axios.get(`${GATEWAY_BASE}/api/battery/${battery.id}`);
          if (res.data && res.data.status) {
            battery.status = res.data.status;
          }
        } catch (err: any) {
          // [CRITICAL FIX] 如果雲端找不到資料 (404)，代表系統剛重置，模擬器必須「清空記憶」歸零為 AVAILABLE
          if (err.response && err.response.status === 404) {
            battery.status = 'AVAILABLE';
            // 順便重設為 100% 以符合重新校準的預期
            battery.capacity = 100.0;
          }
        }

        // 2. 模擬物理行為 (強化動態反饋)
        if (battery.status === 'RENTED') {
          // 租借中：真實耗電 (0.5% - 2.0% 每週期)
          battery.capacity -= (0.5 + Math.random() * 1.5);
        } else if (battery.status === 'AVAILABLE' && battery.capacity < 100) {
          // 待機中：快充模擬 (0.5% - 1.5% 每週期)
          battery.capacity += (0.5 + Math.random() * 1.0);
        }

        battery.capacity = Math.max(0, Math.min(100, battery.capacity));

        // 3. 發送遙測
        await axios.post(GATEWAY_URL, {
          id: battery.id,
          capacity: parseFloat(battery.capacity.toFixed(2)),
          status: battery.status
        });
      } catch (error: any) {
        console.error(`❌ Telemetry failed for ${battery.id}: ${error.message}`);
      }
    }));
    
    // 批次間微小延遲，防止瞬間擠爆 CPU/Socket
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // 縮短輪詢間隔：改為每 2 秒掃描一次
  setTimeout(simulate, 2000);
}

simulate();
