import pool from "../config/db.js";
import mammoth from "mammoth";
import multer from "multer";

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage }).single("file");
export const getAllCourses = async (req, res) => {
  try {
    // Query lấy danh sách khóa học, join tags, aggregate level từ baihoc
    const query = `
      SELECT 
          kh.id,
          kh.ten AS title,
          kh.mota AS description,
          kh.thoiluong,
          CASE 
              WHEN kh.thoiluong > 0 THEN (kh.thoiluong / 40)::TEXT || ' tuần'  -- Giả sử 40 giờ/tuần
              ELSE 'Tự học' 
          END AS duration,
          (kh.danhgia::DECIMAL / 10)::TEXT AS rating,
          STRING_AGG(t.mota, ', ') AS tags,
          (SELECT MIN(bh.capdo) FROM baihoc bh WHERE bh.id_khoahoc = kh.id) AS level  -- Level đại diện (cơ bản nhất)
      FROM khoahoc kh
      LEFT JOIN tag t ON t.id_khoahoc = kh.id
      GROUP BY kh.id, kh.ten, kh.mota, kh.thoiluong, kh.danhgia
      ORDER BY kh.id
      LIMIT 12;
    `;

    const result = await pool.query(query);

    // Map level với icon (giả lập dựa trên level string từ DB)
    const levelIcons = {
      "Cơ bản": "Shield",
      "Trung cấp": "Globe", // Hoặc Bug, tùy theo frontend
      "Nâng cao": "Eye",
    };

    // Chuẩn hóa dữ liệu cho frontend
    const courses = result.rows.map((course) => {
      // Xử lý tags: Split string thành array, trim và filter empty
      const tagArray = course.tags
        ? course.tags
            .split(", ")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      return {
        id: course.id,
        image: course.image || `https://picsum.photos/400?random=${course.id}`, // Placeholder, thay bằng kh.hinhanh nếu thêm trường
        level: course.level || "Cơ bản",
        levelIcon: levelIcons[course.level] || "Shield",
        title: course.title,
        description: course.description,
        tags: tagArray, // Array string[] khớp frontend
        duration: course.duration || "8 tuần",
        rating: course.rating || "4.8", // Đã là TEXT từ query
      };
    });

    // Stats hardcode (có thể thay bằng query dynamic sau)
    res.status(200).json({
      stats: {
        students: "50K+",
        courses: "200+",
        jobRate: "95%",
        support: "24/7",
      },
      courses,
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    res
      .status(500)
      .json({ message: "Error fetching courses", error: error.message });
  }
};

export const getCourseDetail = async (req, res) => {
  try {
    const { id: courseId } = req.params; // Lấy ID khóa học từ URL: /api/courses/:id
    const userId = req.user?.id || 1; // Giả sử lấy từ auth middleware

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Vui lòng đăng nhập để xem tiến độ" });
    }

    const query = `
      WITH course_info AS (
        SELECT 
          kh.id,
          kh.ten AS title,
          kh.mota AS description,
          kh.thoiluong AS total_duration,
          kh.danhgia AS rating
        FROM khoahoc kh
        WHERE kh.id = $1
      ),
      user_enrollment AS (
        -- Kiểm tra user đã đăng ký khóa học
        SELECT COUNT(*) > 0 AS is_enrolled
        FROM user_khoahoc uk
        WHERE uk.user_id = $2 AND uk.khoahoc_id = $1
      ),
      progress AS (
        SELECT 
          COUNT(ub.hoanthanh_baihoc) FILTER (WHERE ub.hoanthanh_baihoc = true) AS completed_count,
          COUNT(*) AS total_count,
          ROUND((COUNT(ub.hoanthanh_baihoc) FILTER (WHERE ub.hoanthanh_baihoc = true)::DECIMAL / GREATEST(COUNT(*), 1) * 100), 2) AS progress_percentage
        FROM baihoc bh
        LEFT JOIN user_baihoc ub ON ub.baihoc_id = bh.id AND ub.user_id = $2
        WHERE bh.id_khoahoc = $1
      ),
      lessons AS (
        SELECT 
          bh.id,
          bh.ten AS title,
          COALESCE(bh.mota, bh.ten) AS description,
          bh.thoiluong,
          CASE WHEN bh.thoiluong > 0 THEN bh.thoiluong::TEXT || ' phút' ELSE 'N/A' END AS duration,
          COALESCE(ub.hoanthanh_baihoc, false) AS is_completed,
          CASE 
            WHEN (SELECT is_enrolled FROM user_enrollment) = false THEN true -- Khóa tất cả nếu chưa đăng ký
            WHEN u.role IN ('user', 'admin') THEN 
              -- Khóa bài 3+ cho user/admin
              (SELECT COUNT(*) >= 2 
               FROM baihoc bh2 
               WHERE bh2.id_khoahoc = $1 AND bh2.id <= bh.id) -- Đếm bài học trước hoặc bằng bài hiện tại
            ELSE 
              false -- Mở khóa tất cả cho role khác
          END AS is_locked,
          CASE 
            WHEN (SELECT completed_count FROM progress) = 0 AND bh.id = (SELECT MIN(id) FROM baihoc WHERE id_khoahoc = $1) THEN true
            WHEN NOT COALESCE(ub.hoanthanh_baihoc, false) AND LAG(COALESCE(ub.hoanthanh_baihoc, false)) OVER (ORDER BY bh.id) = true THEN true
            ELSE false
          END AS is_active
        FROM baihoc bh
        LEFT JOIN user_baihoc ub ON ub.baihoc_id = bh.id AND ub.user_id = $2
        INNER JOIN users u ON u.id = $2
        WHERE bh.id_khoahoc = $1
        ORDER BY bh.id
      )
      SELECT 
        CASE 
          WHEN (SELECT is_enrolled FROM user_enrollment) = false THEN NULL
          ELSE ci.title
        END AS course_title,
        CASE 
          WHEN (SELECT is_enrolled FROM user_enrollment) = false THEN NULL
          ELSE ci.description
        END AS course_description,
        CASE 
          WHEN (SELECT is_enrolled FROM user_enrollment) = false THEN NULL
          ELSE ci.total_duration
        END AS total_duration,
        CASE 
          WHEN (SELECT is_enrolled FROM user_enrollment) = false THEN NULL
          ELSE (ci.rating::DECIMAL / 10)::TEXT
        END AS rating_formatted,
        CASE 
          WHEN (SELECT is_enrolled FROM user_enrollment) = false THEN NULL
          ELSE p.completed_count
        END AS completed_count,
        CASE 
          WHEN (SELECT is_enrolled FROM user_enrollment) = false THEN NULL
          ELSE p.total_count
        END AS total_count,
        CASE 
          WHEN (SELECT is_enrolled FROM user_enrollment) = false THEN NULL
          ELSE p.progress_percentage
        END AS progress_percentage,
        CASE 
          WHEN (SELECT is_enrolled FROM user_enrollment) = false THEN NULL
          ELSE json_agg(
            json_build_object(
              'id', l.id,
              'title', l.title,
              'description', l.description,
              'duration', l.duration,
              'isCompleted', l.is_completed,
              'isLocked', l.is_locked,
              'isActive', l.is_active
            )
          ) FILTER (WHERE l.id IS NOT NULL)
        END AS lessons
      FROM course_info ci
      CROSS JOIN progress p
      LEFT JOIN lessons l ON true
      GROUP BY ci.id, ci.title, ci.description, ci.total_duration, ci.rating, p.completed_count, p.total_count, p.progress_percentage;
    `;

    const result = await pool.query(query, [courseId, userId]);

    if (result.rows.length === 0 || result.rows[0].course_title === null) {
      return res.status(403).json({ message: "Bạn chưa đăng ký khóa học này" });
    }

    const courseData = result.rows[0];

    // Format thêm cho frontend (progress với %)
    courseData.progressPercentage = courseData.progress_percentage + "%";

    // Thêm info bài kiểm tra (test button)
    const testQuery = `
      SELECT 
        bt.id,
        bt.ten AS title,
        bt.thoiluong::TEXT || ' phút' AS duration,
        ubt.diemso,
        ubt.trangthai AS status
      FROM baikiemtra bt
      LEFT JOIN user_baikiemtra ubt ON ubt.baikiemtra_id = bt.id AND ubt.user_id = $1
      WHERE bt.id = (SELECT id_baikiemtra FROM khoahoc WHERE id = $2);
    `;
    const testResult = await pool.query(testQuery, [userId, courseId]);
    courseData.test = testResult.rows[0] || null;

    res.status(200).json(courseData);
  } catch (error) {
    console.error("Error fetching course detail:", error);
    res
      .status(500)
      .json({ message: "Lỗi khi lấy chi tiết khóa học", error: error.message });
  }
};

// export const getCourseContent = async (req, res) => {
//   try {
//     const { id: lessonId } = req.params; // Lấy từ URL: /api/lessons/:id/content (thay đổi endpoint cho lesson)
//     const userId = req.user?.id || 1; // Tùy chọn, nếu cần auth

//     if (!lessonId) {
//       return res.status(400).json({ message: "Thiếu ID bài học" });
//     }

//     if (!userId) {
//       return res.status(401).json({ message: "Vui lòng đăng nhập" });
//     }

//     const query = `
//       -- Query lấy nội dung theo ID bài học (lessonId)
//       WITH featured_doc AS (
//         SELECT
//           kh.id AS course_id,
//           kh.ten AS course_title,
//           kh.mota AS course_description,
//           bh.id AS lesson_id,
//           bh.ten AS lesson_title,
//           bh.mota AS lesson_description,
//           t.ten AS featured_title,
//           t.loai AS featured_type,
//           t.url AS featured_url,
//           COALESCE(bh.mota, 'Tài liệu này cung cấp kiến thức nền tảng về bài học, bao gồm các khái niệm cơ bản và biện pháp thực hành. Phù hợp cho người học hiện tại.') AS featured_description
//         FROM baihoc bh
//         INNER JOIN khoahoc kh ON kh.id = bh.id_khoahoc
//         LEFT JOIN tailieu t ON t.id_baihoc = bh.id AND t.loai ILIKE '%pdf%'
//         WHERE bh.id = $1
//           AND (t.ten ILIKE '%giáo trình%' OR t.id IS NULL)
//         ORDER BY CASE WHEN t.ten ILIKE '%giáo trình%' THEN 0 ELSE 1 END, t.id
//         LIMIT 1
//       ),
//       additional_docs AS (
//         SELECT
//           bh.id AS lesson_id,
//           kh.ten AS course_title,
//           json_agg(
//             json_build_object(
//               'title', COALESCE(t.ten, 'Tài liệu bổ sung'),
//               'type', CASE
//                 WHEN t.loai ILIKE '%ppt%' THEN t.loai || ' • 25 slides'
//                 WHEN t.loai ILIKE '%exercise%' OR t.loai ILIKE '%bài tập%' THEN t.loai || ' • 10 bài tập có lời giải'
//                 ELSE t.loai || ' • Chi tiết bổ sung'
//               END,
//               'url', COALESCE(t.url, 'https://example.com/default.pdf')
//             ) ORDER BY t.id
//           ) FILTER (WHERE t.id IS NOT NULL) AS additional_materials
//         FROM baihoc bh
//         INNER JOIN khoahoc kh ON kh.id = bh.id_khoahoc
//         LEFT JOIN tailieu t ON t.id_baihoc = bh.id
//         WHERE bh.id = $1
//         GROUP BY bh.id, kh.ten
//       ),
//       objectives AS (
//         SELECT
//           bh.id AS lesson_id,
//           bh.muctieu AS objectives_array  -- Lấy trực tiếp muctieu từ bài học (JSONB array)
//         FROM baihoc bh
//         WHERE bh.id = $1 AND bh.muctieu != '[]'::JSONB
//       )
//       SELECT
//         COALESCE(fd.course_title, ad.course_title, 'Bài học không xác định') AS course_title,
//         COALESCE(fd.lesson_title, 'Bài học hiện tại') AS lesson_title,
//         COALESCE(fd.featured_title, 'Giáo trình bài học cơ bản') AS featured_title,
//         COALESCE(fd.featured_type, 'PDF') || ' • 45 trang • Cập nhật 2024' AS featured_info,
//         COALESCE(fd.featured_url, 'https://example.com/giao-trinh.pdf') AS featured_url,
//         COALESCE(fd.featured_description, fd.lesson_description) AS featured_description,
//         COALESCE(ad.additional_materials, '[]'::JSON) AS additional_materials,
//         COALESCE(
//           o.objectives_array,
//           '[{"number":1,"title":"Hiểu khái niệm chính của bài học","description":"Nắm vững định nghĩa và tầm quan trọng của nội dung bài"},{"number":2,"title":"Áp dụng kiến thức","description":"Thực hành các nguyên tắc cơ bản từ bài học"}]'::JSON  -- Fallback cho lesson
//         ) AS objectives
//       FROM featured_doc fd
//       FULL OUTER JOIN additional_docs ad ON fd.lesson_id = ad.lesson_id
//       LEFT JOIN objectives o ON o.lesson_id = COALESCE(fd.lesson_id, ad.lesson_id);
//     `;

//     // Truyền params đúng (array với lessonId)
//     const result = await pool.query(query, [parseInt(lessonId)]); // parseInt để đảm bảo INT

//     if (result.rows.length === 0) {
//       return res
//         .status(404)
//         .json({ message: "Không tìm thấy nội dung bài học" });
//     }

//     const contentData = result.rows[0];

//     // Fallback nếu additional rỗng
//     if (
//       !contentData.additional_materials ||
//       contentData.additional_materials.length === 0
//     ) {
//       contentData.additional_materials = [
//         {
//           title: "Slide thuyết trình bài học",
//           type: "PowerPoint • 25 slides",
//           url: "https://example.com/slides.ppt",
//         },
//         {
//           title: "Bài tập thực hành bài học",
//           type: "PDF • 10 bài tập có lời giải",
//           url: "https://example.com/exercises.pdf",
//         },
//       ];
//     }

//     res.status(200).json(contentData);
//   } catch (error) {
//     console.error("Error fetching lesson content:", error);
//     res
//       .status(500)
//       .json({ message: "Lỗi khi lấy nội dung bài học", error: error.message });
//   }
// };
export const getCourseContent = async (req, res) => {
  try {
    const { id: lessonId } = req.params; // Lấy từ URL: /api/lessons/:id/content
    const userId = req.user?.id || 1; // Tùy chọn, nếu cần auth

    if (!lessonId) {
      return res.status(400).json({ message: "Thiếu ID bài học" });
    }

    if (!userId) {
      return res.status(401).json({ message: "Vui lòng đăng nhập" });
    }

    const query = `
      -- Query lấy nội dung theo ID bài học (lessonId) - Fix: Base CTE cho lesson để luôn có lesson_title
      WITH lesson_base AS (
        SELECT 
          bh.id AS lesson_id,
          bh.ten AS lesson_title,
          bh.mota AS lesson_description,
          kh.id AS course_id,
          kh.ten AS course_title,
          kh.mota AS course_description
        FROM baihoc bh
        INNER JOIN khoahoc kh ON kh.id = bh.id_khoahoc
        WHERE bh.id = $1
      ),
      featured_doc AS (
        SELECT 
          lb.lesson_id,
          lb.course_id,
          lb.course_title,
          lb.course_description,
          lb.lesson_title,
          lb.lesson_description,
          t.ten AS featured_title,
          t.loai AS featured_type,
          t.url AS featured_url,
          lb.lesson_description AS featured_description  -- Fallback to lesson_description if no materials
        FROM lesson_base lb
        LEFT JOIN tailieu t ON t.id_baihoc = lb.lesson_id AND t.loai ILIKE '%pdf%' 
        WHERE (t.ten ILIKE '%giáo trình%' OR t.id IS NULL)
        ORDER BY CASE WHEN t.ten ILIKE '%giáo trình%' THEN 0 ELSE 1 END, t.id
        LIMIT 1
      ),
      additional_docs AS (
        SELECT 
          lb.lesson_id,
          lb.course_title,
          json_agg(
            json_build_object(
              'title', COALESCE(t.ten, 'Tài liệu bổ sung'),
              'type', CASE 
                WHEN t.loai ILIKE '%ppt%' THEN t.loai || ' • 25 slides'
                WHEN t.loai ILIKE '%exercise%' OR t.loai ILIKE '%bài tập%' THEN t.loai || ' • 10 bài tập có lời giải'
                ELSE t.loai || ' • Chi tiết bổ sung'
              END,
              'url', COALESCE(t.url, 'https://example.com/default.pdf')
            ) ORDER BY t.id
          ) FILTER (WHERE t.id IS NOT NULL) AS additional_materials
        FROM lesson_base lb
        LEFT JOIN tailieu t ON t.id_baihoc = lb.lesson_id AND t.id != COALESCE((SELECT t2.id FROM tailieu t2 WHERE t2.id_baihoc = lb.lesson_id AND t2.ten ILIKE '%giáo trình%' LIMIT 1), 0)  -- Loại trừ featured
        GROUP BY lb.lesson_id, lb.course_title
      ),
      objectives AS (
        SELECT 
          lb.lesson_id,
          lb.lesson_title,
          lb.lesson_description,
          bh.muctieu AS objectives_array  -- Lấy trực tiếp muctieu từ bài học (JSONB array)
        FROM lesson_base lb
        LEFT JOIN baihoc bh ON bh.id = lb.lesson_id  -- Đảm bảo match
        WHERE bh.muctieu != '[]'::JSONB OR true  -- Luôn trả, dù rỗng
      )
      SELECT 
        lb.course_title AS course_title,  -- Luôn có từ base
        lb.lesson_title AS lesson_title,  -- Luôn có từ base, không fallback sai
        COALESCE(fd.featured_title, 'Giáo trình bài học cơ bản') AS featured_title,
        COALESCE(fd.featured_type, 'PDF') || ' • 45 trang • Cập nhật 2024' AS featured_info,
        COALESCE(fd.featured_url, 'https://example.com/giao-trinh.pdf') AS featured_url,
        COALESCE(fd.featured_description, lb.lesson_description) AS featured_description,
        COALESCE(ad.additional_materials, '[]'::JSON) AS additional_materials,
        COALESCE(
          o.objectives_array::JSON,  -- Cast JSONB to JSON để tránh type mismatch
          '[{"number":1,"title":"Hiểu khái niệm chính của bài học","description":"Nắm vững định nghĩa và tầm quan trọng của nội dung bài"},{"number":2,"title":"Áp dụng kiến thức","description":"Thực hành các nguyên tắc cơ bản từ bài học"}]'::JSON  -- Fallback JSON
        ) AS objectives
      FROM lesson_base lb
      LEFT JOIN featured_doc fd ON fd.lesson_id = lb.lesson_id
      LEFT JOIN additional_docs ad ON ad.lesson_id = lb.lesson_id
      LEFT JOIN objectives o ON o.lesson_id = lb.lesson_id;
    `;

    // Truyền params đúng (array với lessonId)
    const result = await pool.query(query, [parseInt(lessonId)]); // parseInt để đảm bảo INT

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy nội dung bài học" });
    }

    const contentData = result.rows[0];

    // Fallback nếu additional rỗng
    if (
      !contentData.additional_materials ||
      contentData.additional_materials.length === 0
    ) {
      contentData.additional_materials = [
        {
          title: "Slide thuyết trình bài học",
          type: "PowerPoint • 25 slides",
          url: "https://example.com/slides.ppt",
        },
        {
          title: "Bài tập thực hành bài học",
          type: "PDF • 10 bài tập có lời giải",
          url: "https://example.com/exercises.pdf",
        },
      ];
    }

    res.status(200).json(contentData);
  } catch (error) {
    console.error("Error fetching lesson content:", error);
    res
      .status(500)
      .json({ message: "Lỗi khi lấy nội dung bài học", error: error.message });
  }
};

export const getCTFData = async (req, res) => {
  try {
    const userId = req.user?.id || 1; // Từ auth middleware, fallback 1 để test

    if (!userId) {
      return res.status(401).json({ message: "Vui lòng đăng nhập để xem CTF" });
    }

    // Lấy query params để lọc và tìm kiếm
    const { search, category, difficulty, status } = req.query;

    // Xây dựng điều kiện WHERE động
    const whereClauses = [];
    const queryParams = [userId];

    // Tìm kiếm theo tên
    if (search) {
      whereClauses.push("c.ten ILIKE $" + (queryParams.length + 1));
      queryParams.push(`%${search}%`);
    }

    // Lọc theo category (loaictf)
    if (category) {
      whereClauses.push("c.loaictf = $" + (queryParams.length + 1));
      queryParams.push(category);
    }

    // Lọc theo difficulty (dựa trên choai)
    if (difficulty) {
      const difficultyMap = {
        Beginner: "%sinh viên%",
        Intermediate: "%mọi người%",
        Advanced: "%",
      };
      whereClauses.push("c.choai ILIKE $" + (queryParams.length + 1));
      queryParams.push(difficultyMap[difficulty] || "%");
    }

    // Lọc theo status (dựa trên tiendo)
    if (status) {
      if (status === "completed") {
        whereClauses.push("cu.tiendo = 100");
      } else if (status === "available") {
        whereClauses.push("cu.tiendo > 0 AND cu.tiendo < 100");
      } else if (status === "locked") {
        whereClauses.push("cu.tiendo IS NULL OR cu.tiendo = 0");
      }
    }

    // Tạo điều kiện WHERE
    const whereCondition =
      whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

    const query = `
      WITH user_progress AS (
        SELECT 
          COUNT(CASE WHEN cu.tiendo = 100 THEN 1 END) AS completed_challenges,
          COUNT(*) AS total_challenges,
          SUM(CASE WHEN cu.tiendo = 100 THEN 
            CASE c.id
              WHEN 1 THEN 50
              WHEN 2 THEN 75
              WHEN 3 THEN 150
              WHEN 4 THEN 200
              WHEN 5 THEN 125
              WHEN 6 THEN 300
              ELSE 0
            END
          ELSE 0 END) AS total_points,
          ROUND((COUNT(CASE WHEN cu.tiendo = 100 THEN 1 END)::DECIMAL / GREATEST(COUNT(*), 1) * 100), 2) AS overall_percentage
        FROM ctf c
        LEFT JOIN ctf_user cu ON cu.ctf_id = c.id AND cu.user_id = $1
        ${whereCondition}
      ),
      category_progress AS (
        SELECT 
          c.loaictf,
          COUNT(CASE WHEN cu.tiendo = 100 THEN 1 END) || '/' || COUNT(*) AS progress_count
        FROM ctf c
        LEFT JOIN ctf_user cu ON cu.ctf_id = c.id AND cu.user_id = $1
        ${whereCondition}
        GROUP BY c.loaictf
      ),
      challenges_data AS (
        SELECT
          c.id,
          c.ten AS title,
          c.mota AS description,
          c.loaictf AS category,
          CASE 
            WHEN c.choai ILIKE '%sinh viên%' THEN 'Beginner'
            WHEN c.choai ILIKE '%mọi người%' THEN 'Intermediate'
            ELSE 'Advanced'
          END AS difficulty,
          CASE c.id
            WHEN 1 THEN '15 phút'
            WHEN 2 THEN '30 phút'
            WHEN 3 THEN '45 phút'
            WHEN 4 THEN '60 phút'
            WHEN 5 THEN '40 phút'
            WHEN 6 THEN '90 phút'
            ELSE 'N/A'
          END AS duration,
          c.tacgia AS author,
          CASE c.loaictf
            WHEN 'Crypto' THEN '["#caesar", "#substitution", "#basic"]'
            WHEN 'Web' THEN '["#sql", "#injection", "#database"]'
            WHEN 'Forensics' THEN '["#memory", "#volatility", "#analysis"]'
            WHEN 'Reversing' THEN '["#reverse", "#assembly", "#gdb"]'
            WHEN 'Network' THEN '["#wireshark", "#pcap", "#protocols"]'
            ELSE '[]'
          END::JSONB AS tags,
          true AS "hasHints",
          true AS "hasWriteup",
          CASE c.id
            WHEN 1 THEN 50
            WHEN 2 THEN 75
            WHEN 3 THEN 150
            WHEN 4 THEN 200
            WHEN 5 THEN 125
            WHEN 6 THEN 300
            ELSE 0
          END AS points,
          CASE 
            WHEN cu.tiendo = 100 THEN 'completed'
            WHEN cu.tiendo > 0 THEN 'available'
            ELSE 'locked'
          END AS status,
          CASE c.loaictf
            WHEN 'Crypto' THEN 'Key'
            WHEN 'Web' THEN 'Code2'
            WHEN 'Forensics' THEN 'Search'
            WHEN 'Reversing' THEN 'Target'
            WHEN 'Network' THEN 'Wifi'
            ELSE 'Shield'
          END AS icon
        FROM ctf c
        LEFT JOIN ctf_user cu ON cu.ctf_id = c.id AND cu.user_id = $1
        ${whereCondition}
      )
      SELECT 
        (SELECT json_agg(challenges_data ORDER BY id) FROM challenges_data) AS challenges,
        up.completed_challenges || '/' || up.total_challenges AS completed_total,
        up.total_points AS total_points,
        up.overall_percentage || '%' AS overall_percentage,
        (SELECT json_agg(
          json_build_object(
            'name', COALESCE(cp.loaictf, 'Misc'),
            'progress', COALESCE(cp.progress_count, '0/0'),
            'icon', CASE COALESCE(cp.loaictf, 'Misc')
              WHEN 'Crypto' THEN 'Key'
              WHEN 'Web' THEN 'Code2'
              WHEN 'Forensics' THEN 'Search'
              WHEN 'Reversing' THEN 'Target'
              WHEN 'Network' THEN 'Wifi'
              ELSE NULL
            END
          ) ORDER BY cp.loaictf
        ) FROM category_progress cp) AS category_progress,
        '[{"title":"CTF Handbook","description":"Hướng dẫn toàn diện về CTF","icon":"BookOpen"},{"title":"Tools & Scripts","description":"Công cụ hỗ trợ giải CTF","icon":"Database"},{"title":"Community","description":"Tham gia cộng đồng CTF","icon":"Users"}]'::JSONB AS learning_resources
      FROM user_progress up;
    `;

    const result = await pool.query(query, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không có dữ liệu CTF phù hợp" });
    }

    const ctfData = result.rows[0];

    // Fallback nếu rỗng
    ctfData.challenges = ctfData.challenges || [];
    ctfData.category_progress = ctfData.category_progress || [];

    res.status(200).json(ctfData);
  } catch (error) {
    console.error("Error fetching CTF data:", error);
    res
      .status(500)
      .json({ message: "Lỗi khi lấy dữ liệu CTF", error: error.message });
  }
};
// export const getCTFData = async (req, res) => {
//   try {
//     const userId = req.user?.id || 1; // Từ auth middleware, fallback 1 để test

//     if (!userId) {
//       return res.status(401).json({ message: "Vui lòng đăng nhập để xem CTF" });
//     }

//     // Lấy query params để lọc và tìm kiếm
//     const { search, category, difficulty, status } = req.query;

//     // Xây dựng điều kiện WHERE động
//     const whereClauses = ["c.id <= 6"]; // Giữ giới hạn id <= 6 như query gốc
//     const queryParams = [userId];

//     // Tìm kiếm theo tên
//     if (search) {
//       whereClauses.push("c.ten ILIKE $" + (queryParams.length + 1));
//       queryParams.push(`%${search}%`);
//     }

//     // Lọc theo category (loaictf)
//     if (category) {
//       whereClauses.push("c.loaictf = $" + (queryParams.length + 1));
//       queryParams.push(category);
//     }

//     // Lọc theo difficulty (dựa trên choai)
//     if (difficulty) {
//       const difficultyMap = {
//         Beginner: "%sinh viên%",
//         Intermediate: "%mọi người%",
//         Advanced: "%",
//       };
//       whereClauses.push("c.choai ILIKE $" + (queryParams.length + 1));
//       queryParams.push(difficultyMap[difficulty] || "%");
//     }

//     // Lọc theo status (dựa trên tiendo)
//     if (status) {
//       if (status === "completed") {
//         whereClauses.push("cu.tiendo = 100");
//       } else if (status === "available") {
//         whereClauses.push("cu.tiendo > 0 AND cu.tiendo < 100");
//       } else if (status === "locked") {
//         whereClauses.push("cu.tiendo IS NULL OR cu.tiendo = 0");
//       }
//     }

//     // Tạo điều kiện WHERE
//     const whereCondition =
//       whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

//     const query = `
//       WITH user_progress AS (
//         SELECT
//           COUNT(CASE WHEN cu.tiendo = 100 THEN 1 END) AS completed_challenges,
//           COUNT(*) AS total_challenges,
//           SUM(CASE WHEN cu.tiendo = 100 THEN
//             CASE c.id  -- Hardcode điểm, gợi ý: thêm cột points INT vào ctf
//               WHEN 1 THEN 50
//               WHEN 2 THEN 75
//               WHEN 3 THEN 150
//               WHEN 4 THEN 200
//               WHEN 5 THEN 125
//               WHEN 6 THEN 300
//               ELSE 0
//             END
//           ELSE 0 END) AS total_points,
//           ROUND((COUNT(CASE WHEN cu.tiendo = 100 THEN 1 END)::DECIMAL / GREATEST(COUNT(*), 1) * 100), 2) AS overall_percentage
//         FROM ctf c
//         LEFT JOIN ctf_user cu ON cu.ctf_id = c.id AND cu.user_id = $1
//         ${whereCondition}
//       ),
//       category_progress AS (
//         SELECT
//           c.loaictf,
//           COUNT(CASE WHEN cu.tiendo = 100 THEN 1 END) || '/' || COUNT(*) AS progress_count
//         FROM ctf c
//         LEFT JOIN ctf_user cu ON cu.ctf_id = c.id AND cu.user_id = $1
//         ${whereCondition}
//         GROUP BY c.loaictf
//       )
//       SELECT
//         json_agg(
//           json_build_object(
//             'id', c.id,
//             'title', c.ten,
//             'description', c.mota,
//             'category', c.loaictf,
//             'difficulty', CASE
//               WHEN c.choai ILIKE '%sinh viên%' THEN 'Beginner'
//               WHEN c.choai ILIKE '%mọi người%' THEN 'Intermediate'
//               ELSE 'Advanced'
//             END,
//             'duration', CASE c.id
//               WHEN 1 THEN '15 phút'
//               WHEN 2 THEN '30 phút'
//               WHEN 3 THEN '45 phút'
//               WHEN 4 THEN '60 phút'
//               WHEN 5 THEN '40 phút'
//               WHEN 6 THEN '90 phút'
//               ELSE 'N/A'
//             END,
//             'author', c.tacgia,
//             'tags', CASE c.loaictf
//               WHEN 'Crypto' THEN '["#caesar", "#substitution", "#basic"]'
//               WHEN 'Web' THEN '["#sql", "#injection", "#database"]'
//               WHEN 'Forensics' THEN '["#memory", "#volatility", "#analysis"]'
//               WHEN 'Binary' THEN '["#overflow", "#exploitation", "#c"]'
//               WHEN 'Network' THEN '["#wireshark", "#pcap", "#protocols"]'
//               ELSE '[]'
//             END::JSON,
//             'hasHints', true,
//             'hasWriteup', true,
//             'points', CASE c.id
//               WHEN 1 THEN 50
//               WHEN 2 THEN 75
//               WHEN 3 THEN 150
//               WHEN 4 THEN 200
//               WHEN 5 THEN 125
//               WHEN 6 THEN 300
//               ELSE 0
//             END,
//             'status', CASE
//               WHEN cu.tiendo = 100 THEN 'completed'
//               WHEN cu.tiendo > 0 THEN 'available'
//               ELSE 'locked'
//             END,
//             'icon', CASE c.loaictf
//               WHEN 'Crypto' THEN 'Key'
//               WHEN 'Web' THEN 'Code2'
//               WHEN 'Forensics' THEN 'Search'
//               WHEN 'Binary' THEN 'Target'
//               WHEN 'Network' THEN 'Wifi'
//               ELSE 'Shield'
//             END
//           ) ORDER BY c.id
//         ) AS challenges,
//         up.completed_challenges || '/' || up.total_challenges AS completed_total,
//         up.total_points AS total_points,
//         up.overall_percentage || '%' AS overall_percentage,
//         json_agg(
//           json_build_object(
//             'name', COALESCE(cp.loaictf, 'Misc'),
//             'progress', COALESCE(cp.progress_count, '0/0'),
//             'icon', CASE COALESCE(cp.loaictf, 'Misc')
//               WHEN 'Crypto' THEN 'Key'
//               WHEN 'Web' THEN 'Code2'
//               WHEN 'Forensics' THEN 'Search'
//               WHEN 'Binary' THEN 'Target'
//               WHEN 'Network' THEN 'Wifi'
//               ELSE NULL
//             END
//           ) ORDER BY cp.loaictf
//         ) AS category_progress,
//         '[{"title":"CTF Handbook","description":"Hướng dẫn toàn diện về CTF","icon":"BookOpen"},{"title":"Tools & Scripts","description":"Công cụ hỗ trợ giải CTF","icon":"Database"},{"title":"Community","description":"Tham gia cộng đồng CTF","icon":"Users"}]'::JSON AS learning_resources
//       FROM ctf c
//       LEFT JOIN ctf_user cu ON cu.ctf_id = c.id AND cu.user_id = $1
//       CROSS JOIN user_progress up
//       LEFT JOIN category_progress cp ON true
//       ${whereCondition}
//       GROUP BY up.completed_challenges, up.total_challenges, up.total_points, up.overall_percentage;
//     `;

//     const result = await pool.query(query, queryParams);

//     if (result.rows.length === 0) {
//       return res.status(404).json({ message: "Không có dữ liệu CTF phù hợp" });
//     }

//     const ctfData = result.rows[0];

//     // Fallback nếu rỗng
//     ctfData.challenges = ctfData.challenges || [];
//     ctfData.category_progress = ctfData.category_progress || [];

//     res.status(200).json(ctfData);
//   } catch (error) {
//     console.error("Error fetching CTF data:", error);
//     res
//       .status(500)
//       .json({ message: "Lỗi khi lấy dữ liệu CTF", error: error.message });
//   }
// };

export const getLabsData = async (req, res) => {
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

export const getCourses = async (req, res) => {
  try {
    // Query cho Sidebar
    const sidebarQuery = `
      WITH category_counts AS (
        SELECT 
          COALESCE(t.mota, 'Misc') AS category,
          COUNT(DISTINCT kh.id) AS count
        FROM khoahoc kh
        LEFT JOIN tag t ON t.id_khoahoc = kh.id
        GROUP BY t.mota
      ),
      status_counts AS (
        SELECT 
          CASE 
            WHEN uk.trangthai = 'completed' THEN 'published'
            WHEN uk.trangthai = 'in_progress' THEN 'draft'
            WHEN uk.trangthai = 'not_started' THEN 'scheduled'
            ELSE 'published'
          END AS status,
          COUNT(DISTINCT kh.id) AS count
        FROM khoahoc kh
        LEFT JOIN user_khoahoc uk ON uk.khoahoc_id = kh.id
        GROUP BY CASE 
          WHEN uk.trangthai = 'completed' THEN 'published'
          WHEN uk.trangthai = 'in_progress' THEN 'draft'
          WHEN uk.trangthai = 'not_started' THEN 'scheduled'
          ELSE 'published'
        END
      ),
      overview AS (
        SELECT 
          COUNT(DISTINCT kh.id) AS total_courses,
          COUNT(DISTINCT uk.user_id) AS total_students,
          COALESCE(
            ROUND(AVG(CASE WHEN ub.hoanthanh_baihoc THEN 1 ELSE 0 END)::DECIMAL * 100, 2),
            0
          ) AS completion_rate
        FROM khoahoc kh
        LEFT JOIN user_khoahoc uk ON uk.khoahoc_id = kh.id
        LEFT JOIN user_baihoc ub ON ub.user_id = uk.user_id
        AND EXISTS (SELECT 1 FROM baihoc bh WHERE bh.id_khoahoc = kh.id AND bh.id = ub.baihoc_id)
      )
      SELECT 
        (SELECT json_agg(
          json_build_object(
            'category', COALESCE(category, 'Misc'),
            'count', count
          ) ORDER BY category
        ) FROM category_counts) AS categories,
        (SELECT json_agg(
          json_build_object(
            'status', status,
            'count', count
          ) ORDER BY status
        ) FROM status_counts) AS statuses,
        (SELECT json_build_object(
          'total_courses', total_courses,
          'total_students', total_students,
          'completion_rate', completion_rate
        ) FROM overview) AS overview;
    `;

    // Query cho danh sách khóa học
    const coursesQuery = `
      SELECT 
        kh.id,
        kh.ten AS title,
        kh.mota AS description,
        CASE kh.id
          WHEN 1 THEN 'Security Expert'
          WHEN 2 THEN 'Ethical Hacker Pro'
          WHEN 3 THEN 'Reverse Engineering'
          WHEN 4 THEN 'Web Security'
          WHEN 5 THEN 'Forensics Expert'
          WHEN 6 THEN 'Mobile Security'
          WHEN 7 THEN 'AWS Instructor'
          WHEN 8 THEN 'Awareness Trainer'
          WHEN 9 THEN 'IAM Specialist'
          WHEN 10 THEN 'Encryption Expert'
          WHEN 11 THEN 'Firewall Admin'
          WHEN 12 THEN 'Incident Manager'
          ELSE 'Unknown Instructor'
        END AS instructor,
        CASE kh.id
          WHEN 1 THEN '2 ngày trước'
          WHEN 2 THEN '1 tuần trước'
          WHEN 3 THEN '3 ngày trước'
          WHEN 4 THEN '5 ngày trước'
          WHEN 5 THEN '1 ngày trước'
          WHEN 6 THEN '4 ngày trước'
          WHEN 7 THEN '6 ngày trước'
          WHEN 8 THEN '2 tuần trước'
          WHEN 9 THEN '3 tuần trước'
          WHEN 10 THEN '4 ngày trước'
          WHEN 11 THEN '5 ngày trước'
          WHEN 12 THEN '1 ngày trước'
          ELSE '0 ngày trước'
        END AS time_ago,
        kh.danhgia / 10.0 AS rating,
        (
          SELECT COALESCE(bh.capdo, 'basic')
          FROM baihoc bh
          WHERE bh.id_khoahoc = kh.id
          GROUP BY bh.capdo
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) AS level,
        COALESCE(
          (SELECT CASE uk.trangthai
            WHEN 'completed' THEN 'published'
            WHEN 'in_progress' THEN 'draft'
            WHEN 'not_started' THEN 'scheduled'
            ELSE 'published'
          END
          FROM user_khoahoc uk
          WHERE uk.khoahoc_id = kh.id
          GROUP BY uk.trangthai
          ORDER BY COUNT(*) DESC
          LIMIT 1),
          'published'
        ) AS status,
        CASE kh.id
          WHEN 1 THEN 'https://picsum.photos/400?random=1'
          WHEN 2 THEN 'https://picsum.photos/400?random=2'
          WHEN 3 THEN 'https://picsum.photos/400?random=3'
          WHEN 4 THEN 'https://picsum.photos/400?random=4'
          WHEN 5 THEN 'https://picsum.photos/400?random=5'
          WHEN 6 THEN 'https://picsum.photos/400?random=6'
          WHEN 7 THEN 'https://picsum.photos/400?random=7'
          WHEN 8 THEN 'https://picsum.photos/400?random=8'
          WHEN 9 THEN 'https://picsum.photos/400?random=9'
          WHEN 10 THEN 'https://picsum.photos/400?random=10'
          WHEN 11 THEN 'https://picsum.photos/400?random=11'
          WHEN 12 THEN 'https://picsum.photos/400?random=12'
          ELSE 'https://picsum.photos/400?random=0'
        END AS image,
        COUNT(DISTINCT uk.user_id) AS students,
        COALESCE(
          ROUND(AVG(CASE WHEN ub.hoanthanh_baihoc THEN 1 ELSE 0 END)::DECIMAL * 100, 2),
          0
        ) AS completion,
        CASE kh.id
          WHEN 1 THEN 156
          WHEN 2 THEN 89
          WHEN 3 THEN 67
          WHEN 4 THEN 94
          WHEN 5 THEN 45
          WHEN 6 THEN 72
          WHEN 7 THEN 120
          WHEN 8 THEN 80
          WHEN 9 THEN 90
          WHEN 10 THEN 110
          WHEN 11 THEN 85
          WHEN 12 THEN 100
          ELSE 0
        END AS reviews,
        COALESCE(kh.thoiluong / 60 || ' phút', '0 phút') AS avg_view_time,
        COALESCE(
          (SELECT json_agg(t.mota)::JSON
           FROM tag t
           WHERE t.id_khoahoc = kh.id),
          '[]'::JSON
        ) AS tags
      FROM khoahoc kh
      LEFT JOIN user_khoahoc uk ON uk.khoahoc_id = kh.id
      LEFT JOIN user_baihoc ub ON ub.user_id = uk.user_id
      AND EXISTS (SELECT 1 FROM baihoc bh WHERE bh.id_khoahoc = kh.id AND bh.id = ub.baihoc_id)
      GROUP BY kh.id, kh.ten, kh.mota, kh.danhgia, kh.thoiluong
      ORDER BY kh.id;
    `;

    const [sidebarResult, coursesResult] = await Promise.all([
      pool.query(sidebarQuery),
      pool.query(coursesQuery),
    ]);

    // Hard-code danh mục nếu không đủ
    const defaultCategories = [
      { category: "Network Security", count: 1 },
      { category: "Basic Security", count: 1 },
      { category: "Penetration Testing", count: 1 },
      { category: "Ethical Hacking", count: 1 },
      { category: "Malware Analysis", count: 1 },
      { category: "Reverse Engineering", count: 1 },
      { category: "OWASP Top 10", count: 1 },
      { category: "SQL Injection", count: 1 },
      { category: "Digital Investigation", count: 1 },
      { category: "Evidence Collection", count: 1 },
      { category: "Mobile Android", count: 1 },
      { category: "Mobile iOS", count: 1 },
      { category: "Awareness Training", count: 1 },
      { category: "AWS Security", count: 1 },
      { category: "Basic Concepts", count: 1 },
      { category: "Cloud IAM", count: 1 },
      { category: "Encryption", count: 1 },
      { category: "Firewall", count: 1 },
      { category: "Hardware Security", count: 1 },
      { category: "IDS/IPS", count: 1 },
      { category: "Incident Management", count: 1 },
      { category: "IoT Protocols", count: 1 },
      { category: "Key Management", count: 1 },
      { category: "Phishing Defense", count: 1 },
      { category: "Recovery Planning", count: 1 },
    ];
    const fetchedCategories = sidebarResult.rows[0].categories || [];
    const mergedCategories = [
      ...fetchedCategories,
      ...defaultCategories.filter(
        (dc) => !fetchedCategories.some((fc) => fc.category === dc.category)
      ),
    ];

    const response = {
      sidebar: {
        categories: mergedCategories,
        statuses: sidebarResult.rows[0].statuses || [
          { status: "published", count: 4 },
          { status: "draft", count: 1 },
          { status: "scheduled", count: 1 },
        ],
        overview: sidebarResult.rows[0].overview || {
          total_courses: 6,
          total_students: 0,
          completion_rate: 0,
        },
      },
      courses: coursesResult.rows,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching courses:", error);
    res
      .status(500)
      .json({ message: "Lỗi khi lấy dữ liệu khóa học", error: error.message });
  }
};

export const uploadCourse = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res
        .status(400)
        .json({ message: "Lỗi khi tải file", error: err.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ message: "Vui lòng cung cấp file Word" });
      }

      // Parse Word document
      const { value } = await mammoth.extractRawText({
        buffer: req.file.buffer,
      });
      const lines = value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line);

      console.log("Parsed lines:", lines); // Debug: Inspect parsed lines

      let courseData = {
        ten: "",
        mota: "",
        thoiluong: 0,
        capdo: "basic",
        tags: [],
        lessons: [],
      };
      let currentSection = "";
      let currentLesson = null;

      // Parse document content
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lowerLine = line.toLowerCase();

        if (lowerLine.startsWith("course title:")) {
          courseData.ten = line.substring("Course Title:".length).trim();
        } else if (lowerLine.startsWith("mô tả:")) {
          courseData.mota = line.substring("Mô tả:".length).trim();
        } else if (lowerLine.startsWith("thời lượng:")) {
          const durationMatch = line.match(/thời lượng:\s*(\d+)\s*phút/i);
          if (durationMatch) {
            courseData.thoiluong = parseInt(durationMatch[1]) * 60; // Convert minutes to seconds
          }
        } else if (lowerLine.startsWith("cấp độ:")) {
          const level = line.substring("Cấp độ:".length).trim().toLowerCase();
          if (["basic", "intermediate", "advanced"].includes(level)) {
            courseData.capdo = level;
          }
        } else if (lowerLine.startsWith("tags:")) {
          courseData.tags = line
            .substring("Tags:".length)
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag);
        } else if (lowerLine.startsWith("danh sách bài học")) {
          currentSection = "lessons";
        } else if (
          currentSection === "lessons" &&
          lowerLine.startsWith("bài học")
        ) {
          if (currentLesson) {
            courseData.lessons.push(currentLesson);
          }
          currentLesson = {
            ten: line.substring(line.indexOf(":") + 1).trim(),
            thoiluong: 0,
            loai: "video",
            danhgia: 0,
            capdo: courseData.capdo,
          };
        } else if (currentLesson) {
          if (lowerLine.startsWith("- thời lượng:")) {
            const durationMatch = line.match(/- thời lượng:\s*(\d+)\s*phút/i);
            if (durationMatch) {
              currentLesson.thoiluong = parseInt(durationMatch[1]) * 60;
            }
          } else if (lowerLine.startsWith("- loại:")) {
            const loai = line.substring("- Loại:".length).trim().toLowerCase();
            if (["video", "text", "lab"].includes(loai)) {
              currentLesson.loai = loai;
            }
          } else if (lowerLine.startsWith("- đánh giá:")) {
            const danhgia = parseInt(
              line.substring("- Đánh giá:".length).trim()
            );
            if (!isNaN(danhgia)) {
              currentLesson.danhgia = danhgia;
            }
          } else if (lowerLine.startsWith("- cấp độ:")) {
            const capdo = line
              .substring("- Cấp độ:".length)
              .trim()
              .toLowerCase();
            if (["basic", "intermediate", "advanced"].includes(capdo)) {
              currentLesson.capdo = capdo;
            }
          }
        }
      }
      if (currentLesson) {
        courseData.lessons.push(currentLesson);
      }

      console.log("Parsed courseData:", courseData); // Debug: Inspect parsed data

      // Validate parsed data
      if (
        !courseData.ten ||
        !courseData.mota ||
        !courseData.thoiluong ||
        courseData.lessons.length === 0
      ) {
        return res.status(400).json({
          message:
            "File Word không chứa đủ thông tin: ten, mota, thoiluong, hoặc bài học",
        });
      }

      if (!["basic", "intermediate", "advanced"].includes(courseData.capdo)) {
        return res.status(400).json({
          message: "Cấp độ phải là 'basic', 'intermediate' hoặc 'advanced'",
        });
      }

      // Validate lessons
      for (const lesson of courseData.lessons) {
        if (
          !lesson.ten ||
          !lesson.thoiluong ||
          !["video", "text", "lab"].includes(lesson.loai) ||
          isNaN(lesson.danhgia) ||
          !["basic", "intermediate", "advanced"].includes(lesson.capdo)
        ) {
          return res.status(400).json({
            message: "Thông tin bài học không hợp lệ",
          });
        }
      }

      // Bắt đầu transaction
      await pool.query("BEGIN");

      // Tạo khóa học mới
      const insertCourseQuery = `
        INSERT INTO khoahoc (ten, mota, thoiluong, danhgia, id_baikiemtra)
        VALUES ($1, $2, $3, $4, NULL)
        RETURNING id;
      `;
      const courseResult = await pool.query(insertCourseQuery, [
        courseData.ten,
        courseData.mota,
        courseData.thoiluong,
        0,
      ]);
      const courseId = courseResult.rows[0].id;

      // Tạo bài học
      for (const lesson of courseData.lessons) {
        const insertLessonQuery = `
          INSERT INTO baihoc (ten, thoiluong, loai, danhgia, capdo, id_khoahoc)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id;
        `;
        await pool.query(insertLessonQuery, [
          lesson.ten,
          lesson.thoiluong,
          lesson.loai,
          lesson.danhgia,
          lesson.capdo,
          courseId,
        ]);
      }

      // Tạo tags
      if (courseData.tags.length > 0) {
        const insertTagQuery = `
          INSERT INTO tag (mota, id_khoahoc)
          VALUES ${courseData.tags
            .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
            .join(", ")};
        `;
        const tagValues = courseData.tags.flatMap((tag) => [tag, courseId]);
        await pool.query(insertTagQuery, tagValues);
      }

      // Hard-code các trường trả về
      const newCourse = {
        id: courseId,
        title: courseData.ten,
        description: courseData.mota,
        instructor: "Unknown Instructor",
        time_ago: "0 ngày trước",
        rating: 0,
        level: courseData.capdo,
        status: "published",
        image: "/images/default.png",
        students: 0,
        completion: 0,
        reviews: 0,
        avg_view_time: `${Math.round(courseData.thoiluong / 60)} phút`,
        tags: courseData.tags,
      };

      // Commit transaction
      await pool.query("COMMIT");

      res.status(201).json({
        message: "Tạo khóa học từ file Word thành công",
        course: newCourse,
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error uploading course:", error);
      res.status(500).json({
        message: "Lỗi khi tạo khóa học từ file Word",
        error: error.message,
      });
    }
  });
};

export const createLab = async (req, res) => {
  const { ten, loai, mota, pdf_url } = req.body;

  // Validate required fields
  if (!ten || !loai) {
    return res.status(400).json({ error: "Thiếu field required: ten và loai" });
  }

  try {
    const query = `
      INSERT INTO lab (ten, loai, mota, pdf_url)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [ten, loai, mota || null, pdf_url || null];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server khi tạo Lab" });
  }
};
export const getLabById = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT * FROM lab WHERE id = $1;
    `;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lab không tồn tại" });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server khi lấy chi tiết Lab" });
  }
};
export const createCtf = async (req, res) => {
  const { ten, mota, loaictf, tacgia, choai, pdf_url, points, duration } =
    req.body;

  // Validate required fields
  if (!ten || !loaictf || !tacgia || !choai) {
    return res
      .status(400)
      .json({ error: "Thiếu field required: ten, loaictf, tacgia, choai" });
  }

  try {
    const query = `
      INSERT INTO ctf (ten, mota, loaictf, tacgia, choai, pdf_url, points, duration)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::INTERVAL)
      RETURNING *;
    `;
    const values = [
      ten,
      mota || null,
      loaictf,
      tacgia,
      choai,
      pdf_url || null,
      points || 0,
      duration || "0 minutes", // Default, dạng string để cast thành INTERVAL trong PostgreSQL
    ];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server khi tạo CTF" });
  }
};
export const getCtfById = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT * FROM ctf WHERE id = $1;
    `;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "CTF không tồn tại" });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server khi lấy chi tiết CTF" });
  }
};
