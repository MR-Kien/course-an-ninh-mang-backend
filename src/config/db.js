// import pkg from "pg";
// import dotenv from "dotenv";

// dotenv.config();

// const { Pool } = pkg;

// const pool = new Pool({
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT,
//   database: process.env.DB_NAME,
// });

// export default pool;
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false,
    // ca: process.env.DB_CA.replace(/\\n/g, "\n"), // biến môi trường chứa certificate
  },
});
pool
  .connect()
  .then((client) => {
    console.log("✅ Connected to PostgreSQL successfully!");
    return client
      .query("SELECT NOW()") // kiểm tra query đơn giản
      .then((res) => {
        console.log("🕒 Server time:", res.rows[0].now);
        client.release(); // trả connection về pool
      });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to PostgreSQL:", err);
  });

export default pool;
