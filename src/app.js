import dotenv from "dotenv";
import express from "express";
// import cors from "cors";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import chatbotRoutes from "./routes/chatbotRoutes.js";
import authenticateToken from "./middleware/authMiddleware.js";

dotenv.config();
const app = express();

app.use(express.json());

// routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/chatbot", chatbotRoutes);
// route test cần token
app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({
    message: `Xin chào ${req.user.username}, bạn đã vào route bảo vệ!`,
  });
});

export default app;
