import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import pool from "../config/db.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config(); // Load biến môi trường từ .env

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // địa chỉ Gmail của bạn
    pass: process.env.EMAIL_PASS, // mật khẩu ứng dụng (App Password)
  },
});
// --- REGISTER ---
// export const register = async (req, res) => {
//   const { ten, email, matkhau, ngaysinh } = req.body;
//   try {
//     // Kiểm tra email tồn tại chưa
//     const existingUser = await pool.query(
//       "SELECT * FROM users WHERE email = $1",
//       [email]
//     );
//     if (existingUser.rows.length > 0) {
//       return res.status(400).json({ message: "Email đã tồn tại" });
//     }

//     // Mã hoá mật khẩu
//     const hashedPassword = await bcrypt.hash(matkhau, 10);

//     // Tạo user mới
//     const newUser = await pool.query(
//       "INSERT INTO users (ten, matkhau, email, ngaysinh) VALUES ($1, $2, $3, $4) RETURNING *",
//       [ten, hashedPassword, email, ngaysinh]
//     );

//     res.status(201).json({
//       message: "Đăng ký thành công",
//       user: newUser.rows[0],
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Lỗi server" });
//   }
// };
export const register = async (req, res) => {
  const { ten, email, matkhau, ngaysinh } = req.body;
  try {
    // Kiểm tra email tồn tại chưa
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Email đã tồn tại" });
    }

    // Mã hoá mật khẩu
    const hashedPassword = await bcrypt.hash(matkhau, 10);

    // Tạo user mới và lấy user_id
    const newUser = await pool.query(
      "INSERT INTO users (ten, matkhau, email, ngaysinh) VALUES ($1, $2, $3, $4) RETURNING id, ten, email, ngaysinh",
      [ten, hashedPassword, email, ngaysinh]
    );
    const userId = newUser.rows[0].id;

    // Lấy tất cả các khoahoc_id từ bảng khoahoc
    const allCourses = await pool.query("SELECT id FROM khoahoc");
    const courseIds = allCourses.rows;

    // Cấp toàn bộ khóa học cho user với trạng thái 'in-progress'
    for (const course of courseIds) {
      await pool.query(
        "INSERT INTO user_khoahoc (user_id, khoahoc_id, trangthai) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [userId, course.id, "in-progress"]
      );
    }

    res.status(201).json({
      message:
        "Đăng ký thành công và đã cấp toàn bộ khóa học với trạng thái in-progress",
      user: newUser.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
};
// --- LOGIN ---
export const login = async (req, res) => {
  const { email, matkhau } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (result.rows.length === 0)
      return res.status(400).json({ message: "Email không tồn tại" });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(matkhau, user.matkhau);
    if (!isMatch) return res.status(401).json({ message: "Sai mật khẩu" });

    const token = jwt.sign(
      { id: user.id, email: user.email, ten: user.ten, role: user.role },
      process.env.JWT_SECRET || "secretkey",
      { expiresIn: "1d" }
    );

    res.json({ message: "Đăng nhập thành công", token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

const generateResetCode = () => {
  const code = Math.floor(100000 + Math.random() * 900000);
  return code.toString();
};

// API: Xác nhận mã và đặt lại mật khẩu
// export const resetPassword = async (req, res) => {
//   try {
//     const { email, code, newPassword } = req.body;

//     // Kiểm tra input
//     if (!email || !code || !newPassword) {
//       return res.status(400).json({
//         message: "Vui lòng cung cấp email, mã xác nhận và mật khẩu mới",
//       });
//     }

//     // Tìm user và token
//     const tokenQuery = `
//       SELECT t.user_id, t.token, t.expiry, t.used
//       FROM password_reset_tokens t
//       JOIN users u ON u.id = t.user_id
//       WHERE u.email = $1 AND t.token = $2 AND t.used = false;
//     `;
//     const tokenResult = await pool.query(tokenQuery, [email, code]);

//     if (tokenResult.rows.length === 0) {
//       return res
//         .status(400)
//         .json({ message: "Mã xác nhận không hợp lệ hoặc đã sử dụng" });
//     }

//     const token = tokenResult.rows[0];

//     // Kiểm tra expiry
//     if (new Date() > new Date(token.expiry)) {
//       return res.status(400).json({ message: "Mã xác nhận đã hết hạn" });
//     }

//     // Hash mật khẩu mới
//     const hashedPassword = await bcrypt.hash(newPassword, 10);

//     // Cập nhật mật khẩu
//     const updatePasswordQuery = `
//       UPDATE users
//       SET matkhau = $1
//       WHERE id = $2;
//     `;
//     await pool.query(updatePasswordQuery, [hashedPassword, token.user_id]);

//     // Đánh dấu token đã dùng
//     const updateTokenQuery = `
//       UPDATE password_reset_tokens
//       SET used = true
//       WHERE token = $1;
//     `;
//     await pool.query(updateTokenQuery, [code]);

//     res.status(200).json({ message: "Đặt lại mật khẩu thành công" });
//   } catch (error) {
//     console.error("Error in resetPassword:", error);
//     res.status(500).json({
//       message: "Lỗi server khi đặt lại mật khẩu",
//       error: error.message,
//     });
//   }
// };
// API: Yêu cầu đặt lại mật khẩu
export const forgotPassword = async (req, res) => {
  try {
    const { email, ten } = req.body;

    // Kiểm tra input
    if (!email || !ten) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp email và họ tên" });
    }

    // Kiểm tra email và tên
    const userQuery = `
      SELECT id, ten
      FROM users
      WHERE email = $1 AND ten = $2;
    `;
    const userResult = await pool.query(userQuery, [email, ten]);

    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: "Email hoặc họ tên không đúng" });
    }

    const user = userResult.rows[0];

    // Tạo mã code và expiry (1 giờ)
    const code = generateResetCode();
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // Hết hạn sau 1 giờ

    // Lưu mã vào password_reset_tokens
    const tokenQuery = `
      INSERT INTO password_reset_tokens (user_id, token, expiry)
      VALUES ($1, $2, $3)
      RETURNING id;
    `;
    await pool.query(tokenQuery, [user.id, code, expiry]);

    // Gửi email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Mã Đặt Lại Mật Khẩu",
      text: `Mã đặt lại mật khẩu của bạn là: ${code}. Mã này có hiệu lực trong 1 giờ.`,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "Mã xác nhận đã được gửi qua email" });
  } catch (error) {
    console.error("Error in forgotPassword:", error);
    res.status(500).json({
      message: "Lỗi server khi gửi mã xác nhận",
      error: error.message,
    });
  }
};

// API: Kiểm tra mã xác nhận
export const verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    // Kiểm tra input
    if (!email || !code) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp email và mã xác nhận" });
    }

    // Tìm user và token
    const tokenQuery = `
      SELECT t.user_id, t.token, t.expiry, t.used
      FROM password_reset_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE u.email = $1 AND t.token = $2 AND t.used = false;
    `;
    const tokenResult = await pool.query(tokenQuery, [email, code]);

    if (tokenResult.rows.length === 0) {
      return res
        .status(400)
        .json({ message: "Mã xác nhận không hợp lệ hoặc đã sử dụng" });
    }

    const token = tokenResult.rows[0];

    // Kiểm tra expiry
    if (new Date() > new Date(token.expiry)) {
      return res.status(400).json({ message: "Mã xác nhận đã hết hạn" });
    }

    res
      .status(200)
      .json({ message: "Mã xác nhận hợp lệ", userId: token.user_id });
  } catch (error) {
    console.error("Error in verifyResetCode:", error);
    res.status(500).json({
      message: "Lỗi server khi kiểm tra mã xác nhận",
      error: error.message,
    });
  }
};

// API: Cập nhật mật khẩu mới
export const updatePassword = async (req, res) => {
  try {
    const { userId, code, newPassword } = req.body;

    // Kiểm tra input
    if (!userId || !code || !newPassword) {
      return res.status(400).json({
        message: "Vui lòng cung cấp userId, mã xác nhận và mật khẩu mới",
      });
    }

    // Kiểm tra token
    const tokenQuery = `
      SELECT user_id, token, expiry, used
      FROM password_reset_tokens
      WHERE user_id = $1 AND token = $2 AND used = false;
    `;
    const tokenResult = await pool.query(tokenQuery, [userId, code]);

    if (tokenResult.rows.length === 0) {
      return res
        .status(400)
        .json({ message: "Mã xác nhận không hợp lệ hoặc đã sử dụng" });
    }

    const token = tokenResult.rows[0];

    // Kiểm tra expiry
    if (new Date() > new Date(token.expiry)) {
      return res.status(400).json({ message: "Mã xác nhận đã hết hạn" });
    }

    // Hash mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Cập nhật mật khẩu
    const updatePasswordQuery = `
      UPDATE users
      SET matkhau = $1
      WHERE id = $2;
    `;
    await pool.query(updatePasswordQuery, [hashedPassword, userId]);

    // Đánh dấu token đã dùng
    const updateTokenQuery = `
      UPDATE password_reset_tokens
      SET used = true
      WHERE token = $1;
    `;
    await pool.query(updateTokenQuery, [code]);

    res.status(200).json({ message: "Đặt lại mật khẩu thành công" });
  } catch (error) {
    console.error("Error in updatePassword:", error);
    res.status(500).json({
      message: "Lỗi server khi đặt lại mật khẩu",
      error: error.message,
    });
  }
};
