const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/auth");
const { getMatch } = require("../controllers/matchController");

router.use(requireAuth);

router.get("/:poNumber", getMatch);

module.exports = router;
