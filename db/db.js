import mongoose from "mongoose";
import dotenv from "dotenv";
import { EventEmitter } from "events";
dotenv.config();

const connectDB = async (io) => {
  try {
    mongoose.set("bufferCommands", false); // Disable Mongoose buffering

    // Establish MongoDB connection
    await mongoose.connect(
      // process.env.MONGO_URL_LOCAL, // Use your MongoDB URL
      process.env.MONGO_URL,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        connectTimeoutMS: 30000, // Increase timeout
      }
    );

    console.log("MongoDB connected successfully!");
    EventEmitter.setMaxListeners(100000);

    // Array of collection names to watch
    const collectionsToWatch = [
      "users",
      "posts",
      "notifications",
      "comments",
    ];

    collectionsToWatch.forEach((collectionName) => {
      const collection = mongoose.connection.collection(collectionName);
      const changeStream = collection.watch();

      changeStream.on("change", (change) => {
        console.log(`Change detected in ${collectionName} collection:`, change);

        // Emit changes based on the operation type
        switch (change.operationType) {
          case "insert":
            io.emit(`${collectionName}Insert`, change.fullDocument);
            break;
          case "update":
            io.emit(`${collectionName}Update`, {
              id: change.documentKey._id,
              update: change.updateDescription,
            });
            break;
          case "delete":
            io.emit(`${collectionName}Delete`, change.documentKey._id);
            break;
          default:
            console.log(
              `Unhandled change operation in ${collectionName} collection:`,
              change.operationType
            );
        }
      });
    });
  } catch (error) {
    console.log("Error connecting to MongoDB", error);
  }
};

export { connectDB };
