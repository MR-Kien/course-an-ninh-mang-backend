import express from "express";
const router = express.Router();
import { sendChat } from "../controllers/chatbotController.js";

// định nghĩa API và map tới controller
router.post("/chat", sendChat);

export default router;
