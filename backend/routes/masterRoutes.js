const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/auth");
const masterController = require("../controllers/masterController");

router.use(requireAuth);

router.post("/sku", masterController.create);
router.get("/sku", masterController.list);
router.get("/sku/:id", masterController.getOne);
router.patch("/sku/:id", masterController.update);
router.delete("/sku/:id", masterController.remove);

module.exports = router;
