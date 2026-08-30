const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/auth");
const { getSummary } = require("../controllers/summaryController");

router.use(requireAuth);

router.get("/:poNumber", getSummary);

module.exports = router;
