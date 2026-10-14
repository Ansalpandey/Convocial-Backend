import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { connectDB } from "./db/db.js";
import morgan from "morgan";
dotenv.config();
import { startConsumer } from "./kafka/kafka.consumer.js";
import { startProducer } from "./kafka/kafka.producer.js";
const wsServer = http.createServer();
export const io = new Server(wsServer);
const app = express();
const httpServer = http.createServer(app);
import { startWorker } from "./workers/email.worker.js";
startWorker();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(morgan("dev"));
await connectDB(io);
import userRouter from "./routes/user.route.js";
import postRouter from "./routes/post.route.js";
import commentRouter from "./routes/comment.route.js";
import notificationRouter from "./routes/notification.route.js";
app.use("/api/v1/users/", userRouter);
app.use("/api/v1/posts/", postRouter);
app.use("/api/v1/posts/", commentRouter);
app.use("/api/v1/notifications/", notificationRouter);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running on v1" });
});

httpServer.listen(process.env.HTTP_PORT, async () => {
  console.log(`HTTP Server running on port ${process.env.HTTP_PORT}`);
  try {
    await startProducer();
    console.log("Kafka producer started successfully");
    await startConsumer();
    console.log("Kafka consumer started successfully");
  } catch (error) {
    console.error("Error starting Kafka consumer:", error);
  }
});

export const connectedUsers = {}; // Track connected users by their userId

io.on("connection", (socket) => {
  console.log("A user connected via WebSocket");
  socket.on("identify", (userId) => {
    connectedUsers[userId] = socket.id;
    console.log(`User ${userId} connected with socket ID: ${socket.id}`);
  });
  socket.on("send_notification", (notification) => {
    const { userId, message } = notification;

    const socketId = connectedUsers[userId];
    if (socketId) {
      io.to(socketId).emit("new_notification", message);
      console.log(`Notification sent to user ${userId}: ${message}`);
    } else {
      console.log(`User ${userId} is not connected.`);
    }
  });
  socket.on("disconnect", () => {
    for (const userId in connectedUsers) {
      if (connectedUsers[userId] === socket.id) {
        console.log(`User ${userId} disconnected from WebSocket`);
        delete connectedUsers[userId];
        break;
      }
    }
  });
});
wsServer.listen(process.env.WS_PORT, () => {
  console.log(`WebSocket server running on port ${process.env.WS_PORT}`);
});
