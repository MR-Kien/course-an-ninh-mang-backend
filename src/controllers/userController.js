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
  const userId = req.user?.id;

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

// export const getAdminDashboard = async (req, res) => {
//   try {
//     const adminUserId = req.user?.id || 1;

//     const query = `WITH user_stats AS (
//   -- Tổng người dùng (users)
//   SELECT
//     COUNT(*) AS total_users,
//     COUNT(*) FILTER (WHERE DATE(ngaysinh) = CURRENT_DATE) AS today_registrations  -- Giả sử ngaysinh = ngày đăng ký; gợi ý thêm created_at DATE INTO users cho dynamic
//   FROM users
// ),
// content_stats AS (
//   -- Nội dung (khoahoc + baihoc)
//   SELECT
//     (COUNT(kh.id) + COUNT(bh.id)) AS total_content,  -- Tổng nội dung
//     23 AS pending_content  -- Hardcode chờ duyệt (note: Thêm trangthai VARCHAR INTO khoahoc ('cho_duyet', 'duyet') để COUNT WHERE trangthai = 'cho_duyet')
//   FROM khoahoc kh
//   LEFT JOIN baihoc bh ON bh.id_khoahoc = kh.id
// ),
// certificate_stats AS (
//   -- Chứng chỉ (hardcode vì chưa có bảng; gợi ý thêm bảng chungchi: id, user_id, khoahoc_id, issued_date)
//   SELECT
//     6 AS total_certificates,  -- Hardcode
//     12 AS recent_certificates  -- Hardcode "12 ngày vừa qua"
// ),
// revenue_stats AS (
//   -- Doanh thu (hardcode vì chưa có; gợi ý thêm bảng thanhtoan: amount DECIMAL, user_id)
//   SELECT
//     'N/A'::TEXT AS total_revenue,  -- Hardcode
//     '12.5%' AS conversion_rate  -- Hardcode
// )
// -- Main select: Aggregate tất cả + hardcode metrics/activities
// SELECT
//   -- Stats array (4 items)
//   json_agg(
//     json_build_object(
//       'title', stats.title,
//       'value', stats.value,
//       'subtitle', stats.subtitle,
//       'trend', stats.trend,
//       'icon', stats.icon,
//       'color', stats.color
//     )
//   ) AS stats,
//   -- System metrics array (hardcode)
//   '[{"name":"CPU Usage","value":"52%","icon":"Cpu","color":"green"},{"name":"Memory","value":"35%","icon":"HardDrive","color":"yellow"},{"name":"Storage","value":"61%","icon":"Database","color":"green"},{"name":"Network","value":"89%","icon":"Wifi","color":"green"},{"name":"Database","value":"34%","icon":"Server","color":"green"},{"name":"API Response","value":"156ms","icon":"Zap","color":"green"}]'::JSON AS systemMetrics,
//   -- Recent activities array (hardcode vì chưa có bảng; gợi ý thêm bảng hoatdong: title TEXT, time TIMESTAMP, user TEXT, priority VARCHAR, type VARCHAR)
//   '[{"title":"Phát hiện nhiều lần đăng nhập thất bại từ IP 192.168.1.100","time":"2 phút trước","user":"System","priority":"HIGH","type":"error"},{"title":"Khóa học \"Advanced SQL Injection\" bị báo cáo vi phạm nội dung","time":"5 phút trước","user":"nhatphamyt@gmail.com","priority":"HIGH","type":"error"},{"title":"Người dùng buiminhhieu123@gmail.com bị tạm khóa do vi phạm điều khoản","time":"15 phút trước","user":"admin","priority":"MEDIUM","type":"warning"},{"title":"Series \"Web Security Basics\" đã được duyệt và xuất bản","time":"1 giờ trước","user":"QuanTQ","priority":"LOW","type":"success"}]'::JSON AS recentActivities,
//   -- Action cards array (hardcode subtitle, query pending nếu có trangthai)
//   json_agg(
//     json_build_object(
//       'title', ac.title,
//       'subtitle', CASE
//         WHEN ac.id = 1 THEN cs.pending_content || ' nội dung chờ duyệt'  -- Hardcode 23
//         WHEN ac.id = 2 THEN '12 chứng chỉ được cấp cho học viên'  -- Hardcode
//         ELSE 'Xuất báo cáo hệ thống'  -- Hardcode
//       END,
//       'button', ac.button,
//       'color', ac.color,
//       'icon', ac.icon
//     )
//   ) AS actionCards
// FROM (
//   -- Hardcode stats array base
//   SELECT 1 AS id, 'Tổng người dùng' AS title, us.total_users::TEXT AS value, us.today_registrations || ' đăng ký hôm nay' AS subtitle, '+12%' AS trend, 'Users' AS icon, 'blue' AS color FROM user_stats us
//   UNION ALL
//   SELECT 2, 'Nội dung', cs.total_content::TEXT, cs.pending_content || ' chờ duyệt', '+5%', 'BookOpen', 'red' FROM content_stats cs
//   UNION ALL
//   SELECT 3, 'Chứng chỉ', ccs.total_certificates::TEXT, ccs.recent_certificates || ' ngày vừa qua', '+100%', 'Award', 'yellow' FROM certificate_stats ccs
//   UNION ALL
//   SELECT 4, 'Doanh thu', rvs.total_revenue, rvs.conversion_rate || ' tỷ lệ chuyển đổi', '+N/A%', 'TrendingUp', 'green' FROM revenue_stats rvs
// ) stats
// CROSS JOIN (
//   -- Hardcode action cards base
//   SELECT 1 AS id, 'Duyệt nội dung' AS title, 'Xem ngay' AS button, 'blue' AS color, 'Eye' AS icon
//   UNION ALL
//   SELECT 2, 'Kiểm tra chứng chỉ', 'Kiểm tra', 'orange', 'Shield'
//   UNION ALL
//   SELECT 3, 'Tạo báo cáo', 'Tạo báo cáo', 'purple', 'Download'
// ) ac,
// content_stats cs,
// certificate_stats ccs,
// revenue_stats rvs;
// `;

//     const result = await pool.query(query, [adminUserId]);

//     if (result.rows.length === 0) {
//       return res.status(404).json({ message: "Không có dữ liệu dashboard" });
//     }

//     const dashboardData = result.rows[0];

//     dashboardData.stats = dashboardData.stats || [];
//     dashboardData.systemMetrics = dashboardData.systemMetrics || [];
//     dashboardData.recentActivities = dashboardData.recentActivities || [];
//     dashboardData.actionCards = dashboardData.actionCards || [];

//     res.status(200).json(dashboardData);
//   } catch (error) {
//     console.error("Error fetching admin dashboard:", error);
//     res
//       .status(500)
//       .json({ message: "Lỗi khi lấy dashboard", error: error.message });
//   }
// };

export const getAdminDashboard = async (req, res) => {
  try {
    const query = `
      WITH user_stats AS (
  SELECT 
    COUNT(*) AS total_users,
    COUNT(*) FILTER (WHERE DATE(ngaysinh) = CURRENT_DATE) AS today_registrations
  FROM users
),
content_stats AS (
  SELECT 
    (COUNT(kh.id) + COUNT(bh.id)) AS total_content,
    23 AS pending_content -- Gợi ý: Thêm cột trangthai VARCHAR vào khoahoc để đếm WHERE trangthai = 'cho_duyet'
  FROM khoahoc kh
  LEFT JOIN baihoc bh ON bh.id_khoahoc = kh.id
),
certificate_stats AS (
  SELECT 
    6 AS total_certificates, -- Gợi ý: Tạo bảng chungchi (id, user_id, khoahoc_id, issued_date) để đếm
    12 AS recent_certificates -- Hardcode "12 ngày vừa qua"
),
revenue_stats AS (
  SELECT 
    COALESCE(SUM(so_tien), 0)::TEXT AS total_revenue, -- Tổng doanh thu từ thanhtoan
    ROUND(
      (COUNT(*) FILTER (WHERE trang_thai = 'completed')::DECIMAL / GREATEST((SELECT COUNT(*) FROM users), 1) * 100), 
      2
    )::TEXT || '%' AS conversion_rate -- Tỷ lệ chuyển đổi: giao dịch completed / tổng users
  FROM thanhtoan
  WHERE trang_thai = 'completed'
),
stats_data AS (
  SELECT 1 AS id, 'Tổng người dùng' AS title, us.total_users::TEXT AS value,
         us.today_registrations || ' đăng ký hôm nay' AS subtitle, '+12%' AS trend,
         'Users' AS icon, 'blue' AS color
  FROM user_stats us
  UNION ALL
  SELECT 2, 'Nội dung', cs.total_content::TEXT, cs.pending_content || ' chờ duyệt',
         '+5%', 'BookOpen', 'red' FROM content_stats cs
  UNION ALL
  SELECT 3, 'Chứng chỉ', ccs.total_certificates::TEXT,
         ccs.recent_certificates || ' ngày vừa qua', '+100%', 'Award', 'yellow'
  FROM certificate_stats ccs
  UNION ALL
  SELECT 4, 'Doanh thu', rvs.total_revenue,
         'Tỷ lệ chuyển đổi: ' || rvs.conversion_rate, '+N/A%', 'TrendingUp', 'green'
  FROM revenue_stats rvs
),
action_cards AS (
  SELECT 1 AS id, 'Duyệt nội dung' AS title, cs.pending_content || ' nội dung chờ duyệt' AS subtitle,
         'Xem ngay' AS button, 'blue' AS color, 'Eye' AS icon
  FROM content_stats cs
  UNION ALL
  SELECT 2, 'Kiểm tra chứng chỉ', '12 chứng chỉ được cấp cho học viên',
         'Kiểm tra', 'orange', 'Shield'
  FROM certificate_stats
  UNION ALL
  SELECT 3, 'Tạo báo cáo', 'Xuất báo cáo hệ thống',
         'Tạo báo cáo', 'purple', 'Download'
  FROM certificate_stats
)
SELECT 
  (SELECT json_agg(
    json_build_object(
      'title', s.title,
      'value', s.value,
      'subtitle', s.subtitle,
      'trend', s.trend,
      'icon', s.icon,
      'color', s.color
    )
  ) FROM stats_data s) AS stats,
  json_build_array(
    json_build_object('name','CPU Usage','value','52%','icon','Cpu','color','green'),
    json_build_object('name','Memory','value','35%','icon','HardDrive','color','yellow'),
    json_build_object('name','Storage','value','61%','icon','Database','color','green'),
    json_build_object('name','Network','value','89%','icon','Wifi','color','green'),
    json_build_object('name','Database','value','34%','icon','Server','color','green'),
    json_build_object('name','API Response','value','156ms','icon','Zap','color','green')
  ) AS systemMetrics,
  json_build_array(
    json_build_object('title','Phát hiện nhiều lần đăng nhập thất bại từ IP 192.168.1.100','time','2 phút trước','user','System','priority','HIGH','type','error'),
    json_build_object('title','Khóa học "Advanced SQL Injection" bị báo cáo vi phạm nội dung','time','5 phút trước','user','nhatphamyt@gmail.com','priority','HIGH','type','error'),
    json_build_object('title','Người dùng buiminhhieu123@gmail.com bị tạm khóa do vi phạm điều khoản','time','15 phút trước','user','admin','priority','MEDIUM','type','warning'),
    json_build_object('title','Series "Web Security Basics" đã được duyệt và xuất bản','time','1 giờ trước','user','QuanTQ','priority','LOW','type','success')
  ) AS recentActivities,
  (SELECT json_agg(
    json_build_object(
      'title', a.title,
      'subtitle', a.subtitle,
      'button', a.button,
      'color', a.color,
      'icon', a.icon
    )
  ) FROM action_cards a) AS actionCards;
    `;

    const result = await pool.query(query);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không có dữ liệu dashboard" });
    }

    const dashboardData = result.rows[0];

    dashboardData.stats = dashboardData.stats || [];
    dashboardData.systemMetrics = dashboardData.systemmetrics || [];
    dashboardData.recentActivities = dashboardData.recentactivities || [];
    dashboardData.actionCards = dashboardData.actioncards || [];

    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Error fetching admin dashboard:", error);
    res.status(500).json({
      message: "Lỗi khi lấy dashboard",
      error: error.message,
    });
  }
};
