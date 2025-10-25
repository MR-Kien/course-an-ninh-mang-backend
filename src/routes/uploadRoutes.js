import express from "express";
import { getPresignedUrl } from "../controllers/uploadController.js";

const router = express.Router();

// Route: GET /api/upload/presign?filename=file.pdf
router.get("/presign", getPresignedUrl);

export default router;
