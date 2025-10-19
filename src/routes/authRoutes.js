import express from "express";
import {
  register,
  login,
  forgotPassword,
  verifyResetCode,
  updatePassword,
} from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-code", verifyResetCode);
router.post("/update-password", updatePassword);

export default router;
