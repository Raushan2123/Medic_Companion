// src/modules/adherence/adherence.routes.js - Adherence routes
const express = require("express");
const router = express.Router();
const {
  markDose,
  getAdherenceSummary,
  getDoseHistory,
} = require("./adherence.controller");
const authenticate = require("../../middlewares/auth.middleware");

// All routes require authentication
router.use(authenticate);

// POST /adherence/mark - Mark dose as taken/missed/snoozed
router.post("/adherence/mark", markDose);

// GET /adherence/summary - Get adherence summary
router.get("/adherence/summary", getAdherenceSummary);

// GET /adherence/history - Get dose history
router.get("/adherence/history", getDoseHistory);

module.exports = router;
