import express from "express";
import {
  getAllCourses,
  getCourseDetail,
  getCourseContent,
  getCTFData,
  getLabsData,
} from "../controllers/courseController.js";

const router = express.Router();

router.get("/", getAllCourses);
router.get("/:id", getCourseDetail);
router.get("/:id/content", getCourseContent);
router.get("/ctf", getCTFData);
router.get("/lab", getLabsData);

export default router;
