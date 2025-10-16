// import axios from "axios";
// import pool from "../config/db.js";
// const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";

// export const sendChat = async (req, res) => {
//   try {
//     const { messages, model } = req.body;

//     const response = await axios.post(
//       OPENROUTER_API,
//       {
//         model: model || "openai/gpt-4o",
//         messages,
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
//           "HTTP-Referer": process.env.SITE_URL,
//           "X-Title": process.env.SITE_NAME,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     res.json(response.data);
//   } catch (error) {
//     console.error("❌ Chatbot Error:", error.response?.data || error.message);
//     res.status(500).json({
//       error: "Chatbot request failed",
//       details: error.response?.data || error.message,
//     });
//   }
// };
import axios from "axios";
import pool from "../config/db.js";
const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";

export const getUserTopics = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const query = `SELECT id, ten, mota, userid FROM chudeai WHERE userid = $1 ORDER BY id ASC;`;
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Query 2: GET /api/topics/:topicId/qa
export const getTopicQA = async (req, res) => {
  try {
    const topicId = parseInt(req.params.topicId);
    const query = `SELECT id, cauhoi, cautraloi, thoigian, id_chudeai FROM hoidapai WHERE id_chudeai = $1 ORDER BY thoigian ASC;`;
    const result = await pool.query(query, [topicId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
export const sendChat = async (req, res) => {
  try {
    const { messages, model, topicId } = req.body;
    const userId = req.user?.id || 1; // Giả sử từ auth middleware

    if (!userId) {
      return res.status(401).json({ message: "Vui lòng đăng nhập" });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: "Thiếu messages" });
    }

    // Điều chỉnh prompt để AI trả tên chủ đề nếu tạo mới
    let adjustedMessages = [...messages];
    if (!topicId) {
      // Thêm system prompt để AI trả tên chủ đề ở cuối
      adjustedMessages.unshift({
        role: "system",
        content:
          "Bạn là trợ lý AI hỗ trợ học an ninh mạng. Trả lời câu hỏi một cách hữu ích. Nếu đây là cuộc trò chuyện mới, ở CUỐI phản hồi của bạn, thêm định dạng chính xác: [CHUDE: Tên chủ đề ngắn gọn, phù hợp cho cuộc trò chuyện này, ví dụ 'An ninh mạng cơ bản'] mà không giải thích thêm.",
      });
    }

    const response = await axios.post(
      OPENROUTER_API,
      {
        model: model || "openai/gpt-4o",
        messages: adjustedMessages,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": process.env.SITE_URL,
          "X-Title": process.env.SITE_NAME,
          "Content-Type": "application/json",
        },
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    const cauhoi = messages[messages.length - 1].content; // Câu hỏi cuối từ user
    const cautraloi = aiResponse;
    const thoigian = new Date();

    let finalTopicId = topicId;

    if (!topicId) {
      // Parse tên chủ đề từ [CHUDE: ...] ở cuối aiResponse
      const chudeMatch = aiResponse.match(/\[CHUDE:\s*(.+?)\]/i);
      const tenChude = chudeMatch ? chudeMatch[1].trim() : "Chủ đề chung"; // Fallback nếu không parse được
      const motaChude = cauhoi.substring(0, 100) + "..."; // Mô tả ngắn từ câu hỏi đầu

      // Tạo chủ đề mới
      const createTopicQuery = `
        INSERT INTO chudeai (ten, mota, userid) 
        VALUES ($1, $2, $3) 
        RETURNING id;
      `;
      const topicResult = await pool.query(createTopicQuery, [
        tenChude,
        motaChude,
        userId,
      ]);
      finalTopicId = topicResult.rows[0].id;
    }

    // Lưu vào hoidapai
    const saveQuery = `
      INSERT INTO hoidapai (cauhoi, cautraloi, thoigian, id_chudeai) 
      VALUES ($1, $2, $3, $4);
    `;
    await pool.query(saveQuery, [cauhoi, cautraloi, thoigian, finalTopicId]);

    // Trả về kết quả AI + topicId (nếu mới)
    res.json({
      ...response.data,
      topicId: finalTopicId, // Luôn trả để frontend biết
    });
  } catch (error) {
    console.error("❌ Chatbot Error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Chatbot request failed",
      details: error.response?.data || error.message,
    });
  }
};
