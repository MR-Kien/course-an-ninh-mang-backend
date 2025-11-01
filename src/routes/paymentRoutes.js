import express from "express";
import {
  processPayment,
  ipnHandler,
} from "../controllers/paymentController.js";
import authenticateToken from "../middleware/authMiddleware.js";
const router = express.Router();

router.post("/", authenticateToken, processPayment);
router.post("/notify", express.raw({ type: "application/json" }), ipnHandler);

export default router;
