const express = require("express");
const router = express.Router();

const authenticate = require("../middlewares/auth.middleware");
const requireBiometricUnlock = require("../middlewares/biometric.middleware");
const { generateAISchedule } = require("../controllers/ai.controller");

router.post(
  "/ai-schedule",
  authenticate,
  requireBiometricUnlock,
  generateAISchedule,
);

module.exports = router;
