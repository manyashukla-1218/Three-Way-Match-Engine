const { computeMatch } = require("../services/matchingEngine");

/**
 * GET /match/:poNumber
 * Always recomputes fresh — never returns a cached/stale result.
 */
async function getMatch(req, res) {
  const { poNumber } = req.params;
  if (!poNumber) {
    return res.status(400).json({ error: "poNumber is required" });
  }

  try {
    const result = await computeMatch(poNumber);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: "Failed to compute match" });
  }
}

module.exports = { getMatch };
