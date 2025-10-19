import pool from "../config/db.js"; // Giả sử bạn có file config/db.js để kết nối PostgreSQL

export const processPayment = async (req, res) => {
  try {
    const userId = req.user?.id || 1; // Lấy từ JWT middleware
    const {
      ho_ten,
      email,
      so_dien_thoai,
      phuong_thuc_thanh_toan,
      ten_goi,
      so_tien,
    } = req.body;

    // Kiểm tra userId
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Vui lòng đăng nhập để thực hiện thanh toán" });
    }

    // Kiểm tra các trường bắt buộc
    if (!ho_ten || !email || !phuong_thuc_thanh_toan || !ten_goi || !so_tien) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
    }

    // Kiểm tra phương thức thanh toán hợp lệ
    const validPaymentMethods = ["momo", "bank_transfer"];
    if (!validPaymentMethods.includes(phuong_thuc_thanh_toan)) {
      return res
        .status(400)
        .json({ message: "Phương thức thanh toán không hợp lệ" });
    }

    // Kiểm tra gói và số tiền hợp lệ
    const packageConfig = {
      "Gói Cơ Bản": { role: "user_basic", price: 39000 },
      "Gói Nâng Cao": { role: "user_premium", price: 89000 },
      "Gói Năm": { role: "user_year", price: 1299000 },
    };
    if (!packageConfig[ten_goi]) {
      return res.status(400).json({ message: "Gói không hợp lệ" });
    }
    if (so_tien !== packageConfig[ten_goi].price) {
      return res
        .status(400)
        .json({ message: `Số tiền không khớp với ${ten_goi}` });
    }

    // Kiểm tra người dùng tồn tại và vai trò hiện tại
    const userQuery = "SELECT role, email FROM users WHERE id = $1";
    const userResult = await pool.query(userQuery, [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    // Kiểm tra email khớp
    if (userResult.rows[0].email !== email) {
      return res
        .status(400)
        .json({ message: "Email không khớp với tài khoản" });
    }

    // Kiểm tra vai trò hiện tại
    const currentRole = userResult.rows[0].role || "user";
    const rolePriority = {
      user: 0,
      user_basic: 1,
      user_premium: 2,
      user_year: 3,
    };
    const newRole = packageConfig[ten_goi].role;
    if (rolePriority[currentRole] >= rolePriority[newRole]) {
      return res.status(400).json({
        message: `Bạn đã có vai trò ${currentRole}, không thể hạ cấp hoặc mua gói tương đương`,
      });
    }

    // Bắt đầu transaction
    await pool.query("BEGIN");

    // Ghi nhận thanh toán
    const paymentQuery = `
      INSERT INTO thanhtoan (user_id, ho_ten, email, so_dien_thoai, phuong_thuc_thanh_toan, ten_goi, so_tien, trang_thai)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    const paymentResult = await pool.query(paymentQuery, [
      userId,
      ho_ten,
      email,
      so_dien_thoai || null, // Có thể null nếu không cung cấp
      phuong_thuc_thanh_toan,
      ten_goi,
      so_tien,
      "completed",
    ]);
    const paymentId = paymentResult.rows[0].id;

    // Cập nhật vai trò người dùng
    const updateUserQuery = "UPDATE users SET role = $1 WHERE id = $2";
    await pool.query(updateUserQuery, [newRole, userId]);

    // Commit transaction
    await pool.query("COMMIT");

    res.status(200).json({
      message: "Thanh toán thành công",
      payment_id: paymentId,
      new_role: newRole,
    });
  } catch (error) {
    // Rollback transaction nếu có lỗi
    await pool.query("ROLLBACK");
    console.error("Error processing payment:", error);
    res
      .status(500)
      .json({ message: "Lỗi khi xử lý thanh toán", error: error.message });
  }
};
