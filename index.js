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
// WebSocket Server
const wsServer = http.createServer(); // Separate server for WebSocket
export const io = new Server(wsServer);
const app = express();
const httpServer = http.createServer(app); // HTTP server for the Express app

app.use(cors());

// Middlewares
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(morgan("dev"));

// Database connection
await connectDB(io);

// Routes
import userRouter from "./routes/user.route.js";
import postRouter from "./routes/post.route.js";
import commentRouter from "./routes/comment.route.js";
import notificationRouter from "./routes/notification.route.js";

// Endpoints
app.use("/api/v1/users/", userRouter);
app.use("/api/v1/posts/", postRouter);
app.use("/api/v1/posts/", commentRouter);
app.use("/api/v1/notifications/", notificationRouter);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running on v1" });
});

// Start the HTTP server and Kafka consumer
httpServer.listen(process.env.HTTP_PORT, async () => {
  console.log(`HTTP Server running on port ${process.env.HTTP_PORT}`);
  // Start the Kafka consumer when the server starts
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

  // Listen for user identification (when they connect or log in)
  socket.on("identify", (userId) => {
    connectedUsers[userId] = socket.id; // Map the userId to this WebSocket connection ID
    console.log(`User ${userId} connected with socket ID: ${socket.id}`);
  });

  // Listen for incoming notifications to send to specific users
  socket.on("send_notification", (notification) => {
    const { userId, message } = notification; // Notification includes the target userId and the message

    const socketId = connectedUsers[userId]; // Get the socket ID of the target user
    if (socketId) {
      // Emit the notification only to the specific user
      io.to(socketId).emit("new_notification", message);
      console.log(`Notification sent to user ${userId}: ${message}`);
    } else {
      console.log(`User ${userId} is not connected.`);
    }
  });

  // Handle user disconnect
  socket.on("disconnect", () => {
    // Find and remove the disconnected user from the connectedUsers map
    for (const userId in connectedUsers) {
      if (connectedUsers[userId] === socket.id) {
        console.log(`User ${userId} disconnected from WebSocket`);
        delete connectedUsers[userId]; // Remove the user from the map
        break;
      }
    }
  });
});

// Start the WebSocket server on a different port
wsServer.listen(process.env.WS_PORT, () => {
  console.log(`WebSocket server running on port ${process.env.WS_PORT}`);
});
