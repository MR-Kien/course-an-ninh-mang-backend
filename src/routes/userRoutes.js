const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

// định nghĩa API và map tới controller
router.get("/", userController.getUserDashboard);

module.exports = router;
