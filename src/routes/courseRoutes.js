import express from "express";
import {
  getAllCourses,
  getCourseDetail,
  getCourseContent,
  getCTFData,
  getLabsData,
  getCourses,
  uploadCourse,
} from "../controllers/courseController.js";

const router = express.Router();

router.get("/", getAllCourses);
router.get("/ctf", getCTFData);
router.get("/lab", getLabsData);
router.get("/management", getCourses);
router.get("/:id", getCourseDetail);
router.get("/:id/content", getCourseContent);
router.post("/upload", uploadCourse);

export default router;
