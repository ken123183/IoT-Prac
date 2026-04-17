import http from 'k6/http';
import { sleep, check } from 'k6';

// 配置：20 個市民同時在線上活動
export const options = {
    vus: 20,
    duration: '3m', // 短時間快速驗證雲端負載效能
};

const GATEWAY_URL = __ENV.GATEWAY_URL || 'https://battery-gateway-426680682460.asia-east1.run.app/api/batteries';
const RENT_URL = __ENV.RENT_URL || 'https://battery-core-426680682460.asia-east1.run.app/api/rental/rent';
const RETURN_URL_BASE = __ENV.RETURN_URL || 'https://battery-core-426680682460.asia-east1.run.app/api/rental/return';

export default function () {
    // 1. 搜尋：尋找可用的電池
    const res = http.get(GATEWAY_URL);
    if (!check(res, { 'get batteries success': (r) => r.status === 200 })) {
        sleep(1);
        return;
    }

    const batteries = JSON.parse(res.body);
    const availableBatteries = batteries.filter(b => b.status === 'AVAILABLE' && b.capacity > 15);

    if (availableBatteries.length === 0) {
        console.log('⚠️ 全城電池皆已租借或電量不足，等待中...');
        sleep(2);
        return;
    }

    // 隨機挑選一顆電池
    const randomBattery = availableBatteries[Math.floor(Math.random() * availableBatteries.length)];
    const batteryId = randomBattery.id;

    // 2. 租借 (Rent)
    const rentPayload = JSON.stringify({
        batteryId: batteryId,
        userId: `K6_USER_${__VU}`
    });

    const rentParams = { headers: { 'Content-Type': 'application/json' } };
    const rentRes = http.post(RENT_URL, rentPayload, rentParams);

    const rentSuccess = check(rentRes, { 'rent success': (r) => r.status === 200 });
    
    if (rentSuccess) {
        // 3. 使用中 (模擬騎車路徑時間：15 - 30 秒)
        const usageTime = Math.floor(Math.random() * 15) + 15;
        // console.log(`🔋 用戶 ${__VU} 租借了 ${batteryId}，將使用 ${usageTime} 秒...`);
        sleep(usageTime);

        // 4. 歸還 (Return)
        const returnRes = http.post(`${RETURN_URL_BASE}/${batteryId}`);
        check(returnRes, { 'return success': (r) => r.status === 200 });
        // console.log(`📦 用戶 ${__VU} 已歸還 ${batteryId}`);
    }

    // 下次租借前的間隔
    sleep(1);
}
