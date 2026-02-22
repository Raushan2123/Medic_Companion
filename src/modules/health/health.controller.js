// src/modules/health/health.controller.js - Health check and system status
const db = require("../../config/db");

// GET /health - Health check endpoint
const healthCheck = async (req, res) => {
  try {
    // Check database connection
    let dbStatus = "healthy";
    try {
      await db.query("SELECT 1");
    } catch (error) {
      dbStatus = "unhealthy";
    }

    const status = {
      status: dbStatus === "healthy" ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        ai: process.env.AI_SERVICE_URL ? "configured" : "not configured",
      },
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    };

    const statusCode = dbStatus === "healthy" ? 200 : 503;
    res.status(statusCode).json(status);
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

// GET / - Root endpoint with API info
const root = (req, res) => {
  res.json({
    name: "Medic Companion API",
    version: "1.0.0",
    description: "AI-powered medicine adherence system",
    endpoints: {
      auth: {
        register: "POST /api/auth/register",
        login: "POST /api/auth/login",
        profile: "GET /api/auth/profile",
      },
      ai: {
        plan: "POST /api/ai/plan",
        continue: "POST /api/ai/continue",
        approve: "POST /api/ai/approve",
        audit: "GET /api/ai/audit",
        debugState: "GET /api/ai/debug_state",
      },
      adherence: {
        mark: "POST /api/adherence/mark",
        summary: "GET /api/adherence/summary",
        history: "GET /api/adherence/history",
      },
      health: {
        health: "GET /api/health",
        root: "GET /api/",
      },
    },
    timestamp: new Date().toISOString(),
  });
};

module.exports = { healthCheck, root };
