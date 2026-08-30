/**
 * POST /auth/login
 * Accepts any request body and returns the static bearer token configured
 * via AUTH_TOKEN. There is no real user database in this assignment.
 */
function login(req, res) {
  const token = process.env.AUTH_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Server auth token is not configured" });
  }
  return res.status(200).json({ token });
}

module.exports = { login };
