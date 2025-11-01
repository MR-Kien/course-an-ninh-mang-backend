// import pool from "../config/db.js"; // Giả sử bạn có file config/db.js để kết nối PostgreSQL

// export const processPayment = async (req, res) => {
//   try {
//     const userId = req.user?.id || 1; // Lấy từ JWT middleware
//     const {
//       ho_ten,
//       email,
//       so_dien_thoai,
//       phuong_thuc_thanh_toan,
//       ten_goi,
//       so_tien,
//     } = req.body;

//     // Kiểm tra userId
//     if (!userId) {
//       return res
//         .status(401)
//         .json({ message: "Vui lòng đăng nhập để thực hiện thanh toán" });
//     }

//     // Kiểm tra các trường bắt buộc
//     if (!ho_ten || !email || !phuong_thuc_thanh_toan || !ten_goi || !so_tien) {
//       return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
//     }

//     // Kiểm tra phương thức thanh toán hợp lệ
//     const validPaymentMethods = ["momo", "bank_transfer"];
//     if (!validPaymentMethods.includes(phuong_thuc_thanh_toan)) {
//       return res
//         .status(400)
//         .json({ message: "Phương thức thanh toán không hợp lệ" });
//     }

//     // Kiểm tra gói và số tiền hợp lệ
//     const packageConfig = {
//       "Gói Cơ Bản": { role: "user_basic", price: 39000 },
//       "Gói Nâng Cao": { role: "user_premium", price: 89000 },
//       "Gói Năm": { role: "user_year", price: 1299000 },
//     };
//     if (!packageConfig[ten_goi]) {
//       return res.status(400).json({ message: "Gói không hợp lệ" });
//     }
//     if (so_tien !== packageConfig[ten_goi].price) {
//       return res
//         .status(400)
//         .json({ message: `Số tiền không khớp với ${ten_goi}` });
//     }

//     // Kiểm tra người dùng tồn tại và vai trò hiện tại
//     const userQuery = "SELECT role, email FROM users WHERE id = $1";
//     const userResult = await pool.query(userQuery, [userId]);
//     if (userResult.rows.length === 0) {
//       return res.status(404).json({ message: "Người dùng không tồn tại" });
//     }

//     // Kiểm tra email khớp
//     if (userResult.rows[0].email !== email) {
//       return res
//         .status(400)
//         .json({ message: "Email không khớp với tài khoản" });
//     }

//     // Kiểm tra vai trò hiện tại
//     const currentRole = userResult.rows[0].role || "user";
//     const rolePriority = {
//       user: 0,
//       user_basic: 1,
//       user_premium: 2,
//       user_year: 3,
//     };
//     const newRole = packageConfig[ten_goi].role;
//     if (rolePriority[currentRole] >= rolePriority[newRole]) {
//       return res.status(400).json({
//         message: `Bạn đã có vai trò ${currentRole}, không thể hạ cấp hoặc mua gói tương đương`,
//       });
//     }

//     // Bắt đầu transaction
//     await pool.query("BEGIN");

//     // Ghi nhận thanh toán
//     const paymentQuery = `
//       INSERT INTO thanhtoan (user_id, ho_ten, email, so_dien_thoai, phuong_thuc_thanh_toan, ten_goi, so_tien, trang_thai)
//       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//       RETURNING id
//     `;
//     const paymentResult = await pool.query(paymentQuery, [
//       userId,
//       ho_ten,
//       email,
//       so_dien_thoai || null, // Có thể null nếu không cung cấp
//       phuong_thuc_thanh_toan,
//       ten_goi,
//       so_tien,
//       "completed",
//     ]);
//     const paymentId = paymentResult.rows[0].id;

//     // Cập nhật vai trò người dùng
//     const updateUserQuery = "UPDATE users SET role = $1 WHERE id = $2";
//     await pool.query(updateUserQuery, [newRole, userId]);

//     // Commit transaction
//     await pool.query("COMMIT");

//     res.status(200).json({
//       message: "Thanh toán thành công",
//       payment_id: paymentId,
//       new_role: newRole,
//     });
//   } catch (error) {
//     // Rollback transaction nếu có lỗi
//     await pool.query("ROLLBACK");
//     console.error("Error processing payment:", error);
//     res
//       .status(500)
//       .json({ message: "Lỗi khi xử lý thanh toán", error: error.message });
//   }
// };
import pool from "../config/db.js";
import crypto from "crypto";

// 🟢 Cấu hình MoMo Sandbox
const MOMO_CONFIG = {
  partnerCode: process.env.MOMO_PARTNER_CODE || "MOMO",
  accessKey: process.env.MOMO_ACCESS_KEY || "F8BBA842ECF85",
  secretKey: process.env.MOMO_SECRET_KEY || "K951B6PE1waDMi640xX08PD3vg6EkVlz",
  endpoint: "https://test-payment.momo.vn/v2/gateway/api/create",
};

// 🟣 Hàm gọi API MoMo qua FETCH
const createMomoPayment = async (requestBody) => {
  try {
    const response = await fetch(MOMO_CONFIG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MoMo API HTTP ${response.status}: ${text}`);
    }

    return await response.json();
  } catch (error) {
    console.error("MoMo API Error:", error.message);
    throw { resultCode: 9999, message: "Lỗi kết nối MoMo" };
  }
};

// 🟡 IPN Handler (nhận callback từ MoMo)
export const ipnHandler = async (req, res) => {
  try {
    const body = req.body;

    // 🔍 Lấy paymentId từ extraData
    const extraData = body.extraData || "";
    const paymentId = extraData.split("paymentId=")[1];

    const rawSignature = [
      `accessKey=${MOMO_CONFIG.accessKey}`,
      `amount=${body.amount}`,
      `extraData=${extraData}`,
      `message=${body.message || ""}`,
      `orderId=${body.orderId}`,
      `orderInfo=${body.orderInfo}`,
      `orderType=${body.orderType || ""}`,
      `partnerCode=${MOMO_CONFIG.partnerCode}`,
      `payType=${body.payType || ""}`,
      `requestId=${body.requestId}`,
      `responseTime=${body.responseTime}`,
      `resultCode=${body.resultCode}`,
      `transId=${body.transId}`,
    ].join("&");

    const signature = crypto
      .createHmac("sha256", MOMO_CONFIG.secretKey)
      .update(rawSignature)
      .digest("hex");

    if (signature !== body.signature) {
      console.error("❌ Invalid IPN signature");
      return res.status(200).send("OK");
    }

    if (body.resultCode !== "0") {
      console.log("❌ Payment failed:", body);
      await pool.query(
        "UPDATE thanhtoan SET trang_thai = 'failed' WHERE id = $1",
        [paymentId]
      );
      return res.status(200).send("OK");
    }

    // ✅ Xử lý thanh toán thành công
    const paymentQuery = `
      SELECT tt.*, u.role as current_role
      FROM thanhtoan tt 
      JOIN users u ON tt.user_id = u.id
      WHERE tt.id = $1 AND tt.trang_thai = 'pending'
    `;
    const paymentResult = await pool.query(paymentQuery, [paymentId]);
    const payment = paymentResult.rows[0];

    if (!payment || parseInt(body.amount) !== payment.so_tien) {
      console.warn("⚠️ Sai số tiền hoặc không tìm thấy giao dịch:", paymentId);
      return res.status(200).send("OK");
    }

    const packageConfig = {
      "Gói Cơ Bản": { role: "user_basic", price: 39000 },
      "Gói Nâng Cao": { role: "user_premium", price: 89000 },
      "Gói Năm": { role: "user_year", price: 1299000 },
    };

    const newRole = packageConfig[payment.ten_goi]?.role;
    const rolePriority = {
      user: 0,
      user_basic: 1,
      user_premium: 2,
      user_year: 3,
    };

    if (
      !newRole ||
      rolePriority[payment.current_role] >= rolePriority[newRole]
    ) {
      return res.status(200).send("OK");
    }

    await pool.query("BEGIN");
    await pool.query(
      "UPDATE thanhtoan SET trang_thai = 'completed' WHERE id = $1",
      [paymentId]
    );
    await pool.query("UPDATE users SET role = $1 WHERE id = $2", [
      newRole,
      payment.user_id,
    ]);
    await pool.query("COMMIT");

    console.log("✅ MoMo Payment COMPLETED:", paymentId);
    res.status(200).send("OK");
  } catch (error) {
    console.error("IPN error:", error);
    res.status(200).send("OK");
  }
};

// 🟢 Hàm xử lý thanh toán chính
export const processPayment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      ho_ten,
      email,
      so_dien_thoai,
      phuong_thuc_thanh_toan,
      ten_goi,
      so_tien,
    } = req.body;

    if (!userId) return res.status(401).json({ message: "Vui lòng đăng nhập" });
    if (!ho_ten || !email || !phuong_thuc_thanh_toan || !ten_goi || !so_tien)
      return res.status(400).json({ message: "Thiếu thông tin" });

    const validMethods = ["momo", "bank_transfer"];
    if (!validMethods.includes(phuong_thuc_thanh_toan))
      return res.status(400).json({ message: "Phương thức không hợp lệ" });

    const packageConfig = {
      "Gói Cơ Bản": { role: "user_basic", price: 39000 },
      "Gói Nâng Cao": { role: "user_premium", price: 89000 },
      "Gói Năm": { role: "user_year", price: 1299000 },
    };

    if (!packageConfig[ten_goi] || so_tien !== packageConfig[ten_goi].price)
      return res.status(400).json({ message: "Gói/số tiền không hợp lệ" });

    const userResult = await pool.query(
      "SELECT role, email FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0 || userResult.rows[0].email !== email)
      return res.status(400).json({ message: "Tài khoản không hợp lệ" });

    const currentRole = userResult.rows[0].role || "user";
    const rolePriority = {
      user: 0,
      user_basic: 1,
      user_premium: 2,
      user_year: 3,
    };
    const newRole = packageConfig[ten_goi].role;
    if (rolePriority[currentRole] >= rolePriority[newRole])
      return res
        .status(400)
        .json({ message: `Không thể hạ cấp từ ${currentRole}` });

    // 🏦 Bank Transfer
    if (phuong_thuc_thanh_toan === "bank_transfer") {
      await pool.query("BEGIN");
      const {
        rows: [payment],
      } = await pool.query(
        `INSERT INTO thanhtoan (user_id, ho_ten, email, so_dien_thoai, phuong_thuc_thanh_toan, ten_goi, so_tien, trang_thai)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'completed') RETURNING id`,
        [
          userId,
          ho_ten,
          email,
          so_dien_thoai || null,
          phuong_thuc_thanh_toan,
          ten_goi,
          so_tien,
        ]
      );
      await pool.query("UPDATE users SET role = $1 WHERE id = $2", [
        newRole,
        userId,
      ]);
      await pool.query("COMMIT");
      return res.json({
        message: "Thanh toán chuyển khoản OK",
        payment_id: payment.id,
        new_role: newRole,
      });
    }

    // 💳 MoMo Payment
    const {
      rows: [payment],
    } = await pool.query(
      `INSERT INTO thanhtoan (user_id, ho_ten, email, so_dien_thoai, phuong_thuc_thanh_toan, ten_goi, so_tien, trang_thai)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING id`,
      [
        userId,
        ho_ten,
        email,
        so_dien_thoai || null,
        phuong_thuc_thanh_toan,
        ten_goi,
        so_tien,
      ]
    );

    const paymentId = payment.id;

    // ⚙️ requestId & orderId theo chuẩn MoMo
    const requestId = `${MOMO_CONFIG.partnerCode}${Date.now()}`;
    const orderId = requestId;

    const orderInfo = `Nâng cấp ${ten_goi}`;
    const amount = so_tien.toString();
    const extraData = `paymentId=${paymentId}`;
    const redirectUrl = `http://localhost:3000/payment/return?paymentId=${paymentId}`;
    const ipnUrl = `https://course-an-ninh-mang-backend.vercel.app/api/payment/notify`;

    const rawSignature = `accessKey=${MOMO_CONFIG.accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${MOMO_CONFIG.partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=captureWallet`;
    const signature = crypto
      .createHmac("sha256", MOMO_CONFIG.secretKey)
      .update(rawSignature)
      .digest("hex");

    const requestBody = {
      partnerCode: MOMO_CONFIG.partnerCode,
      accessKey: MOMO_CONFIG.accessKey,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
      extraData,
      requestType: "captureWallet",
      signature,
      lang: "vi",
    };

    const momoResponse = await createMomoPayment(requestBody);

    if (momoResponse.resultCode === 0) {
      return res.json({
        message: "✅ Tạo MoMo URL thành công!",
        payUrl: momoResponse.payUrl,
        qrCode: momoResponse.qrCode,
        payment_id: paymentId,
        orderId,
        requestId,
      });
    } else {
      await pool.query("DELETE FROM thanhtoan WHERE id = $1", [paymentId]);
      return res.status(400).json({
        message: "❌ Lỗi MoMo",
        error: momoResponse,
      });
    }
  } catch (error) {
    console.error("Payment error:", error);
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
};
