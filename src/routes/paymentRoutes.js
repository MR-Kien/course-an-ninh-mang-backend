import express from "express";
import { processPayment } from "../controllers/paymentController.js";
// import { verifyToken } from "../middleware/auth.js"; // Middleware xác thực JWT

const router = express.Router();

router.post("/", processPayment);

export default router;
