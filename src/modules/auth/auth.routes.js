// src/modules/auth/auth.routes.js - Authentication routes
const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getProfile,
  updateProfile,
} = require("./auth.controller");
const authenticate = require("../../middlewares/auth.middleware");

// Public routes
router.post("/auth/register", register);
router.post("/auth/login", login);

// Protected routes
router.get("/auth/profile", authenticate, getProfile);
router.put("/auth/profile", authenticate, updateProfile);

module.exports = router;

// ============================================================
// GIT INSTRUCTIONS AFTER COMPLETING AUTH MODULE:
// ============================================================
// git checkout -b feature/auth-module
// git add src/modules/auth/
// git commit -m "feat: Add authentication module with register, login, profile endpoints"
// git push -u origin feature/auth-module
// ============================================================
