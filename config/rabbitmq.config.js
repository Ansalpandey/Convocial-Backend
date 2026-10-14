import amqp from "amqplib";

let connection = null;
let publishChannel = null;

const getRabbitMQUrl = () => {
  const username = encodeURIComponent(
    process.env.RABBITMQ_USERNAME || "vranzo"
  );
  const password = encodeURIComponent(
    process.env.RABBITMQ_PASSWORD || "Ansal@01"
  );
  const host = process.env.RABBITMQ_HOST || "127.0.0.1";
  const port = process.env.RABBITMQ_PORT || 5672;
  return `amqp://${username}:${password}@${host}:${port}`;
};

// Call this ONCE in your server.js / index.js startup
async function initRabbitMQ() {
  if (publishChannel) return;
  try {
    connection = await amqp.connect(getRabbitMQUrl());

    connection.on("error", (err) => {
      console.error("🔴 [RabbitMQ] Connection error:", err);
      connection = null;
      publishChannel = null;
    });

    publishChannel = await connection.createChannel();

    // Assert all required queues ONCE at startup
    await publishChannel.assertQueue("otp-email-queue", {
      durable: true,
    });

    console.log(`🟢 [RabbitMQ] Connected and topology initialized.`);
  } catch (error) {
    console.error("🔴 [RabbitMQ] Initialization failed:", error);
    // In production, you might want to process.exit(1) here so Kubernetes restarts the pod
  }
}

// O(1) Time Complexity, Zero extra network roundtrips
async function publishToQueue(queueName, message) {
  if (!publishChannel) {
    console.warn(`[RabbitMQ] Channel not ready, attempting reconnect...`);
    await initRabbitMQ();
  }
  try {
    // Fire and forget: sendToQueue returns a boolean synchronously if buffer isn't full
    publishChannel.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
      }
    );
  } catch (error) {
    console.error(`🔴 Error publishing to queue [${queueName}]:`, error);
  }
}

// Note: Consumers should ideally run in a separate Worker microservice, not the Express API.
async function consumeFromQueue(queueName, callback) {
  try {
    const consumeChannel = await connection.createChannel();
    await consumeChannel.assertQueue(queueName, { durable: true });
    consumeChannel.prefetch(10); // Process 10 messages concurrently

    console.log(`[*] Worker listening on queue: ${queueName}`);

    consumeChannel.consume(queueName, async (msg) => {
      if (msg !== null) {
        try {
          await callback(JSON.parse(msg.content.toString()));
          consumeChannel.ack(msg);
        } catch (err) {
          console.error(`🔴 Error processing message:`, err);
          consumeChannel.nack(msg, false, true); // Requeue on failure
        }
      }
    });
  } catch (error) {
    console.error(`🔴 Consumer setup failed:`, error);
  }
}

export { initRabbitMQ, publishToQueue, consumeFromQueue };
