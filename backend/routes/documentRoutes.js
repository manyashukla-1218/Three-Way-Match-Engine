const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/auth");
const { upload: uploadMiddleware } = require("../middleware/upload");
const documentController = require("../controllers/documentController");

router.use(requireAuth);

router.post("/upload", uploadMiddleware.single("file"), documentController.upload);
router.get("/:id/file", documentController.getFile);
router.get("/:id", documentController.getById);
router.get("/", documentController.list);

module.exports = router;
