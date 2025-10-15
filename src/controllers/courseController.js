const pool = require("../config/db"); // Kết nối PostgreSQL/MySQL tùy bạn

exports.getAllCourses = async (req, res) => {
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

exports.getCourseDetail = async (req, res) => {
  try {
    const { id: courseId } = req.params; // Lấy ID khóa học từ URL: /api/courses/:id
    const userId = req.user?.id || 1; // Giả sử lấy từ auth middleware (req.user.id); nếu chưa login, có thể set null hoặc error

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
            WHEN bh.id = (SELECT MIN(id) FROM baihoc WHERE id_khoahoc = $1) THEN false
            WHEN LAG(COALESCE(ub.hoanthanh_baihoc, false)) OVER (ORDER BY bh.id) = false THEN true
            ELSE false
          END AS is_locked,
          CASE 
            WHEN (SELECT completed_count FROM progress) = 0 AND bh.id = (SELECT MIN(id) FROM baihoc WHERE id_khoahoc = $1) THEN true
            WHEN NOT COALESCE(ub.hoanthanh_baihoc, false) AND LAG(COALESCE(ub.hoanthanh_baihoc, false)) OVER (ORDER BY bh.id) = true THEN true
            ELSE false
          END AS is_active
        FROM baihoc bh
        LEFT JOIN user_baihoc ub ON ub.baihoc_id = bh.id AND ub.user_id = $2
        WHERE bh.id_khoahoc = $1
        ORDER BY bh.id
      )
      SELECT 
        ci.title AS course_title,
        ci.description AS course_description,
        ci.total_duration,
        (ci.rating::DECIMAL / 10)::TEXT AS rating_formatted,
        p.completed_count,
        p.total_count,
        p.progress_percentage,
        json_agg(json_build_object(
          'id', l.id,
          'title', l.title,
          'description', l.description,
          'duration', l.duration,
          'isCompleted', l.is_completed,
          'isLocked', l.is_locked,
          'isActive', l.is_active
        )) FILTER (WHERE l.id IS NOT NULL) AS lessons
      FROM course_info ci
      CROSS JOIN progress p
      LEFT JOIN lessons l ON true
      GROUP BY ci.id, ci.title, ci.description, ci.total_duration, ci.rating, p.completed_count, p.total_count, p.progress_percentage;
    `;

    const result = await pool.query(query, [courseId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Khóa học không tồn tại" });
    }

    const courseData = result.rows[0];

    // Format thêm cho frontend (progress với %)
    courseData.progressPercentage = courseData.progress_percentage + "%";

    // Nếu muốn thêm info bài kiểm tra (test button)
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

exports.getCourseContent = async (req, res) => {
  try {
    const { id: lessonId } = req.params; // Lấy từ URL: /api/lessons/:id/content (thay đổi endpoint cho lesson)
    const userId = req.user?.id || 1; // Tùy chọn, nếu cần auth

    if (!lessonId) {
      return res.status(400).json({ message: "Thiếu ID bài học" });
    }

    if (!userId) {
      return res.status(401).json({ message: "Vui lòng đăng nhập" });
    }

    const query = `
      -- Query lấy nội dung theo ID bài học (lessonId)
      WITH featured_doc AS (
        SELECT 
          kh.id AS course_id,
          kh.ten AS course_title,
          kh.mota AS course_description,
          bh.id AS lesson_id,
          bh.ten AS lesson_title,
          bh.mota AS lesson_description,
          t.ten AS featured_title,
          t.loai AS featured_type,
          t.url AS featured_url,
          COALESCE(bh.mota, 'Tài liệu này cung cấp kiến thức nền tảng về bài học, bao gồm các khái niệm cơ bản và biện pháp thực hành. Phù hợp cho người học hiện tại.') AS featured_description
        FROM baihoc bh
        INNER JOIN khoahoc kh ON kh.id = bh.id_khoahoc
        LEFT JOIN tailieu t ON t.id_baihoc = bh.id AND t.loai ILIKE '%pdf%' 
        WHERE bh.id = $1 
          AND (t.ten ILIKE '%giáo trình%' OR t.id IS NULL)
        ORDER BY CASE WHEN t.ten ILIKE '%giáo trình%' THEN 0 ELSE 1 END, t.id
        LIMIT 1
      ),
      additional_docs AS (
        SELECT 
          bh.id AS lesson_id,
          kh.ten AS course_title,
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
        FROM baihoc bh
        INNER JOIN khoahoc kh ON kh.id = bh.id_khoahoc
        LEFT JOIN tailieu t ON t.id_baihoc = bh.id 
        WHERE bh.id = $1
        GROUP BY bh.id, kh.ten
      ),
      objectives AS (
        SELECT 
          bh.id AS lesson_id,
          bh.muctieu AS objectives_array  -- Lấy trực tiếp muctieu từ bài học (JSONB array)
        FROM baihoc bh
        WHERE bh.id = $1 AND bh.muctieu != '[]'::JSONB
      )
      SELECT 
        COALESCE(fd.course_title, ad.course_title, 'Bài học không xác định') AS course_title,
        COALESCE(fd.lesson_title, 'Bài học hiện tại') AS lesson_title,
        COALESCE(fd.featured_title, 'Giáo trình bài học cơ bản') AS featured_title,
        COALESCE(fd.featured_type, 'PDF') || ' • 45 trang • Cập nhật 2024' AS featured_info,
        COALESCE(fd.featured_url, 'https://example.com/giao-trinh.pdf') AS featured_url,
        COALESCE(fd.featured_description, fd.lesson_description) AS featured_description,
        COALESCE(ad.additional_materials, '[]'::JSON) AS additional_materials,
        COALESCE(
          o.objectives_array,
          '[{"number":1,"title":"Hiểu khái niệm chính của bài học","description":"Nắm vững định nghĩa và tầm quan trọng của nội dung bài"},{"number":2,"title":"Áp dụng kiến thức","description":"Thực hành các nguyên tắc cơ bản từ bài học"}]'::JSON  -- Fallback cho lesson
        ) AS objectives
      FROM featured_doc fd
      FULL OUTER JOIN additional_docs ad ON fd.lesson_id = ad.lesson_id
      LEFT JOIN objectives o ON o.lesson_id = COALESCE(fd.lesson_id, ad.lesson_id);
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

exports.getCTFData = async (req, res) => {
  try {
    const userId = req.user?.id || 1; // Từ auth middleware, fallback 1 để test (thay bằng error nếu cần)

    if (!userId) {
      return res.status(401).json({ message: "Vui lòng đăng nhập để xem CTF" });
    }

    const query = `
      WITH user_progress AS (
        SELECT 
          COUNT(CASE WHEN cu.tiendo = 100 THEN 1 END) AS completed_challenges,
          COUNT(*) AS total_challenges,
          SUM(CASE WHEN cu.tiendo = 100 THEN 
            CASE c.id  -- Hardcode diem dựa id (note: thêm diem INT INTO ctf sau)
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
      ),
      category_progress AS (
        SELECT 
          c.loaictf,
          COUNT(CASE WHEN cu.tiendo = 100 THEN 1 END) || '/' || COUNT(*) AS progress_count
        FROM ctf c
        LEFT JOIN ctf_user cu ON cu.ctf_id = c.id AND cu.user_id = $1
        GROUP BY c.loaictf
      )
      SELECT 
        json_agg(
          json_build_object(
            'id', c.id,
            'title', c.ten,
            'description', c.mota,
            'category', c.loaictf,
            'difficulty', CASE 
              WHEN c.choai ILIKE '%sinh viên%' THEN 'Beginner'
              WHEN c.choai ILIKE '%mọi người%' THEN 'Intermediate'
              ELSE 'Advanced'
            END,
            'duration', CASE c.id
              WHEN 1 THEN '15 phút'
              WHEN 2 THEN '30 phút'
              WHEN 3 THEN '45 phút'
              WHEN 4 THEN '60 phút'
              WHEN 5 THEN '40 phút'
              WHEN 6 THEN '90 phút'
              ELSE 'N/A'
            END,
            'author', c.tacgia,
            'tags', CASE c.loaictf
              WHEN 'Crypto' THEN '["#caesar", "#substitution", "#basic"]'
              WHEN 'Web' THEN '["#sql", "#injection", "#database"]'
              WHEN 'Forensics' THEN '["#memory", "#volatility", "#analysis"]'
              WHEN 'Binary' THEN '["#overflow", "#exploitation", "#c"]'
              WHEN 'Network' THEN '["#wireshark", "#pcap", "#protocols"]'
              ELSE '[]'
            END::JSON,
            'hasHints', true,
            'hasWriteup', true,
            'points', CASE c.id
              WHEN 1 THEN 50
              WHEN 2 THEN 75
              WHEN 3 THEN 150
              WHEN 4 THEN 200
              WHEN 5 THEN 125
              WHEN 6 THEN 300
              ELSE 0
            END,
            'status', CASE 
              WHEN cu.tiendo = 100 THEN 'completed'
              WHEN cu.tiendo > 0 THEN 'available'
              ELSE 'locked'
            END,
            'icon', CASE c.loaictf
              WHEN 'Crypto' THEN 'Key'
              WHEN 'Web' THEN 'Code2'
              WHEN 'Forensics' THEN 'Search'
              WHEN 'Binary' THEN 'Target'
              WHEN 'Network' THEN 'Wifi'
              ELSE 'Shield'
            END
          ) ORDER BY c.id
        ) AS challenges,
        up.completed_challenges || '/' || up.total_challenges AS completed_total,
        up.total_points AS total_points,
        up.overall_percentage || '%' AS overall_percentage,
        json_agg(
          json_build_object(
            'name', COALESCE(cp.loaictf, 'Misc'),
            'progress', COALESCE(cp.progress_count, '0/0'),
            'icon', CASE COALESCE(cp.loaictf, 'Misc')
              WHEN 'Crypto' THEN 'Key'
              WHEN 'Web' THEN 'Code2'
              WHEN 'Forensics' THEN 'Search'
              WHEN 'Binary' THEN 'Target'
              WHEN 'Network' THEN 'Wifi'
              ELSE NULL
            END
          ) ORDER BY cp.loaictf
        ) AS category_progress,
        '[{"title":"CTF Handbook","description":"Hướng dẫn toàn diện về CTF","icon":"BookOpen"},{"title":"Tools & Scripts","description":"Công cụ hỗ trợ giải CTF","icon":"Database"},{"title":"Community","description":"Tham gia cộng đồng CTF","icon":"Users"}]'::JSON AS learning_resources
      FROM ctf c
      LEFT JOIN ctf_user cu ON cu.ctf_id = c.id AND cu.user_id = $1
      CROSS JOIN user_progress up
      LEFT JOIN category_progress cp ON true
      WHERE c.id <= 6
      GROUP BY up.completed_challenges, up.total_challenges, up.total_points, up.overall_percentage;
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không có dữ liệu CTF" });
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
