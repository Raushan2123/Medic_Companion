// src/modules/schedules/schedule.routes.js - Schedule routes
const express = require("express");
const router = express.Router();
const { getTodayDoses } = require("./schedule.controller");
const authenticate = require("../../middlewares/auth.middleware");

// All routes require authentication
router.use(authenticate);

// GET /api/schedules/today - Get today's doses for the authenticated patient
router.get("/schedules/today", getTodayDoses);

module.exports = router;
