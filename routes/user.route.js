import express from "express";
const router = express.Router();
import {
  getUsers,
  createUser,
  loginUser,
  forgetPassword,
  deleteUser,
  logoutUser,
  getMyProfile,
  refreshToken,
  isFollowing,
  followUser,
  getFollowers,
  getOtherUserProfile,
  getFollowings,
  editProfile,
  searchUsers,
  getUsersBookmarkedPosts,
  requestOTP,
  verifyOTP,
  removeFollower,
  getDeviceToken,
  sendDeviceToken,
} from "../controller/user.controller.js";
import { auth } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/multer.middleware.js";

router.get("/", auth, (req, res) => {
  getUsers(req, res);
});

router
  .route("/register")
  .post(upload.fields([{ name: "profileImage", maxCount: 1 }]), (req, res) => {
    createUser(req, res);
  });

router.post("/login", (req, res) => {
  loginUser(req, res);
});

router.delete("/:id", auth, (req, res) => {
  deleteUser(req, res);
});

router.post("/reset", (req, res) => {
  forgetPassword(req, res);
});

router.post("/request-otp", (req, res) => {
  requestOTP(req, res);
});

router.post("/verify-otp", (req, res) => {
  verifyOTP(req, res);
});

router.get("/bookmarked-posts", auth, (req, res) => {
  getUsersBookmarkedPosts(req, res);
});

router.post("/logout", auth, (req, res) => {
  logoutUser(req, res);
});

router.get("/profile", auth, (req, res) => {
  getMyProfile(req, res);
});

router.get("/profile/:id", auth, (req, res) => {
  getOtherUserProfile(req, res);
});

router.get("/refresh-token", (req, res) => {
  refreshToken(req, res);
});

router.post("/follow/:id", auth, (req, res) => {
  followUser(req, res);
});

router.get("/followers/:id", auth, (req, res) => {
  getFollowers(req, res);
});

router.get("/is-following/:id", auth, (req, res) => {
  isFollowing(req, res);
});

router.get("/followings/:id", auth, (req, res) => {
  getFollowings(req, res);
});

router.get("/search", auth, (req, res) => {
  searchUsers(req, res);
});

router.put(
  "/edit-profile/:id",
  upload.fields([{ name: "profileImage", maxCount: 1 }]),
  auth,
  (req, res) => {
    editProfile(req, res);
  }
);

router.delete("/remove-follower/:id", auth, (req, res) => {
  removeFollower(req, res);
});

router.post("/device-token", auth, (req, res) => {
  sendDeviceToken(req, res);
});

router.get("/device-token", auth, (req, res) => {
  getDeviceToken(req, res);
});

export default router;
