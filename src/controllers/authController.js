const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("../config/db"); // file kết nối PostgreSQL

// --- REGISTER ---
const register = async (req, res) => {
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

    // Tạo user mới
    const newUser = await pool.query(
      "INSERT INTO users (ten, matkhau, email, ngaysinh) VALUES ($1, $2, $3, $4) RETURNING *",
      [ten, hashedPassword, email, ngaysinh]
    );

    res.status(201).json({
      message: "Đăng ký thành công",
      user: newUser.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// --- LOGIN ---
const login = async (req, res) => {
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
      { id: user.id, email: user.email, ten: user.ten },
      process.env.JWT_SECRET || "secretkey",
      { expiresIn: "1d" }
    );

    res.json({ message: "Đăng nhập thành công", token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

module.exports = { register, login };
