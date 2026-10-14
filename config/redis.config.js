import { createClient } from "redis"

const redisClient = createClient({
  url: process.env.REDIS_URL,
  password: process.env.REDIS_PASSWORD,
  socket: {
    reconnectStrategy: (retries) => {
      return Math.min(retries * 100, 3000);
    },
  },
});

redisClient.on("error", (err) => {
  console.error("Redis Error:", err);
});

redisClient.connect().catch((err) => {
  console.error("Failed to connect to Redis during startup:", err);
});

export default redisClient;
