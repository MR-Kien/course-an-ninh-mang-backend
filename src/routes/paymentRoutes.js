import express from "express";
import {
  processPayment,
  confirmPayment,
} from "../controllers/paymentController.js";
import authenticateToken from "../middleware/authMiddleware.js";
const router = express.Router();

router.post("/", authenticateToken, processPayment);
// router.post("/notify", express.raw({ type: "application/json" }), ipnHandler);
router.post("/confirm", authenticateToken, confirmPayment);
export default router;
