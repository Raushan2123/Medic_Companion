const express = require("express");
const router = express.Router();

const authenticate = require("../middlewares/auth.middleware");
const { syncOfflineLogs } = require("../controllers/sync.controller");

router.post("/sync", authenticate, syncOfflineLogs);

module.exports = router;
