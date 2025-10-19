import express from "express";
import {
  sendChat,
  getUserTopics,
  getTopicQA,
} from "../controllers/chatbotController.js";

// định nghĩa API và map tới controller
const router = express.Router();
router.post("/chat", sendChat);
router.get("/topics", getUserTopics);
router.get("/topics/:topicId/qa", getTopicQA);

export default router;
