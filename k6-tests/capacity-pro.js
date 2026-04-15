import http from 'k6/http';
import { check, sleep } from 'k6';

// -------------------------------------------------------
// 城市級負載配置 (City-Scale Load Config)
// -------------------------------------------------------
export const options = {
  scenarios: {
    ramping_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },  // 熱身：逐漸增加到 50 人
        { duration: '1m', target: 200 },  // 衝刺：增加到 200 人
        { duration: '1m', target: 500 },  // 極限：挑戰 500 人在線
        { duration: '30s', target: 0 },   // 冷卻
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'], // P95 回應時間必須小於 1.5 秒
    http_req_failed: ['rate<0.1'],     // 錯誤率必須低於 10%
  },
};

const API_URL = 'http://localhost:8080/api/rental/rent';

export default function () {
  // 1. 隨機選取 1,000 顆電池中的其中一顆
  const batteryId = `BATT-${Math.floor(Math.random() * 1000 + 1).toString().padStart(4, '0')}`;
  
  // 2. 隨機產生用戶 ID (USER-0001 ~ USER-5000)
  const userId = `USER-${Math.floor(Math.random() * 5000 + 1).toString().padStart(4, '0')}`;

  const payload = JSON.stringify({
    batteryId: batteryId,
    userId: userId,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(API_URL, payload, params);

  // 3. 驗證 (在這種大規模隨機下，我們主要看 API 穩定度)
  check(res, {
    'status is 200 or 500': (r) => r.status === 200 || r.status === 500,
  });

  // 模擬人為思考與操作間隔 (0.5s ~ 2s)
  sleep(Math.random() * 1.5 + 0.5);
}
