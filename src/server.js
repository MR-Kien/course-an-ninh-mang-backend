// import app from "./app.js";

// const PORT = process.env.PORT || 8000;

// app.listen(PORT, () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`);
// });
import dotenv from "dotenv";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import chatbotRoutes from "./routes/chatbotRoutes.js";
import authenticateToken from "./middleware/authMiddleware.js";
import paymentRoutes from "./routes/paymentRoutes.js";

dotenv.config();
const app = express();
const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:3000",
  "https://courseanninhmang.vercel.app",
  "https://lozoacademy.com.vn",
];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // Nếu dùng cookie hoặc auth token
  })
);
app.use(express.json());

// Xử lý các yêu cầu preflight cho tất cả các route
// app.options("/*", cors());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", authenticateToken, userRoutes);
app.use("/api/courses", authenticateToken, courseRoutes);
app.use("/api/chatbot", authenticateToken, chatbotRoutes);
app.use("/api/payment", authenticateToken, paymentRoutes);

// Route test cần token
app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({
    message: `Xin chào ${req.user.username}, bạn đã vào route bảo vệ!`,
  });
});

// Xử lý lỗi 404
app.use((req, res) => {
  res.status(404).json({ message: "Không tìm thấy route" });
});

// Xử lý lỗi server
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Lỗi server" });
});

// Vercel yêu cầu export default để hoạt động như một serverless function
export default app;
