import express from "express";
import {
  processPayment,
  ipnHandler,
} from "../controllers/paymentController.js";

const router = express.Router();

router.post("/", processPayment);
router.post("/notify", ipnHandler);

export default router;
