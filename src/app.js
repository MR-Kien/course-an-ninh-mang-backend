const express = require("express");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const courseRoutes = require("./routes/courseRoutes");
const authenticateToken = require("./middleware/authMiddleware");

const app = express();
app.use(express.json());

// routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/courses", courseRoutes);
// route test cần token
app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({
    message: `Xin chào ${req.user.username}, bạn đã vào route bảo vệ!`,
  });
});

module.exports = app;
