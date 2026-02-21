const express = require("express");
const cors = require("cors");

const biometricRoutes = require("./routes/biometric.routes");
const aiRoutes = require("./routes/ai.routes");
const syncRoutes = require("./routes/sync.routes");

const app = express();

app.use(express.json());
app.use(cors());

app.use("/api", biometricRoutes);
app.use("/api", aiRoutes);
app.use("/api", syncRoutes);

module.exports = app;
