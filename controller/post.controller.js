import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import {
  uploadBase64Image,
  uploadVideoOnCloudinary,
  uploadOnCloudinary,
  uploadVideoOnCloudinaryBase64,
} from "../utils/cloudinary.util.js";
import {
  createTopicIfNotExists,
  produceMessage,
} from "../kafka/kafka.producer.js";

const getPosts = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 }) // Sort posts by creation date in descending order
      .populate("createdBy", "name username email profileImage")
      .populate("likedBy", "name username profileImage bio")
      .populate({
        path: "comments",
        options: { sort: { createdAt: -1 } }, // Sort comments by creation date in descending order
        populate: [
          {
            path: "createdBy",
            select: "name username profileImage",
          },
          {
            path: "content",
            select: "content",
          },
        ],
      })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .exec();

    const totalPosts = await Post.countDocuments();

    res.status(200).json({
      message: "Posts retrieved successfully",
      posts,
      totalPages: Math.ceil(totalPosts / pageSize),
      currentPage: page,
    });
  } catch (error) {
    console.error("Error retrieving posts:", error);
    res.status(500).json({ message: error.message });
  }
};

const getPost = async (req, res) => {
  const { id } = req.params;

  try {
    const post = await Post.findById(id)
      .populate("createdBy", "username email") // Ensure 'username' and 'email' are valid fields in User schema
      .exec();

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.status(200).json({
      message: "Post retrieved successfully",
      post,
    });
  } catch (error) {
    console.error("Error retrieving post:", error);
    res.status(500).json({ message: error.message });
  }
};

const createPost = async (req, res) => {
  const { content, imageUrlBase64, videoUrlBase64 } = req.body;
  const createdBy = req.user ? req.user._id : null;

  if (!createdBy) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  try {
    let imageUrl = [];
    let videoUrl = "";

    // Ensure imageUrlBase64 is an array
    const imageBase64Array = Array.isArray(imageUrlBase64)
      ? imageUrlBase64
      : [imageUrlBase64];

    // Upload the post images if provided (either base64 or from the file)
    if (imageUrlBase64) {
      const imageUrls = await Promise.all(
        imageBase64Array.map(async (base64) => {
          const result = await uploadBase64Image(base64);
          return result.url;
        })
      );
      imageUrl = imageUrls;
    } else if (
      req.files &&
      req.files.imageUrl &&
      req.files.imageUrl.length > 0
    ) {
      const imageFiles = req.files.imageUrl;
      const imageUrls = await Promise.all(
        imageFiles.map(async (file) => {
          const result = await uploadOnCloudinary(file.path);
          return result.url;
        })
      );
      imageUrl = imageUrls;
    }

    if (videoUrlBase64) {
      const videoResult = await uploadVideoOnCloudinaryBase64(videoUrlBase64);
      videoUrl = videoResult.url;
    }

    // Upload video if it is provided (from file)
    if (req.files && req.files.videoUrl && req.files.videoUrl.length > 0) {
      const videoFiles = req.files.videoUrl;
      const video = videoFiles[0];
      const videoResult = await uploadVideoOnCloudinary(video.path);
      videoUrl = videoResult.url;

      if (!videoUrl || videoUrl.trim() === "") {
        return res.status(500).json({ message: "Failed to upload video" });
      }
    }
    // Check if the topic exists, and create it if not
    const topic = "create-posts";
    await createTopicIfNotExists(topic);

    // Produce a message with post creation details
    const message = JSON.stringify({
      content,
      imageUrl,
      videoUrl,
      createdBy,
    });

    await produceMessage(topic, message);

    res.status(201).json({
      message: "Post creation request sent successfully to Kafka",
    });
  } catch (error) {
    console.error("Error in createPost function:", error);
    res.status(409).json({ message: error.message });
  }
};

const bookmarkedPost = async (req, res) => {
  const userId = req.user ? req.user._id : null;
  const postId = req.params.id;

  if (!userId) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  try {
    // Check if the post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if the post is already bookmarked
    if (post.bookmarkedBy && post.bookmarkedBy.includes(userId)) {
      return res.status(400).json({ message: "Post already bookmarked" });
    }

    // Add user to bookmarkedBy array in the post
    post.bookmarkedBy = post.bookmarkedBy || [];
    post.bookmarkedBy.push(userId);
    await post.save();

    res.status(200).json({ message: "Post bookmarked successfully" });
  } catch (error) {
    console.error("Error bookmarking post:", error);
    res.status(500).json({ message: error.message });
  }
};

const updatePost = async (req, res) => {
  const { id } = req.params;
  const { content, imageUrlBase64 } = req.body;
  const userId = req.user ? req.user._id : null;

  if (!userId) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  try {
    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ message: "User not authorized" });
    }

    // Initialize imageUrl with default value
    let imageUrl = { url: "" };

    // Upload the postImage if it is provided
    if (imageUrlBase64) {
      imageUrl = await uploadBase64Image(imageUrlBase64);
    } else if (
      req.files &&
      req.files.imageUrl &&
      req.files.imageUrl.length > 0
    ) {
      const imageFiles = req.files.imageUrl;
      imageUrl = await uploadOnCloudinary(imageFiles[0].path);
    }

    post.content = content;
    post.imageUrl = imageUrl.url;

    await post.save();

    res.status(200).json({
      message: "Post updated successfully",
      post,
    });
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).json({ message: error.message });
  }
};

const deletePost = async (req, res) => {
  const { id } = req.params;
  const userId = req.user ? req.user._id : null;

  if (!userId) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  try {
    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ message: "User not authorized" });
    }

    await post.remove();

    res.status(200).json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({ message: error.message });
  }
};

const TOPIC_NAME = "like-dislike-events";

// Like a post
const likePost = async (req, res) => {
  const { id: postId } = req.params;
  const userId = req.user ? req.user._id : null;

  if (!userId) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  // Find the post and its owner
  const post = await Post.findById(postId);
  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }
  const postOwner = await User.findById(post.createdBy);

  const likedByUser = await User.findById(userId).select(
    "_id name username profileImage bio"
  );

  if (!postOwner || !postOwner.deviceToken) {
    return res
      .status(404)
      .json({ message: "Post owner or device token not found" });
  }

  try {
    // Ensure the topic exists
    await createTopicIfNotExists(TOPIC_NAME);

    // Produce a like event
    const message = JSON.stringify({
      postId,
      userId,
      action: "like",
      timestamp: new Date().toISOString(),
    });
    await produceMessage(TOPIC_NAME, message);

    // Produce a notification event for the post owner
    const notificationMessage = JSON.stringify({
      user: postOwner._id,
      type: "like_post",
      message: `${userId} liked your post`,
      link: `/posts/${postId}`,
    });
    await produceMessage("notifications", notificationMessage);

    await Notification.create({
      user: postOwner._id,
      type: "like_post",
      message: ` liked your post`,
      link: `/posts/${postId}`,
      details: {
        post: {
          id: postId,
          title: post.content,
          name: likedByUser.name,
          username: likedByUser.username,
          profileImage: likedByUser.profileImage,
        },
      },
    });
    // Send a Firebase push notification
    const postOwnerDeviceToken = postOwner.deviceToken;

    // Only send a Firebase push notification if the liker is not the post owner
    if (likedByUser._id.toString() !== postOwner._id.toString()) {
      const postOwnerDeviceToken = postOwner.deviceToken;
      await sendLikeNotification(postOwnerDeviceToken, postId, likedByUser);
    } else {
      return;
    }

    await sendLikeNotification(postOwnerDeviceToken, postId, likedByUser);
    res.status(200).json({ message: "Like event produced successfully" });
  } catch (error) {
    console.error("Error producing like event:", error);
    res.status(500).json({ message: error.message });
  }
};

// Dislike (unlike) a post
const unlikePost = async (req, res) => {
  const { id: postId } = req.params;
  const userId = req.user ? req.user._id : null;

  if (!userId) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  try {
    // Ensure the topic exists
    await createTopicIfNotExists(TOPIC_NAME);

    // Produce a dislike event
    const message = JSON.stringify({
      postId,
      userId,
      action: "dislike",
      timestamp: new Date().toISOString(),
    });
    await produceMessage(TOPIC_NAME, message);

    res.status(200).json({ message: "Dislike event produced successfully" });
  } catch (error) {
    console.error("Error producing dislike event:", error);
    res.status(500).json({ message: error.message });
  }
};

const getPostLikes = async (req, res) => {
  const { id } = req.params;

  try {
    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const likes = await User.find({ _id: { $in: post.likedBy } });

    res.status(200).json({
      message: "Post likes retrieved successfully",
      likes,
    });
  } catch (error) {
    console.error("Error retrieving post likes:", error);
    res.status(500).json({ message: error.message });
  }
};

const getPostsByUserId = async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;

  try {
    const posts = await Post.find()
      .where({ createdBy: id }) // Find posts by the specific user
      .sort({ createdAt: -1 }) // Sort posts by creation date in descending order
      .populate("createdBy", "name username email profileImage")
      .populate("likedBy", "name username profileImage bio")
      .populate({
        path: "comments",
        options: { sort: { createdAt: -1 } }, // Sort comments by creation date in descending order
        populate: [
          {
            path: "createdBy",
            select: "name username profileImage",
          },
          {
            path: "content",
            select: "content",
          },
        ],
      })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .exec();

    // Count total posts by the specific user
    const totalPosts = await Post.countDocuments({ createdBy: req.params.id });

    // If no posts are found
    if (!posts.length) {
      return res.status(404).json({
        message: "No posts found for this user",
      });
    }

    // Send response with posts, total pages, and current page
    res.status(200).json({
      message: "Posts retrieved successfully",
      posts,
      totalPages: Math.ceil(totalPosts / pageSize), // Calculate total pages
      currentPage: page,
    });
  } catch (error) {
    console.error("Error retrieving posts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const deleteAllPostsOfUser = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  try {
    // Delete all posts created by the user
    await Post.deleteMany({ createdBy: id });

    // Reset the user's posts array and posts count
    await User.findByIdAndUpdate(
      id,
      {
        $set: {
          posts: [],
          postsCount: 0,
        },
      },
      { new: true } // Returns the updated document
    );

    res.status(200).json({
      message:
        "All posts deleted successfully, user's posts and post count reset.",
    });
  } catch (error) {
    console.error("Error deleting posts:", error);
    res.status(500).json({ message: error.message });
  }
};

export {
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  getPostLikes,
  bookmarkedPost,
  getPostsByUserId,
  deleteAllPostsOfUser,
};
