import jwt from "jsonwebtoken";

function authenticateToken(req, res, next) {
  if (req.method === "OPTIONS") return next();
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer TOKEN"

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "secretkey", (err, user) => {
    if (err) return res.sendStatus(403); // token không hợp lệ
    req.user = user;
    next();
  });
}

export default authenticateToken;
