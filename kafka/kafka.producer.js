import dotenv from "dotenv";
dotenv.config();
import { Kafka, logLevel } from "kafkajs";
// const brokers = Array.from({ length: 10 }, (_, i) => `kafka-${i}.kafka.social-api.svc.cluster.local:9092`);


const kafka = new Kafka({
  clientId: "slidee-app",
  brokers: ["192.168.1.30:9092"],
  logLevel: logLevel.INFO,
});

const producer = kafka.producer();
const admin = kafka.admin();

export const createTopicIfNotExists = async (topic) => {
  try {
    await admin.connect();
    const topics = await admin.listTopics();
    if (!topics.includes(topic)) {
      await admin.createTopics({
        topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
      });
      console.log(`Topic "${topic}" created`);
    }
  } catch (error) {
    console.error("Error creating topic:", error);
  } finally {
    await admin.disconnect();
  }
};

// Kafka producer wrapper function
export const startProducer = async () => {
  try {
    console.log("Connecting to Kafka...");
    await producer.connect();
    console.log("Kafka producer connected successfully");
  } catch (error) {
    console.error("Error connecting to Kafka:", error);
    throw error;
  }
};

// Produce Message
export const produceMessage = async (topic, message) => {
  try {
    await producer.send({
      topic,
      messages: [{ value: message }],
    });
    console.log("Message produced successfully");
  } catch (error) {
    console.error("Error producing message:", error);
    throw error;
  }
};

// Disconnect Kafka producer
export const disconnectProducer = async () => {
  try {
    await producer.disconnect();
    console.log("Kafka producer disconnected successfully");
  } catch (error) {
    console.error("Error disconnecting Kafka producer:", error);
    throw error;
  }
};
