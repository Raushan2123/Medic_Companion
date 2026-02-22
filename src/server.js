// src/server.js - Server entry point
require("dotenv").config();
const app = require("./app");
const initDb = require("./config/initDb");

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Initialize database
    await initDb();

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Medic Companion API running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📚 API docs: http://localhost:${PORT}/api/`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
