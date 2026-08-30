/**
 * Requires "Authorization: Bearer <token>" on every route it's applied to.
 * The token is validated against the static AUTH_TOKEN from the environment
 * (the same value POST /auth/login hands back).
 */
function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  next();
}

module.exports = requireAuth;
