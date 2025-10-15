const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController.js");

router.get("/", courseController.getAllCourses);
router.get("/:id", courseController.getCourseDetail);
router.get("/:id/content", courseController.getCourseContent);
router.get("/ctf", courseController.getCTFData);
router.get("/lab", courseController.getLabData);
module.exports = router;
