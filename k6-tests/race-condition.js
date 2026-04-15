import http from 'k6/http';
import { check, sleep } from 'k6';

// 測試設定：10 個虛擬用戶同時發起請求
export const options = {
  vus: 10,
  duration: '5s',
};

const API_URL = 'http://localhost:8080/api/rental/rent';

export default function () {
  const payload = JSON.stringify({
    batteryId: 'BATT-1234',
    userId: `TEST_USER_${__VU}` // 每一個虛擬用戶都有不同的 ID
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(API_URL, payload, params);

  // 🔴 在壓力測試期間將所有回應印出來，您會看到滿滿的「搶租失敗」訊息
  if (res.status !== 200) {
    console.log(`[VUS_${__VU}] Failed: ${res.body}`);
  }

  // 驗證邏輯：
  // 我們預期只有「一個」請求會成功 (200 OK)
  // 其餘的請求應該會被分散式鎖擋住，回傳 500 或 400 (視後端報錯而定)
  check(res, {
    'is status 200 (Success)': (r) => r.status === 200,
    'is status 500/400 (Locked/Failed)': (r) => r.status !== 200,
  });

  sleep(1);
}
