// src/app.js - Main Express application
const express = require("express");
const cors = require("cors");

// Import route modules
const authRoutes = require("./modules/auth/auth.routes");
const aiRoutes = require("./modules/ai/ai.routes");
const adherenceRoutes = require("./modules/adherence/adherence.routes");
const expertRoutes = require("./modules/expert/expert.routes");
const healthRoutes = require("./modules/health/health.routes");

const app = express();

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cors());

// API Routes
app.use("/api", healthRoutes); // Health check (no auth)
app.use("/api", authRoutes); // Auth routes
app.use("/api", aiRoutes); // AI planning routes
app.use("/api", adherenceRoutes); // Adherence routes
app.use("/api", expertRoutes); // Expert visibility routes

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
