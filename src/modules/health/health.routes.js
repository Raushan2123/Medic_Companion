// src/modules/health/health.routes.js - Health check routes
const express = require("express");
const router = express.Router();
const { healthCheck, root } = require("./health.controller");

// GET /health - Health check (no auth required)
router.get("/health", healthCheck);

// GET / - Root endpoint (no auth required)
router.get("/", root);

module.exports = router;
