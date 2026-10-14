import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import { Kafka, logLevel } from "kafkajs";
// const brokers = Array.from({ length: 10 }, (_, i) => `kafka-${i}.kafka.social-api.svc.cluster.local:9092`);
const kafka = new Kafka({
  clientId: "slidee-app",
  brokers: ["192.168.1.30:9092"],
  logLevel: logLevel.INFO,
});

const consumer = kafka.consumer({
  groupId: "slidee-group",
});
const url = process.env.MONGO_URL;

let postBatch = [];
let userPostIdsBatch = [];

let likeBatch = [];
let dislikeBatch = [];

// MongoDB connection function
const connectToMongoDB = async () => {
  try {
    await mongoose.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected successfully.");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
};

// Kafka consumer wrapper function
export const startConsumer = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await connectToMongoDB();

    console.log("Connecting to Kafka...");
    await consumer.connect();
    console.log("Kafka consumer connected successfully!");

    await consumer.subscribe({ topic: "create-posts", fromBeginning: true });
    await consumer.subscribe({
      topic: "like-dislike-events",
      fromBeginning: true,
    });

    console.log("Subscribed to topics: create-posts, like-dislike-events");

    consumer.run({
      eachMessage: async ({ topic, message }) => {
        const parsedMessage = JSON.parse(message.value.toString());

        try {
          switch (topic) {
            case "create-posts":
              await handlePostCreation(parsedMessage);
              break;
            case "like-dislike-events":
              await handleLikeDislike(parsedMessage);
              break;

            case "notification":
              console.log("Notification received:", parsedMessage);
              break;
            default:
              console.log(`Unhandled topic: ${topic}`);
          }
        } catch (error) {
          console.error("Error processing message:", error);
        }
      },
    });

    // Set up periodic batch insert every 30 seconds
    setInterval(async () => {
      await insertPostsInBatch();
      await insertLikesDislikesInBatch();
    }, 30000);
  } catch (error) {
    console.error("Error starting Kafka consumer:", error);
  }
};

// Handle Post Creation (Batch and Insert)
const handlePostCreation = async ({
  content,
  imageUrl,
  videoUrl,
  createdBy,
}) => {
  try {
    // Add post to the batch
    postBatch.push({
      content,
      imageUrl,
      videoUrl,
      createdBy: new mongoose.Types.ObjectId(createdBy),
      createdAt: new Date(),
    });

    // Initialize userPostIdsBatch for the user if not already initialized
    if (!userPostIdsBatch[createdBy]) {
      userPostIdsBatch[createdBy] = [];
    }

    console.log(`Post added to batch. Batch size: ${postBatch.length}`);

    // If the batch reaches 5000, insert immediately
    if (postBatch.length >= 5000) {
      await insertPostsInBatch();
    }
  } catch (error) {
    console.error("Error handling post creation:", error);
  }
};

// Insert posts in batch
const insertPostsInBatch = async () => {
  if (postBatch.length === 0) {
    console.log("No posts to process.");
    return;
  }

  try {
    console.log(`Inserting batch of ${postBatch.length} posts...`);

    // Bulk insert posts
    const savedPosts = await Post.insertMany(postBatch);

    // After saving, associate the posts with respective users
    savedPosts.forEach((savedPost) => {
      const userId = savedPost.createdBy.toString();
      userPostIdsBatch[userId].push(savedPost._id);
    });

    // Update users' posts arrays in batch
    await Promise.all(
      Object.keys(userPostIdsBatch).map(async (userId) => {
        const postIds = userPostIdsBatch[userId];
        if (postIds.length > 0) {
          try {
            console.log(`Updating posts array for user ${userId}`);
            await User.findByIdAndUpdate(
              userId,
              { $push: { posts: { $each: postIds } } },
              { new: true }
            );
            console.log(`Updated posts array for user ${userId}`);
          } catch (error) {
            console.error(
              `Error updating posts array for user ${userId}:`,
              error
            );
          }
        }
      })
    );

    // Clear the batch after successful insertion and update
    postBatch = [];
    userPostIdsBatch = {};
    console.log("Batch insert completed and cleared.");
  } catch (error) {
    console.error("Error during batch insertion:", error);
  }
};

// Handle Like and Dislike Events and Batch Insert
const handleLikeDislike = async ({ postId, userId, action }) => {
  try {
    const isLiked = likeBatch.some(
      (like) => like.postId === postId && like.userId === userId
    );
    const isDisliked = dislikeBatch.some(
      (dislike) => dislike.postId === postId && dislike.userId === userId
    );

    if (action === "like" && !isLiked) {
      // Add the event to the like batch
      likeBatch.push({ postId, userId });
      console.log(`Like added to batch. Batch size: ${likeBatch.length}`);
    } else if (action === "dislike" && !isDisliked) {
      // Add the event to the dislike batch
      dislikeBatch.push({ postId, userId });
      console.log(`Dislike added to batch. Batch size: ${dislikeBatch.length}`);
    } else {
      console.log(`Unknown action or duplicate action: ${action}`);
    }

    // Process batches if they reach a certain size (optional)
    if (likeBatch.length >= 5000 || dislikeBatch.length >= 5000) {
      await insertLikesDislikesInBatch();
    }
  } catch (error) {
    console.error("Error handling like/dislike event:", error);
  }
};

// Insert likes/dislikes in batch
const insertLikesDislikesInBatch = async () => {
  if (likeBatch.length === 0 && dislikeBatch.length === 0) {
    console.log("No likes or dislikes to process.");
    return;
  }

  try {
    console.log(
      `Processing ${likeBatch.length} likes and ${dislikeBatch.length} dislikes...`
    );

    // Process likes
    if (likeBatch.length > 0) {
      await Promise.all(
        likeBatch.map(async (like) => {
          await Post.findByIdAndUpdate(
            like.postId,
            {
              $addToSet: { likedBy: like.userId }, // Add the user to likedBy array
              $inc: { likes: 1 }, // Increment the likes count
            },
            { new: true }
          );
        })
      );
      console.log(`Processed ${likeBatch.length} likes`);
    }

    // Process dislikes
    if (dislikeBatch.length > 0) {
      await Promise.all(
        dislikeBatch.map(async (dislike) => {
          // Find the post to check the current like count
          const post = await Post.findById(dislike.postId);
          if (post && post.likes > 0) {
            // Only decrement if likes are greater than 0
            await Post.findByIdAndUpdate(
              dislike.postId,
              {
                $pull: { likedBy: dislike.userId }, // Remove the user from likedBy array
                $inc: { likes: -1 }, // Decrement the likes count
              },
              { new: true }
            );
          } else {
            console.log(`Post ${dislike.postId} has no likes to decrement.`);
          }
        })
      );
      console.log(`Processed ${dislikeBatch.length} dislikes`);
    }

    // Clear the like and dislike batches after processing
    likeBatch = [];
    dislikeBatch = [];
  } catch (error) {
    console.error("Error during like/dislike batch insertion:", error);
  }
};

export default consumer;
