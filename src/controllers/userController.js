const pool = require("../config/db");
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

exports.getUserDashboard = async (req, res) => {
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
        value: parseInt(qKhoa.rows[0]?.cnt || "0", 10),
      },
      {
        title: "Module hoàn thành",
        value: parseInt(qModules.rows[0]?.cnt || "0", 10),
      },
      {
        title: "Lab hoàn thành",
        value: parseInt(qLabs.rows[0]?.cnt || "0", 10),
      },
      {
        title: "Chứng chỉ đã nhận",
        value: parseInt(qCerts.rows[0]?.cnt || "0", 10),
      },
    ];

    // === LEARNING PROGRESS ===
    // Lấy danh sách khóa mà user đã ghi danh
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

      // tổng modules của khóa = COUNT(baihoc WHERE id_khoahoc = courseId)
      const totalModulesRes = await pool.query(
        `SELECT COUNT(*) AS total FROM baihoc WHERE id_khoahoc = $1`,
        [courseId]
      );
      const totalModules = parseInt(totalModulesRes.rows[0]?.total || "0", 10);

      // modules đã hoàn thành của user trong khóa
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

      // last access ≈ thời điểm hoàn thành bài kiểm tra liên kết với khóa (nếu có)
      // (khoahoc.id_baikiemtra -> baikiemtra.id -> user_baikiemtra.ngayhoanthanh)
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
    // 1) Hoạt động: hoàn thành bài kiểm tra
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

    // 2) Hoạt động: hỏi đáp AI do user tạo (hoidapai -> chudeai.userid)
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

    // Gộp và sort theo timestamp giảm dần
    const merged = [...testsActivities, ...hoidapActivities];
    merged.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const recentActivities = merged.slice(0, 5).map((r) => ({
      title: r.title,
      time: r.time,
      points: r.points || "",
    }));

    // === ACTION CARDS (tĩnh, frontend sẽ link) ===
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

exports.getLabsData = async (req, res) => {
  try {
    const userId = req.user?.id || 1; // Từ auth, fallback 1 test

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Vui lòng đăng nhập để xem Labs" });
    }

    const query = `-- Query lấy dữ liệu cho trang Labs (lab cards + stats + achievements) - Fix: Đơn giản hóa rank subquery (hardcode fallback)
-- Params: $1 = userId (INT, từ auth để lấy progress)
WITH user_progress AS (
  -- Aggregate progress cho user (completed labs, total hours/XP, rank hardcoded/simple)
  SELECT 
    COUNT(CASE WHEN lu.tiendo = 100 THEN 1 END) AS completed_labs,
    COUNT(*) AS total_labs,
    SUM(lu.tiendo) AS total_hours,  -- Giả sử tiendo = % hoàn thành, sum cho total hours (note: thêm thoiluong INTO lab nếu cần)
    -- XP: Hardcode 150 per lab completed (note: thêm diem INTO lab)
    (COUNT(CASE WHEN lu.tiendo = 100 THEN 1 END) * 150) AS total_xp,
    127 AS rank  -- Fix: Hardcode rank tạm (note: Để dynamic, dùng window function ở CTE riêng)
  FROM lab l
  LEFT JOIN lab_user lu ON lu.lab_id = l.id AND lu.user_id = $1
),
category_progress AS (
  -- Progress per category (loai)
  SELECT 
    l.loai,
    COUNT(CASE WHEN lu.tiendo = 100 THEN 1 END) || '/' || COUNT(*) AS progress_count
  FROM lab l
  LEFT JOIN lab_user lu ON lu.lab_id = l.id AND lu.user_id = $1
  GROUP BY l.loai
)
-- Main select: List labs với status, hardcode missing fields
SELECT 
  json_agg(
    json_build_object(
      'id', l.id,
      'title', l.ten,
      'description', l.mota,
      'difficulty', CASE l.loai  -- Map loai to difficulty
        WHEN 'Cơ bản' THEN 'Cơ bản'
        WHEN 'Trung cấp' THEN 'Trung cấp'
        WHEN 'Nâng cao' THEN 'Nâng cao'
        ELSE 'Cơ bản'
      END,
      'subLabsCount', CASE l.id  -- Hardcode số bài lab (note: thêm sub_count INTO lab)
        WHEN 1 THEN '8 bài lab'
        WHEN 2 THEN '12 bài lab'
        WHEN 3 THEN '15 bài lab'
        WHEN 4 THEN '20 bài lab'
        WHEN 5 THEN '10 bài lab'
        WHEN 6 THEN '14 bài lab'
        ELSE 'N/A'
      END,
      'progress', lu.tiendo || '%',  -- Từ lab_user
      'status', CASE 
        WHEN lu.tiendo = 100 THEN 'completed'
        WHEN lu.tiendo > 0 THEN 'in-progress'
        ELSE 'locked'
      END,
      'icon', CASE l.loai  -- Hardcode icon name
        WHEN 'Network' THEN 'Wifi'
        WHEN 'Web' THEN 'Database'
        WHEN 'Binary' THEN 'Code2'
        WHEN 'Forensics' THEN 'Search'
        WHEN 'Mobile' THEN 'Activity'
        WHEN 'Security' THEN 'Shield'
        ELSE 'Shield'
      END
    ) ORDER BY l.id  -- Thứ tự như frontend
  ) AS labs,
  -- Stats cards
  up.completed_labs AS completed_labs_count,
  up.total_hours AS total_hours,
  up.total_xp AS total_xp,
  '#' || up.rank AS rank,
  -- Category progress array (hardcode nếu thiếu)
  json_agg(
    json_build_object(
      'name', COALESCE(cp.loai, 'Misc'),
      'progress', COALESCE(cp.progress_count, '0/0')
    ) ORDER BY cp.loai
  ) AS category_progress,
  -- Achievements (hardcode array)
  '[{"title":"First Blood","description":"Hoàn thành Lab đầu tiên","icon":"Flag"},{"title":"Security Expert","description":"Hoàn thành 25 labs","icon":"Shield"},{"title":"Time Master","description":"100+ giờ thực hành","icon":"Clock"}]'::JSON AS achievements
FROM lab l
LEFT JOIN lab_user lu ON lu.lab_id = l.id AND lu.user_id = $1
CROSS JOIN user_progress up
LEFT JOIN category_progress cp ON true
WHERE l.id <= 6  -- Giới hạn 6 như frontend
GROUP BY up.completed_labs, up.total_hours, up.total_xp, up.rank;`;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không có dữ liệu Labs" });
    }

    const labsData = result.rows[0];

    // Fallback nếu rỗng
    labsData.labs = labsData.labs || [];
    labsData.category_progress = labsData.category_progress || [];
    labsData.achievements = labsData.achievements || [];

    // Format stats cho frontend
    labsData.completed_labs_count = labsData.completed_labs_count || 28; // Fallback hardcode
    labsData.total_hours = labsData.total_hours || 156;
    labsData.total_xp = labsData.total_xp || 4250;
    labsData.rank = labsData.rank || "#127";

    res.status(200).json(labsData);
  } catch (error) {
    console.error("Error fetching Labs data:", error);
    res
      .status(500)
      .json({ message: "Lỗi khi lấy dữ liệu Labs", error: error.message });
  }
};
