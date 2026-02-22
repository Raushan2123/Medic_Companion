const express = require("express");
const router = express.Router();

const authenticate = require("../middlewares/auth.middleware");
const { biometricUnlock } = require("../controllers/biometric.control");

router.post("/biometric-unlock", authenticate, biometricUnlock);

module.exports = router;
