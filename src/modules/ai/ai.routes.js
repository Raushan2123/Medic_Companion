// src/modules/ai/ai.routes.js - AI Planning routes
const express = require("express");
const router = express.Router();
const {
  generatePlan,
  continuePlan,
  approvePlan,
  getAuditLogs,
  debugState,
} = require("./ai.controller");
const authenticate = require("../../middlewares/auth.middleware");

// All routes require authentication
router.use(authenticate);

// POST /ai/plan - Generate AI medication plan
router.post("/ai/plan", generatePlan);

// POST /ai/continue - Continue/refine AI plan
router.post("/ai/continue", continuePlan);

// POST /ai/approve - Approve and apply AI plan
router.post("/ai/approve", approvePlan);

// GET /ai/audit - Get AI audit logs
router.get("/ai/audit", getAuditLogs);

// GET /ai/debug_state - Debug AI state (development only)
router.get("/ai/debug_state", debugState);

module.exports = router;
