import express from "express";
import {
  getUserDashboard,
  getAdminDashboard,
} from "../controllers/userController.js";

const router = express.Router();
// định nghĩa API và map tới controller
router.get("/", getUserDashboard);
router.get("/admindashboard", getAdminDashboard);
export default router;
