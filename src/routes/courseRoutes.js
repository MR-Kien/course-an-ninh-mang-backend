import express from "express";
import {
  getAllCourses,
  getCourseDetail,
  getCourseContent,
  getCTFData,
  getLabsData,
  getCourses,
  uploadCourse,
  createLab,
  createCtf,
  getLabById,
  getCtfById,
} from "../controllers/courseController.js";

const router = express.Router();

router.get("/", getAllCourses);
router.get("/ctf", getCTFData);
router.get("/lab", getLabsData);
router.get("/lab-detail/:id", getLabById);
router.get("/ctf-detail/:id", getCtfById);
router.get("/management", getCourses);
router.get("/:id", getCourseDetail);
router.get("/:id/content", getCourseContent);
router.post("/upload", uploadCourse);
router.post("/lab", createLab);
router.post("/ctf", createCtf);

export default router;
