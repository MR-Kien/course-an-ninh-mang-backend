// const pool = require("../config/db");
// const formatRelative = (date) => {
//   if (!date) return null;
//   const now = new Date();
//   const d = new Date(date);
//   const diffMs = now - d;
//   const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
//   if (diffHours < 24) return `${diffHours} giờ trước`;
//   const diffDays = Math.floor(diffHours / 24);
//   if (diffDays === 1) return "1 ngày trước";
//   return `${diffDays} ngày trước`;
// };

// exports.getUserDashboard = async (req, res) => {
//   const userId = req.user?.id || 1;

//   try {
//     // === STATS ===
//     const qKhoa = await pool.query(
//       `SELECT COUNT(*) AS cnt FROM user_khoahoc WHERE user_id = $1 AND trangthai = 'in-progress'`,
//       [userId]
//     );
//     const qModules = await pool.query(
//       `SELECT COUNT(*) AS cnt FROM user_baihoc WHERE user_id = $1 AND hoanthanh_baihoc = true`,
//       [userId]
//     );
//     const qLabs = await pool.query(
//       `SELECT COUNT(*) AS cnt FROM lab_user WHERE user_id = $1 AND tiendo >= 100`,
//       [userId]
//     );
//     const qCerts = await pool.query(
//       `SELECT COUNT(*) AS cnt FROM user_baikiemtra WHERE user_id = $1 AND trangthai = 'completed'`,
//       [userId]
//     );

//     const stats = [
//       {
//         title: "Khóa học đang học",
//         value: parseInt(qKhoa.rows[0]?.cnt || "0", 10),
//       },
//       {
//         title: "Module hoàn thành",
//         value: parseInt(qModules.rows[0]?.cnt || "0", 10),
//       },
//       {
//         title: "Lab hoàn thành",
//         value: parseInt(qLabs.rows[0]?.cnt || "0", 10),
//       },
//       {
//         title: "Chứng chỉ đã nhận",
//         value: parseInt(qCerts.rows[0]?.cnt || "0", 10),
//       },
//     ];

//     // === LEARNING PROGRESS ===
//     // Lấy danh sách khóa mà user đã ghi danh
//     const coursesRes = await pool.query(
//       `SELECT kh.id, kh.ten
//        FROM khoahoc kh
//        JOIN user_khoahoc uk ON uk.khoahoc_id = kh.id
//        WHERE uk.user_id = $1`,
//       [userId]
//     );

//     const learningProgress = [];
//     for (const row of coursesRes.rows) {
//       const courseId = row.id;

//       // tổng modules của khóa = COUNT(baihoc WHERE id_khoahoc = courseId)
//       const totalModulesRes = await pool.query(
//         `SELECT COUNT(*) AS total FROM baihoc WHERE id_khoahoc = $1`,
//         [courseId]
//       );
//       const totalModules = parseInt(totalModulesRes.rows[0]?.total || "0", 10);

//       // modules đã hoàn thành của user trong khóa
//       const completedModulesRes = await pool.query(
//         `SELECT COUNT(*) AS done
//          FROM user_baihoc ub
//          JOIN baihoc b ON ub.baihoc_id = b.id
//          WHERE ub.user_id = $1 AND b.id_khoahoc = $2 AND ub.hoanthanh_baihoc = true`,
//         [userId, courseId]
//       );
//       const completedModules = parseInt(
//         completedModulesRes.rows[0]?.done || "0",
//         10
//       );

//       // last access ≈ thời điểm hoàn thành bài kiểm tra liên kết với khóa (nếu có)
//       // (khoahoc.id_baikiemtra -> baikiemtra.id -> user_baikiemtra.ngayhoanthanh)
//       const lastTestRes = await pool.query(
//         `SELECT MAX(ub.ngayhoanthanh) AS last_date
//          FROM user_baikiemtra ub
//          JOIN baikiemtra bk ON ub.baikiemtra_id = bk.id
//          JOIN khoahoc kh ON kh.id_baikiemtra = bk.id
//          WHERE ub.user_id = $1 AND kh.id = $2`,
//         [userId, courseId]
//       );
//       const lastDate = lastTestRes.rows[0]?.last_date || null;
//       const lastAccess = lastDate
//         ? `Lần cuối: ${formatRelative(lastDate)}`
//         : "Lần cuối: -";

//       const progressPercent =
//         totalModules > 0
//           ? Math.round((completedModules / totalModules) * 100)
//           : 0;

//       learningProgress.push({
//         title: row.ten,
//         progress: progressPercent,
//         modules: `${completedModules}/${totalModules} modules`,
//         lastAccess,
//       });
//     }

//     // === RECENT ACTIVITIES ===
//     // 1) Hoạt động: hoàn thành bài kiểm tra
//     const testsRes = await pool.query(
//       `SELECT ub.ngayhoanthanh, ub.diemso, bk.ten AS baikiemtra_ten
//        FROM user_baikiemtra ub
//        JOIN baikiemtra bk ON ub.baikiemtra_id = bk.id
//        WHERE ub.user_id = $1 AND ub.trangthai = 'completed' AND ub.ngayhoanthanh IS NOT NULL
//        ORDER BY ub.ngayhoanthanh DESC
//        LIMIT 5`,
//       [userId]
//     );

//     const testsActivities = testsRes.rows.map((r) => ({
//       ts: r.ngayhoanthanh,
//       title: `Hoàn thành: ${r.baikiemtra_ten}`,
//       time: formatRelative(r.ngayhoanthanh),
//       points: r.diemso != null ? `+${r.diemso} điểm` : null,
//     }));

//     // 2) Hoạt động: hỏi đáp AI do user tạo (hoidapai -> chudeai.userid)
//     const hoidapRes = await pool.query(
//       `SELECT h.thoigian, h.cauhoi
//        FROM hoidapai h
//        JOIN chudeai c ON h.id_chudeai = c.id
//        WHERE c.userid = $1
//        ORDER BY h.thoigian DESC
//        LIMIT 5`,
//       [userId]
//     );

//     const hoidapActivities = hoidapRes.rows.map((r) => ({
//       ts: r.thoigian,
//       title: `Hỏi: ${r.cauhoi}`,
//       time: formatRelative(r.thoigian),
//       points: null,
//     }));

//     // Gộp và sort theo timestamp giảm dần
//     const merged = [...testsActivities, ...hoidapActivities];
//     merged.sort((a, b) => new Date(b.ts) - new Date(a.ts));
//     const recentActivities = merged.slice(0, 5).map((r) => ({
//       title: r.title,
//       time: r.time,
//       points: r.points || "",
//     }));

//     // === ACTION CARDS (tĩnh, frontend sẽ link) ===
//     const actionCards = [
//       {
//         title: "Khóa học",
//         subtitle: "Xem thông tin từng khóa học",
//         link: "/user/courses",
//       },
//       {
//         title: "Thực hành Lab",
//         subtitle: "Luyện tập với bài lab thực tế",
//         link: "/user/labs",
//       },
//       {
//         title: "Thử thách CTF",
//         subtitle: "Tham gia các cuộc thi CTF",
//         link: "/user/ctf",
//       },
//     ];

//     return res.json({
//       stats,
//       learningProgress,
//       recentActivities,
//       actionCards,
//     });
//   } catch (err) {
//     console.error("getUserDashboard error:", err);
//     return res.status(500).json({ message: "Lỗi khi lấy dữ liệu dashboard" });
//   }
// };
import pool from "../config/db.js";

// ===== Helper =====
const formatRelative = (date) => {
  if (!date) return null;
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 ngày trước";
  return `${diffDays} ngày trước`;
};

// ===== Controller: Dashboard =====
export const getUserDashboard = async (req, res) => {
  const userId = req.user?.id || 1;

  try {
    // === STATS ===
    const qKhoa = await pool.query(
      `SELECT COUNT(*) AS cnt FROM user_khoahoc WHERE user_id = $1 AND trangthai = 'in-progress'`,
      [userId]
    );
    const qModules = await pool.query(
      `SELECT COUNT(*) AS cnt FROM user_baihoc WHERE user_id = $1 AND hoanthanh_baihoc = true`,
      [userId]
    );
    const qLabs = await pool.query(
      `SELECT COUNT(*) AS cnt FROM lab_user WHERE user_id = $1 AND tiendo >= 100`,
      [userId]
    );
    const qCerts = await pool.query(
      `SELECT COUNT(*) AS cnt FROM user_baikiemtra WHERE user_id = $1 AND trangthai = 'completed'`,
      [userId]
    );

    const stats = [
      {
        title: "Khóa học đang học",
        value: parseInt(qKhoa.rows[0]?.cnt || "0"),
      },
      {
        title: "Module hoàn thành",
        value: parseInt(qModules.rows[0]?.cnt || "0"),
      },
      { title: "Lab hoàn thành", value: parseInt(qLabs.rows[0]?.cnt || "0") },
      {
        title: "Chứng chỉ đã nhận",
        value: parseInt(qCerts.rows[0]?.cnt || "0"),
      },
    ];

    // === LEARNING PROGRESS ===
    const coursesRes = await pool.query(
      `SELECT kh.id, kh.ten
       FROM khoahoc kh
       JOIN user_khoahoc uk ON uk.khoahoc_id = kh.id
       WHERE uk.user_id = $1`,
      [userId]
    );

    const learningProgress = [];
    for (const row of coursesRes.rows) {
      const courseId = row.id;

      const totalModulesRes = await pool.query(
        `SELECT COUNT(*) AS total FROM baihoc WHERE id_khoahoc = $1`,
        [courseId]
      );
      const totalModules = parseInt(totalModulesRes.rows[0]?.total || "0", 10);

      const completedModulesRes = await pool.query(
        `SELECT COUNT(*) AS done
         FROM user_baihoc ub
         JOIN baihoc b ON ub.baihoc_id = b.id
         WHERE ub.user_id = $1 AND b.id_khoahoc = $2 AND ub.hoanthanh_baihoc = true`,
        [userId, courseId]
      );
      const completedModules = parseInt(
        completedModulesRes.rows[0]?.done || "0",
        10
      );

      const lastTestRes = await pool.query(
        `SELECT MAX(ub.ngayhoanthanh) AS last_date
         FROM user_baikiemtra ub
         JOIN baikiemtra bk ON ub.baikiemtra_id = bk.id
         JOIN khoahoc kh ON kh.id_baikiemtra = bk.id
         WHERE ub.user_id = $1 AND kh.id = $2`,
        [userId, courseId]
      );

      const lastDate = lastTestRes.rows[0]?.last_date || null;
      const lastAccess = lastDate
        ? `Lần cuối: ${formatRelative(lastDate)}`
        : "Lần cuối: -";

      const progressPercent =
        totalModules > 0
          ? Math.round((completedModules / totalModules) * 100)
          : 0;

      learningProgress.push({
        title: row.ten,
        progress: progressPercent,
        modules: `${completedModules}/${totalModules} modules`,
        lastAccess,
      });
    }

    // === RECENT ACTIVITIES ===
    const testsRes = await pool.query(
      `SELECT ub.ngayhoanthanh, ub.diemso, bk.ten AS baikiemtra_ten
       FROM user_baikiemtra ub
       JOIN baikiemtra bk ON ub.baikiemtra_id = bk.id
       WHERE ub.user_id = $1 AND ub.trangthai = 'completed' AND ub.ngayhoanthanh IS NOT NULL
       ORDER BY ub.ngayhoanthanh DESC
       LIMIT 5`,
      [userId]
    );

    const testsActivities = testsRes.rows.map((r) => ({
      ts: r.ngayhoanthanh,
      title: `Hoàn thành: ${r.baikiemtra_ten}`,
      time: formatRelative(r.ngayhoanthanh),
      points: r.diemso != null ? `+${r.diemso} điểm` : null,
    }));

    const hoidapRes = await pool.query(
      `SELECT h.thoigian, h.cauhoi
       FROM hoidapai h
       JOIN chudeai c ON h.id_chudeai = c.id
       WHERE c.userid = $1
       ORDER BY h.thoigian DESC
       LIMIT 5`,
      [userId]
    );

    const hoidapActivities = hoidapRes.rows.map((r) => ({
      ts: r.thoigian,
      title: `Hỏi: ${r.cauhoi}`,
      time: formatRelative(r.thoigian),
      points: null,
    }));

    const merged = [...testsActivities, ...hoidapActivities];
    merged.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const recentActivities = merged.slice(0, 5).map((r) => ({
      title: r.title,
      time: r.time,
      points: r.points || "",
    }));

    const actionCards = [
      {
        title: "Khóa học",
        subtitle: "Xem thông tin từng khóa học",
        link: "/user/courses",
      },
      {
        title: "Thực hành Lab",
        subtitle: "Luyện tập với bài lab thực tế",
        link: "/user/labs",
      },
      {
        title: "Thử thách CTF",
        subtitle: "Tham gia các cuộc thi CTF",
        link: "/user/ctf",
      },
    ];

    return res.json({
      stats,
      learningProgress,
      recentActivities,
      actionCards,
    });
  } catch (err) {
    console.error("getUserDashboard error:", err);
    return res.status(500).json({ message: "Lỗi khi lấy dữ liệu dashboard" });
  }
};
