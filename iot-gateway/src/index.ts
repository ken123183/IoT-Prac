import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import amqplib from 'amqplib';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  }
});

app.use(cors());
app.use(express.json());

// 使用環境變數或預設 localhost
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const AMQP_URL = process.env.AMQP_URL || 'amqp://battery_rmq:battery_pass@localhost:5672';

// Redis Client
const redisClient = createClient({ url: REDIS_URL });
const redisPubSub = redisClient.duplicate();

// RabbitMQ Connection
let amqpChannel: amqplib.Channel;

async function init() {
  try {
    await redisClient.connect();
    await redisPubSub.connect();
    console.log('✅ Connected to Redis (3001)');

    // 統一事件名稱為 'batteryUpdate' 以符合 App.tsx
    await redisPubSub.subscribe('battery-events', (message) => {
      const data = JSON.parse(message);
      if (data.type === 'SYSTEM_RESET') {
        io.emit('systemReset');
      } else {
        io.emit('batteryUpdate', data);
      }
    });

    const conn = await amqplib.connect(AMQP_URL);
    amqpChannel = await conn.createChannel();
    await amqpChannel.assertQueue('battery_telemetry', { durable: true });
    console.log('✅ Connected to RabbitMQ');

  } catch (error) {
    console.error('❌ Infrastructure Error:', error);
  }
}

// [NEW] API: 獲取所有電池當前快照
app.get('/api/batteries', async (req, res) => {
  try {
    const keys = await redisClient.keys('battery:*');
    const batteries: any[] = [];
    
    // 使用批量查詢以提升 1,000 筆資料下的效能
    for (const key of keys) {
      const data = await redisClient.hGetAll(key);
      if (data && data.id) {
        batteries.push({
          ...data,
          capacity: data.capacity ? parseFloat(data.capacity) : 0
        });
      }
    }
    res.json(batteries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

// [NEW] API: 獲取單顆電池狀態 (供模擬器同步用)
app.get('/api/battery/:batteryId', async (req, res) => {
  try {
    const data = await redisClient.hGetAll(`battery:${req.params.batteryId}`);
    if (!data || Object.keys(data).length === 0) {
      return res.status(404).json({ error: 'Battery not found' });
    }
    
    // 修正：確保傳回給模擬器的數據包含正確的數字型別
    res.json({
      ...data,
      capacity: data.capacity ? parseFloat(data.capacity) : 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch battery info' });
  }
});

// REST route for Battery IoT Devices
app.post('/api/telemetry', async (req, res) => {
  const payload = req.body;
  if (!payload || !payload.id) {
    return res.status(400).json({ error: 'Missing battery id' });
  }

  const existing = await redisClient.hGetAll(`battery:${payload.id}`);
  
  // 智慧合併：保留 Redis 中的現有欄位 (如 currentUserId)，僅更新物理數據
  const finalPayload = {
    ...existing, 
    ...payload,
    // 確保狀態優先使用伺服器端的關鍵決策 (如果存在)
    status: (existing && existing.status && existing.status !== 'AVAILABLE') ? existing.status : payload.status,
    capacity: Number(payload.capacity),
    updatedAt: new Date().toISOString()
  };

  await redisClient.hSet(`battery:${payload.id}`, finalPayload);
  await redisClient.publish('battery-events', JSON.stringify(finalPayload));

  if (amqpChannel) {
    amqpChannel.sendToQueue('battery_telemetry', Buffer.from(JSON.stringify(finalPayload)));
  } else {
    console.error(`❌ Cannot send telemetry for ${payload.id}: RabbitMQ channel not ready`);
  }

  res.status(200).json({ success: true });
});

const PORT = 3001;
init().then(() => {
  httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 IoT Gateway running on http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('🔥 Failed to initialize Gateway:', err);
});
